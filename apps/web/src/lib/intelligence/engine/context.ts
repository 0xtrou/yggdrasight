import { Timeframe } from '@yggdrasight/core'
import { cookies } from 'next/headers'
import type { AnalysisContext, Candle, SignalDoc, MarketGlobal, OnChainData, SentimentData, OrderBookData, NewsData, DeveloperData, DefiProtocolData } from '../types'

export interface BuildContextOptions {
  symbol: string
  timeframes: Timeframe[]
  model?: string       // OpenCode model ID for LLM analysts
  agentIds?: string[]  // LLM agent IDs to run
}

export function buildContext(symbol: string, timeframes: Timeframe[], model?: string): AnalysisContext {
  const candleCache = new Map<Timeframe, Promise<Candle[]>>()
  let signalsCache: Promise<SignalDoc[]> | null = null
  let marketGlobalCache: Promise<MarketGlobal> | null = null
  let onChainCache: Promise<OnChainData | null> | null = null
  let sentimentCache: Promise<SentimentData | null> | null = null
  let orderBookCache: Promise<OrderBookData | null> | null = null
  let newsCache: Promise<NewsData | null> | null = null
  let developerCache: Promise<DeveloperData | null> | null = null
  let defiCache: Promise<DefiProtocolData | null> | null = null
  return {
    symbol,
    timeframes,
    primaryTimeframe: timeframes[0] ?? Timeframe.H4,
    model,

    getCandles: (tf: Timeframe): Promise<Candle[]> => {
      if (!candleCache.has(tf)) {
        candleCache.set(tf, fetchCandles(symbol, tf))
      }
      return candleCache.get(tf)!
    },

    getSignals: (): Promise<SignalDoc[]> => {
      if (!signalsCache) {
        signalsCache = fetchSignals(symbol)
      }
      return signalsCache
    },

    getMarketGlobal: (): Promise<MarketGlobal> => {
      if (!marketGlobalCache) {
        marketGlobalCache = fetchMarketGlobal()
      }
      return marketGlobalCache
    },

    getOnChainData: (): Promise<OnChainData | null> => {
      if (!onChainCache) {
        onChainCache = fetchOnChainData(symbol)
      }
      return onChainCache
    },

    getSentimentData: (): Promise<SentimentData | null> => {
      if (!sentimentCache) {
        sentimentCache = fetchSentimentData(symbol)
      }
      return sentimentCache
    },

    getOrderBookData: (): Promise<OrderBookData | null> => {
      if (!orderBookCache) {
        orderBookCache = fetchOrderBookData(symbol)
      }
      return orderBookCache
    },

    getNewsData: (): Promise<NewsData | null> => {
      if (!newsCache) {
        newsCache = fetchNewsData(symbol)
      }
      return newsCache
    },

    getDeveloperData: (): Promise<DeveloperData | null> => {
      if (!developerCache) {
        developerCache = fetchDeveloperData(symbol)
      }
      return developerCache
    },

    getDefiData: (): Promise<DefiProtocolData | null> => {
      if (!defiCache) {
        defiCache = fetchDefiData(symbol)
      }
      return defiCache
    },
  }
}

/** Normalize symbol to Binance pair format (BTC → BTCUSDT) */
function toBinancePair(symbol: string): string {
  const upper = symbol.toUpperCase().trim()
  if (upper.endsWith('USDT') || upper.endsWith('BUSD') || upper.endsWith('USD')) return upper
  return `${upper}USDT`
}

/** Read request cookies and return a header object for internal fetches. */
async function getInternalHeaders(): Promise<Record<string, string>> {
  try {
    const cookieStore = await cookies()
    const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
    if (cookieHeader) return { Cookie: cookieHeader }
  } catch { /* not in a request context */ }
  return {}
}

async function fetchCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const pair = toBinancePair(symbol)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const headers = await getInternalHeaders()
  const res = await fetch(`${baseUrl}/api/prices/ohlcv?symbol=${encodeURIComponent(pair)}&interval=${tf}`, { headers })
  if (!res.ok) throw new Error(`OHLCV fetch failed: ${res.status}`)
  const data = await res.json() as { candles: Candle[] }
  return data.candles ?? []
}

async function fetchSignals(symbol: string): Promise<SignalDoc[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const base = symbol.replace(/USDT$|BUSD$|USD$/i, '')
  const headers = await getInternalHeaders()
  const res = await fetch(`${baseUrl}/api/signals?symbol=${encodeURIComponent(base)}&limit=50`, { headers })
  if (!res.ok) throw new Error(`Signals fetch failed: ${res.status}`)
  const data = await res.json() as { signals: SignalDoc[] }
  return data.signals ?? []
}

