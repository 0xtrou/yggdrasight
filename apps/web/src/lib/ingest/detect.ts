import { ProviderType } from '@oculus/core'

export function detectProvider(body: unknown): ProviderType {
  if (typeof body !== 'object' || body === null) return ProviderType.WEBHOOK
  const b = body as Record<string, unknown>
  // TradingView: has 'action' AND (symbol contains ':' OR has 'interval' OR has 'exchange')
  const hasAction = typeof b['action'] === 'string'
  const symbolHasColon = typeof b['symbol'] === 'string' && (b['symbol'] as string).includes(':')
  const hasInterval = typeof b['interval'] === 'string'
  const hasExchange = typeof b['exchange'] === 'string'
  if (hasAction && (symbolHasColon || hasInterval || hasExchange)) {
    return ProviderType.TRADINGVIEW
  }
  return ProviderType.WEBHOOK
}
