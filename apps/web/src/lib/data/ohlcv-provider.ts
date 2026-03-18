import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import type { Candle } from '../intelligence/types'

const CACHE_DIR = resolve(process.cwd(), 'data', 'cache', 'ohlcv')
const COINGECKO_TTL_MS = 7 * 24 * 3600_000
const BINANCE_TTL_MS   = 2 * 60_000

const geckoIdMemCache = new Map<string, string>()
const GECKO_ID_CACHE_FILE = join(CACHE_DIR, '_gecko-id-map.json')

function loadGeckoIdCache(): void {
  if (geckoIdMemCache.size > 0) return
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    if (existsSync(GECKO_ID_CACHE_FILE)) {
      const raw = JSON.parse(readFileSync(GECKO_ID_CACHE_FILE, 'utf-8')) as Record<string, string>
      for (const [k, v] of Object.entries(raw)) geckoIdMemCache.set(k, v)
    }
  } catch { /* ignore */ }
}

function saveGeckoIdCache(): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(GECKO_ID_CACHE_FILE, JSON.stringify(Object.fromEntries(geckoIdMemCache)), 'utf-8')
  } catch { /* ignore */ }
}

/**
 * Fetch with exponential backoff on 429.
 * Delays: 10s → 20s → 30s (3 attempts max).
 */
async function fetchWithRetry(
  url: string,
  headers?: Record<string, string>,
  retries = 3,
): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'yggdrasight/1.0', ...headers } })
      if (res.ok) return res
      if (res.status === 429) {
        const wait = (i + 1) * 10_000  // 10s, 20s, 30s
        console.log(`[ohlcv-provider] 429 rate limit — waiting ${wait / 1000}s (attempt ${i + 1}/${retries})`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      console.warn(`[ohlcv-provider] HTTP ${res.status} for ${url}`)
      return null
    } catch (err) {
      console.warn(`[ohlcv-provider] Fetch error for ${url}:`, err)
    }
  }
  return null
}

function toBinancePair(symbol: string): string {
  const upper = symbol.toUpperCase().trim()
  if (upper.endsWith('USDT') || upper.endsWith('BUSD') || upper.endsWith('USD')) return upper
  return `${upper}USDT`
}

function toBaseSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
}

async function resolveGeckoId(symbol: string): Promise<string> {
  const base = toBaseSymbol(symbol)
  loadGeckoIdCache()

  if (geckoIdMemCache.has(base)) return geckoIdMemCache.get(base)!

  const res = await fetchWithRetry(`https://api.coingecko.com/api/v3/search?query=${base}`)
  if (res) {
    const data = await res.json() as { coins?: Array<{ id: string; symbol: string }> }
    const match = data.coins?.find(c => c.symbol.toUpperCase() === base)
    if (match) {
      geckoIdMemCache.set(base, match.id)
      saveGeckoIdCache()
      console.log(`[ohlcv-provider] Resolved ${base} → ${match.id}`)
      return match.id
    }
  }

  const fallback = base.toLowerCase()
  geckoIdMemCache.set(base, fallback)
  saveGeckoIdCache()
  return fallback
}

interface CacheEntry<T> { ts: number; data: T }

function readCache<T>(file: string, ttlMs: number): T | null {
  try {
    if (existsSync(file)) {
      const entry = JSON.parse(readFileSync(file, 'utf-8')) as CacheEntry<T>
      if (Date.now() - entry.ts < ttlMs) return entry.data
    }
  } catch { /* ignore */ }
  return null
}

function writeCache<T>(file: string, data: T): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(file, JSON.stringify({ ts: Date.now(), data }), 'utf-8')
  } catch { /* ignore */ }
}

