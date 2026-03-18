import { NextRequest, NextResponse } from 'next/server'
import { Timeframe, SignalDirection } from '@yggdrasight/core'
import { runAnalysis } from '@/lib/intelligence/engine/runner'
import { withAuth } from '@/lib/auth/middleware'
import { withDecryptedConfig } from '@/lib/auth/session'
import { getAgentModelMapFromConnection } from '@/lib/auth/intelligence-models'

function sanitizeMirofishReason(reason: string): string {
  return reason
    .replace(/https?:\/\/localhost:\d+[^\s,)"]*/g, '')
    .replace(/\b(simulation_id|report_id|project_id|graph_id|task_id)\s*[:=]\s*\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sanitizeMirofishIndicators(
  raw?: Record<string, number | string>
): { consensusBullPct?: number; consensusBearPct?: number; simulationRounds?: number; agentsCount?: number; durationMs?: number } {
  if (!raw) return {}
  const out: ReturnType<typeof sanitizeMirofishIndicators> = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toLowerCase()
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(n)) {
      if (key.includes('bull')) out.consensusBullPct = n
      else if (key.includes('bear')) out.consensusBearPct = n
      else if (key.includes('round')) out.simulationRounds = n
      else if (key.includes('agent') || key.includes('count')) out.agentsCount = n
      else if (key.includes('duration') || key.includes('ms')) out.durationMs = n
    }
  }
  return out
}

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return withAuth(async (ctx) => {
    try {
      const body = await req.json()
      const { symbol, timeframes: requestTimeframes, agentIds } = body as {
        symbol?: string
        timeframes?: string[]
        agentIds?: string[]
      }

      // Validate symbol
      if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
        return NextResponse.json(
          { error: 'Missing or invalid symbol' },
          { status: 400 }
        )
      }

      // Default timeframes if not provided
      const timeframes = (requestTimeframes?.length
        ? requestTimeframes
        : ['1h', '4h', '1d']) as Timeframe[]

      // Fetch model config from MongoDB — never trust what the client sends
      const agentModelMap = await getAgentModelMapFromConnection(ctx.connection)
      const model = agentModelMap['*'] ?? Object.values(agentModelMap)[0] ?? undefined

      // Run analysis
      // Run analysis with decrypted auth for Docker container mounts
      const result = await withDecryptedConfig(ctx, async (configPaths) => {
        return runAnalysis(symbol, timeframes, { model, agentModelMap, agentIds, authJsonPath: configPaths.authJsonPath })
      })

      const sanitizedAnalysts = result.analysts
        .filter((a) => !(a.meta.id === 'mirofish' && a.confidence <= 0.1))
        .map((a) => {
          if (a.meta.id !== 'mirofish') return a
          return {
            ...a,
            reason: sanitizeMirofishReason(a.reason),
            output: undefined,
            indicators: sanitizeMirofishIndicators(a.indicators),
          }
        })

      // When only a subset of agents ran, merge their results into the latest full verdict.
      // This ensures DB always holds a complete analyst set and fetchHistory never shows partial data.
      let mergedAnalysts = sanitizedAnalysts
      let baseDirection = result.direction
      let baseConfidence = result.confidence
      let baseScore = result.score
      let baseConfluence = result.confluence

      if (agentIds && agentIds.length > 0) {
        try {
          const latest = await ctx.intelligenceModels.IntelligenceVerdict
            .findOne({ symbol: result.symbol })
            .sort({ createdAt: -1 })
            .lean() as { analysts?: typeof sanitizedAnalysts; direction?: string; confidence?: number; score?: number; confluence?: number } | null

          if (latest?.analysts && Array.isArray(latest.analysts) && latest.analysts.length > sanitizedAnalysts.length) {
            const base = [...(latest.analysts as typeof sanitizedAnalysts)]
            for (const incoming of sanitizedAnalysts) {
              const idx = base.findIndex(a => a.meta.id === incoming.meta.id)
              if (idx >= 0) base[idx] = incoming
              else base.push(incoming)
            }
            mergedAnalysts = base
            // Keep consensus metrics from the previous full run — they were computed over all agents
            baseDirection = (latest.direction as SignalDirection) ?? result.direction
            baseConfidence = latest.confidence ?? result.confidence
            baseScore = latest.score ?? result.score
            baseConfluence = latest.confluence ?? result.confluence
          }
        } catch (err) {
          console.error('[analyze] Merge failed, saving partial verdict:', err)
        }
      }

      const verdict = await ctx.intelligenceModels.IntelligenceVerdict.create({
        symbol: result.symbol,
        timeframes: result.timeframes,
        direction: baseDirection,
        confidence: baseConfidence,
        score: baseScore,
        confluence: baseConfluence,
        analysts: mergedAnalysts,
        llmModel: Object.values(agentModelMap)[0] ?? model ?? undefined,
      })

      const mirofishVerdict = result.analysts.find((a) => a.meta.id === 'mirofish')
      if (mirofishVerdict && mirofishVerdict.direction !== 'neutral' || (mirofishVerdict && mirofishVerdict.confidence > 0.1)) {
        try {
          await ctx.intelligenceModels.MirofishPrediction.create({
            symbol: result.symbol,
            direction: mirofishVerdict!.direction,
            confidence: mirofishVerdict!.confidence,
            reason: sanitizeMirofishReason(mirofishVerdict!.reason),
            modelId: agentModelMap['mirofish'] ?? Object.values(agentModelMap)[0] ?? '',
            indicators: sanitizeMirofishIndicators(mirofishVerdict!.indicators),
          })
        } catch (err) {
          console.error('[analyze] Failed to save MirofishPrediction:', err)
        }
      }

      // Return the created verdict as JSON
      const json = verdict.toJSON()
      return NextResponse.json({ verdict: json }, { status: 201 })
    } catch (err) {
      console.error('[POST /api/intelligence/analyze]', err)
      return NextResponse.json(
        { error: 'Failed to analyze' },
        { status: 500 }
      )
    }
  })
}
