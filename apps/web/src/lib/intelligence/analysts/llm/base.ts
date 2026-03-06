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
  NewsData,
  DeveloperData,
  DefiProtocolData,
} from '../../types'
import { runOpenCode, parseVerdictFromText } from '../../engine/opencode'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── Data serialization ───────────────────────────────────────────────────────

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
      return ['_', '\u2581', '\u2583', '\u2585', '\u2588'][level] ?? '\u2588'
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

// ── Work directory builder ──────────────────────────────────────────────────

const VERDICT_SCHEMA = `{
  "direction": "long" | "short" | "neutral",
  "confidence": 0.0 to 1.0,
  "reason": "1-3 sentence explanation of your analysis",
  "indicators": { "key_metric_1": value, "key_metric_2": value }
}`

/**
 * Create a temporary work directory with structured data files for the agent.
 *
 * Directory structure:
 *   /tmp/oculus-<id>/
 *     INSTRUCTIONS.md    — analyst role, output format, list of data files
 *     data/
 *       price.md         — OHLCV candle data
 *       market.md        — market global data
 *       signals.md       — recent signals
 *       onchain.md       — on-chain metrics
 *       sentiment.md     — sentiment data
 *       news.md          — news headlines
 *       orderbook.md     — order book data
 *       developer.md     — developer/GitHub metrics
 *       defi.md          — DeFi/protocol metrics
 * OpenCode runs with `--dir` pointing here, so its `read` tool can access all files.
 */
