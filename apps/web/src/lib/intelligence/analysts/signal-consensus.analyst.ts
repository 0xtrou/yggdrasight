import { SignalDirection } from '@oculus/core'
import {
  Analyst,
  AnalystMeta,
  AnalystVerdict,
  AnalysisContext,
} from '../types'

const signalConsensusAnalystMeta: AnalystMeta = {
  id: 'signal-consensus',
  name: 'Signal Consensus',
  description: 'Aggregates recent signals from database',
  weight: 1.0,
}

/**
 * Signal Consensus Analyst
 * Reads historical signals for the symbol from MongoDB and computes a weighted directional vote
 * based on the last 7 days of signals
 */
const signalConsensusAnalyst: Analyst = {
  meta: signalConsensusAnalystMeta,
  analyze: async (ctx: AnalysisContext): Promise<AnalystVerdict> => {
    try {
      // Fetch signals from the database
      const signals = await ctx.getSignals()

      // Compute cutoff: 7 days ago in milliseconds
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000

      // Filter signals from the last 7 days
      const recent = signals.filter((s) => {
        const signalTime = new Date(s.createdAt).getTime()
        return signalTime > cutoff
      })

      // If no recent signals, return neutral with low confidence
      if (recent.length === 0) {
        return {
          meta: signalConsensusAnalystMeta,
          direction: SignalDirection.NEUTRAL,
          confidence: 0.15,
          reason: 'No recent signals',
          indicators: {
            signalCount: 0,
            longRatio: 0,
            shortRatio: 0,
          },
        }
      }

      // Compute weighted votes (only considering LONG and SHORT, ignoring NEUTRAL)
      let longScore = 0
      let shortScore = 0

      for (const signal of recent) {
        if (signal.direction === SignalDirection.LONG) {
          longScore += signal.confidence
        } else if (signal.direction === SignalDirection.SHORT) {
          shortScore += signal.confidence
        }
      }

      const total = longScore + shortScore

      // If only neutral signals, return neutral with low confidence
      if (total === 0) {
        return {
          meta: signalConsensusAnalystMeta,
          direction: SignalDirection.NEUTRAL,
          confidence: 0.15,
          reason: 'Only neutral signals',
          indicators: {
            signalCount: recent.length,
            longRatio: 0,
            shortRatio: 0,
          },
        }
      }

      // Compute ratios
      const longRatio = longScore / total
      const shortRatio = shortScore / total

      // Determine direction and base confidence
      let direction: SignalDirection
      let confidence: number

      if (longRatio >= 0.52) {
        direction = SignalDirection.LONG
        confidence = longRatio * 0.85
      } else if (shortRatio >= 0.52) {
        direction = SignalDirection.SHORT
        confidence = shortRatio * 0.85
      } else {
        direction = SignalDirection.NEUTRAL
        confidence = 0.3
      }

      // Cap confidence between 0.15 and 0.85
      confidence = Math.min(0.85, Math.max(0.15, confidence))

      // Build reason string
      const reason = `${recent.length} signals in 7d: ${Math.round(longRatio * 100)}% long / ${Math.round(shortRatio * 100)}% short`

      // Build indicators object
      const indicators = {
        signalCount: recent.length,
        longRatio: parseFloat(longRatio.toFixed(2)),
        shortRatio: parseFloat(shortRatio.toFixed(2)),
      }

      return {
        meta: signalConsensusAnalystMeta,
        direction,
        confidence,
        reason,
        indicators,
      }
    } catch (error) {
      // If any error occurs, return neutral verdict
      return {
        meta: signalConsensusAnalystMeta,
        direction: SignalDirection.NEUTRAL,
        confidence: 0.15,
        reason: `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        indicators: {},
      }
    }
  },
}

export { signalConsensusAnalyst }
