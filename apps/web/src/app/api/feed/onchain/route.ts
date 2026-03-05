import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface OnChainEntry {
  id: string
  time: string
  source: string
  headline: string
  sentiment?: 'up' | 'down' | 'neutral'
  value?: number
}

interface BinanceFundingRate {
  symbol: string
  fundingRate: string
  fundingTime: number
}

interface BinanceLongShortRatio {
  symbol: string
  longShortRatio: string
  longAccount: string
  shortAccount: string
  timestamp: number
}

interface BinanceOpenInterest {
  symbol: string
  openInterest: string
  time: number
}

interface BinanceTopTraderRatio {
  symbol: string
  longShortRatio: string
  longAccount: string
  shortAccount: string
  timestamp: number
}

interface BinanceTakerVolume {
  buySellRatio: string
  buyVol: string
  sellVol: string
  timestamp: number
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fundingSentiment(rate: number): 'up' | 'down' | 'neutral' {
  if (rate > 0.0005) return 'up' // Longs paying shorts — bullish momentum
  if (rate < -0.0005) return 'down' // Shorts paying longs — bearish pressure
  return 'neutral'
}

// GET /api/feed/onchain?symbol=BTC
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get('symbol') ?? 'BTC').toUpperCase()
    const pair = `${symbol}USDT`

    const entries: OnChainEntry[] = []

    // Fetch all Binance derivatives data in parallel
    const [fundingRes, longShortRes, oiRes, topTraderRes, takerRes] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${pair}&limit=5`, {
        next: { revalidate: 60 },
      }).catch(() => null),
      fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=1h&limit=5`, {
        next: { revalidate: 60 },
      }).catch(() => null),
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${pair}`, {
        next: { revalidate: 60 },
      }).catch(() => null),
      fetch(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${pair}&period=1h&limit=5`, {
        next: { revalidate: 60 },
      }).catch(() => null),
      fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${pair}&period=1h&limit=5`, {
        next: { revalidate: 60 },
      }).catch(() => null),
    ])

    // Process funding rates
    if (fundingRes?.ok) {
      const data: BinanceFundingRate[] = await fundingRes.json()
      for (const item of data) {
        const rate = parseFloat(item.fundingRate)
        const ratePct = (rate * 100).toFixed(4)
        const sign = rate >= 0 ? '+' : ''
        entries.push({
          id: `funding-${item.fundingTime}`,
          time: formatTime(item.fundingTime),
          source: 'BFUND',
          headline: `${symbol} funding rate: ${sign}${ratePct}% — ${rate > 0 ? 'longs pay shorts' : rate < 0 ? 'shorts pay longs' : 'neutral'}`,
          sentiment: fundingSentiment(rate),
          value: rate,
        })
      }
    }

    // Process global long/short ratio
    if (longShortRes?.ok) {
      const data: BinanceLongShortRatio[] = await longShortRes.json()
      for (const item of data) {
        const ratio = parseFloat(item.longShortRatio)
        const longPct = (parseFloat(item.longAccount) * 100).toFixed(1)
        const shortPct = (parseFloat(item.shortAccount) * 100).toFixed(1)
        entries.push({
          id: `lsr-${item.timestamp}`,
          time: formatTime(item.timestamp),
          source: 'BL/S',
          headline: `${symbol} long/short ratio: ${ratio.toFixed(2)} — ${longPct}% long / ${shortPct}% short`,
          sentiment: ratio > 1.2 ? 'up' : ratio < 0.8 ? 'down' : 'neutral',
          value: ratio,
        })
      }
    }

    // Process open interest
    if (oiRes?.ok) {
      const data: BinanceOpenInterest = await oiRes.json()
      const oi = parseFloat(data.openInterest)
      entries.push({
        id: `oi-${Date.now()}`,
        time: formatTime(Date.now()),
        source: 'BOI',
        headline: `${symbol} open interest: ${oi.toLocaleString()} ${symbol} — futures market depth`,
        sentiment: 'neutral',
        value: oi,
      })
    }

    // Process top trader position ratio
    if (topTraderRes?.ok) {
      const data: BinanceTopTraderRatio[] = await topTraderRes.json()
      if (data.length > 0) {
        const latest = data[0]
        const ratio = parseFloat(latest.longShortRatio)
        const longPct = (parseFloat(latest.longAccount) * 100).toFixed(1)
        const shortPct = (parseFloat(latest.shortAccount) * 100).toFixed(1)
        entries.push({
          id: `top-${latest.timestamp}`,
          time: formatTime(latest.timestamp),
          source: 'BTOP',
          headline: `${symbol} top traders: ${ratio.toFixed(2)} L/S ratio — ${longPct}% long / ${shortPct}% short`,
          sentiment: ratio > 1.5 ? 'up' : ratio < 0.7 ? 'down' : 'neutral',
          value: ratio,
        })
      }
    }

    // Process taker buy/sell volume ratio
    if (takerRes?.ok) {
      const data: BinanceTakerVolume[] = await takerRes.json()
      for (const item of data) {
        const ratio = parseFloat(item.buySellRatio)
        const buyVol = parseFloat(item.buyVol)
        const sellVol = parseFloat(item.sellVol)
        entries.push({
          id: `taker-${item.timestamp}`,
          time: formatTime(item.timestamp),
          source: 'BTVOL',
          headline: `${symbol} taker buy/sell: ${ratio.toFixed(3)} — buy $${(buyVol / 1e6).toFixed(1)}M / sell $${(sellVol / 1e6).toFixed(1)}M`,
          sentiment: ratio > 1.05 ? 'up' : ratio < 0.95 ? 'down' : 'neutral',
          value: ratio,
        })
      }
    }

    // Sort by time descending
    entries.sort((a, b) => b.time.localeCompare(a.time))

    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[GET /api/feed/onchain]', err)
    return NextResponse.json({ entries: [] })
  }
}
