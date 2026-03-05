import type {
  AssetClass,
  Exchange,
  MarketRegime,
  ProviderType,
  SignalDirection,
  SignalStatus,
  Timeframe,
} from '../enums'

export interface TakeProfit {
  level: number
  price: number
  hit?: boolean
  hitAt?: Date
}

export interface Signal {
  id: string
  createdAt: Date
  updatedAt: Date

  // Source
  source: ProviderType
  sourceProvider: string
  sourceRaw: unknown

  // Instrument
  symbol: string
  exchange: Exchange
  assetClass: AssetClass

  // Direction & levels
  direction: SignalDirection
  entryPrice: number
  entryPriceHigh?: number
  entryPriceLow?: number
  takeProfits: TakeProfit[]
  stopLoss: number
  timeframe: Timeframe

  // Analysis
  indicators: Record<string, unknown>
  fundamentalScore?: number
  confidenceScore?: number
  marketRegime?: MarketRegime
  projectId?: string

  // Lifecycle
  status: SignalStatus
  entryFilledAt?: Date
  exitPrice?: number
  exitedAt?: Date
  pnlPercent?: number
  pnlAbsolute?: number

  // Meta
  notes?: string
  tags: string[]
}
