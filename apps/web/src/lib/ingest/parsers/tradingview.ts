import { AssetClass, Exchange, ProviderType, SignalDirection, Timeframe } from '@yggdrasight/core'
import type { CreateSignalInput } from '@yggdrasight/core'

const INTERVAL_MAP: Record<string, Timeframe> = {
  '1': Timeframe.M1, '5': Timeframe.M5, '15': Timeframe.M15, '30': Timeframe.M30,
  '60': Timeframe.H1, '240': Timeframe.H4, '480': Timeframe.H8, '720': Timeframe.H12,
  'D': Timeframe.D1, 'W': Timeframe.W1,
}

const EXCHANGE_MAP: Record<string, Exchange> = {
  binance: Exchange.BINANCE, bybit: Exchange.BYBIT, okx: Exchange.OKX,
  coinbase: Exchange.COINBASE, kraken: Exchange.KRAKEN, hyperliquid: Exchange.HYPERLIQUID,
}

function mapDirection(action: string): SignalDirection {
  const a = action.toLowerCase()
  if (a === 'buy' || a === 'long') return SignalDirection.LONG
  if (a === 'sell' || a === 'short') return SignalDirection.SHORT
  return SignalDirection.NEUTRAL
}

function mapExchange(ex: string | undefined): Exchange {
  if (!ex) return Exchange.UNKNOWN
  return EXCHANGE_MAP[ex.toLowerCase()] ?? Exchange.UNKNOWN
}

function mapTimeframe(interval: string | undefined): Timeframe {
  if (!interval) return Timeframe.H1
  return INTERVAL_MAP[interval] ?? Timeframe.H1
}

export function parseTradingView(body: unknown): CreateSignalInput {
  if (typeof body !== 'object' || body === null) throw new Error('TradingView: payload must be an object')
  const b = body as Record<string, unknown>

  // Symbol
  const rawSymbol = b['symbol']
  if (typeof rawSymbol !== 'string' || !rawSymbol) throw new Error('TradingView: missing symbol')
  const symbol = rawSymbol.includes(':') ? rawSymbol.split(':')[1] : rawSymbol

  // Exchange
  const rawExchange = b['exchange']
  const symbolExchange = rawSymbol.includes(':') ? rawSymbol.split(':')[0] : undefined
  const exchange = mapExchange(typeof rawExchange === 'string' ? rawExchange : symbolExchange)

  // Direction
  const action = b['action']
  if (typeof action !== 'string' || !action) throw new Error('TradingView: missing action')
  const direction = mapDirection(action)

  // Entry price
  const rawPrice = b['price']
  const entryPrice = parseFloat(String(rawPrice))
  if (isNaN(entryPrice)) throw new Error('TradingView: invalid or missing price')

  // Stop loss
  const rawStop = b['stop']
  const stopLoss = parseFloat(String(rawStop))
  if (isNaN(stopLoss)) throw new Error('TradingView: invalid or missing stop')

  // Take profit
  const rawTarget = b['target']
  const tpPrice = parseFloat(String(rawTarget))
  if (isNaN(tpPrice)) throw new Error('TradingView: invalid or missing target')

  // Timeframe
  const timeframe = mapTimeframe(typeof b['interval'] === 'string' ? b['interval'] : undefined)

  // Notes
  const notes = typeof b['message'] === 'string' ? b['message'] : undefined

  return {
    source: ProviderType.TRADINGVIEW,
    sourceProvider: 'tradingview',
    sourceRaw: body,
    symbol,
    exchange,
    assetClass: AssetClass.CRYPTO,
    direction,
    entryPrice,
    stopLoss,
    takeProfits: [{ level: 1, price: tpPrice }],
    timeframe,
    indicators: {},
    tags: [],
    notes,
  }
}
