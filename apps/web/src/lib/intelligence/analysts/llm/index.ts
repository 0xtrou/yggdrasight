import type { Analyst } from '../../types'
import { wyckoffAnalyst, wyckoffDefinition } from './wyckoff.analyst'
import { elliottWaveAnalyst, elliottWaveDefinition } from './elliott-wave.analyst'
import { sorosReflexivityAnalyst, sorosReflexivityDefinition } from './soros-reflexivity.analyst'
import { onChainAnalysisAnalyst, onChainAnalysisDefinition } from './on-chain.analyst'
import { warrenBuffettAnalyst, warrenBuffettDefinition } from './warren-buffett.analyst'
import { longTermConvictionAnalyst, longTermConvictionDefinition } from './long-term-conviction.analyst'
import type { LLMAnalystDefinition } from '../../types'

/**
 * All LLM-powered analyst instances.
 * Each analyst calls OpenCode CLI with a philosophy-specific system prompt.
 */
export const LLM_ANALYSTS: Analyst[] = [
  wyckoffAnalyst,
  elliottWaveAnalyst,
  sorosReflexivityAnalyst,
  onChainAnalysisAnalyst,
  warrenBuffettAnalyst,
  longTermConvictionAnalyst,
]

/**
 * All LLM analyst definitions (for UI display, filtering by category, etc.)
 */
export const LLM_ANALYST_DEFINITIONS: LLMAnalystDefinition[] = [
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

// Re-export individual analysts
export {
  wyckoffAnalyst,
  elliottWaveAnalyst,
  sorosReflexivityAnalyst,
  onChainAnalysisAnalyst,
  warrenBuffettAnalyst,
  longTermConvictionAnalyst,
}
