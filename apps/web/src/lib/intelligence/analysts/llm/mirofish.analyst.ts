import { SignalDirection } from '@yggdrasight/core'
import type { Analyst, AnalystMeta, AnalystVerdict, AnalysisContext, Candle, LLMAnalystDefinition } from '../../types'
import { askTypeSafe, choice, isTypeSafeConfigured, typeSafeModel } from '../../engine/typesafe'
import { verdictFromChoice } from './base'
import { fetchOHLCV } from '../../../data/ohlcv-provider'

const MIROFISH_WEIGHT = 6.3

export const mirofishDefinition: LLMAnalystDefinition = {
  meta: {
    id: 'mirofish',
    name: 'Mirofish Prediction',
    description: 'Consensus prediction — TypeSafe bull/bear probability judgment over 30-day price action, trend and macro context',
    weight: MIROFISH_WEIGHT,
    type: 'llm',
    category: 'mirofish-prediction',
    systemPrompt: `You are a crowd-consensus predictor for cryptocurrency prices.

CORE PHILOSOPHY:
- Aggregate the way a well-calibrated crowd would: weigh bull and bear cases against each other
- Price direction over the next 24-72 hours is dominated by momentum, trend structure and macro context
- Near a 30-day low with stabilizing volume, reversals become plausible; above rising moving averages, continuation is favored
- Declining volume in a downtrend weakens conviction; increasing volume confirms it

YOUR ANALYSIS FRAMEWORK:
1. Trend: price vs SMA7/SMA14/SMA30, 7d/14d/30d changes
2. Position in the 30-day range: distance from high and low
3. Volume trend: is participation confirming or fading the move?
4. Macro context: fear & greed, BTC dominance, total market cap direction

SIGNAL RULES:
- LONG: bullish evidence outweighs bearish — continuation or reversal setup with supportive volume
- SHORT: bearish evidence outweighs bullish — downtrend continuation or exhausted rally
- NEUTRAL: only when bull and bear cases are genuinely inseparable`,
    requiredData: ['candles', 'market-global'],
  },
}

// ── Seed material builder (unchanged — this is the judgment state) ───────────

function buildSeedMaterial(
  ctx: AnalysisContext,
  dailyCandles: Candle[],
  candles: Candle[],
  mg: { btcDominance: number; fearGreedIndex: number; fearGreedLabel: string; totalMarketCap: number; totalMarketCapChange24h: number },
): string {
  const sections: string[] = [`# ${ctx.symbol} — 30-Day Price Analysis & Prediction`]

  if (dailyCandles.length > 2) {
    const currentPrice = dailyCandles[dailyCandles.length - 1].close
    const price7dAgo = dailyCandles[Math.max(0, dailyCandles.length - 8)]?.close ?? currentPrice
    const price14dAgo = dailyCandles[Math.max(0, dailyCandles.length - 15)]?.close ?? currentPrice
    const price30dAgo = dailyCandles[0].close
    const high30d = Math.max(...dailyCandles.map(c => c.close))
    const low30d = Math.min(...dailyCandles.map(c => c.close))
    const change7d = ((currentPrice - price7dAgo) / price7dAgo * 100).toFixed(2)
    const change14d = ((currentPrice - price14dAgo) / price14dAgo * 100).toFixed(2)
    const change30d = ((currentPrice - price30dAgo) / price30dAgo * 100).toFixed(2)
    const distFromHigh = ((currentPrice - high30d) / high30d * 100).toFixed(2)
    const distFromLow = ((currentPrice - low30d) / low30d * 100).toFixed(2)

    const sma7 = dailyCandles.slice(-7).reduce((s, c) => s + c.close, 0) / 7
    const sma14 = dailyCandles.slice(-14).reduce((s, c) => s + c.close, 0) / Math.min(14, dailyCandles.length)
    const sma30 = dailyCandles.reduce((s, c) => s + c.close, 0) / dailyCandles.length
    const trendSma = currentPrice > sma7 && sma7 > sma14 ? 'BULLISH (price > SMA7 > SMA14)' :
      currentPrice < sma7 && sma7 < sma14 ? 'BEARISH (price < SMA7 < SMA14)' : 'MIXED'

    const recentVols = dailyCandles.slice(-7).map(c => c.volume)
    const olderVols = dailyCandles.slice(-14, -7).map(c => c.volume)
    const avgRecentVol = recentVols.length > 0 ? recentVols.reduce((s, v) => s + v, 0) / recentVols.length : 0
    const avgOlderVol = olderVols.length > 0 ? olderVols.reduce((s, v) => s + v, 0) / olderVols.length : 1
    const volChange = avgOlderVol > 0 ? ((avgRecentVol - avgOlderVol) / avgOlderVol * 100).toFixed(1) : '0'

    sections.push(
      '',
      '## 30-Day Price Action (daily)',
      `Current Price: $${currentPrice.toPrecision(6)}`,
      `30-Day High: $${high30d.toPrecision(6)} (${distFromHigh}% from current)`,
      `30-Day Low: $${low30d.toPrecision(6)} (${distFromLow}% from current)`,
      `7-Day Change: ${change7d}%`,
      `14-Day Change: ${change14d}%`,
      `30-Day Change: ${change30d}%`,
      '',
      '## Trend Indicators',
      `SMA7: $${sma7.toPrecision(6)} | SMA14: $${sma14.toPrecision(6)} | SMA30: $${sma30.toPrecision(6)}`,
      `Trend: ${trendSma}`,
      `Volume Trend (7d vs prior 7d): ${volChange}%`,
      '',
      '## Daily Price History (last 30 days)',
      '| Date | Price (USD) | Daily Change |',
      '|------|------------|-------------|',
    )
    for (let i = 1; i < dailyCandles.length; i++) {
      const date = new Date(dailyCandles[i].time * 1000).toISOString().split('T')[0]
      const pct = ((dailyCandles[i].close - dailyCandles[i - 1].close) / dailyCandles[i - 1].close * 100).toFixed(2)
      sections.push(`| ${date} | $${dailyCandles[i].close.toPrecision(6)} | ${pct}% |`)
    }
  } else if (candles.length > 0) {
    const latest = candles[candles.length - 1]
    const earliest = candles[0]
    const change = ((latest.close - earliest.open) / earliest.open * 100).toFixed(2)
    sections.push(
      '',
      '## Price Data (from exchange candles)',
      `Current Price: ${latest.close}`,
      `Period Change: ${change}% (${candles.length} candles)`,
      `Range: ${Math.min(...candles.map(c => c.low))} - ${Math.max(...candles.map(c => c.high))}`,
    )
  }

  sections.push(
    '',
    '## Market Context',
    `Fear & Greed Index: ${mg.fearGreedIndex} (${mg.fearGreedLabel})`,
    `BTC Dominance: ${mg.btcDominance.toFixed(1)}%`,
    `Total Crypto Market Cap 24h Change: ${mg.totalMarketCapChange24h.toFixed(2)}%`,
  )

  return sections.join('\n')
}

