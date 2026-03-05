/**
 * Classification Intelligence Types
 *
 * Types for the philosophical classification system that categorizes
 * crypto projects against the true nature of cryptocurrency consciousness.
 *
 * 6 Categories:
 *   1 — Crack Expander
 *   2 — Infrastructure of Disappearance
 *   3 — Mirror Builder
 *   4 — Narrative Vessel
 *   5 — Ego Builder
 *   6 — Consciousness Seed
 *
 * 9 Cracks (the assumed-vs-actual truth gaps crypto expands into):
 *   1 — Institutional dependency
 *   2 — Property illusion
 *   3 — Geographic financial apartheid
 *   4 — Weaponized time
 *   5 — Information asymmetry
 *   6 — Gatekept participation
 *   7 — Revisable history
 *   8 — Liability dependency
 *   9 — Identity subjugation
 */

// ── Category & Crack Enums ──────────────────────────────────────────────────

export type ClassificationCategory = 1 | 2 | 3 | 4 | 5 | 6

export type CrackId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export const CATEGORY_NAMES: Record<ClassificationCategory, string> = {
  1: 'Crack Expander',
  2: 'Infrastructure of Disappearance',
  3: 'Mirror Builder',
  4: 'Narrative Vessel',
  5: 'Ego Builder',
  6: 'Consciousness Seed',
}

export const CRACK_NAMES: Record<CrackId, string> = {
  1: 'Institutional dependency',
  2: 'Property illusion',
  3: 'Geographic financial apartheid',
  4: 'Weaponized time',
  5: 'Information asymmetry',
  6: 'Gatekept participation',
  7: 'Revisable history',
  8: 'Liability dependency',
  9: 'Identity subjugation',
}

// ── Agent Output Types (what each of the 6 agents returns) ──────────────────

/** Agent 1 — Crack Mapping: Which crack does this project sit at? */
export interface CrackMappingResult {
  crack_ids: CrackId[]
  resonance_strength: Partial<Record<CrackId, number>> // 0-1 per crack
  primary_crack: CrackId | null
  reasoning: string
  evidence: string[]
}

/** Agent 2 — Visibility: Does success make crypto more or less visible? */
export interface VisibilityResult {
  visibility_direction: 'more_visible' | 'less_visible' | 'neutral'
  abstraction_depth: number // 0-1, how many layers between user and crypto
  crypto_language_ratio: number // 0-1, how much the project talks in crypto terms vs general
  reasoning: string
  evidence: string[]
}

/** Agent 3 — Narrative Separator: Remove the narrative — what remains? */
export interface NarrativeSeparatorResult {
  narrative_dependency: number // 0-1, how much the project depends on narrative for relevance
  core_function: string | null // what the project actually DOES without narrative framing
  substitutability: number // 0-1, how easily you could swap this for another project in same narrative
  narrative_label: string | null // the narrative it rides on (e.g. "AI + crypto", "DePIN")
  reasoning: string
  evidence: string[]
}

/** Agent 4 — Power Vector: Concentrate or distribute power over time? */
export interface PowerVectorResult {
  power_direction: 'concentrating' | 'distributing' | 'mixed'
  governance_analysis: string // how decisions actually get made
  team_dependency: number // 0-1, how much the project dies without the team
  token_concentration: string | null // summary of token distribution
  reasoning: string
  evidence: string[]
}

/** Agent 5 — Problem Recognition: Is the crack already recognized? */
export interface ProblemRecognitionResult {
  recognition_level: number // 0-1, how widely the problem this project solves is recognized
  mainstream_awareness: string // how the mainstream describes the problem (if at all)
  categorization_coherence: number // 0-1, how consistently the market categorizes this project
  reasoning: string
  evidence: string[]
}

/** Agent 6 — Identity Polarity: Defined by what it IS or what it's NOT? */
export interface IdentityPolarityResult {
  polarity: 'positive' | 'negative' | 'mixed'
  // positive = defined by what it IS (Cat 1, 2, 5, 6)
  // negative = defined by what it's NOT / opposition (Cat 3)
  // mixed = defined by market narrative (Cat 4)
  self_description_analysis: string // how the project describes itself
  transcendence_indicators: string[] // signs the project transcends its mirror
  reasoning: string
  evidence: string[]
}

