import type { Analyst } from '../types'
import { trendAnalyst } from './trend.analyst'
import { signalConsensusAnalyst } from './signal-consensus.analyst'
import { marketRegimeAnalyst } from './market-regime.analyst'
import { volumeProfileAnalyst } from './volume-profile.analyst'
import { keyLevelsAnalyst } from './key-levels.analyst'
import { mtfAlignmentAnalyst } from './mtf-alignment.analyst'

/**
 * Registry of all analyst modules.
 * Add new analyst modules here to make them available to the consensus engine.
 * Order matters for display — first analyst is shown first in the UI breakdown.
 */
export const ANALYSTS: Analyst[] = [
  trendAnalyst,
  signalConsensusAnalyst,
  marketRegimeAnalyst,
  volumeProfileAnalyst,
  keyLevelsAnalyst,
  mtfAlignmentAnalyst,
]

// Re-export individual analysts for direct import
export { trendAnalyst, signalConsensusAnalyst, marketRegimeAnalyst, volumeProfileAnalyst, keyLevelsAnalyst, mtfAlignmentAnalyst }

// LLM-powered analysts
export { LLM_ANALYSTS, getLLMAnalysts, LLM_ANALYST_DEFINITIONS } from './llm'
