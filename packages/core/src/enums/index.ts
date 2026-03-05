export enum SignalStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  TP_HIT = 'tp_hit',
  SL_HIT = 'sl_hit',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum SignalDirection {
  LONG = 'long',
  SHORT = 'short',
  NEUTRAL = 'neutral',
}

export enum Timeframe {
  M1 = '1m',
  M5 = '5m',
  M15 = '15m',
  M30 = '30m',
  H1 = '1h',
  H4 = '4h',
  H8 = '8h',
  H12 = '12h',
  D1 = '1d',
  W1 = '1w',
  MN = '1M',
}

export enum Exchange {
  BINANCE = 'binance',
  BYBIT = 'bybit',
  OKX = 'okx',
  COINBASE = 'coinbase',
  KRAKEN = 'kraken',
  HYPERLIQUID = 'hyperliquid',
  UNKNOWN = 'unknown',
}

export enum ProviderType {
  TRADINGVIEW = 'tradingview',
  TELEGRAM = 'telegram',
  WEBHOOK = 'webhook',
  MANUAL = 'manual',
  ONCHAIN = 'onchain',
  SOCIAL = 'social',
}

export enum MarketRegime {
  TRENDING_UP = 'trending_up',
  TRENDING_DOWN = 'trending_down',
  RANGING = 'ranging',
  VOLATILE = 'volatile',
  ACCUMULATION = 'accumulation',
  DISTRIBUTION = 'distribution',
}

export enum AssetClass {
  CRYPTO = 'crypto',
  FOREX = 'forex',
  EQUITIES = 'equities',
  COMMODITIES = 'commodities',
  DERIVATIVES = 'derivatives',
}
