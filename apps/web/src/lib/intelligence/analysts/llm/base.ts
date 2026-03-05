import { SignalDirection, Timeframe } from '@oculus/core'
import type {
  Analyst,
  AnalystVerdict,
  AnalysisContext,
  LLMAnalystDefinition,
  LLMAnalystMeta,
  Candle,
  MarketGlobal,
  SignalDoc,
  OnChainData,
  SentimentData,
  OrderBookData,
} from '../../types'
import { runOpenCode, parseVerdictFromText } from '../../engine/opencode'

// ── Data serialization ───────────────────────────────────────────────────────

/**
 * Summarize candles into a compact text format for the LLM.
 * Instead of sending all 200+ candles, we send:
 * - Current price + 24h change
 * - Key price levels (high, low, open)
 * - Simple moving averages
 * - Recent price action (last 10 candles)
 */
function serializeCandles(candles: Candle[], tf: Timeframe): string {
  if (candles.length === 0) return `[${tf}] No data available`

  const latest = candles[candles.length - 1]
  const earliest = candles[0]
  const highest = Math.max(...candles.map((c) => c.high))
  const lowest = Math.min(...candles.map((c) => c.low))
  const avgVolume = candles.reduce((s, c) => s + c.volume, 0) / candles.length

  // Compute simple indicators
  const closes = candles.map((c) => c.close)
  const sma20 = closes.length >= 20
    ? closes.slice(-20).reduce((s, v) => s + v, 0) / 20
    : latest.close
  const sma50 = closes.length >= 50
    ? closes.slice(-50).reduce((s, v) => s + v, 0) / 50
    : latest.close

  // Price change over the period
  const periodChange = ((latest.close - earliest.open) / earliest.open * 100).toFixed(2)

  // Recent candles (last 5)
  const recentCandles = candles.slice(-5).map((c) =>
    `  O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} V:${c.volume.toFixed(0)}`
  ).join('\n')

  return [
    `[${tf}] ${candles.length} candles`,
    `Current: ${latest.close.toFixed(2)} | Period change: ${periodChange}%`,
    `Range: ${lowest.toFixed(2)} - ${highest.toFixed(2)}`,
    `SMA20: ${sma20.toFixed(2)} | SMA50: ${sma50.toFixed(2)}`,
    `Avg Volume: ${avgVolume.toFixed(0)}`,
    `Recent candles:`,
    recentCandles,
  ].join('\n')
}

function serializeMarketGlobal(mg: MarketGlobal): string {
  return [
    `BTC Dominance: ${mg.btcDominance.toFixed(1)}%`,
    `Fear & Greed: ${mg.fearGreedIndex} (${mg.fearGreedLabel})`,
    `Total Market Cap: $${(mg.totalMarketCap / 1e9).toFixed(1)}B`,
    `Market Cap 24h Change: ${mg.totalMarketCapChange24h.toFixed(2)}%`,
  ].join('\n')
}

function serializeSignals(signals: SignalDoc[]): string {
  if (signals.length === 0) return 'No recent signals'

  return signals.slice(0, 10).map((s) =>
    `${s.direction.toUpperCase()} (conf: ${(s.confidence * 100).toFixed(0)}%) at ${s.createdAt}`
  ).join('\n')
}

function serializeOnChain(data: OnChainData): string {
  const lines: string[] = []
  if (data.activeAddresses24h !== undefined) lines.push(`Active Addresses (24h): ${data.activeAddresses24h.toLocaleString()}`)
  if (data.transactionVolume24h !== undefined) lines.push(`Transaction Volume (24h): $${(data.transactionVolume24h / 1e6).toFixed(1)}M`)
  if (data.exchangeNetFlow24h !== undefined) lines.push(`Exchange Net Flow (24h): $${(data.exchangeNetFlow24h / 1e6).toFixed(1)}M ${data.exchangeNetFlow24h < 0 ? '(outflow/bullish)' : '(inflow/bearish)'}`)
  if (data.whaleTransactions24h !== undefined) lines.push(`Whale Transactions (24h): ${data.whaleTransactions24h}`)
  if (data.nvtRatio !== undefined) lines.push(`NVT Ratio: ${data.nvtRatio.toFixed(2)}`)
  if (data.mvrvRatio !== undefined) lines.push(`MVRV Ratio: ${data.mvrvRatio.toFixed(2)}`)
  if (data.sopr !== undefined) lines.push(`SOPR: ${data.sopr.toFixed(4)}`)
  if (data.fundingRate !== undefined) lines.push(`Funding Rate: ${(data.fundingRate * 100).toFixed(4)}%`)
  if (data.openInterest !== undefined) lines.push(`Open Interest: $${(data.openInterest / 1e6).toFixed(1)}M`)
  return lines.length > 0 ? lines.join('\n') : 'No on-chain data available'
}