async function buildAnalysisWorkDir(
  definition: LLMAnalystDefinition,
  ctx: AnalysisContext,
): Promise<{ workDir: string; message: string; dataFiles: string[] }> {
  const workDir = mkdtempSync(join(tmpdir(), 'oculus-'))
  const dataDir = join(workDir, 'data')
  mkdirSync(dataDir)

  const requirements = definition.meta.requiredData
  const dataFiles: string[] = []

  // Write data files based on requirements
  if (requirements.includes('candles')) {
    try {
      const candles = await ctx.getCandles(ctx.primaryTimeframe)
      let content = `# Price Data\n\n## ${ctx.primaryTimeframe}\n${serializeCandles(candles, ctx.primaryTimeframe)}`

      const higherTf = ctx.timeframes.find((tf) => tf !== ctx.primaryTimeframe)
      if (higherTf) {
        const higherCandles = await ctx.getCandles(higherTf)
        content += `\n\n## ${higherTf}\n${serializeCandles(higherCandles, higherTf)}`
      }

      writeFileSync(join(dataDir, 'price.md'), content, 'utf-8')
      dataFiles.push('data/price.md — OHLCV candle data with indicators')
    } catch (err) {
      writeFileSync(join(dataDir, 'price.md'), `# Price Data\nFailed to fetch: ${err instanceof Error ? err.message : 'unknown error'}`, 'utf-8')
      dataFiles.push('data/price.md — (fetch failed)')
    }
  }

  if (requirements.includes('market-global')) {
    try {
      const mg = await ctx.getMarketGlobal()
      writeFileSync(join(dataDir, 'market.md'), `# Market Global\n${serializeMarketGlobal(mg)}`, 'utf-8')
      dataFiles.push('data/market.md — BTC dominance, fear & greed, market cap')
    } catch (err) {
      writeFileSync(join(dataDir, 'market.md'), `# Market Global\nFailed to fetch: ${err instanceof Error ? err.message : 'unknown error'}`, 'utf-8')
      dataFiles.push('data/market.md — (fetch failed)')
    }
  }

  if (requirements.includes('signals')) {
    try {
      const signals = await ctx.getSignals()
      writeFileSync(join(dataDir, 'signals.md'), `# Recent Signals\n${serializeSignals(signals)}`, 'utf-8')
      dataFiles.push('data/signals.md — recent trading signals')
    } catch (err) {
      writeFileSync(join(dataDir, 'signals.md'), `# Recent Signals\nFailed to fetch: ${err instanceof Error ? err.message : 'unknown error'}`, 'utf-8')
      dataFiles.push('data/signals.md — (fetch failed)')
    }
  }

  if (requirements.includes('on-chain') && ctx.getOnChainData) {
    try {
      const data = await ctx.getOnChainData()
      writeFileSync(join(dataDir, 'onchain.md'), `# On-Chain Data\n${data ? serializeOnChain(data) : 'Not available'}`, 'utf-8')
      dataFiles.push('data/onchain.md — funding rate, open interest, on-chain metrics')
    } catch {
      writeFileSync(join(dataDir, 'onchain.md'), `# On-Chain Data\nNot available`, 'utf-8')
      dataFiles.push('data/onchain.md — (not available)')
    }
  }

  if (requirements.includes('sentiment') && ctx.getSentimentData) {
    try {
      const data = await ctx.getSentimentData()
      writeFileSync(join(dataDir, 'sentiment.md'), `# Sentiment Data\n${data ? serializeSentiment(data) : 'Not available'}`, 'utf-8')
      dataFiles.push('data/sentiment.md — social sentiment, fear & greed')
    } catch {
      writeFileSync(join(dataDir, 'sentiment.md'), `# Sentiment Data\nNot available`, 'utf-8')
      dataFiles.push('data/sentiment.md — (not available)')
    }
  }

  if (requirements.includes('orderbook') && ctx.getOrderBookData) {
    try {
      const data = await ctx.getOrderBookData()
      writeFileSync(join(dataDir, 'orderbook.md'), `# Order Book Data\n${data ? serializeOrderBook(data) : 'Not available'}`, 'utf-8')
      dataFiles.push('data/orderbook.md — bid/ask depth, spread, imbalance')
    } catch {
      writeFileSync(join(dataDir, 'orderbook.md'), `# Order Book Data\nNot available`, 'utf-8')
      dataFiles.push('data/orderbook.md — (not available)')
    }
  }

  if (requirements.includes('news') && ctx.getNewsData) {
    try {
      const data = await ctx.getNewsData()
      writeFileSync(join(dataDir, 'news.md'), `# News & Headlines\n${data ? serializeNews(data) : 'Not available'}`, 'utf-8')
      dataFiles.push('data/news.md — recent crypto news with sentiment')
    } catch {
      writeFileSync(join(dataDir, 'news.md'), `# News & Headlines\nNot available`, 'utf-8')
      dataFiles.push('data/news.md — (not available)')
    }
  }

  if (requirements.includes('developer') && ctx.getDeveloperData) {
    try {
      const data = await ctx.getDeveloperData()
      writeFileSync(join(dataDir, 'developer.md'), `# Developer & Project Data\n${data ? serializeDeveloper(data) : 'Not available'}`, 'utf-8')
      dataFiles.push('data/developer.md — GitHub metrics, project metadata, community stats')
    } catch {
      writeFileSync(join(dataDir, 'developer.md'), `# Developer & Project Data\nNot available`, 'utf-8')
      dataFiles.push('data/developer.md — (not available)')
    }
  }

  if (requirements.includes('defi') && ctx.getDefiData) {
    try {
      const data = await ctx.getDefiData()
      writeFileSync(join(dataDir, 'defi.md'), `# DeFi Protocol Metrics\n${data ? serializeDefi(data) : 'Not available'}`, 'utf-8')
      dataFiles.push('data/defi.md — TVL, fees, revenue, chain data')
    } catch {
      writeFileSync(join(dataDir, 'defi.md'), `# DeFi Protocol Metrics\nNot available`, 'utf-8')
      dataFiles.push('data/defi.md — (not available)')
    }
  }

  // Write the INSTRUCTIONS.md file
  const instructions = [
    `# ${definition.meta.name} — Analysis Instructions`,
    '',
    `## Your Role`,
    definition.meta.systemPrompt,
    '',
    `## Asset Under Analysis`,
    `- Symbol: ${ctx.symbol}`,
    `- Timeframes: ${ctx.timeframes.join(', ')}`,
    `- Primary Timeframe: ${ctx.primaryTimeframe}`,
    '',
    `## Available Data Files`,
    `Read each file in the \`data/\` directory to gather your analysis inputs:`,
    ...dataFiles.map((f) => `- ${f}`),
    '',
    `## Required Output`,
    `After reading ALL data files, respond with ONLY a JSON object:`,
    VERDICT_SCHEMA,
    '',
    `Rules:`,
    `- direction MUST be exactly "long", "short", or "neutral"`,
    `- CRITICAL: Be DECISIVE. Force a direction (long or short). Only use "neutral" when signals are genuinely 50/50 contradictory with no lean either way. Most market conditions lean one direction — find it.`,
    `- confidence MUST be a number between 0.0 and 1.0`,
    `- reason MUST be a concise 1-3 sentence explanation`,
    `- indicators is optional but recommended — include key metrics that drove your decision`,
    `- Do NOT include any text outside the JSON object`,
    `- Do NOT wrap in markdown code blocks`,
    `- Use ALL tools at your disposal to research deeper — websearch, webfetch, Task tool, sub-agents — go as deep as needed`,
  ].join('\n')

  writeFileSync(join(workDir, 'INSTRUCTIONS.md'), instructions, 'utf-8')

  // Build the short CLI message that points the agent to the files
  const message = `Read INSTRUCTIONS.md for your analyst role and output format. Then read each file listed in the data/ directory. Use ALL tools at your disposal — websearch, webfetch, Task tool, sub-agents — to research deeper if needed. Finally, respond with ONLY the JSON verdict as specified in INSTRUCTIONS.md.`

  return { workDir, message, dataFiles }
}
// ── File-read validation ──────────────────────────────────────────────────────

/** Map from requiredData keys to expected data file names */
const DATA_KEY_TO_FILE: Record<string, string> = {
  'candles': 'price.md',
  'market-global': 'market.md',
  'signals': 'signals.md',
  'on-chain': 'onchain.md',
  'sentiment': 'sentiment.md',
  'news': 'news.md',
  'orderbook': 'orderbook.md',
  'developer': 'developer.md',
  'defi': 'defi.md',
}

/**
 * Validate that the agent read all required data files.
 * Returns a list of data keys whose files were NOT read.
 */
