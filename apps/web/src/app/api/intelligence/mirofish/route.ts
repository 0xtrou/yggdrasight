import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withAuth(async (ctx) => {
    try {
      const url = req.nextUrl
      const symbol = url.searchParams.get('symbol')
      const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)

      const query: Record<string, unknown> = {}
      if (symbol) query.symbol = { $regex: symbol, $options: 'i' }

      const records = await ctx.intelligenceModels.MirofishPrediction
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()

      const transformed = records.map((r) => {
        const obj = r as unknown as Record<string, unknown>
        const { _id, __v, ...rest } = obj
        return { id: String(_id), ...rest }
      })

      return NextResponse.json({ predictions: transformed })
    } catch (err) {
      console.error('[GET /api/intelligence/mirofish]', err)
      return NextResponse.json({ error: 'Failed to fetch Mirofish predictions' }, { status: 500 })
    }
  })
}