function serializeSentiment(data: SentimentData): string {
  const lines = [
    `Fear & Greed: ${data.fearGreedIndex} (${data.fearGreedLabel})`,
  ]
  if (data.socialVolume24h !== undefined) lines.push(`Social Volume (24h): ${data.socialVolume24h.toLocaleString()}`)
  if (data.socialSentiment !== undefined) lines.push(`Social Sentiment: ${data.socialSentiment.toFixed(2)} (-1=bearish, +1=bullish)`)
  if (data.newsScore !== undefined) lines.push(`News Sentiment: ${data.newsScore.toFixed(2)} (-1=negative, +1=positive)`)
  if (data.trendingScore !== undefined) lines.push(`Trending Score: ${data.trendingScore}/100`)
  return lines.join('\n')
}

function serializeOrderBook(data: OrderBookData): string {
  return [
    `Best Bid: ${data.bestBid.toFixed(2)} | Best Ask: ${data.bestAsk.toFixed(2)}`,
    `Spread: ${data.spread.toFixed(2)} bps`,
    `Bid Depth (2%): ${data.bidDepth.toFixed(2)} | Ask Depth (2%): ${data.askDepth.toFixed(2)}`,
    `Imbalance: ${data.imbalance.toFixed(3)} (${data.imbalance > 0 ? 'buy pressure' : 'sell pressure'})`,
  ].join('\n')
}

// ── Build full prompt ────────────────────────────────────────────────────────

const VERDICT_SCHEMA_INSTRUCTION = `
IMPORTANT: You MUST respond with ONLY a JSON object in the following format, no other text:
{
  "direction": "long" | "short" | "neutral",
  "confidence": 0.0 to 1.0,
  "reason": "1-3 sentence explanation of your analysis",
  "indicators": { "key_metric_1": value, "key_metric_2": value }
}

Rules:
- direction MUST be exactly "long", "short", or "neutral"
- confidence MUST be a number between 0.0 and 1.0
- reason MUST be a concise string explaining your verdict
- indicators is optional but recommended — include key metrics that drove your decision
- Do NOT include any text outside the JSON object
- Do NOT wrap in markdown code blocks
`

