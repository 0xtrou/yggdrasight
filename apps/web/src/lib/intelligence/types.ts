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
  | 'long-term-investing'

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
  | 'news'
  | 'developer'
  | 'defi'

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
  getNewsData?: () => Promise<NewsData | null>
  getDeveloperData?: () => Promise<DeveloperData | null>
  getDefiData?: () => Promise<DefiProtocolData | null>
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
  // Core metrics (Glassnode-style — placeholders for future integration)
  activeAddresses24h?: number
  transactionVolume24h?: number    // in USD
  exchangeNetFlow24h?: number      // negative = outflow (bullish)
  whaleTransactions24h?: number    // txns > $100k
  nvtRatio?: number                // Network Value to Transactions
  mvrvRatio?: number               // Market Value to Realized Value
  sopr?: number                    // Spent Output Profit Ratio
  // Binance derivatives (fully wired)
  fundingRate?: number             // Perpetual futures funding rate
  openInterest?: number            // Total open interest (in base asset)
  longShortRatio?: number          // Global long/short account ratio
  longAccountPct?: number          // % accounts long
  shortAccountPct?: number         // % accounts short
  topTraderLongShortRatio?: number // Top traders L/S ratio
  topTraderLongPct?: number        // Top traders % long
  topTraderShortPct?: number       // Top traders % short
  takerBuySellRatio?: number       // Taker buy/sell volume ratio
  takerBuyVolume?: number          // Taker buy volume in USD
  takerSellVolume?: number         // Taker sell volume in USD
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
 * News/headline data for narrative analysis
 */
export interface NewsItem {
  time: string
  source: string
  headline: string
  sentiment?: 'up' | 'down' | 'neutral'
}

export interface NewsData {
  items: NewsItem[]
  bullishCount: number
  bearishCount: number
  neutralCount: number
  dominantSentiment: 'up' | 'down' | 'neutral'
}

/**
 * Developer & project fundamental data (CoinGecko)
 */
export interface DeveloperData {
  // Identity
  name: string                     // Coin name (e.g. 'Bitcoin')
  twitterHandle: string | null     // Twitter/X screen name
  // GitHub metrics
  stars: number
  forks: number
  subscribers: number
  totalIssues: number
  closedIssues: number
  pullRequestsMerged: number
  pullRequestContributors: number
  commitCount4Weeks: number
  codeAdditions4Weeks: number
  codeDeletions4Weeks: number
  commitActivitySeries: number[]    // 28-day daily commit array
  // Project metadata
  categories: string[]              // e.g. ['AI', 'DePIN', 'Layer 1']
  description: string               // project description
  genesisDate: string | null        // project launch date
  githubRepos: string[]             // GitHub repo URLs
  homepage: string | null
  // Community snapshot
  telegramUsers: number | null
  redditSubscribers: number | null
  twitterFollowers: number | null
  sentimentUp: number               // CoinGecko sentiment_votes_up_percentage
  sentimentDown: number
}

/**
 * DeFi protocol metrics (DeFiLlama)
 */
export interface DefiProtocolData {
  protocolName: string | null
  protocolSlug: string | null
  tvl: number | null                // Current TVL in USD
  tvlChange24h: number | null       // TVL change % 24h
  tvlChange7d: number | null        // TVL change % 7d
  mcapToTvl: number | null          // Market cap / TVL ratio
  category: string | null           // e.g. 'Dexes', 'Lending', 'Bridge'
  chains: string[]                  // Chains the protocol operates on
  chainTvl: number | null           // Total TVL on this chain (if L1/L2)
  fees24h: number | null
  fees7d: number | null
  fees30d: number | null
  revenue24h: number | null
  revenue7d: number | null
  revenue30d: number | null
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

/**
 * Data discovered by OpenCode agent via web search (websearch + webfetch).
 * Organized around the 4 core investment pillars.
 * Fields are nullable because the agent may not find everything.
 */
export interface DiscoveredProjectInfo {
  // ── Identity ──
  projectName: string | null
  description: string | null
  website: string | null
  twitter: string | null
  github: string | null
  discord: string | null
  telegram: string | null

