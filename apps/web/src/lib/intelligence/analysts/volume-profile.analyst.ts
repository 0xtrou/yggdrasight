import { SignalDirection } from '@oculus/core'
import { Analyst, AnalystMeta, AnalystVerdict, AnalysisContext, Candle } from '../types'

const meta: AnalystMeta = {
  id: 'volume-profile',
  name: 'Volume Profile',
  description: 'Relative volume + OBV divergence analysis',
  weight: 1.2,
}

/**
 * Compute On-Balance Volume (OBV) for a candle array.
 * Running sum where close > prev close adds volume, close < prev close subtracts.
 * Returns OBV value at each index (array same length as candles).
 */
function computeOBV(candles: Candle[]): number[] {
  const obv: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv.push(obv[i - 1] + candles[i].volume)
    } else if (candles[i].close < candles[i - 1].close) {
      obv.push(obv[i - 1] - candles[i].volume)
    } else {
      obv.push(obv[i - 1])
    }
  }
  return obv
}

async function analyze(ctx: AnalysisContext): Promise<AnalystVerdict> {
  try {
    const candles = await ctx.getCandles(ctx.primaryTimeframe)

    if (candles.length < 20) {
      return {
        meta,
        direction: SignalDirection.NEUTRAL,
        confidence: 0.15,
        reason: 'Insufficient data (need 20+ candles)',
        indicators: {},
      }
    }

    // Compute OBV series
    const obvSeries = computeOBV(candles)
    const currentOBV = obvSeries[obvSeries.length - 1]

    // OBV trend: compare OBV of last 5 candles to OBV 10 candles ago
    const obvRecent = obvSeries[obvSeries.length - 1]
    const obvLookbackIdx = Math.max(0, obvSeries.length - 11)
    const obvPast = obvSeries[obvLookbackIdx]
    const obvChange = obvPast !== 0 ? ((obvRecent - obvPast) / Math.abs(obvPast)) * 100 : 0

    let obvTrend: 'rising' | 'falling' | 'flat'
    if (obvChange > 5) {
      obvTrend = 'rising'
    } else if (obvChange < -5) {
      obvTrend = 'falling'
    } else {
      obvTrend = 'flat'
    }

    // Average volume: last 20 candles vs last 5 candles
    const last20 = candles.slice(-20)
    const last5 = candles.slice(-5)
    const avgVol20 = last20.reduce((sum, c) => sum + c.volume, 0) / last20.length
    const avgVol5 = last5.reduce((sum, c) => sum + c.volume, 0) / last5.length
    const volumeRatio = avgVol20 > 0 ? avgVol5 / avgVol20 : 1

    // Score calculation
    let score = 0

    if (obvTrend === 'rising' && volumeRatio > 1) {
      score += 0.4
    } else if (obvTrend === 'falling' && volumeRatio > 1) {
      score -= 0.4
    }

    // High volume amplifier
    if (volumeRatio > 1.5) {
      if (obvTrend === 'rising') {
        score += 0.2
      } else if (obvTrend === 'falling') {
        score -= 0.2
      }
    }

    // Determine direction and confidence
    let direction: SignalDirection
    let confidence: number

    if (score > 0) {
      direction = SignalDirection.LONG
      confidence = Math.min(Math.abs(score), 1.0)
    } else if (score < 0) {
      direction = SignalDirection.SHORT
      confidence = Math.min(Math.abs(score), 1.0)
    } else {
      direction = SignalDirection.NEUTRAL
      confidence = 0.3
    }

    // Cap confidence
    confidence = Math.min(0.85, Math.max(0.15, confidence))

    const reason = `OBV ${obvTrend} | Vol ratio: ${volumeRatio.toFixed(2)}x avg`

    const indicators = {
      obv: parseFloat(currentOBV.toFixed(2)),
      obvTrend,
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
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

export const volumeProfileAnalyst: Analyst = {
  meta,
  analyze,
}