async function fetchMarketGlobal(): Promise<MarketGlobal> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const headers = await getInternalHeaders()
  const res = await fetch(`${baseUrl}/api/market/global`, { headers })
  if (!res.ok) throw new Error(`Market global fetch failed: ${res.status}`)
  const raw = await res.json() as {
    btcDominance?: number
    totalMarketCap?: number
    fearGreedValue?: number
    fearGreedLabel?: string
    totalMarketCapChange24h?: number
  }
  return {
    btcDominance: raw.btcDominance ?? 50,
    fearGreedIndex: raw.fearGreedValue ?? 50,
    fearGreedLabel: raw.fearGreedLabel ?? 'Neutral',
    totalMarketCap: raw.totalMarketCap ?? 0,
    totalMarketCapChange24h: raw.totalMarketCapChange24h ?? 0,
  }
}


async function fetchOnChainData(symbol: string): Promise<OnChainData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '')
    const headers = await getInternalHeaders()
    const res = await fetch(`${baseUrl}/api/feed/onchain?symbol=${encodeURIComponent(base)}`, { headers })
    if (!res.ok) return null
    const data = await res.json() as { entries: { headline: string; value?: number; sentiment?: string; source: string }[] }
    const entries = data.entries ?? []
    if (entries.length === 0) return null

    // Map feed entries to OnChainData interface
    const result: OnChainData = {}

    for (const e of entries) {
      if (e.source === 'BFUND' && e.value !== undefined) {
        result.fundingRate = e.value
      } else if (e.source === 'BOI' && e.value !== undefined) {
        result.openInterest = e.value
      } else if (e.source === 'BL/S' && e.value !== undefined) {
        result.longShortRatio = e.value
        // Parse percentages from headline: "BTC long/short ratio: 1.23 — 55.1% long / 44.9% short"
        const lsMatch = e.headline.match(/(\d+\.\d+)%\s*long\s*\/\s*(\d+\.\d+)%\s*short/)
        if (lsMatch) {
          result.longAccountPct = parseFloat(lsMatch[1])
          result.shortAccountPct = parseFloat(lsMatch[2])
        }
      } else if (e.source === 'BTOP' && e.value !== undefined) {
        result.topTraderLongShortRatio = e.value
        const topMatch = e.headline.match(/(\d+\.\d+)%\s*long\s*\/\s*(\d+\.\d+)%\s*short/)
        if (topMatch) {
          result.topTraderLongPct = parseFloat(topMatch[1])
          result.topTraderShortPct = parseFloat(topMatch[2])
        }
      } else if (e.source === 'BTVOL' && e.value !== undefined) {
        result.takerBuySellRatio = e.value
        // Parse volumes from headline: "BTC taker buy/sell: 1.023 — buy $123.4M / sell $120.1M"
        const volMatch = e.headline.match(/buy\s*\$([\d.]+)M\s*\/\s*sell\s*\$([\d.]+)M/)
        if (volMatch) {
          result.takerBuyVolume = parseFloat(volMatch[1]) * 1e6
          result.takerSellVolume = parseFloat(volMatch[2]) * 1e6
        }
      }
    }
    return result
  } catch {
    return null
  }
}

async function fetchSentimentData(symbol: string): Promise<SentimentData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '')
    const headers = await getInternalHeaders()
    const res = await fetch(`${baseUrl}/api/feed/social?symbol=${encodeURIComponent(base)}`, { headers })
    if (!res.ok) return null
    const data = await res.json() as { entries: { id: string; headline: string; value?: number; sentiment?: string; source: string }[] }
    const entries = data.entries ?? []
    if (entries.length === 0) return null

    // Extract sentiment data from social feed entries
    let sentimentUp = 50
    let socialVolume: number | undefined
    let trendingScore: number | undefined

    for (const e of entries) {
      if (e.id.startsWith('sentiment-') && e.value !== undefined) {
        sentimentUp = e.value  // CoinGecko sentiment_votes_up_percentage
      } else if (e.id.startsWith('reddit-subs-') && e.value !== undefined) {
        socialVolume = (socialVolume ?? 0) + e.value
      } else if (e.id.startsWith('twitter-') && e.value !== undefined) {
        socialVolume = (socialVolume ?? 0) + e.value
      } else if (e.id === `trending-${base}`) {
        trendingScore = 80  // If our coin is trending, score high
      }
    }

    // Map sentiment_votes_up_percentage (0-100) to socialSentiment (-1 to 1)
    const socialSentiment = (sentimentUp - 50) / 50  // 50% → 0, 100% → 1, 0% → -1

    // Map to Fear & Greed-style values
    const fearGreedIndex = Math.round(sentimentUp)
    const fearGreedLabel = fearGreedIndex >= 75 ? 'Extreme Greed'
      : fearGreedIndex >= 55 ? 'Greed'
      : fearGreedIndex >= 45 ? 'Neutral'
      : fearGreedIndex >= 25 ? 'Fear'
      : 'Extreme Fear'

    return {
      fearGreedIndex,
      fearGreedLabel,
      socialVolume24h: socialVolume,
      socialSentiment,
      trendingScore,
    }
  } catch {
    return null
  }
}