// ── Analyst ──────────────────────────────────────────────────────────────────

export const mirofishAnalyst: Analyst = {
  meta: {
    id: 'mirofish',
    name: 'Mirofish Prediction',
    description: 'Consensus prediction — TypeSafe bull/bear probability judgment over 30-day price action, trend and macro context',
    weight: MIROFISH_WEIGHT,
  },
  analyze: async (ctx: AnalysisContext): Promise<AnalystVerdict> => {
    const meta: AnalystMeta = mirofishAnalyst.meta
    const startTime = Date.now()

    if (!isTypeSafeConfigured()) {
      return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: 'TYPESAFE_API_KEY is not set — TypeSafe analysis unavailable' }
    }

    try {
      let candles: Candle[] = []
      let mg = { btcDominance: 0, fearGreedIndex: 0, fearGreedLabel: 'N/A', totalMarketCap: 0, totalMarketCapChange24h: 0 }
      try { candles = await ctx.getCandles(ctx.primaryTimeframe) } catch { }
      try { mg = await ctx.getMarketGlobal() } catch { }

      const dailyCandles = await fetchOHLCV({ symbol: ctx.symbol, interval: '1d', days: 30 })

      if (dailyCandles.length === 0 && candles.length === 0) {
        return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: 'No price data available' }
      }

      const seed = buildSeedMaterial(ctx, dailyCandles, candles, mg)

      const { answers } = await askTypeSafe(
        { prediction_seed: seed },
        {
          direction: choice(
            {
              philosophy: mirofishDefinition.meta.systemPrompt,
              question: `Based on the 30-day price action, trend indicators, volume and macro context above: will ${ctx.symbol} price be BULLISH or BEARISH over the next 24-72 hours?`,
              rules: [
                'You MUST pick a side. Neutral is only acceptable if the data genuinely shows zero directional bias.',
                'If the data seems balanced, examine the bull and bear cases more carefully — one side usually has slightly stronger support.',
              ],
            },
            {
              long: 'Bullish over the next 24-72 hours: momentum, trend and macro context favor upside',
              short: 'Bearish over the next 24-72 hours: momentum, trend and macro context favor downside',
              neutral: 'Bull and bear cases genuinely inseparable — zero directional bias',
            },
          ),
        },
      )

      const answer = answers.direction
      const { direction, confidence, gapNeutralized } = verdictFromChoice(answer)
      const durationMs = Date.now() - startTime

      const bullPct = Math.round((answer.probabilities['long'] ?? 0) * 100)
      const bearPct = Math.round((answer.probabilities['short'] ?? 0) * 100)

      const reason = gapNeutralized
        ? `Crowd consensus: ${bullPct}% bullish vs ${bearPct}% bearish — within the decisiveness band, neutral by policy.`
        : `Crowd consensus: ${bullPct}% bullish, ${bearPct}% bearish → ${direction.toUpperCase()} (call confidence ${answer.confidence.toFixed(2)}).`

      return {
        meta,
        direction,
        confidence: Math.min(0.95, Math.max(0.05, confidence)),
        reason,
        output: JSON.stringify(answer),
        indicators: {
          consensusBullPct: bullPct,
          consensusBearPct: bearPct,
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
        reason: `Mirofish error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        indicators: { durationMs: Date.now() - startTime },
      }
    }
  },
}
