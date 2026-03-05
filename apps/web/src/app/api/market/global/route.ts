import { NextResponse } from 'next/server'


// In-memory cache for global market data
let cache: { data: any; ts: number } | null = null
const CACHE_TTL = 60_000 // 60 seconds in milliseconds
export const dynamic = 'force-dynamic'

// GET /api/market/global — aggregates CoinGecko global + Fear & Greed index
export async function GET() {
  try {
    // Return cached data if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data)
    }

    const [globalRes, fngRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/global', {
        headers: { 'User-Agent': 'oculus-trading/1.0' },
        next: { revalidate: 60 },
      }),
      fetch('https://api.alternative.me/fng/', {
        headers: { 'User-Agent': 'oculus-trading/1.0' },
        next: { revalidate: 60 },
      }),
    ])

    if (!globalRes.ok) {
      console.error('[GET /api/market/global] CoinGecko error', globalRes.status)
      return NextResponse.json({ error: 'upstream unavailable' }, { status: 503 })
    }

    if (!fngRes.ok) {
      console.error('[GET /api/market/global] Fear & Greed error', fngRes.status)
      return NextResponse.json({ error: 'upstream unavailable' }, { status: 503 })
    }

    const globalData: {
      data: {
        market_cap_percentage: { btc: number }
        total_market_cap: { usd: number }
        total_volume: { usd: number }
        market_cap_change_percentage_24h_usd: number
      }
    } = await globalRes.json()

    const fngData: {
      data: { value: string; value_classification: string }[]
    } = await fngRes.json()

    const result = {
      btcDominance: globalData.data.market_cap_percentage.btc,
      totalMarketCap: globalData.data.total_market_cap.usd,
      totalVolume24h: globalData.data.total_volume.usd,
      totalMarketCapChange24h: globalData.data.market_cap_change_percentage_24h_usd ?? 0,
      fearGreedValue: Number(fngData.data[0].value),
      fearGreedLabel: fngData.data[0].value_classification,
    }

    // Store in cache
    cache = { data: result, ts: Date.now() }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/market/global]', err)
    return NextResponse.json({ error: 'upstream unavailable' }, { status: 503 })
  }
}