  // ── PILLAR 1: Team Survival Fitness ──
  founders: string[] | null           // Key founders/team members
  teamSize: string | null             // e.g. '50+', '10-20'
  teamBackground: string | null       // Brief background on the team
  fundingRounds: string[] | null      // e.g. ['Series A: $10M (a16z, 2023)']
  totalFunding: string | null         // e.g. '$85M'
  investors: string[] | null          // Key investors/VCs
  treasury: string | null             // e.g. '$50M estimated runway'
  teamActivity: string | null         // Recent team activity signals (hiring, shipping)
  genesisDate: string | null          // Project launch date

  // ── PILLAR 2: Narrative Alignment ──
  categories: string[] | null         // e.g. ['AI', 'DePIN', 'Compute']
  ecosystem: string | null            // e.g. 'Polkadot', 'Cosmos', 'Standalone'
  narrativeStrength: string | null    // How well the project fits current macro narratives
  uniqueSellingPoint: string | null   // Core value proposition
  competitors: string[] | null        // Direct competitors
  partnerships: string[] | null       // Notable partnerships/integrations
  adoptionSignals: string | null      // dApp usage, TVL growth, user metrics

  // ── PILLAR 3: Economic Moat ──
  tokenType: string | null            // e.g. 'ERC-20', 'Native L1', 'SPL'
  totalSupply: string | null
  circulatingSupply: string | null
  maxSupply: string | null
  tvl: string | null                  // As string since agent may report '$1.2B'
  marketCap: string | null
  fdv: string | null
  revenueModel: string | null         // How the protocol earns
  moatDescription: string | null      // What makes it defensible
  mainnetLaunched: boolean | null
  audited: boolean | null
  auditDetails: string | null         // Which firms, when

  // ── PILLAR 4: Valuation & Accumulation Zone ──
  currentPrice: string | null
  allTimeHigh: string | null
  allTimeLow: string | null
  priceFromATH: string | null         // e.g. '-56% from ATH'
  vestingSchedule: string | null      // Token unlock schedule summary
  inflationRate: string | null        // Annual token emission rate
  stakingYield: string | null         // Staking APR/APY if applicable
  valuationNotes: string | null       // Agent's valuation assessment

  // ── On-chain Activity ──
  contractAddress: string | null
  chain: string | null
  holderCount: string | null
  activeAddresses24h: string | null
  largeTransactions: string | null    // Notable whale activity summary
  topHolders: string[] | null
  onChainSummary: string | null

  // ── Risks & News ──
  risks: string[] | null
  recentNews: string[] | null

  // ── AI Assessment ──
  aiSummary: string | null            // Overall agent assessment
  pillar1Score: string | null         // e.g. 'STRONG', 'MODERATE', 'WEAK'
  pillar2Score: string | null
  pillar3Score: string | null
  pillar4Score: string | null

  // ── Metadata ──
  discoveredAt: string
  sourcesUsed: string[]
}

/**
 * Unified project info — merges API data (CoinGecko, DeFiLlama) with
 * AI-discovered data into a single view organized by the 4 core pillars.
 * Each field has a `source` to show where data came from.
 */
export interface UnifiedProjectField<T = string | null> {
  value: T
  source: 'api' | 'ai' | 'both'      // 'api' = CoinGecko/DeFiLlama, 'ai' = agent discovery
}

export interface UnifiedProjectInfo {
  // ── Identity ──
  name: UnifiedProjectField
  description: UnifiedProjectField
  categories: UnifiedProjectField<string[]>
  genesisDate: UnifiedProjectField
  website: UnifiedProjectField
  twitter: UnifiedProjectField
  github: UnifiedProjectField
  discord: UnifiedProjectField
  telegram: UnifiedProjectField

