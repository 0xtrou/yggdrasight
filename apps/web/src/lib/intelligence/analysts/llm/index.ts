import type { Analyst } from '../../types'
import { mirofishAnalyst, mirofishDefinition } from './mirofish.analyst'
import { wyckoffAnalyst, wyckoffDefinition } from './wyckoff.analyst'
import { elliottWaveAnalyst, elliottWaveDefinition } from './elliott-wave.analyst'
import { sorosReflexivityAnalyst, sorosReflexivityDefinition } from './soros-reflexivity.analyst'
import { onChainAnalysisAnalyst, onChainAnalysisDefinition } from './on-chain.analyst'
import { warrenBuffettAnalyst, warrenBuffettDefinition } from './warren-buffett.analyst'
import { longTermConvictionAnalyst, longTermConvictionDefinition } from './long-term-conviction.analyst'
import type { LLMAnalystDefinition } from '../../types'

export const LLM_ANALYSTS: Analyst[] = [
  mirofishAnalyst,
  wyckoffAnalyst,
  elliottWaveAnalyst,
  sorosReflexivityAnalyst,
  onChainAnalysisAnalyst,
  warrenBuffettAnalyst,
  longTermConvictionAnalyst,
]

export const LLM_ANALYST_DEFINITIONS: LLMAnalystDefinition[] = [
  mirofishDefinition,
  wyckoffDefinition,
  elliottWaveDefinition,
  sorosReflexivityDefinition,
  onChainAnalysisDefinition,
  warrenBuffettDefinition,
  longTermConvictionDefinition,
]

/**
 * Get LLM analysts filtered by their IDs.
 * If no IDs provided, returns all.
 */
export function getLLMAnalysts(agentIds?: string[]): Analyst[] {
  if (!agentIds || agentIds.length === 0) return LLM_ANALYSTS
  return LLM_ANALYSTS.filter((a) => agentIds.includes(a.meta.id))
}

export {
  mirofishAnalyst,
  wyckoffAnalyst,
  elliottWaveAnalyst,
  sorosReflexivityAnalyst,
  onChainAnalysisAnalyst,
  warrenBuffettAnalyst,
  longTermConvictionAnalyst,
}
