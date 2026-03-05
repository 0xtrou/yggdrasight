import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/prices/ohlcv?symbol=BTCUSDT&interval=1h&limit=500
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const symbol = url.searchParams.get('symbol') ?? 'BTCUSDT'
    const interval = url.searchParams.get('interval') ?? '1h'
    const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 1000)

    const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`

    const res = await fetch(binanceUrl, {
      headers: { 'User-Agent': 'oculus-trading/1.0' },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[GET /api/prices/ohlcv] Binance error', res.status, text)
      return NextResponse.json({ error: `Binance API error: ${res.status}` }, { status: 502 })
    }

    // Binance klines: [openTime, open, high, low, close, volume, closeTime, ...]
    const raw: unknown[][] = await res.json()

    const candles = raw.map((k) => ({
      time: Math.floor(Number(k[0]) / 1000), // seconds
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }))

    return NextResponse.json({ candles })
  } catch (err) {
    console.error('[GET /api/prices/ohlcv]', err)
    return NextResponse.json({ error: 'Failed to fetch OHLCV data' }, { status: 500 })
  }
}
