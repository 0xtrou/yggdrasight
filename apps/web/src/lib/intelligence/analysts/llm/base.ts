import { SignalDirection, Timeframe } from '@yggdrasight/core'
import type {
  Analyst,
  AnalystVerdict,
  AnalysisContext,
  LLMAnalystDefinition,
  Candle,
  MarketGlobal,
  SignalDoc,
  OnChainData,
  SentimentData,
  OrderBookData,
  NewsData,
  DeveloperData,
  DefiProtocolData,
} from '../../types'
import {
  askTypeSafe,
  choice,
  clamp01,
  isTypeSafeConfigured,
  typeSafeModel,
  type TypeSafeChoiceAnswer,
} from '../../engine/typesafe'

// ── Data serialization (state builders — unchanged from the OpenCode era) ────

function serializeCandles(candles: Candle[], tf: Timeframe): string {
  if (candles.length === 0) return `[${tf}] No data available`

  const latest = candles[candles.length - 1]
  const earliest = candles[0]
  const highest = Math.max(...candles.map((c) => c.high))
  const lowest = Math.min(...candles.map((c) => c.low))
  const avgVolume = candles.reduce((s, c) => s + c.volume, 0) / candles.length

  const closes = candles.map((c) => c.close)
  const sma20 = closes.length >= 20
    ? closes.slice(-20).reduce((s, v) => s + v, 0) / 20
    : latest.close
  const sma50 = closes.length >= 50
    ? closes.slice(-50).reduce((s, v) => s + v, 0) / 50
    : latest.close

  const periodChange = ((latest.close - earliest.open) / earliest.open * 100).toFixed(2)

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
  if (data.longShortRatio !== undefined) lines.push(`Long/Short Ratio: ${data.longShortRatio.toFixed(2)}`)
  if (data.longAccountPct !== undefined && data.shortAccountPct !== undefined) lines.push(`Accounts: ${data.longAccountPct.toFixed(1)}% long / ${data.shortAccountPct.toFixed(1)}% short`)
  if (data.topTraderLongShortRatio !== undefined) lines.push(`Top Trader L/S Ratio: ${data.topTraderLongShortRatio.toFixed(2)}`)
  if (data.topTraderLongPct !== undefined && data.topTraderShortPct !== undefined) lines.push(`Top Traders: ${data.topTraderLongPct.toFixed(1)}% long / ${data.topTraderShortPct.toFixed(1)}% short`)
  if (data.takerBuySellRatio !== undefined) lines.push(`Taker Buy/Sell Ratio: ${data.takerBuySellRatio.toFixed(3)}`)
  if (data.takerBuyVolume !== undefined && data.takerSellVolume !== undefined) lines.push(`Taker Volume: buy $${(data.takerBuyVolume / 1e6).toFixed(1)}M / sell $${(data.takerSellVolume / 1e6).toFixed(1)}M`)
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

function serializeNews(data: NewsData): string {
  const lines = [
    `Headlines: ${data.items.length} recent news items`,
    `Sentiment: ${data.bullishCount} bullish, ${data.bearishCount} bearish, ${data.neutralCount} neutral`,
    `Dominant sentiment: ${data.dominantSentiment === 'up' ? 'BULLISH' : data.dominantSentiment === 'down' ? 'BEARISH' : 'NEUTRAL'}`,
    '',
    'Recent headlines:',
  ]
  for (const item of data.items.slice(0, 15)) {
    const sentimentIcon = item.sentiment === 'up' ? '[+]' : item.sentiment === 'down' ? '[-]' : '[=]'
    lines.push(`  ${sentimentIcon} [${item.source}] ${item.headline}`)
  }
  return lines.join('\n')
}

function serializeDeveloper(data: DeveloperData): string {
  const lines: string[] = []

  // Project identity
  if (data.name) lines.push(`Name: ${data.name}`)
  if (data.description) lines.push(`Description: ${data.description.substring(0, 300)}`)
  if (data.categories.length > 0) lines.push(`Categories: ${data.categories.join(', ')}`)
  if (data.genesisDate) lines.push(`Genesis Date: ${data.genesisDate}`)
  if (data.homepage) lines.push(`Homepage: ${data.homepage}`)
  if (data.twitterHandle) lines.push(`Twitter/X: @${data.twitterHandle}`)
  if (data.githubRepos.length > 0) lines.push(`GitHub Repos: ${data.githubRepos.join(', ')}`)

  // GitHub metrics
  lines.push('')
  lines.push('## GitHub Activity')
  lines.push(`Stars: ${data.stars.toLocaleString()} | Forks: ${data.forks.toLocaleString()} | Subscribers: ${data.subscribers.toLocaleString()}`)
  lines.push(`Issues: ${data.closedIssues.toLocaleString()} closed / ${data.totalIssues.toLocaleString()} total (${data.totalIssues > 0 ? ((data.closedIssues / data.totalIssues) * 100).toFixed(0) : 0}% resolution rate)`)
  lines.push(`PRs Merged: ${data.pullRequestsMerged.toLocaleString()} | Contributors: ${data.pullRequestContributors.toLocaleString()}`)
  lines.push(`Commits (4 weeks): ${data.commitCount4Weeks}`)
  lines.push(`Code Changes (4 weeks): +${data.codeAdditions4Weeks.toLocaleString()} / -${data.codeDeletions4Weeks.toLocaleString()}`)

  // Commit activity sparkline (28-day)
  if (data.commitActivitySeries.length > 0) {
    const maxCommits = Math.max(...data.commitActivitySeries, 1)
    const sparkline = data.commitActivitySeries.map(c => {
      const level = Math.round((c / maxCommits) * 4)
      return ['_', '▁', '▃', '▅', '█'][level] ?? '█'
    }).join('')
    lines.push(`Commit Activity (28d): ${sparkline}`)
    const totalCommits = data.commitActivitySeries.reduce((s, v) => s + v, 0)
    const avgDaily = (totalCommits / data.commitActivitySeries.length).toFixed(1)
    lines.push(`Daily Average: ${avgDaily} commits/day | Total: ${totalCommits}`)
  }

  // Community snapshot
  lines.push('')
  lines.push('## Community')
  if (data.twitterFollowers !== null) lines.push(`Twitter Followers: ${data.twitterFollowers.toLocaleString()}`)
  if (data.redditSubscribers !== null) lines.push(`Reddit Subscribers: ${data.redditSubscribers.toLocaleString()}`)
  if (data.telegramUsers !== null) lines.push(`Telegram Users: ${data.telegramUsers.toLocaleString()}`)
  lines.push(`Sentiment: ${data.sentimentUp.toFixed(0)}% positive / ${data.sentimentDown.toFixed(0)}% negative`)

  return lines.join('\n')
}

function serializeDefi(data: DefiProtocolData): string {
  const lines: string[] = []

  if (data.protocolName) lines.push(`Protocol: ${data.protocolName}`)
  if (data.category) lines.push(`Category: ${data.category}`)
  if (data.chains.length > 0) lines.push(`Chains: ${data.chains.join(', ')}`)

  // TVL metrics
  lines.push('')
  lines.push('## TVL')
  if (data.tvl != null) lines.push(`Current TVL: $${(data.tvl / 1e6).toFixed(1)}M`)
  if (data.tvlChange24h != null) lines.push(`TVL Change 24h: ${data.tvlChange24h.toFixed(2)}%`)
  if (data.tvlChange7d != null) lines.push(`TVL Change 7d: ${data.tvlChange7d.toFixed(2)}%`)
  if (data.mcapToTvl != null) lines.push(`Market Cap / TVL: ${data.mcapToTvl.toFixed(2)}x`)
  if (data.chainTvl != null) lines.push(`Chain Total TVL: $${(data.chainTvl / 1e9).toFixed(2)}B`)

  // Fees
  if (data.fees24h !== null || data.fees7d !== null || data.fees30d !== null) {
    lines.push('')
    lines.push('## Fees')
    if (data.fees24h !== null) lines.push(`Fees 24h: $${(data.fees24h / 1e3).toFixed(1)}K`)
    if (data.fees7d !== null) lines.push(`Fees 7d: $${(data.fees7d / 1e3).toFixed(1)}K`)
    if (data.fees30d !== null) lines.push(`Fees 30d: $${(data.fees30d / 1e3).toFixed(1)}K`)
  }

  // Revenue
  if (data.revenue24h !== null || data.revenue7d !== null || data.revenue30d !== null) {
    lines.push('')
    lines.push('## Revenue')
    if (data.revenue24h !== null) lines.push(`Revenue 24h: $${(data.revenue24h / 1e3).toFixed(1)}K`)
    if (data.revenue7d !== null) lines.push(`Revenue 7d: $${(data.revenue7d / 1e3).toFixed(1)}K`)
    if (data.revenue30d !== null) lines.push(`Revenue 30d: $${(data.revenue30d / 1e3).toFixed(1)}K`)
  }

  return lines.length > 0 ? lines.join('\n') : 'No DeFi data available'
}

// ── Judgment state assembly ──────────────────────────────────────────────────

/**
 * Build the TypeSafe judgment state for an analyst: one named field per
 * required data source, serialized with the helpers above. Every analyst
 * question sees the same structured market snapshot.
 */
async function buildAnalysisState(
  definition: LLMAnalystDefinition,
  ctx: AnalysisContext,
): Promise<Record<string, string>> {
  const requirements = definition.meta.requiredData
  const state: Record<string, string> = {
    asset: `Symbol: ${ctx.symbol} | Timeframes: ${ctx.timeframes.join(', ')} | Primary: ${ctx.primaryTimeframe}`,
  }

  if (requirements.includes('candles')) {
    try {
      let content = `## ${ctx.primaryTimeframe}\n${serializeCandles(await ctx.getCandles(ctx.primaryTimeframe), ctx.primaryTimeframe)}`
      const higherTf = ctx.timeframes.find((tf) => tf !== ctx.primaryTimeframe)
      if (higherTf) {
        content += `\n\n## ${higherTf}\n${serializeCandles(await ctx.getCandles(higherTf), higherTf)}`
      }
      state['price'] = content
    } catch (err) {
      state['price'] = `Fetch failed: ${err instanceof Error ? err.message : 'unknown error'}`
    }
  }

  if (requirements.includes('market-global')) {
    try { state['market'] = serializeMarketGlobal(await ctx.getMarketGlobal()) }
    catch (err) { state['market'] = `Fetch failed: ${err instanceof Error ? err.message : 'unknown error'}` }
  }

  if (requirements.includes('signals')) {
    try { state['recent_signals'] = serializeSignals(await ctx.getSignals()) }
    catch (err) { state['recent_signals'] = `Fetch failed: ${err instanceof Error ? err.message : 'unknown error'}` }
  }

  if (requirements.includes('on-chain') && ctx.getOnChainData) {
    try {
      const data = await ctx.getOnChainData()
      state['onchain'] = data ? serializeOnChain(data) : 'Not available'
    } catch { state['onchain'] = 'Not available' }
  }

  if (requirements.includes('sentiment') && ctx.getSentimentData) {
    try {
      const data = await ctx.getSentimentData()
      state['sentiment'] = data ? serializeSentiment(data) : 'Not available'
    } catch { state['sentiment'] = 'Not available' }
  }

  if (requirements.includes('orderbook') && ctx.getOrderBookData) {
    try {
      const data = await ctx.getOrderBookData()
      state['orderbook'] = data ? serializeOrderBook(data) : 'Not available'
    } catch { state['orderbook'] = 'Not available' }
  }

  if (requirements.includes('news') && ctx.getNewsData) {
    try {
      const data = await ctx.getNewsData()
      state['news'] = data ? serializeNews(data) : 'Not available'
    } catch { state['news'] = 'Not available' }
  }

  if (requirements.includes('developer') && ctx.getDeveloperData) {
    try {
      const data = await ctx.getDeveloperData()
      state['developer'] = data ? serializeDeveloper(data) : 'Not available'
    } catch { state['developer'] = 'Not available' }
  }

  if (requirements.includes('defi') && ctx.getDefiData) {
    try {
      const data = await ctx.getDefiData()
      state['defi'] = data ? serializeDefi(data) : 'Not available'
    } catch { state['defi'] = 'Not available' }
  }

  return state
}

// ── Direction policy ─────────────────────────────────────────────────────────

/**
 * Code policy on top of the raw judgment: a Choice answer whose long/short
 * probabilities are within DIRECTION_GAP_THRESHOLD is not an actionable
 * directional call — it becomes NEUTRAL. The probabilities are preserved in
 * indicators so nothing is lost.
 */
const DIRECTION_GAP_THRESHOLD = 0.10

const DIRECTION_MAP: Record<string, SignalDirection> = {
  long: SignalDirection.LONG,
  short: SignalDirection.SHORT,
  neutral: SignalDirection.NEUTRAL,
}

export function verdictFromChoice(
  answer: TypeSafeChoiceAnswer,
): { direction: SignalDirection; confidence: number; gapNeutralized: boolean } {
  const pLong = clamp01(answer.probabilities['long'] ?? 0)
  const pShort = clamp01(answer.probabilities['short'] ?? 0)
  const top = answer.choice as keyof typeof DIRECTION_MAP

  let direction = DIRECTION_MAP[top] ?? SignalDirection.NEUTRAL
  let gapNeutralized = false

  if ((direction === SignalDirection.LONG || direction === SignalDirection.SHORT)
    && Math.abs(pLong - pShort) < DIRECTION_GAP_THRESHOLD) {
    direction = SignalDirection.NEUTRAL
    gapNeutralized = true
  }

  // Directional call → its probability; neutral → distribution concentration
  const confidence = direction === SignalDirection.NEUTRAL
    ? clamp01(answer.confidence)
    : clamp01(answer.probabilities[top] ?? 0)

  return { direction, confidence, gapNeutralized }
}

// ── Create analyst from definition ───────────────────────────────────────────

/**
 * Create an Analyst instance from an LLM analyst definition.
 *
 * The analyst's philosophy (systemPrompt) becomes the judgment instructions;
 * the serialized market data becomes the state. A single batched Choice
 * question over long/short/neutral replaces the entire OpenCode container run:
 * the answer carries the full probability distribution plus a confidence
 * derived from how concentrated it is.
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
      const startTime = Date.now()

      if (!isTypeSafeConfigured()) {
        return {
          meta,
          direction: SignalDirection.NEUTRAL,
          confidence: 0.1,
          reason: 'TYPESAFE_API_KEY is not set — TypeSafe analysis unavailable',
        }
      }

      try {
        const state = await buildAnalysisState(definition, ctx)

        const { answers } = await askTypeSafe(state, {
          direction: choice(
            {
              analyst_philosophy: definition.meta.systemPrompt,
              question: `Applying ONLY this philosophy to the state above, which directional stance is most supported for ${ctx.symbol} on the ${ctx.primaryTimeframe} timeframe over the next several days?`,
              rules: [
                'Be decisive: force long or short unless the evidence is genuinely 50/50 contradictory with no lean either way. Most market conditions lean one direction — find it.',
                'Judge the data on its own merits; if a required data section says "Not available", do not let it dominate the judgment.',
              ],
            },
            {
              long: 'Bullish evidence dominates per this philosophy: long bias justified',
              short: 'Bearish evidence dominates per this philosophy: short bias justified',
              neutral: 'Evidence genuinely balanced or contradictory — no actionable lean either way',
            },
          ),
        })

        const answer = answers.direction
        const { direction, confidence, gapNeutralized } = verdictFromChoice(answer)
        const durationMs = Date.now() - startTime

        const p = (k: string) => (answer.probabilities[k] ?? 0).toFixed(2)
        const reason = gapNeutralized
          ? `${meta.name} judgment: LONG/SHORT probabilities within ${DIRECTION_GAP_THRESHOLD} (p_long=${p('long')}, p_short=${p('short')}) — neutral by policy.`
          : `${meta.name} judgment: ${direction.toUpperCase()} at p=${p(answer.choice)} (p_long=${p('long')}, p_short=${p('short')}, p_neutral=${p('neutral')}, confidence ${(answer.confidence).toFixed(2)}).`

        return {
          meta,
          direction,
          confidence: Math.min(0.95, Math.max(0.05, confidence)),
          reason,
          output: JSON.stringify(answer),
          indicators: {
            p_long: Number(p('long')),
            p_short: Number(p('short')),
            p_neutral: Number(p('neutral')),
            judgment_confidence: Number(answer.confidence.toFixed(3)),
            durationMs,
            model: typeSafeModel(),
          },
        }
      } catch (err) {
        return {
          meta,
          direction: SignalDirection.NEUTRAL,
          confidence: 0.1,
          reason: `TypeSafe analysis error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          indicators: { durationMs: Date.now() - startTime },
        }
      }
    },
  }
}
