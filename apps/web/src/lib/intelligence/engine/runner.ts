import { Timeframe } from '@oculus/core'
import type { Analyst, ConsensusResult, AnalystVerdict } from '../types'
import { ANALYSTS } from '../analysts'
import { getLLMAnalysts } from '../analysts/llm'
import { buildConsensus } from './consensus'
import { buildContext } from './context'

export interface RunAnalysisOptions {
  model?: string
  agentIds?: string[]
  includeDeterministic?: boolean
}

export async function runAnalysis(
  symbol: string,
  timeframes: Timeframe[],
  options?: RunAnalysisOptions
): Promise<ConsensusResult> {
  // Build shared context (lazy-cached data providers)
  const ctx = buildContext(symbol, timeframes, options?.model)


  const analysts: Analyst[] = []


  if (options?.includeDeterministic !== false) {
    analysts.push(...ANALYSTS)
  }


  if (options?.model) {
    const llmAnalysts = getLLMAnalysts(options.agentIds)
    analysts.push(...llmAnalysts)
  }

  if (analysts.length === 0) {
    return buildConsensus(symbol, timeframes, [])
  }

  // Run all analysts in parallel — tolerate individual failures
  const results = await Promise.allSettled(
    analysts.map((analyst) => analyst.analyze(ctx))
  )

  // Collect successful verdicts, log failures
  const verdicts: AnalystVerdict[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      verdicts.push(result.value)
    } else {
      console.error(`[intelligence] Analyst ${analysts[i].meta.id} failed:`, result.reason)
      // Do NOT push a fallback — just skip the failed analyst
      // This way a failed external API doesn't corrupt the consensus
    }
  }

  // Build and return consensus from successful verdicts
  return buildConsensus(symbol, timeframes, verdicts)
}
