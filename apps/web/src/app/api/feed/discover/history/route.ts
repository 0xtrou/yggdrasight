import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/feed/discover/history?symbol=BTC&limit=20
// Returns completed discovery jobs for a symbol, sorted by completedAt DESC.
// Also returns the latest completed job's result for immediate display.
export async function GET(request: Request) {
  return withAuth(async (ctx) => {
    try {
      const url = new URL(request.url)
      const symbol = url.searchParams.get('symbol')?.toUpperCase()
      if (!symbol) {
        return NextResponse.json({ jobs: [], latest: null })
      }

      const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)

      // Fetch completed jobs (most recent first)
      const jobs = await ctx.intelligenceModels.DiscoveryJob.find(
        { symbol, status: 'completed' },
        { _id: 1, symbol: 1, modelId: 1, status: 1, startedAt: 1, completedAt: 1, result: 1, rawOutput: 1 },
        { sort: { completedAt: -1 }, limit },
      ).lean()

      const transformed = jobs.map((j) => {
        const obj = j as unknown as Record<string, unknown>
        const { _id, __v, ...rest } = obj
        return { id: String(_id), ...rest }
      })

      return NextResponse.json({
        jobs: transformed,
        latest: transformed[0] ?? null,
      })
    } catch (err) {
      console.error('[GET /api/feed/discover/history]', err)
      return NextResponse.json({ jobs: [], latest: null }, { status: 500 })
    }
  })
}
