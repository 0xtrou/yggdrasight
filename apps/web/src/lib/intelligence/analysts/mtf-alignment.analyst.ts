import { SignalDirection, Timeframe } from '@yggdrasight/core'
import { Analyst, AnalystMeta, AnalystVerdict, AnalysisContext, Candle } from '../types'

const meta: AnalystMeta = {
  id: 'mtf-alignment',
  name: 'MTF Alignment',
  description: 'EMA trend alignment across 1h, 4h, 1d, 1w, 1M timeframes',
  weight: 1.4,
}

/**
 * Compute EMA(period) for a candle array.
 */
function computeEMA(candles: Candle[], period: number): number {
  if (candles.length < period) {
    return candles[candles.length - 1].close
  }

  const k = 2 / (period + 1)

  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += candles[i].close
  }
  let ema = sum / period

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
  }

  return ema
}

interface TimeframeBias {
  tf: string
  bias: 'bullish' | 'bearish'
}

async function analyze(ctx: AnalysisContext): Promise<AnalystVerdict> {
  try {
    const timeframes = [Timeframe.H1, Timeframe.H4, Timeframe.D1, Timeframe.W1, Timeframe.MN]
    const tfLabels = ['h1', 'h4', 'd1', 'w1', 'mn'] as const

    // Fetch all timeframes in parallel, tolerating failures
    const results = await Promise.allSettled(
      timeframes.map((tf) => ctx.getCandles(tf))
    )

    const biases: TimeframeBias[] = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled' && result.value.length >= 50) {
        const candles = result.value
        const ema20 = computeEMA(candles, 20)
        const ema50 = computeEMA(candles, 50)
        biases.push({
          tf: tfLabels[i],
          bias: ema20 > ema50 ? 'bullish' : 'bearish',
        })
      }
      // If rejected or insufficient data, skip this timeframe
    }

    // If no timeframes produced data, return neutral
    if (biases.length === 0) {
      return {
        meta,
        direction: SignalDirection.NEUTRAL,
        confidence: 0.15,
        reason: 'No timeframe data available',
        indicators: {},
      }
    }

    const bullishCount = biases.filter((b) => b.bias === 'bullish').length
    const bearishCount = biases.filter((b) => b.bias === 'bearish').length
    const totalCount = biases.length

    // Determine direction and raw score
    let direction: SignalDirection
    let score: number

    if (bullishCount === totalCount) {
      direction = SignalDirection.LONG
      score = 0.7
    } else if (bearishCount === totalCount) {
      direction = SignalDirection.SHORT
      score = 0.7
    } else if (bullishCount > bearishCount) {
      direction = SignalDirection.LONG
      score = 0.4
    } else if (bearishCount > bullishCount) {
      direction = SignalDirection.SHORT
      score = 0.4
    } else {
      direction = SignalDirection.NEUTRAL
      score = 0.3
    }

    // Confidence: proportion agreeing × 0.85
    const alignedCount = Math.max(bullishCount, bearishCount)
    let confidence = (alignedCount / totalCount) * 0.85

    // Cap confidence
    confidence = Math.min(0.85, Math.max(0.15, confidence))

    // Build indicator values — use biases we have, mark missing as 'n/a'
    const h1Bias = biases.find((b) => b.tf === 'h1')?.bias ?? 'n/a'
    const h4Bias = biases.find((b) => b.tf === 'h4')?.bias ?? 'n/a'
    const d1Bias = biases.find((b) => b.tf === 'd1')?.bias ?? 'n/a'
    const w1Bias = biases.find((b) => b.tf === 'w1')?.bias ?? 'n/a'
    const mnBias = biases.find((b) => b.tf === 'mn')?.bias ?? 'n/a'

    const reason = `H1:${h1Bias} H4:${h4Bias} D1:${d1Bias} W1:${w1Bias} MN:${mnBias} | ${alignedCount}/${totalCount} aligned`

    const indicators = {
      h1: h1Bias,
      h4: h4Bias,
      d1: d1Bias,
      w1: w1Bias,
      mn: mnBias,
      alignment: parseFloat((alignedCount / totalCount).toFixed(2)),
    }

    return {
      meta,
      direction,
      confidence,
      reason,
      indicators,
    }
  } catch (error) {
    return {
      meta,
      direction: SignalDirection.NEUTRAL,
      confidence: 0.15,
      reason: `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      indicators: {},
    }
  }
}

export const mtfAlignmentAnalyst: Analyst = {
  meta,
  analyze,
}
