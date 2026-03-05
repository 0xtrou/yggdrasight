import { SignalDirection } from '@oculus/core'
import { Analyst, AnalystMeta, AnalystVerdict, AnalysisContext, Candle } from '../types'

const meta: AnalystMeta = {
  id: 'key-levels',
  name: 'Key Levels',
  description: 'Support/resistance proximity and breakout detection',
  weight: 1.3,
}

interface SwingPoint {
  price: number
  type: 'high' | 'low'
}

/**
 * Find swing highs and lows using 3-candle comparison.
 * A swing high: candle's high > both neighbors' highs.
 * A swing low: candle's low < both neighbors' lows.
 */
function findSwingPoints(candles: Candle[]): SwingPoint[] {
  const swings: SwingPoint[] = []

  for (let i = 1; i < candles.length - 1; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high) {
      swings.push({ price: candles[i].high, type: 'high' })
    }
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low) {
      swings.push({ price: candles[i].low, type: 'low' })
    }
  }

  return swings
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

    // Use last 100 candles (or whatever is available)
    const recentCandles = candles.slice(-100)
    const currentCandle = recentCandles[recentCandles.length - 1]
    const close = currentCandle.close

    // Find swing points
    const allSwings = findSwingPoints(recentCandles)

    // Take last 20 swings
    const swings = allSwings.slice(-20)

    const swingHighs = swings.filter((s) => s.type === 'high').map((s) => s.price)
    const swingLows = swings.filter((s) => s.type === 'low').map((s) => s.price)

    // Need at least some swings to work with
    if (swingHighs.length < 2 || swingLows.length < 2) {
      return {
        meta,
        direction: SignalDirection.NEUTRAL,
        confidence: 0.2,
        reason: 'Insufficient swing data',
        indicators: {},
      }
    }

    // Find nearest resistance (lowest swing high above current price)
    const resistanceLevels = swingHighs.filter((h) => h > close).sort((a, b) => a - b)
    const supportLevels = swingLows.filter((l) => l < close).sort((a, b) => b - a)

    // Fallback: if no levels above/below, use highest high / lowest low
    const nearestResistance = resistanceLevels.length > 0
      ? resistanceLevels[0]
      : Math.max(...swingHighs)
    const nearestSupport = supportLevels.length > 0
      ? supportLevels[0]
      : Math.min(...swingLows)

    // Compute proximity percentages
    const proximityToResistance = ((nearestResistance - close) / close) * 100
    const proximityToSupport = ((close - nearestSupport) / close) * 100

    // Determine if last candle is bullish or bearish
    const lastBullish = currentCandle.close > currentCandle.open
    const lastBearish = currentCandle.close < currentCandle.open

    // Score calculation
    let score = 0

    if (close > nearestResistance && proximityToResistance < -0.3) {
      // Breakout above resistance
      score = 0.6
    } else if (close < nearestSupport && proximityToSupport < -0.3) {
      // Breakdown below support
      score = -0.6
    } else if (Math.abs(proximityToSupport) <= 0.5 && lastBullish) {
      // Close within 0.5% of support and bullish candle
      score = 0.5
    } else if (Math.abs(proximityToResistance) <= 0.5 && lastBearish) {
      // Close within 0.5% of resistance and bearish candle
      score = -0.5
    } else {
      // Weaker directional bias based on which level is closer
      if (proximityToSupport < proximityToResistance) {
        // Closer to support
        score = 0.2
      } else {
        // Closer to resistance
        score = -0.2
      }
    }

    // Determine direction and confidence
    let direction: SignalDirection
    let confidence: number

    if (score > 0) {
      direction = SignalDirection.LONG
      confidence = Math.abs(score)
    } else if (score < 0) {
      direction = SignalDirection.SHORT
      confidence = Math.abs(score)
    } else {
      direction = SignalDirection.NEUTRAL
      confidence = 0.3
    }

    // Cap confidence
    confidence = Math.min(0.85, Math.max(0.15, confidence))

    const reason = `Resistance: $${nearestResistance.toFixed(0)} (+${proximityToResistance.toFixed(1)}%) | Support: $${nearestSupport.toFixed(0)} (-${proximityToSupport.toFixed(1)}%)`

    const indicators = {
      nearestResistance: parseFloat(nearestResistance.toFixed(2)),
      nearestSupport: parseFloat(nearestSupport.toFixed(2)),
      proximityToResistance: parseFloat(proximityToResistance.toFixed(2)),
      proximityToSupport: parseFloat(proximityToSupport.toFixed(2)),
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

export const keyLevelsAnalyst: Analyst = {
  meta,
  analyze,
}
