import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@oculus/db'
import { IntelligenceVerdict } from '@/lib/intelligence/models/verdict.model'

export const dynamic = 'force-dynamic'

// GET /api/intelligence/verdicts — list verdicts with optional filters
export async function GET(req: NextRequest) {
  try {
    await connectDB()

    const url = req.nextUrl
    const query: Record<string, unknown> = {}

    const symbol = url.searchParams.get('symbol')
    if (symbol) query.symbol = { $regex: symbol, $options: 'i' }

    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)
    const verdicts = await IntelligenceVerdict.find(query).sort({ createdAt: -1 }).limit(limit).lean()

    // Transform _id → id
    const transformed = verdicts.map((v) => {
      const obj = v as unknown as Record<string, unknown>
      const { _id, __v, ...rest } = obj
      return { id: String(_id), ...rest }
    })

    return NextResponse.json({ verdicts: transformed })
  } catch (err) {
    console.error('[GET /api/intelligence/verdicts]', err)
    return NextResponse.json({ error: 'Failed to fetch verdicts' }, { status: 500 })
  }
}