// ── Synthesizer Output (Agent 7) ────────────────────────────────────────────

/** A single category weight in the final classification */
export interface CategoryWeight {
  category: ClassificationCategory
  weight: number // 0-1
  reasoning: string
}

/** Final classification output from the synthesizer agent */
export interface ClassificationResult {
  /** All categories with their weights (a project can be multiple categories) */
  categories: CategoryWeight[]
  /** The dominant category */
  primary_category: ClassificationCategory
  /** Which cracks the project aligns with */
  crack_alignment: CrackId[]
  /** Predicted trajectory — where is this project heading? */
  migration_prediction: string
  /** What consciousness function does this project serve? */
  consciousness_contribution: string
  /** Which Inner Council archetype does this align with? */
  archetype_alignment: string
  /** Overall philosophical assessment */
  overall_assessment: string
}

// ── Sub-Agent Result Container ──────────────────────────────────────────────

export type AgentType =
  | 'crack_mapping'
  | 'visibility'
  | 'narrative_separator'
  | 'power_vector'
  | 'problem_recognition'
  | 'identity_polarity'
  | 'synthesizer'

export interface SubAgentResult<T = unknown> {
  agentType: AgentType
  status: 'completed' | 'failed'
  result: T | null
  rawOutput: string | null
  error: string | null
  modelId: string
  durationMs: number
  urlsFetched: string[]
  toolCallCount: number
}

// ── Classification Snapshot (stored in MongoDB for time-series) ──────────────

export interface ClassificationSnapshot {
  symbol: string
  /** The full classification result */
  classification: ClassificationResult
  /** Individual sub-agent results for auditability */
  subAgentResults: {
    crack_mapping: SubAgentResult<CrackMappingResult>
    visibility: SubAgentResult<VisibilityResult>
    narrative_separator: SubAgentResult<NarrativeSeparatorResult>
    power_vector: SubAgentResult<PowerVectorResult>
    problem_recognition: SubAgentResult<ProblemRecognitionResult>
    identity_polarity: SubAgentResult<IdentityPolarityResult>
    synthesizer: SubAgentResult<ClassificationResult>
  }
  /** Model used for the agents */
  modelId: string
  /** When this snapshot was taken */
  classifiedAt: string
}

// ── Migration Detection ─────────────────────────────────────────────────────

export interface CategoryMigration {
  symbol: string
  from_primary: ClassificationCategory
  to_primary: ClassificationCategory
  from_weights: CategoryWeight[]
  to_weights: CategoryWeight[]
  drift_magnitude: number // 0-1, how much the weights shifted
  migration_type: 'upgrade' | 'downgrade' | 'lateral' | 'evolution'
  significance: string // human-readable explanation
  detected_at: string
  snapshot_from: string // ISO date of the earlier snapshot
  snapshot_to: string // ISO date of the later snapshot
}

/** Valuable migration patterns (from framework) */
export const MIGRATION_PATTERNS = {
  /** Cat 4 → Cat 1: Narrative vessel discovers a real crack — highest value signal */
  NARRATIVE_TO_CRACK: { from: 4 as ClassificationCategory, to: 1 as ClassificationCategory, type: 'upgrade' as const, value: 'highest' },
  /** Cat 4 → Cat 2: Narrative vessel becomes infrastructure — high value */
  NARRATIVE_TO_INFRA: { from: 4 as ClassificationCategory, to: 2 as ClassificationCategory, type: 'upgrade' as const, value: 'high' },
  /** Cat 3 → Cat 2: Mirror builder transcends mirroring — becomes invisible infrastructure */
  MIRROR_TO_INFRA: { from: 3 as ClassificationCategory, to: 2 as ClassificationCategory, type: 'evolution' as const, value: 'high' },
  /** Cat 1 → Cat 5: Crack expander centralizes — warning signal */
  CRACK_TO_EGO: { from: 1 as ClassificationCategory, to: 5 as ClassificationCategory, type: 'downgrade' as const, value: 'warning' },
  /** Cat 6 → Cat 1: Consciousness seed finds its crack — validation */
  SEED_TO_CRACK: { from: 6 as ClassificationCategory, to: 1 as ClassificationCategory, type: 'upgrade' as const, value: 'high' },
} as const
