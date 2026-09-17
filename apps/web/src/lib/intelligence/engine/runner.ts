import { Timeframe } from '@yggdrasight/core'
import type { Analyst, ConsensusResult, AnalystVerdict } from '../types'
import { ANALYSTS } from '../analysts'
import { getLLMAnalysts } from '../analysts/llm'
import { buildConsensus } from './consensus'
import { buildContext } from './context'
import { isTypeSafeConfigured } from './typesafe'
import { arbitrateConsensus, judgeSignals } from './final-judgment'
import { buildFullMarketState } from '../analysts/llm/base'

export interface RunAnalysisOptions {
  model?: string
  agentModelMap?: Record<string, string>
  agentIds?: string[]
  includeDeterministic?: boolean
  authJsonPath?: string
  forceFresh?: boolean
}

export async function runAnalysis(
  symbol: string,
  timeframes: Timeframe[],
  options?: RunAnalysisOptions
): Promise<ConsensusResult> {
  // Build shared context (lazy-cached data providers)
  const defaultModel = options?.agentModelMap ? Object.values(options.agentModelMap)[0] : options?.model
  const ctx = { ...buildContext(symbol, timeframes, defaultModel, options?.authJsonPath), forceFresh: options?.forceFresh ?? false }


  const analysts: Analyst[] = []


  if (options?.includeDeterministic !== false) {
    analysts.push(...ANALYSTS)
  }


  // LLM analysts run on the TypeSafe engine when TYPESAFE_API_KEY is set.
  // The legacy OpenCode model map is no longer required — per-agent model
  // selection is accepted but ignored (jev-latest judges everything).
  const hasTypeSafe = isTypeSafeConfigured()
  const hasModel = !!(
    options?.model ||
    (options?.agentModelMap && Object.keys(options.agentModelMap).length > 0)
  )
  if (hasTypeSafe || hasModel) {
    const llmAnalysts = getLLMAnalysts(options?.agentIds)
    analysts.push(...llmAnalysts)
  }

  if (analysts.length === 0) {
    return buildConsensus(symbol, timeframes, [])
  }

  // Run all analysts in parallel — tolerate individual failures
  const results = await Promise.allSettled(
    analysts.map((analyst) => {
      const agentModel = options?.agentModelMap?.[analyst.meta.id] || options?.agentModelMap?.['*'] || options?.model || ctx.model
      if (agentModel && agentModel !== ctx.model) {
        return analyst.analyze({ ...ctx, model: agentModel })
      }
      return analyst.analyze(ctx)
    })
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

  // Build the deterministic consensus (weighted score + confluence — kept as
  // audit input), then let TypeSafe judge each signal and arbitrate the final
  // direction over all verdicts, signals and indicators.
  const consensus = buildConsensus(symbol, timeframes, verdicts)

  if (!isTypeSafeConfigured() || consensus.analysts.length === 0) {
    return consensus
  }

  try {
    const marketState = await buildFullMarketState(ctx)
    const signalJudgments = await judgeSignals(ctx)
    return await arbitrateConsensus(consensus, signalJudgments, marketState)
  } catch (err) {
    console.error(`[intelligence] Final judgment stage failed — keeping deterministic verdict:`, err)
    return consensus
  }
}
