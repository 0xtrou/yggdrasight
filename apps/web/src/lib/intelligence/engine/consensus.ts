import { SignalDirection, Timeframe } from '@oculus/core'
import type { AnalystVerdict, ConsensusResult, TimeframeAnalysis } from '../types'

/**
 * Converts SignalDirection to numeric value for weighted scoring
 */
function directionToNumeric(direction: SignalDirection): number {
  if (direction === SignalDirection.LONG) {
    return 1
  } else if (direction === SignalDirection.SHORT) {
    return -1
  } else {
    return 0
  }
}

/**
 * Builds consensus from multiple analyst verdicts using weighted directional scoring
 *
 * Algorithm:
 * 1. Convert each direction to numeric (long=1, short=-1, neutral=0)
 * 2. Calculate weighted raw score: Σ(direction × confidence × weight) / Σ(weight)
 * 3. Apply ±0.08 threshold to determine final direction (tight band — force binary signals)
 * 4. Calculate confluence: ratio of analysts agreeing with final direction
 * 5. Final confidence: weighted avg of agreeing analysts × confluence, capped [0.15, 0.85]
 * 6. Generate TimeframeAnalysis entries for each timeframe
 */
export function buildConsensus(
  symbol: string,
  timeframes: Timeframe[],
  verdicts: AnalystVerdict[]
): ConsensusResult {
  // Edge case: no verdicts
  if (verdicts.length === 0) {
    return {
      symbol,
      timeframes,
      direction: SignalDirection.NEUTRAL,
      confidence: 0.15,
      score: 0,
      analysts: [],
      timeframeAnalyses: timeframes.map((tf) => ({
        timeframe: tf,
        direction: SignalDirection.NEUTRAL,
        confidence: 0.15,
        score: 0,
      })),
      confluence: 0,
      createdAt: new Date().toISOString(),
    }
  }

  // Step 1: Calculate total weight and raw score
  const totalWeight = verdicts.reduce((sum, v) => sum + v.meta.weight, 0)

  const rawScore =
    verdicts.reduce((sum, v) => {
      const numeric = directionToNumeric(v.direction)
      return sum + numeric * v.confidence * v.meta.weight
    }, 0) / totalWeight

  // Step 2: Determine final direction by threshold
  let finalDirection: SignalDirection
  if (rawScore > 0.08) {
    finalDirection = SignalDirection.LONG
  } else if (rawScore < -0.08) {
    finalDirection = SignalDirection.SHORT
  } else {
    finalDirection = SignalDirection.NEUTRAL
  }

  // Step 3: Calculate confluence (agreement ratio)
  let agreeingVerdicts: AnalystVerdict[]

  if (finalDirection === SignalDirection.NEUTRAL) {
    // For neutral: any neutral verdict or weak verdict (confidence < 0.3) counts as agreeing
    agreeingVerdicts = verdicts.filter(
      (v) => v.direction === SignalDirection.NEUTRAL || v.confidence < 0.3
    )
  } else {
    // For long/short: exact direction match
    agreeingVerdicts = verdicts.filter((v) => v.direction === finalDirection)
  }

  const confluence = agreeingVerdicts.length / verdicts.length

  // Step 4: Calculate final confidence
  let finalConfidence: number

  if (agreeingVerdicts.length > 0) {
    // Weighted average confidence of agreeing analysts
    const agreeingWeightSum = agreeingVerdicts.reduce(
      (sum, v) => sum + v.meta.weight,
      0
    )
    const agreeingScore = agreeingVerdicts.reduce(
      (sum, v) => sum + v.confidence * v.meta.weight,
      0
    ) / agreeingWeightSum

    // Final confidence = weighted avg × confluence
    finalConfidence = agreeingScore * confluence
  } else {
    // Fallback (should rarely happen)
    finalConfidence = 0.1
  }

  // Step 5: Cap confidence to [0.15, 0.85]
  finalConfidence = Math.min(0.85, Math.max(0.15, finalConfidence))

  // Step 6: Build TimeframeAnalysis entries
  const timeframeAnalyses: TimeframeAnalysis[] = timeframes.map((tf) => ({
    timeframe: tf,
    direction: finalDirection,
    confidence: finalConfidence,
    score: rawScore,
  }))

  // Build final result
  const result: ConsensusResult = {
    symbol,
    timeframes,
    direction: finalDirection,
    confidence: finalConfidence,
    score: rawScore,
    analysts: verdicts,
    timeframeAnalyses,
    confluence,
    createdAt: new Date().toISOString(),
  }

  return result
}