async function buildPrompt(
  definition: LLMAnalystDefinition,
  ctx: AnalysisContext,
): Promise<string> {
  const sections: string[] = []

  // System prompt (philosophy)
  sections.push(`=== ANALYST ROLE ===\n${definition.meta.systemPrompt}`)

  // Asset info
  sections.push(`=== ASSET ===\nSymbol: ${ctx.symbol}\nTimeframes: ${ctx.timeframes.join(', ')}\nPrimary Timeframe: ${ctx.primaryTimeframe}`)

  // Gather data based on requirements
  const requirements = definition.meta.requiredData

  if (requirements.includes('candles')) {
    try {
      const candles = await ctx.getCandles(ctx.primaryTimeframe)
      sections.push(`=== PRICE DATA (${ctx.primaryTimeframe}) ===\n${serializeCandles(candles, ctx.primaryTimeframe)}`)

      // Also include a higher timeframe for context if available
      const higherTf = ctx.timeframes.find((tf) => tf !== ctx.primaryTimeframe)
      if (higherTf) {
        const higherCandles = await ctx.getCandles(higherTf)
        sections.push(`=== PRICE DATA (${higherTf}) ===\n${serializeCandles(higherCandles, higherTf)}`)
      }
    } catch (err) {
      sections.push(`=== PRICE DATA ===\nFailed to fetch: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  if (requirements.includes('market-global')) {
    try {
      const mg = await ctx.getMarketGlobal()
      sections.push(`=== MARKET GLOBAL ===\n${serializeMarketGlobal(mg)}`)
    } catch (err) {
      sections.push(`=== MARKET GLOBAL ===\nFailed to fetch: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  if (requirements.includes('signals')) {
    try {
      const signals = await ctx.getSignals()
      sections.push(`=== RECENT SIGNALS ===\n${serializeSignals(signals)}`)
    } catch (err) {
      sections.push(`=== RECENT SIGNALS ===\nFailed to fetch: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  if (requirements.includes('on-chain') && ctx.getOnChainData) {
    try {
      const data = await ctx.getOnChainData()
      sections.push(`=== ON-CHAIN DATA ===\n${data ? serializeOnChain(data) : 'Not available'}`)
    } catch {
      sections.push(`=== ON-CHAIN DATA ===\nNot available`)
    }
  }

  if (requirements.includes('sentiment') && ctx.getSentimentData) {
    try {
      const data = await ctx.getSentimentData()
      sections.push(`=== SENTIMENT DATA ===\n${data ? serializeSentiment(data) : 'Not available'}`)
    } catch {
      sections.push(`=== SENTIMENT DATA ===\nNot available`)
    }
  }

  if (requirements.includes('orderbook') && ctx.getOrderBookData) {
    try {
      const data = await ctx.getOrderBookData()
      sections.push(`=== ORDER BOOK DATA ===\n${data ? serializeOrderBook(data) : 'Not available'}`)
    } catch {
      sections.push(`=== ORDER BOOK DATA ===\nNot available`)
    }
  }

  // Output format instruction
  sections.push(`=== OUTPUT FORMAT ===${VERDICT_SCHEMA_INSTRUCTION}`)

  let prompt = sections.join('\n\n')

  // Allow analyst-specific prompt enrichment
  if (definition.enrichPrompt) {
    prompt = await definition.enrichPrompt(ctx, prompt)
  }

  return prompt
}

// ── Create analyst from definition ───────────────────────────────────────────

/**
 * Create an Analyst instance from an LLM analyst definition.
 *
 * The returned analyst uses the OpenCode CLI to call the specified model
 * with the analyst's system prompt and serialized market data.
 */
export function createLLMAnalyst(definition: LLMAnalystDefinition): Analyst {
  const meta = {
    id: definition.meta.id,
    name: definition.meta.name,
    description: definition.meta.description,
    weight: definition.meta.weight,
  }

  return {
    meta,
    analyze: async (ctx: AnalysisContext): Promise<AnalystVerdict> => {
      const model = ctx.model
      if (!model) {
        return {
          meta,
          direction: SignalDirection.NEUTRAL,
          confidence: 0.1,
          reason: 'No model specified for LLM analysis',
        }
      }

      try {
        // Build the full prompt
        const prompt = await buildPrompt(definition, ctx)

        // Call OpenCode CLI
        const result = await runOpenCode({ model, prompt })

        if (!result.success) {
          return {
            meta,
            direction: SignalDirection.NEUTRAL,
            confidence: 0.1,
            reason: `OpenCode CLI error: ${result.error}`,
            indicators: { durationMs: result.durationMs },
          }
        }

        // Parse the LLM response
        const verdict = parseVerdictFromText(result.text)

        if (!verdict) {
          return {
            meta,
            direction: SignalDirection.NEUTRAL,
            confidence: 0.1,
            reason: `Failed to parse LLM response: ${result.text.substring(0, 200)}`,
            indicators: { durationMs: result.durationMs },
          }
        }

        // Map string direction to SignalDirection enum
        const directionMap: Record<string, SignalDirection> = {
          long: SignalDirection.LONG,
          short: SignalDirection.SHORT,
          neutral: SignalDirection.NEUTRAL,
        }

        return {
          meta,
          direction: directionMap[verdict.direction] ?? SignalDirection.NEUTRAL,
          confidence: Math.min(0.95, Math.max(0.05, verdict.confidence)),
          reason: verdict.reason,
          indicators: {
            ...verdict.indicators,
            durationMs: result.durationMs,
            model,
          },
        }
      } catch (err) {
        return {
          meta,
          direction: SignalDirection.NEUTRAL,
          confidence: 0.1,
          reason: `Analysis error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }
      }
    },
  }
}
