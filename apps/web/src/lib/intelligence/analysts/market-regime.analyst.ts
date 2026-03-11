import { SignalDirection } from '@yggdrasight/core'
import { Analyst, AnalystMeta, AnalystVerdict, AnalysisContext } from '../types'

const meta: AnalystMeta = {
  id: 'market-regime',
  name: 'Market Regime',
  description: 'BTC dominance + Fear & Greed macro analysis',
  weight: 0.8
}

async function analyze(ctx: AnalysisContext): Promise<AnalystVerdict> {
  const global = await ctx.getMarketGlobal()

  let score = 0

  // Fear & Greed: 0=Extreme Fear, 100=Extreme Greed
  // < 25 = extreme fear (contrarian BUY signal)
  // > 75 = extreme greed (contrarian SELL signal)
  // 40-60 = neutral zone
  if (global.fearGreedIndex < 25) {
    score += 0.5 // extreme fear → accumulation zone
  } else if (global.fearGreedIndex < 40) {
    score += 0.2 // fear zone → slight bullish
  } else if (global.fearGreedIndex > 75) {
    score -= 0.5 // extreme greed → distribution zone
  } else if (global.fearGreedIndex > 60) {
    score -= 0.2 // greed zone → slight bearish
  }

  // BTC dominance: rising dominance = risk-off (BTC gaining vs alts = market uncertainty)
  // falling dominance = risk-on (alts performing = bull market expansion)
  // Use 50% as baseline
  if (global.btcDominance > 58) {
    score -= 0.3 // very high dominance = risk-off
  } else if (global.btcDominance > 52) {
    score -= 0.1 // elevated dominance
  } else if (global.btcDominance < 42) {
    score += 0.3 // low dominance = alt season / risk-on
  } else if (global.btcDominance < 48) {
    score += 0.1 // falling dominance = bullish expansion
  }

  // Direction threshold
  let direction: SignalDirection
  let confidence: number

  if (score > 0.15) {
    direction = SignalDirection.LONG
    confidence = Math.min(score, 1.0)
  } else if (score < -0.15) {
    direction = SignalDirection.SHORT
    confidence = Math.min(-score, 1.0)
  } else {
    direction = SignalDirection.NEUTRAL
    confidence = 0.3
  }

  confidence = Math.min(0.85, Math.max(0.15, confidence))

  const reason = `F&G: ${global.fearGreedIndex} (${global.fearGreedLabel}) | BTC Dom: ${global.btcDominance.toFixed(
    1
  )}%`

  const indicators = {
    fearGreedIndex: global.fearGreedIndex,
    fearGreedLabel: global.fearGreedLabel,
    btcDominance: parseFloat(global.btcDominance.toFixed(2))
  }

  return {
    meta,
    direction,
    confidence,
    reason,
    indicators
  }
}

export const marketRegimeAnalyst: Analyst = {
  meta,
  analyze
}
