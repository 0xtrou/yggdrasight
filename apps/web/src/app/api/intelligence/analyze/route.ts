import { NextRequest, NextResponse } from 'next/server'
import { Timeframe } from '@oculus/core'
import { runAnalysis } from '@/lib/intelligence/engine/runner'
import { withAuth } from '@/lib/auth/middleware'
import { getAgentModelMapFromConnection } from '@/lib/auth/intelligence-models'

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
      const result = await runAnalysis(symbol, timeframes, { model, agentModelMap, agentIds })

      // Persist to MongoDB
      const verdict = await ctx.intelligenceModels.IntelligenceVerdict.create({
        symbol: result.symbol,
        timeframes: result.timeframes,
        direction: result.direction,
        confidence: result.confidence,
        score: result.score,
        confluence: result.confluence,
        analysts: result.analysts,
        llmModel: Object.values(agentModelMap)[0] ?? model ?? undefined,
      })

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