async function fetchFromBinance(symbol: string, interval: string, limit: number): Promise<Candle[] | null> {
  const pair = toBinancePair(symbol)
  const safeLimit = Math.min(limit, 1000)
  const cacheFile = join(CACHE_DIR, `binance-${pair}-${interval}-${safeLimit}.json`)

  const cached = readCache<Candle[]>(cacheFile, BINANCE_TTL_MS)
  if (cached) {
    console.log(`[ohlcv-provider] Binance cache hit: ${pair} ${interval}`)
    return cached
  }

  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(interval)}&limit=${safeLimit}`
  const res = await fetchWithRetry(url, {}, 2)
  if (!res) return null

  try {
    const raw = await res.json() as unknown[][]
    if (!Array.isArray(raw) || raw.length === 0) return null

    const candles: Candle[] = raw.map(k => ({
      time: Math.floor(Number(k[0]) / 1000),  // ms → unix seconds
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }))

    writeCache(cacheFile, candles)
    console.log(`[ohlcv-provider] Binance: ${candles.length} candles for ${pair} ${interval}`)
    return candles
  } catch {
    return null
  }
}

/**
 * Fetch daily candles from CoinGecko market_chart.
 *
 * CoinGecko only provides [timestamp, price] pairs (no true OHLCV).
 * Resulting candles have open=high=low=close=price — fine for macro/30d analysis.
 */
async function fetchFromCoinGecko(symbol: string, days: number): Promise<Candle[] | null> {
  const geckoId = await resolveGeckoId(symbol)
  const cacheFile = join(CACHE_DIR, `cg-${geckoId}-${days}d.json`)

  const cached = readCache<Candle[]>(cacheFile, COINGECKO_TTL_MS)
  if (cached) {
    console.log(`[ohlcv-provider] CoinGecko cache hit: ${geckoId} ${days}d`)
    return cached
  }

  const url = `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
  console.log(`[ohlcv-provider] CoinGecko fetching ${days}d for ${geckoId}`)
  const res = await fetchWithRetry(url)
  if (!res) return null

  try {
    const data = await res.json() as {
      prices?: [number, number][]
      total_volumes?: [number, number][]
    }
    const prices = data.prices ?? []
    const volumes = data.total_volumes ?? []
    if (prices.length === 0) return null

    const candles: Candle[] = prices.map((p, i) => {
      const price = p[1]
      const vol = volumes[i]?.[1] ?? 0
      return {
        time: Math.floor(p[0] / 1000),  // ms → unix seconds
        open: price,
        high: price,
        low: price,
        close: price,
        volume: vol,
      }
    })

    writeCache(cacheFile, candles)
    console.log(`[ohlcv-provider] CoinGecko: ${candles.length} daily candles for ${geckoId}`)
    return candles
  } catch {
    return null
  }
}

export interface OHLCVOptions {
  /** Trading symbol — any format: 'BTC', 'BTCUSDT', 'btc' */
  symbol: string
  /** Binance klines interval: '1m', '5m', '15m', '1h', '4h', '1d', etc. (default: '1h') */
  interval?: string
  /** Max candle count for Binance (default: 500, max: 1000) */
  limit?: number
  /** Days for CoinGecko fallback (default: 30) */
  days?: number
}

/**
 * Fetch OHLCV candles — Binance primary, CoinGecko fallback.
 *
 * Always returns standard Candle[]:
 *   { time: unix seconds, open, high, low, close, volume }
 *
 * Fallback triggers when Binance fails (invalid symbol, network error,
 * non-USDT pair). CoinGecko result is daily granularity only.
 *
 * Returns [] if both providers fail.
 */
export async function fetchOHLCV(opts: OHLCVOptions): Promise<Candle[]> {
  const { symbol, interval = '1h', limit = 500, days = 30 } = opts

  const binanceCandles = await fetchFromBinance(symbol, interval, limit)
  if (binanceCandles && binanceCandles.length > 0) return binanceCandles

  console.log(`[ohlcv-provider] Binance failed for ${symbol} — falling back to CoinGecko`)

  const geckoCandles = await fetchFromCoinGecko(symbol, days)
  return geckoCandles ?? []
}