async function fetchOrderBookData(symbol: string): Promise<OrderBookData | null> {
  try {
    const pair = toBinancePair(symbol)
    const res = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${pair}&limit=20`)
    if (!res.ok) return null
    const data = await res.json() as { bids: [string, string][]; asks: [string, string][] }
    const bids = data.bids ?? []
    const asks = data.asks ?? []
    if (bids.length === 0 || asks.length === 0) return null

    const bestBid = parseFloat(bids[0][0])
    const bestAsk = parseFloat(asks[0][0])
    const midPrice = (bestBid + bestAsk) / 2
    const spread = ((bestAsk - bestBid) / midPrice) * 10000 // basis points

    // Sum bid/ask depth within 2% of mid price
    const depthThreshold = midPrice * 0.02
    let bidDepth = 0
    let askDepth = 0
    for (const [price, qty] of bids) {
      if (midPrice - parseFloat(price) <= depthThreshold) {
        bidDepth += parseFloat(price) * parseFloat(qty)
      }
    }
    for (const [price, qty] of asks) {
      if (parseFloat(price) - midPrice <= depthThreshold) {
        askDepth += parseFloat(price) * parseFloat(qty)
      }
    }

    const totalDepth = bidDepth + askDepth
    const imbalance = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0

    return { bestBid, bestAsk, spread, bidDepth, askDepth, imbalance }
  } catch {
    return null
  }
}

async function fetchNewsData(symbol: string): Promise<NewsData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '')
    const headers = await getInternalHeaders()
    const res = await fetch(`${baseUrl}/api/feed/news?symbol=${encodeURIComponent(base)}`, { headers })
    if (!res.ok) return null
    const data = await res.json() as { entries: { time: string; source: string; headline: string; sentiment?: 'up' | 'down' | 'neutral' }[] }
    const entries = data.entries ?? []
    if (entries.length === 0) return null

    const items = entries.map(e => ({
      time: e.time,
      source: e.source,
      headline: e.headline,
      sentiment: e.sentiment,
    }))

    const bullishCount = items.filter(i => i.sentiment === 'up').length
    const bearishCount = items.filter(i => i.sentiment === 'down').length
    const neutralCount = items.filter(i => i.sentiment === 'neutral' || !i.sentiment).length

    const dominantSentiment: 'up' | 'down' | 'neutral' =
      bullishCount > bearishCount && bullishCount > neutralCount ? 'up'
      : bearishCount > bullishCount && bearishCount > neutralCount ? 'down'
      : 'neutral'

    return {
      items,
      bullishCount,
      bearishCount,
      neutralCount,
      dominantSentiment,
    }
  } catch {
    return null
  }
}

async function fetchDeveloperData(symbol: string): Promise<DeveloperData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '')
    const headers = await getInternalHeaders()
    const res = await fetch(`${baseUrl}/api/feed/developer?symbol=${encodeURIComponent(base)}`, { headers })
    if (!res.ok) return null
    const json = await res.json() as { data: DeveloperData | null }
    return json.data ?? null
  } catch {
    return null
  }
}

async function fetchDefiData(symbol: string): Promise<DefiProtocolData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '')
    const headers = await getInternalHeaders()
    const res = await fetch(`${baseUrl}/api/feed/defi?symbol=${encodeURIComponent(base)}`, { headers })
    if (!res.ok) return null
    const json = await res.json() as { data: DefiProtocolData | null }
    return json.data ?? null
  } catch {
    return null
  }
}