function validateFilesRead(
  filesRead: string[],
  requiredData: string[],
): { missingKeys: string[]; readKeys: string[]; auditLog: string } {
  // Normalize file paths to just filenames for matching
  // OpenCode returns absolute paths like /private/tmp/oculus-xxx/data/price.md
  const readFilenames = new Set(
    filesRead.map(f => {
      const parts = f.split('/')
      return parts[parts.length - 1]  // e.g. 'price.md'
    })
  )

  const readKeys: string[] = []
  const missingKeys: string[] = []

  for (const key of requiredData) {
    const expectedFile = DATA_KEY_TO_FILE[key]
    if (!expectedFile) continue  // Unknown key, skip
    if (readFilenames.has(expectedFile)) {
      readKeys.push(key)
    } else {
      missingKeys.push(key)
    }
  }

  // Also check INSTRUCTIONS.md was read
  const readInstructions = readFilenames.has('INSTRUCTIONS.md')

  const auditLog = [
    `Required: [${requiredData.join(', ')}]`,
    `Read: [${readKeys.join(', ')}]${readInstructions ? ' + INSTRUCTIONS.md' : ''}`,
    missingKeys.length > 0 ? `MISSING: [${missingKeys.join(', ')}]` : 'All files read ✓',
  ].join(' | ')

  return { missingKeys, readKeys, auditLog }
}

// ── Create analyst from definition ───────────────────────────────────────────

const MAX_RETRIES = 1  // Retry once if agent skipped files

/**
 * Create an Analyst instance from an LLM analyst definition.
 *
 * The analyst creates a temp directory with structured data files and lets
 * OpenCode's agent read them naturally — like a coding agent reviewing code.
 *
 * After each run, validates that the agent actually read ALL required data files.
 * If files were skipped, retries once with a stronger prompt.
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

      let workDir: string | undefined
      try {
        // Build work directory with all data files
        const workspace = await buildAnalysisWorkDir(definition, ctx)
        workDir = workspace.workDir

        let result = await runOpenCode({
          model,
          prompt: workspace.message,
          workDir: workspace.workDir,
        })

        // Validate file reads
        const audit = validateFilesRead(result.filesRead, definition.meta.requiredData)
        console.log(`[${meta.id}] File audit: ${audit.auditLog}`)

        // If agent skipped files, retry with explicit instructions
        if (result.success && audit.missingKeys.length > 0) {
          const missingFiles = audit.missingKeys
            .map(k => `data/${DATA_KEY_TO_FILE[k]}`)
            .filter(Boolean)
          console.warn(`[${meta.id}] Agent skipped ${audit.missingKeys.length} files, retrying with explicit read instructions...`)

          const retryPrompt = [
            `You MUST read ALL of the following files before responding. You missed some on the previous attempt.`,
            `Files to read:`,
            `- INSTRUCTIONS.md`,
            ...workspace.dataFiles.map(f => `- ${f.split(' — ')[0]}`),
            ``,
            `Read EVERY file listed above, then respond with ONLY the JSON verdict as specified in INSTRUCTIONS.md.`,
          ].join('\n')

          result = await runOpenCode({
            model,
            prompt: retryPrompt,
            workDir: workspace.workDir,
          })

          const retryAudit = validateFilesRead(result.filesRead, definition.meta.requiredData)
          console.log(`[${meta.id}] Retry audit: ${retryAudit.auditLog}`)

          if (retryAudit.missingKeys.length > 0) {
            console.warn(`[${meta.id}] Agent still skipped files after retry: [${retryAudit.missingKeys.join(', ')}]`)
          }
        }

        if (!result.success) {
          return {
            meta,
            direction: SignalDirection.NEUTRAL,
            confidence: 0.1,
            reason: `OpenCode CLI error: ${result.error}`,
            output: result.text,
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
            reason: 'Failed to parse LLM response',
            output: result.text,
            indicators: { durationMs: result.durationMs, rawLength: result.text.length },
          }
        }

        // Map string direction to SignalDirection enum
        const directionMap: Record<string, SignalDirection> = {
          long: SignalDirection.LONG,
          short: SignalDirection.SHORT,
          neutral: SignalDirection.NEUTRAL,
        }

        // Include audit info in indicators
        const finalAudit = validateFilesRead(result.filesRead, definition.meta.requiredData)

        return {
          meta,
          direction: directionMap[verdict.direction] ?? SignalDirection.NEUTRAL,
          confidence: Math.min(0.95, Math.max(0.05, verdict.confidence)),
          reason: verdict.reason,
          output: result.text,
          indicators: {
            ...verdict.indicators,
            durationMs: result.durationMs,
            model,
            filesRead: result.filesRead.length,
            toolCalls: result.toolCallCount,
            dataConsumed: finalAudit.readKeys.join(','),
            ...(finalAudit.missingKeys.length > 0 ? { dataMissed: finalAudit.missingKeys.join(',') } : {}),
          },
        }
      } catch (err) {
        return {
          meta,
          direction: SignalDirection.NEUTRAL,
          confidence: 0.1,
          reason: `Analysis error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }
      } finally {
        // Always clean up the temp directory
        if (workDir) {
          try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
        }
      }
    },
  }
}
