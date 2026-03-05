import { Timeframe } from '@oculus/core'
import type { AnalysisContext, Candle, SignalDoc, MarketGlobal, OnChainData, SentimentData, OrderBookData } from '../types'

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
  }
}

/** Normalize symbol to Binance pair format (BTC → BTCUSDT) */
function toBinancePair(symbol: string): string {
  const upper = symbol.toUpperCase().trim()
  if (upper.endsWith('USDT') || upper.endsWith('BUSD') || upper.endsWith('USD')) return upper
  return `${upper}USDT`
}

async function fetchCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const pair = toBinancePair(symbol)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/prices/ohlcv?symbol=${encodeURIComponent(pair)}&interval=${tf}`)
  if (!res.ok) throw new Error(`OHLCV fetch failed: ${res.status}`)
  const data = await res.json() as { candles: Candle[] }
  return data.candles ?? []
}

async function fetchSignals(symbol: string): Promise<SignalDoc[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  // Normalize symbol for regex search: BTCUSDT → BTC so it matches BTC/USDT, BTCUSDT, BTC-USDT etc.
  const base = symbol.replace(/USDT$|BUSD$|USD$/i, '')
  const res = await fetch(`${baseUrl}/api/signals?symbol=${encodeURIComponent(base)}&limit=50`)
  if (!res.ok) throw new Error(`Signals fetch failed: ${res.status}`)
  const data = await res.json() as { signals: SignalDoc[] }
  return data.signals ?? []
}

async function fetchMarketGlobal(): Promise<MarketGlobal> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/market/global`)
  if (!res.ok) throw new Error(`Market global fetch failed: ${res.status}`)
  const raw = await res.json() as {
    btcDominance?: number
    totalMarketCap?: number
    fearGreedValue?: number
    fearGreedLabel?: string
  }
  // Map API response to MarketGlobal interface
  return {
    btcDominance: raw.btcDominance ?? 50,
    fearGreedIndex: raw.fearGreedValue ?? 50,
    fearGreedLabel: raw.fearGreedLabel ?? 'Neutral',
    totalMarketCap: raw.totalMarketCap ?? 0,
    totalMarketCapChange24h: 0,
  }
}


async function fetchOnChainData(_symbol: string): Promise<OnChainData | null> {
  // Placeholder — returns null until a real data source (Glassnode, CryptoQuant) is wired
  return null
}

async function fetchSentimentData(_symbol: string): Promise<SentimentData | null> {
  // Placeholder — returns null. Could wire to LunarCrush, Santiment, etc.
  return null
}

async function fetchOrderBookData(_symbol: string): Promise<OrderBookData | null> {
  // Placeholder — could wire to Binance depth API
  return null
}