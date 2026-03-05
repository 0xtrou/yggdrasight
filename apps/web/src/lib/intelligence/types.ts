import { SignalDirection, Timeframe, MarketRegime } from '@oculus/core'
export { SignalDirection, Timeframe, MarketRegime }

/**
 * Static metadata for every analyst module
 */
export interface AnalystMeta {
  id: string          // e.g. 'trend', 'signal-consensus', 'market-regime'
  name: string        // Human-readable, e.g. 'Trend & Momentum'
  description: string
  weight: number      // Static weight for consensus (e.g. 1.5, 1.0, 0.8)
}

/**
 * Extended metadata for LLM-powered analysts
 */
export interface LLMAnalystMeta extends AnalystMeta {
  type: 'llm'
  category: AnalystCategory
  systemPrompt: string           // The philosophy-encoding prompt
  requiredData: DataRequirement[] // What data sources this analyst needs
}

/**
 * Categories for grouping analysts in the UI
 */
export type AnalystCategory =
  | 'value-investing'
  | 'technical-analysis'
  | 'quantitative'
  | 'macro-economic'
  | 'behavioral-finance'
  | 'crypto-native'
  | 'risk-management'
  | 'market-microstructure'

/**
 * Data requirements that an LLM analyst can declare
 */
export type DataRequirement =
  | 'candles'
  | 'signals'
  | 'market-global'
  | 'on-chain'
  | 'sentiment'
  | 'orderbook'

/**
 * What every analyst returns
 */
export interface AnalystVerdict {
  meta: AnalystMeta
  direction: SignalDirection   // LONG | SHORT | NEUTRAL
  confidence: number           // 0.0 – 1.0 (capped, never raw)
  reason: string               // Human-readable explanation
  indicators?: Record<string, number | string>  // optional raw indicator values for display
}

/**
 * The ONE function every analyst module must implement
 */
export interface Analyst {
  meta: AnalystMeta
  analyze: (ctx: AnalysisContext) => Promise<AnalystVerdict>
}

/**
 * A single OHLCV candle (matches what Binance/useOHLCV returns)
 */
export interface Candle {
  time: number    // Unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Cached market global data
 */
export interface MarketGlobal {
  btcDominance: number         // e.g. 52.3 (percent)
  fearGreedIndex: number       // 0-100
  fearGreedLabel: string       // e.g. 'Greed'
  totalMarketCap: number       // in USD
  totalMarketCapChange24h: number  // percent
}

/**
 * Signal from DB (minimal shape needed by analysts — mirrors useSignals.ts Signal interface)
 */
export interface SignalDoc {
  id: string
  symbol: string
  direction: SignalDirection
  confidence: number           // 0.0 – 1.0
  createdAt: string
}

/**
 * Context passed to every analyst — lazy-cached data providers
 */
export interface AnalysisContext {
  symbol: string               // e.g. 'BTCUSDT'
  timeframes: Timeframe[]      // e.g. [H1, H4, D1]
  primaryTimeframe: Timeframe  // first in the array
  getCandles: (tf: Timeframe) => Promise<Candle[]>
  getSignals: () => Promise<SignalDoc[]>
  getMarketGlobal: () => Promise<MarketGlobal>

  // ── LLM analysis config ──
  model?: string                  // OpenCode model ID (e.g. 'google/gemini-2.5-pro')
  agentIds?: string[]             // Which LLM agents to run (empty = all)

  // ── Extended data providers (graceful degradation — may return null) ──
  getOnChainData?: () => Promise<OnChainData | null>
  getSentimentData?: () => Promise<SentimentData | null>
  getOrderBookData?: () => Promise<OrderBookData | null>
}
/**
 * Per-timeframe analysis result (used when running across multiple timeframes)
 */
export interface TimeframeAnalysis {
  timeframe: Timeframe
  direction: SignalDirection
  confidence: number
  score: number   // raw weighted score before threshold
}

/**
 * Final output of the consensus engine
 */
export interface ConsensusResult {
  symbol: string
  timeframes: Timeframe[]
  direction: SignalDirection       // final verdict
  confidence: number               // 0.0 – 1.0
  score: number                    // raw weighted score
  analysts: AnalystVerdict[]       // per-analyst breakdown
  timeframeAnalyses: TimeframeAnalysis[]
  confluence: number               // 0.0 – 1.0, how much analysts agree
  createdAt: string                // ISO timestamp
}

/**
 * MongoDB document shape for persisted verdicts
 */
export interface VerdictRecord {
  id: string
  symbol: string
  timeframes: Timeframe[]
  direction: SignalDirection
  confidence: number
  score: number
  confluence: number
  analysts: AnalystVerdict[]
  llmModel?: string
  createdAt: string
}

// ── LLM Analysis types ────────────────────────────────────────────────────────

/**
 * Configuration for an LLM analysis run
 */
export interface AnalysisConfig {
  symbol: string
  timeframes: Timeframe[]
  model: string                    // OpenCode model ID
  agentIds?: string[]              // Subset of LLM agents to run (undefined = all)
  includeDeterministic?: boolean   // Also run the 6 deterministic analysts (default: true)
}

/**
 * On-chain metrics (Glassnode-style)
 */
export interface OnChainData {
  activeAddresses24h?: number
  transactionVolume24h?: number    // in USD
  exchangeNetFlow24h?: number      // negative = outflow (bullish)
  whaleTransactions24h?: number    // txns > $100k
  nvtRatio?: number                // Network Value to Transactions
  mvrvRatio?: number               // Market Value to Realized Value
  sopr?: number                    // Spent Output Profit Ratio
  fundingRate?: number             // Perpetual futures funding rate
  openInterest?: number            // Total open interest in USD
}

/**
 * Sentiment metrics
 */
export interface SentimentData {
  fearGreedIndex: number           // 0-100
  fearGreedLabel: string
  socialVolume24h?: number         // Total social mentions
  socialSentiment?: number         // -1.0 to 1.0
  newsScore?: number               // -1.0 to 1.0 (NLP sentiment from news)
  trendingScore?: number           // 0-100 trending intensity
}

/**
 * Order book / microstructure data
 */
export interface OrderBookData {
  bestBid: number
  bestAsk: number
  spread: number                   // in basis points
  bidDepth: number                 // Total bid volume within 2% of mid
  askDepth: number                 // Total ask volume within 2% of mid
  imbalance: number                // -1.0 to 1.0 (positive = more bids)
}

/**
 * Result from OpenCode CLI model listing
 */
export interface AvailableModel {
  id: string                       // e.g. 'google/gemini-2.5-pro'
  provider: string                 // e.g. 'google'
  name: string                     // e.g. 'gemini-2.5-pro'
}

/**
 * LLM analyst definition — used by the base class to create Analyst instances
 */
export interface LLMAnalystDefinition {
  meta: LLMAnalystMeta
  /**
   * Optional function to add analyst-specific data to the prompt context.
   * Called after standard data serialization.
   */
  enrichPrompt?: (ctx: AnalysisContext, basePrompt: string) => Promise<string>
}