  // ── PILLAR 1: Team Survival Fitness ──
  founders: UnifiedProjectField<string[] | null>
  teamSize: UnifiedProjectField
  teamBackground: UnifiedProjectField
  fundingRounds: UnifiedProjectField<string[] | null>
  totalFunding: UnifiedProjectField
  investors: UnifiedProjectField<string[] | null>
  treasury: UnifiedProjectField
  teamActivity: UnifiedProjectField
  commitCount4Weeks: UnifiedProjectField<number | null>
  commitActivitySeries: UnifiedProjectField<number[]>
  pullRequestsMerged: UnifiedProjectField<number | null>
  pullRequestContributors: UnifiedProjectField<number | null>
  codeAdditions4Weeks: UnifiedProjectField<number | null>
  codeDeletions4Weeks: UnifiedProjectField<number | null>
  issuesClosed: UnifiedProjectField<number | null>
  issuesTotal: UnifiedProjectField<number | null>
  githubStars: UnifiedProjectField<number | null>
  githubForks: UnifiedProjectField<number | null>
  pillar1Score: UnifiedProjectField

  // ── PILLAR 2: Narrative Alignment ──
  ecosystem: UnifiedProjectField
  narrativeStrength: UnifiedProjectField
  uniqueSellingPoint: UnifiedProjectField
  competitors: UnifiedProjectField<string[] | null>
  partnerships: UnifiedProjectField<string[] | null>
  adoptionSignals: UnifiedProjectField
  sentimentUp: UnifiedProjectField<number | null>
  sentimentDown: UnifiedProjectField<number | null>
  twitterFollowers: UnifiedProjectField<number | null>
  redditSubscribers: UnifiedProjectField<number | null>
  telegramUsers: UnifiedProjectField<number | null>
  pillar2Score: UnifiedProjectField

  // ── PILLAR 3: Economic Moat ──
  tokenType: UnifiedProjectField
  totalSupply: UnifiedProjectField
  circulatingSupply: UnifiedProjectField
  maxSupply: UnifiedProjectField
  protocolName: UnifiedProjectField
  protocolCategory: UnifiedProjectField
  tvl: UnifiedProjectField
  tvlChange24h: UnifiedProjectField<number | null>
  tvlChange7d: UnifiedProjectField<number | null>
  mcapToTvl: UnifiedProjectField<number | null>
  chains: UnifiedProjectField<string[]>
  chainTvl: UnifiedProjectField<number | null>
  marketCap: UnifiedProjectField
  fdv: UnifiedProjectField
  revenueModel: UnifiedProjectField
  moatDescription: UnifiedProjectField
  mainnetLaunched: UnifiedProjectField
  audited: UnifiedProjectField
  auditDetails: UnifiedProjectField
  pillar3Score: UnifiedProjectField

  // ── PILLAR 4: Valuation & Accumulation Zone ──
  fees24h: UnifiedProjectField<number | null>
  fees7d: UnifiedProjectField<number | null>
  fees30d: UnifiedProjectField<number | null>
  revenue24h: UnifiedProjectField<number | null>
  revenue7d: UnifiedProjectField<number | null>
  revenue30d: UnifiedProjectField<number | null>
  currentPrice: UnifiedProjectField
  allTimeHigh: UnifiedProjectField
  allTimeLow: UnifiedProjectField
  priceFromATH: UnifiedProjectField
  vestingSchedule: UnifiedProjectField
  inflationRate: UnifiedProjectField
  stakingYield: UnifiedProjectField
  valuationNotes: UnifiedProjectField
  pillar4Score: UnifiedProjectField

  // ── On-chain Activity ──
  contractAddress: UnifiedProjectField
  chain: UnifiedProjectField
  holderCount: UnifiedProjectField
  activeAddresses24h: UnifiedProjectField
  largeTransactions: UnifiedProjectField
  topHolders: UnifiedProjectField<string[] | null>
  onChainSummary: UnifiedProjectField

  // ── Risks & News ──
  risks: UnifiedProjectField<string[] | null>
  recentNews: UnifiedProjectField<string[] | null>

  // ── AI Assessment ──
  aiSummary: UnifiedProjectField

  // ── Metadata ──
  hasApiData: boolean
  hasAiData: boolean
  discoveredAt: string | null
  sourcesUsed: string[]
}
