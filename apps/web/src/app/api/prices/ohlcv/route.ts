import { NextRequest, NextResponse } from 'next/server'
import { fetchOHLCV } from '@/lib/data/ohlcv-provider'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const symbol = url.searchParams.get('symbol') ?? 'BTCUSDT'
    const interval = url.searchParams.get('interval') ?? '1h'
    const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 1000)

    const candles = await fetchOHLCV({ symbol, interval, limit })
    return NextResponse.json({ candles })
  } catch (err) {
    console.error('[GET /api/prices/ohlcv]', err)
    return NextResponse.json({ error: 'Failed to fetch OHLCV data' }, { status: 500 })
  }
}
