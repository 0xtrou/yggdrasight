import { AssetClass, Exchange, ProviderType, SignalDirection, Timeframe } from '@oculus/core'
import type { CreateSignalInput } from '@oculus/core'

function tryDirection(b: Record<string, unknown>): SignalDirection {
  const raw = (b['direction'] ?? b['action'] ?? b['side'] ?? '') as string
  const v = raw.toLowerCase()
  if (v === 'buy' || v === 'long') return SignalDirection.LONG
  if (v === 'sell' || v === 'short') return SignalDirection.SHORT
  return SignalDirection.NEUTRAL
}

function tryPrice(b: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = parseFloat(String(b[k]))
    if (!isNaN(v) && v > 0) return v
  }
  return NaN
}

export function parseGeneric(body: unknown): CreateSignalInput {
  if (typeof body !== 'object' || body === null) throw new Error('Generic: payload must be an object')
  const b = body as Record<string, unknown>

  const rawSymbol = b['symbol'] ?? b['ticker'] ?? b['pair']
  if (typeof rawSymbol !== 'string' || !rawSymbol) throw new Error('Generic: missing symbol')
  const symbol = rawSymbol.includes(':') ? rawSymbol.split(':')[1] : rawSymbol

  const direction = tryDirection(b)

  const entryPrice = tryPrice(b, 'entryPrice', 'entry_price', 'price', 'close')
  if (isNaN(entryPrice)) throw new Error('Generic: cannot determine entry price')

  const stopLoss = tryPrice(b, 'stopLoss', 'stop_loss', 'stop', 'sl')
  if (isNaN(stopLoss)) throw new Error('Generic: cannot determine stop loss')

  const tpPrice = tryPrice(b, 'takeProfit', 'take_profit', 'target', 'tp')
  if (isNaN(tpPrice)) throw new Error('Generic: cannot determine take profit')

  const timeframe: Timeframe = (b['timeframe'] as Timeframe) ?? Timeframe.H1
  const notes = typeof b['notes'] === 'string' ? b['notes'] : undefined

  return {
    source: ProviderType.WEBHOOK,
    sourceProvider: 'webhook',
    sourceRaw: body,
    symbol,
    exchange: Exchange.UNKNOWN,
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
