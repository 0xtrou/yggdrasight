import { SignalDirection } from '@oculus/core'
import {
  Analyst,
  AnalystMeta,
  AnalystVerdict,
  AnalysisContext,
  Candle,
} from '../types'

/**
 * Compute RSI(14) using Wilder's Exponential Smoothing
 * @param candles Array of candles with at least 14 elements
 * @returns RSI value (0-100)
 */
function computeRSI(candles: Candle[]): number {
  if (candles.length < 15) {
    return 50 // Default neutral
  }

  // Step 1: Compute price changes
  const changes: number[] = []
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close)
  }

  // Step 2: Separate gains and losses
  const gains: number[] = []
  const losses: number[] = []
  for (let i = 0; i < changes.length; i++) {
    gains.push(Math.max(changes[i], 0))
    losses.push(Math.max(-changes[i], 0))
  }

  // Step 3: Seed averages at index 14 (first 14 deltas = indices 1-14 of closes)
  let sumGain = 0
  let sumLoss = 0
  for (let i = 0; i < 14; i++) {
    sumGain += gains[i]
    sumLoss += losses[i]
  }
  let avgGain = sumGain / 14
  let avgLoss = sumLoss / 14

  // Step 4: Apply Wilder's smoothing for remaining values
  for (let i = 14; i < gains.length; i++) {
    avgGain = (avgGain * 13 + gains[i]) / 14
    avgLoss = (avgLoss * 13 + losses[i]) / 14
  }

  // Step 5 & 6: Compute RS and RSI
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  const rsi = 100 - 100 / (1 + rs)

  return rsi
}

/**
 * Compute EMA(period) - Exponential Moving Average
 * @param candles Array of candles
 * @param period EMA period (e.g., 20, 50)
 * @returns EMA value
 */
function computeEMA(candles: Candle[], period: number): number {
  if (candles.length < period) {
    return candles[candles.length - 1].close
  }

  // Compute smoothing factor
  const k = 2 / (period + 1)

  // Seed with SMA of first `period` closes
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += candles[i].close
  }
  let ema = sum / period

  // Compute EMA for remaining candles
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
  }

  return ema
}

const trendAnalystMeta: AnalystMeta = {
  id: 'trend',
  name: 'Trend & Momentum',
  description: 'RSI(14) + EMA(20/50) crossover',
  weight: 1.5,
}

/**
 * Trend & Momentum Analyst
 * Combines RSI(14) and EMA(20/50) crossover to assess directional bias
 */
const trendAnalyst: Analyst = {
  meta: trendAnalystMeta,
  analyze: async (ctx: AnalysisContext): Promise<AnalystVerdict> => {
    try {
      // Fetch candles for the primary timeframe
      const candles = await ctx.getCandles(ctx.primaryTimeframe)

      // Check if we have enough data
      if (candles.length < 60) {
        return {
          meta: trendAnalystMeta,
          direction: SignalDirection.NEUTRAL,
          confidence: 0.15,
          reason: 'Insufficient data (need 60+ candles)',
          indicators: {},
        }
      }

      // Compute indicators
      const rsi = computeRSI(candles)
      const ema20 = computeEMA(candles, 20)
      const ema50 = computeEMA(candles, 50)

      // Build score based on RSI and EMA crossover
      let score = 0

      // EMA crossover logic
      if (ema20 > ema50) {
        score += 0.4 // Bullish cross
      } else if (ema20 < ema50) {
        score -= 0.4 // Bearish cross
      }

      // RSI zones
      if (rsi > 50 && rsi < 70) {
        score += 0.3 // RSI bullish zone
      } else if (rsi < 50 && rsi > 30) {
        score -= 0.3 // RSI bearish zone
      }

      // Oversold/Overbought
      if (rsi < 30) {
        score += 0.2 // Oversold = upside
      } else if (rsi > 70) {
        score -= 0.2 // Overbought = downside
      }

      // Determine direction and confidence
      let direction: SignalDirection
      let confidence: number

      if (score > 0.3) {
        direction = SignalDirection.LONG
        confidence = Math.min(score, 1.0)
      } else if (score < -0.3) {
        direction = SignalDirection.SHORT
        confidence = Math.min(-score, 1.0)
      } else {
        direction = SignalDirection.NEUTRAL
        confidence = 0.3
      }

      // Cap confidence between 0.15 and 0.85
      confidence = Math.min(0.85, Math.max(0.15, confidence))

      // Build reason string
      const reason = `RSI(14)=${rsi.toFixed(1)} | EMA20 ${ema20 > ema50 ? 'above' : 'below'} EMA50 | ${direction}`

      // Build indicators object
      const indicators = {
        rsi: parseFloat(rsi.toFixed(2)),
        ema20: parseFloat(ema20.toFixed(2)),
        ema50: parseFloat(ema50.toFixed(2)),
      }

      return {
        meta: trendAnalystMeta,
        direction,
        confidence,
        reason,
        indicators,
      }
    } catch (error) {
      // If any error occurs, return neutral verdict
      return {
        meta: trendAnalystMeta,
        direction: SignalDirection.NEUTRAL,
        confidence: 0.15,
        reason: `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        indicators: {},
      }
    }
  },
}

export { trendAnalyst }
