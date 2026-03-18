import { NextResponse } from 'next/server'
import { Timeframe } from '@yggdrasight/core'
import { runAnalysis } from '@/lib/intelligence/engine/runner'
import { withAuth } from '@/lib/auth/middleware'
import { withDecryptedConfig } from '@/lib/auth/session'
import { getAgentModelMapFromConnection, getIntelligenceModelsForConnection } from '@/lib/auth/intelligence-models'
import { getUserMongoUri } from '@/lib/auth/mongo-manager'

export const dynamic = 'force-dynamic'

function sanitizeMirofishReason(reason: string): string {
  return reason
    .replace(/https?:\/\/localhost:\d+[^\s,)"]*/g, '')
    .replace(/\b(simulation_id|report_id|project_id|graph_id|task_id)\s*[:=]\s*\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sanitizeMirofishIndicators(
  raw?: Record<string, number | string>
): Record<string, number> {
  if (!raw) return {}
  const out: Record<string, number> = {}
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

export async function POST(request: Request) {
  return withAuth(async (ctx) => {
    const body = await request.json() as { symbol?: string; agentId?: string; timeframes?: string[]; forceFresh?: boolean }
    const symbol = body.symbol?.toUpperCase()
    const agentId = body.agentId
    const forceFresh = body.forceFresh ?? false

    if (!symbol || !agentId) {
      return NextResponse.json({ error: 'Missing symbol or agentId' }, { status: 400 })
    }

    const activeJob = await ctx.intelligenceModels.AnalysisJob.findOne(
      { symbol, agentId, status: { $in: ['pending', 'running'] } },
    ).lean()

    if (activeJob) {
      return NextResponse.json({
        jobId: String(activeJob._id),
        status: activeJob.status,
        alreadyRunning: true,
      })
    }

    const DEFAULT_MODEL = 'opencode/big-pickle'
    const agentModelMap = await getAgentModelMapFromConnection(ctx.connection)
    const model = agentModelMap[agentId] ?? agentModelMap['*'] ?? Object.values(agentModelMap)[0] ?? DEFAULT_MODEL

    const job = await ctx.intelligenceModels.AnalysisJob.create({
      symbol,
      agentId,
      modelId: model,
      status: 'running',
      startedAt: new Date(),
    })

    const jobId = String(job._id)
    const timeframes = (body.timeframes?.length ? body.timeframes : ['1h', '4h', '1d']) as Timeframe[]

    const sessionId = ctx.sessionId
    const connectionUri = getUserMongoUri(sessionId)

    setImmediate(async () => {
      let userConnection: import('mongoose').Connection | null = null
      try {
        const mongoose = (await import('mongoose')).default
        userConnection = connectionUri
          ? await mongoose.createConnection(connectionUri).asPromise()
          : null
        if (!userConnection) throw new Error('No MongoDB URI for session')
        const models = getIntelligenceModelsForConnection(userConnection)

        const result = await withDecryptedConfig(ctx, async (configPaths) => {
          return runAnalysis(symbol, timeframes, {
            model,
            agentModelMap,
            agentIds: [agentId],
            authJsonPath: configPaths.authJsonPath,
            forceFresh,
          })
        })

        const mirofishResult = result.analysts.find(a => a.meta.id === 'mirofish')
        console.log(`[analyze-agent] ${agentId}@${symbol}: ${result.analysts.length} analysts, mirofish confidence=${mirofishResult?.confidence ?? 'N/A'}, reason=${mirofishResult?.reason ?? 'N/A'}, output=${(mirofishResult?.output ?? '').substring(0, 200)}`)

        const sanitizedAnalysts = result.analysts.map((a) => {
          if (a.meta.id !== 'mirofish') return a
          return { ...a, reason: sanitizeMirofishReason(a.reason), output: undefined, indicators: sanitizeMirofishIndicators(a.indicators) }
        })

        const latest = await models.IntelligenceVerdict
          .findOne({ symbol })
          .sort({ createdAt: -1 })
          .lean() as { analysts?: typeof sanitizedAnalysts } | null

        let mergedAnalysts = sanitizedAnalysts
        if (latest?.analysts && Array.isArray(latest.analysts) && latest.analysts.length > sanitizedAnalysts.length) {
          const base = [...(latest.analysts as typeof sanitizedAnalysts)]
          for (const incoming of sanitizedAnalysts) {
            const idx = base.findIndex(a => a.meta.id === incoming.meta.id)
            if (idx >= 0) base[idx] = incoming
            else base.push(incoming)
          }
          mergedAnalysts = base
        }

        await models.IntelligenceVerdict.create({
          symbol: result.symbol,
          timeframes: result.timeframes,
          direction: latest ? (latest as Record<string, unknown>).direction ?? result.direction : result.direction,
          confidence: latest ? (latest as Record<string, unknown>).confidence ?? result.confidence : result.confidence,
          score: latest ? (latest as Record<string, unknown>).score ?? result.score : result.score,
          confluence: latest ? (latest as Record<string, unknown>).confluence ?? result.confluence : result.confluence,
          analysts: mergedAnalysts,
          llmModel: model,
        })

        await models.AnalysisJob.updateOne({ _id: jobId }, {
          $set: { status: 'completed', completedAt: new Date() },
        })

        console.log(`[analyze-agent] Job ${jobId} completed for ${agentId}@${symbol}`)
      } catch (err) {
        console.error(`[analyze-agent] Job ${jobId} failed:`, err)
        try {
          const mongoose = (await import('mongoose')).default
          const conn = userConnection ?? await mongoose.createConnection(connectionUri!).asPromise()
          const models = getIntelligenceModelsForConnection(conn)
          await models.AnalysisJob.updateOne({ _id: jobId }, {
            $set: { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error', completedAt: new Date() },
          })
          if (!userConnection) await conn.close()
        } catch { }
      } finally {
        if (userConnection) await userConnection.close().catch(() => {})
      }
    })

    return NextResponse.json({ jobId, status: 'running' })
  })
}

export async function GET(request: Request) {
  return withAuth(async (ctx) => {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')?.toUpperCase()
    const agentId = url.searchParams.get('agentId')

    if (!symbol) {
      return NextResponse.json({ jobs: [] })
    }

    const query: Record<string, unknown> = {
      symbol,
      status: { $in: ['pending', 'running'] },
    }
    if (agentId) query.agentId = agentId

    const jobs = await ctx.intelligenceModels.AnalysisJob.find(
      query,
      { _id: 1, agentId: 1, status: 1, startedAt: 1 },
      { sort: { startedAt: -1 } },
    ).lean()

    return NextResponse.json({
      jobs: jobs.map(j => ({
        id: String(j._id),
        agentId: j.agentId,
        status: j.status,
        startedAt: j.startedAt,
      })),
    })
  })
}
