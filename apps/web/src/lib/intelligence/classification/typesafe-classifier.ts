/**
 * TypeSafe Classification Engine
 *
 * Replaces the 7-agent OpenCode/Docker pipeline with batched TypeSafe System One
 * judgments. Round 1 asks all six classification dimensions as independent
 * questions over the same state (one request, run in parallel). Round 2 — a
 * second request, warranted because it needs round-1 answers as state — makes
 * the synthesis call. Code then assembles the exact SubAgentResult /
 * ClassificationResult shapes the old pipeline produced, so the DB models,
 * snapshots, migration tracking and UI keep working unchanged.
 *
 * The framework text (categories, cracks, score levels) is unchanged from the
 * original agent prompts — it now lives in question instructions/criteria
 * instead of INSTRUCTIONS.md. Free-text fields (reasoning, assessments,
 * predictions) are deterministically templated from the judgments: TypeSafe
 * returns typed answers and probabilities, never generated prose.
 */

import {
  askTypeSafe,
  choice,
  choiceProb,
  clamp01,
  noul,
  score,
  scoreTo01,
  typeSafeModel,
  type TypeSafeChoiceAnswer,
  type TypeSafeNoulAnswer,
  type TypeSafeScoreAnswer,
} from '../engine/typesafe'
import type {
  CategoryWeight,
  ClassificationCategory,
  ClassificationResult,
  CrackId,
  CrackMappingResult,
  IdentityPolarityResult,
  NarrativeSeparatorResult,
  PowerVectorResult,
  ProblemRecognitionResult,
  SubAgentResult,
  VisibilityResult,
} from './types'

// ── Framework definitions (verbatim from "The Void's Archive" prompts) ───────

const CRACKS: Record<CrackId, { name: string; assumed: string; actual: string }> = {
  1: { name: 'Institutional dependency', assumed: 'Trust requires institutions', actual: 'Trust requires math' },
  2: { name: 'Property illusion', assumed: 'You own what the ledger says', actual: 'Self-custody is true ownership' },
  3: { name: 'Geographic financial apartheid', assumed: 'Borders are financially real', actual: 'Value is not property of nations' },
  4: { name: 'Weaponized time', assumed: 'Settlement delay is natural', actual: 'Real-time finality is possible' },
  5: { name: 'Information asymmetry', assumed: 'Transparency is asymmetric by nature', actual: 'On-chain = symmetric transparency' },
  6: { name: 'Gatekept participation', assumed: 'Access is rationed by geography/status', actual: 'Permissionless access is default' },
  7: { name: 'Revisable history', assumed: 'The ledger is editable (by authority)', actual: 'Immutable record is possible' },
  8: { name: 'Liability dependency', assumed: 'Money is someone\'s liability', actual: 'Bitcoin is no one\'s liability' },
  9: { name: 'Identity subjugation', assumed: 'Identity is rented from institutions', actual: 'Private key = self-sovereign identity' },
}

const CATEGORIES: Record<ClassificationCategory, { name: string; desc: string }> = {
  1: { name: 'Crack Expander', desc: 'exists AT a genuine crack and IS the expansion of it' },
  2: { name: 'Infrastructure of Disappearance', desc: 'makes crypto invisible to end users — success means disappearance into plumbing' },
  3: { name: 'Mirror Builder', desc: 'reflects fiat\'s assumptions back at it — the "decentralized X" mirror that reveals what was never necessary' },
  4: { name: 'Narrative Vessel', desc: 'exists because a narrative exists — remove the narrative label and nothing remains' },
  5: { name: 'Ego Builder', desc: 'builds new centralized authority while wearing decentralization\'s clothing' },
  6: { name: 'Consciousness Seed', desc: 'creating a crack that does not exist yet — building ahead of recognized problems' },
}

const CATEGORY_IDS = Object.keys(CATEGORIES).map(Number) as ClassificationCategory[]
const CRACK_IDS = Object.keys(CRACKS).map(Number) as CrackId[]

// ── Score legends (situation descriptions, 5 levels, normalized 0..1 by /4) ──

const ABSTRACTION_LEVELS = [
  'Users must understand crypto concepts (wallets, gas, private keys) to use the product',
  'Significant crypto knowledge is needed; only some parts are abstracted',
  'Mixed: some crypto concepts still leak through to the user',
  'Mostly abstracted; only occasional crypto awareness is required',
  'Users have zero awareness they are interacting with crypto',
]

const CRYPTO_LANGUAGE_LEVELS = [
  'The project communicates entirely in non-crypto, problem-first language',
  'Mostly general language with rare crypto terms',
  'Evenly mixed crypto-native and general language',
  'Mostly crypto-native jargon with some general language',
  'Communication is entirely crypto-native jargon',
]

const NARRATIVE_DEPENDENCY_LEVELS = [
  'The project would be equally relevant if its market narrative did not exist',
  'Genuine standalone function; the narrative provides only a minor boost',
  'The narrative is a meaningful but not dominant part of why people care',
  'The narrative is the dominant reason people pay attention',
  'Pure narrative vessel: remove the narrative label and nothing remains',
]

const SUBSTITUTABILITY_LEVELS = [
  'Removing the project leaves a unique gap; no real substitute exists',
  'Substitution would be costly; only one or two near-peers exist',
  'A few projects could replace it with moderate loss',
  'Many similar projects exist; swapping changes little',
  'Interchangeable with 5+ same-narrative projects; swapping changes nothing',
]

const TEAM_DEPENDENCY_LEVELS = [
  'The protocol runs autonomously; the team could vanish and it continues',
  'The team drives development but the protocol is self-sustaining',
  'The project depends significantly on the team for direction and maintenance',
  'The team is central to operations; their absence would badly degrade the project',
  'The team IS the product: remove them and everything stops',
]

const TOKEN_CONCENTRATION_LEVELS = [
  'Tokens are widely dispersed; no single actor holds meaningful control',
  'Some large holders exist but no blocking stake',
  'Notable concentration: insiders or a foundation hold significant power',
  'Heavy concentration: a handful of entities control governance or supply',
  'Extreme concentration: team/foundation controls token supply, roadmap and validators',
]

const RECOGNITION_LEVELS = [
  'Nobody recognizes this as a problem yet — it is not on anyone\'s map',
  'A few specialists recognize it; the mainstream does not',
  'The problem is recognized but solutions are new and unproven',
  'A well-understood problem with established solution categories',
  'A universally recognized problem mainstream people can articulate',
]

const COHERENCE_LEVELS = [
  'The market has no consistent way to categorize this project',
  'The market reaches for different, conflicting labels',
  'A category exists but the fit is awkward',
  'Mostly clean categorization with minor disagreement',
  'The market cleanly and consistently categorizes it',
]

// ── State preparation ────────────────────────────────────────────────────────

/** Truncate a string for state without breaking mid-word badly */
function trimText(v: unknown, max: number): string | null {
  if (typeof v !== 'string' || v.trim().length === 0) return null
  const s = v.trim()
  return s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

/** Compact discovery research into bounded state — all facts, no bloat */
function buildClassificationState(
  symbol: string,
  projectName: string,
  discovery: Record<string, unknown> | null,
): Record<string, unknown> {
  const project: Record<string, unknown> = { symbol, name: projectName }

  if (discovery) {
    for (const [key, value] of Object.entries(discovery)) {
      if (value == null) continue
      if (typeof value === 'string') {
        const t = trimText(value, 300)
        if (t) project[key] = t
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        project[key] = value
      } else if (Array.isArray(value)) {
        const items = value
          .map((v) => (typeof v === 'string' ? trimText(v, 160) : null))
          .filter((v): v is string => v !== null)
          .slice(0, 5)
        if (items.length > 0) project[key] = items
      }
      // nested objects skipped — flat facts are what the judgments need
    }
  } else {
    project['note'] = 'No prior research data available — judge from general knowledge of this project.'
  }

  return {
    instructions_context: 'You are judging what a crypto project\'s relationship to crypto\'s true nature IS — not whether it is a good investment. Judge from the project\'s actual FUNCTION, never its marketing.',
    project,
  }
}

/** Pick a few concrete discovery facts as evidence for a dimension result */
function pickEvidence(discovery: Record<string, unknown> | null, keys: string[]): string[] {
  if (!discovery) return []
  const out: string[] = []
  for (const key of keys) {
    const t = trimText(discovery[key], 200)
    if (t) out.push(`${key}: ${t}`)
    if (out.length >= 3) break
  }
  return out
}

// ── Round 1: the six classification dimensions (one batched request) ─────────

interface Round1Answers {
  cracks: Record<CrackId, TypeSafeNoulAnswer>
  visibility_direction: TypeSafeChoiceAnswer
  abstraction_depth: TypeSafeScoreAnswer
  crypto_language: TypeSafeScoreAnswer
  narrative_dependency: TypeSafeScoreAnswer
  substitutability: TypeSafeScoreAnswer
  has_core_function: TypeSafeNoulAnswer
  narrative_label: TypeSafeChoiceAnswer
  power_direction: TypeSafeChoiceAnswer
  team_dependency: TypeSafeScoreAnswer
  token_concentration: TypeSafeScoreAnswer
  recognition_level: TypeSafeScoreAnswer
  categorization_coherence: TypeSafeScoreAnswer
  identity_polarity: TypeSafeChoiceAnswer
  transcends_mirror: TypeSafeNoulAnswer
}

/** Candidate narratives for the narrative_label choice — discovery categories plus common crypto narratives */
function narrativeCandidates(discovery: Record<string, unknown> | null): string[] {
  const FIXED = [
    'ai_plus_crypto', 'depin', 'rwa', 'modular_blockchain', 'l2_scaling', 'defi',
    'meme', 'gaming', 'privacy', 'dao_infrastructure', 'oracle', 'storage',
    'liquid_staking', 'restaking', 'interop_bridge',
  ]
  const fromDiscovery = Array.isArray(discovery?.categories)
    ? (discovery.categories as unknown[])
        .filter((c): c is string => typeof c === 'string')
        .map((c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
        .filter((c) => c.length > 1 && !FIXED.includes(c))
    : []
  return [...new Set([...fromDiscovery, ...FIXED, 'none'])]
}

function buildRound1Questions(discovery: Record<string, unknown> | null): Record<string, ReturnType<typeof noul | typeof choice | typeof score>> {
  const questions: Record<string, ReturnType<typeof noul | typeof choice | typeof score>> = {}

  // Dimension 1 — Crack Mapping: one noul per crack (each judged independently)
  for (const id of CRACK_IDS) {
    const crack = CRACKS[id]
    questions[`crack_${id}`] = noul(
      `Does this project's actual FUNCTION (not its marketing) address crack ${id} — "${crack.name}"? This crack is the gap between the assumed truth "${crack.assumed}" and the actual truth "${crack.actual}". Answer yes only if the project's core mechanics genuinely expand this gap. Apply the Crack Expander test: if the project disappeared, would this crack remain un-addressed by it? A project can address multiple cracks.`,
      {
        true: `The project's core function structurally expands the "${crack.name}" crack`,
        false: `The project does not meaningfully address this crack`,
      },
    )
  }

  // Dimension 2 — Visibility
  questions['visibility_direction'] = choice(
    'Does this project\'s success make crypto MORE or LESS visible to end users? The framework: crypto\'s ultimate success is disappearance — trustless coordination becomes so fundamental nobody calls it "crypto".',
    {
      less_visible: 'Success means crypto disappears further into infrastructure; users never think about it',
      more_visible: 'Success means MORE people explicitly know they are interacting with crypto',
      neutral: 'No clear effect on crypto\'s visibility either way',
    },
  )
  questions['abstraction_depth'] = score(
    'How deeply does this project abstract crypto away from its end users?',
    ABSTRACTION_LEVELS,
  )
  questions['crypto_language'] = score(
    'How much does the project communicate in crypto-native language versus general problem-first language?',
    CRYPTO_LANGUAGE_LEVELS,
  )

  // Dimension 3 — Narrative Separator
  questions['narrative_dependency'] = score(
    'How much does this project\'s relevance depend on its market narrative?',
    NARRATIVE_DEPENDENCY_LEVELS,
  )
  questions['substitutability'] = score(
    'If this project were removed, how easily could another same-narrative project replace it?',
    SUBSTITUTABILITY_LEVELS,
  )
  questions['has_core_function'] = noul(
    'If ALL narrative framing is stripped away (the words "AI", "DePIN", "RWA", "modular", etc.), does a concrete mechanical function remain that gives this project a reason to exist?',
    {
      true: 'A concrete mechanical function remains without any narrative framing',
      false: 'Without the narrative label there is no clear reason for the project to exist',
    },
  )
  questions['narrative_label'] = choice(
    'Which market narrative does this project ride on? Choose the single best fit.',
    Object.fromEntries(
      narrativeCandidates(discovery).map((label) => [
        label,
        label === 'none'
          ? 'The project predates or transcends narrative categories — no specific narrative applies'
          : null,
      ]),
    ),
  )

  // Dimension 4 — Power Vector
  questions['power_direction'] = choice(
    'Does this project concentrate or distribute decision-making power over time? Follow the governance, not the marketing.',
    {
      concentrating: 'Power is becoming MORE centralized over time — new authority in decentralization\'s clothing',
      distributing: 'Power is genuinely spreading to participants over time',
      mixed: 'Some aspects centralize while others distribute',
    },
  )
  questions['team_dependency'] = score(
    'How much does this project depend on its founding team continuing to run it?',
    TEAM_DEPENDENCY_LEVELS,
  )
  questions['token_concentration'] = score(
    'How concentrated is the project\'s token supply and governance power?',
    TOKEN_CONCENTRATION_LEVELS,
  )

  // Dimension 5 — Problem Recognition
  questions['recognition_level'] = score(
    'How widely is the problem this project solves recognized as a problem?',
    RECOGNITION_LEVELS,
  )
  questions['categorization_coherence'] = score(
    'How consistently does the market categorize this project?',
    COHERENCE_LEVELS,
  )

  // Dimension 6 — Identity Polarity
  questions['identity_polarity'] = choice(
    'Is this project defined by what it IS, by what it is NOT, or by what the market says it is?',
    {
      positive: 'Defined by what it IS — a novel function with no traditional equivalent',
      negative: 'Defined by what it is NOT — opposition to a legacy system (the "decentralized X" pattern)',
      mixed: 'Defined mainly by what the market says it is — narrative-dependent identity',
    },
  )
  questions['transcends_mirror'] = noul(
    'Does the project show signs of transcending its mirror — building features, usage or a user base with no traditional-finance equivalent, beyond the legacy system it mirrors?',
    {
      true: 'Concrete signs of transcending the mirrored legacy system',
      false: 'No signs of transcending — it remains defined by the system it mirrors',
    },
  )

  return questions
}

// ── Round 2: synthesis (needs round-1 answers as state) ──────────────────────

interface Round2Answers {
  category: Record<ClassificationCategory, TypeSafeNoulAnswer>
  primary_category: TypeSafeChoiceAnswer
  migration_trajectory: TypeSafeChoiceAnswer
  archetype: TypeSafeChoiceAnswer
}

const ARCHETYPE_CLAUSES: Record<string, string> = {
  Warrior: 'adversarial thinking and protocol defense',
  Magician: 'cryptography and protocol design',
  Lover: 'onboarding, UX and belonging',
  King: 'governance and stewardship',
  Sage: 'philosophical understanding of why this exists',
}

function buildRound2Questions(): Record<string, ReturnType<typeof noul | typeof choice>> {
  const questions: Record<string, ReturnType<typeof noul | typeof choice>> = {}

  // One noul per category — a project can belong to several categories at once
  for (const id of CATEGORY_IDS) {
    const cat = CATEGORIES[id]
    questions[`category_${id}`] = noul(
      `Does this project belong to Category ${id}: ${cat.name} — ${cat.desc}? A project can belong to multiple categories simultaneously; judge THIS category on its own merits using the phase-one judgments provided.`,
      {
        true: `The project genuinely belongs to Category ${id} (${cat.name})`,
        false: `The project does not belong to Category ${id}`,
      },
    )
  }

  questions['primary_category'] = choice(
    'Which single category is the project\'s PRIMARY classification — the lens that best explains what it fundamentally is?',
    {
      cat_1_crack_expander: `Category 1 — ${CATEGORIES[1].desc}`,
      cat_2_infrastructure_of_disappearance: `Category 2 — ${CATEGORIES[2].desc}`,
      cat_3_mirror_builder: `Category 3 — ${CATEGORIES[3].desc}`,
      cat_4_narrative_vessel: `Category 4 — ${CATEGORIES[4].desc}`,
      cat_5_ego_builder: `Category 5 — ${CATEGORIES[5].desc}`,
      cat_6_consciousness_seed: `Category 6 — ${CATEGORIES[6].desc}`,
    },
  )

  questions['migration_trajectory'] = choice(
    'Predict where this project is heading categorically, based on all judgments. Category migration is the framework\'s most valuable signal.',
    {
      stable: 'No category migration expected — it stays in its current primary category',
      cat4_to_cat1: 'Narrative Vessel discovers a real crack → Crack Expander (Cat 4 → 1): the highest-value upgrade',
      cat4_to_cat2: 'Narrative Vessel becomes invisible infrastructure (Cat 4 → 2): high value',
      cat3_to_cat2: 'Mirror Builder transcends mirroring into infrastructure (Cat 3 → 2): evolution',
      cat1_to_cat5: 'Crack Expander centralizes into an Ego Builder (Cat 1 → 5): warning downgrade',
      cat6_to_cat1: 'Consciousness Seed finds its crack (Cat 6 → 1): validation upgrade',
      other: 'A different trajectory than any listed pattern',
    },
  )

  questions['archetype'] = choice(
    'Which Inner Council archetype does this project\'s contribution align with?',
    {
      Warrior: 'Security researchers, adversarial thinking, protocol defense',
      Magician: 'ZK researchers, cryptographers, protocol designers',
      Lover: 'UX, onboarding, beauty, belonging (rare in crypto)',
      King: 'Governance, stewardship',
      Sage: '"Why does this exist?" — philosophical understanding',
    },
  )

  return questions
}

// ── Assembly: judgments → legacy result shapes ───────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

function assembleCrackMapping(
  answers: Round1Answers,
  discovery: Record<string, unknown> | null,
  modelId: string,
  durationMs: number,
): SubAgentResult<CrackMappingResult> {
  const scored = CRACK_IDS
    .map((id) => ({ id, p: clamp01(answers.cracks[id].noul) }))
    .sort((a, b) => b.p - a.p)

  const crackIds = scored.filter((c) => c.p >= 0.5).map((c) => c.id)
  const resonance: Partial<Record<CrackId, number>> = {}
  for (const c of scored) resonance[c.id] = c.p

  const primary = scored[0]
  const primaryCrack: CrackId | null = primary && primary.p >= 0.5 ? primary.id : (crackIds[0] ?? null)

  const result: CrackMappingResult = {
    crack_ids: crackIds,
    resonance_strength: resonance,
    primary_crack: primaryCrack,
    reasoning: primaryCrack
      ? `Strongest structural resonance at crack ${primaryCrack} (${CRACKS[primaryCrack].name}) at ${pct(primary.p)}; ${crackIds.length} crack${crackIds.length === 1 ? '' : 's'} exceed the 0.5 threshold.`
      : 'No crack reached the 0.5 resonance threshold — the project maps to no existing crack (Narrative Vessel or Consciousness Seed territory).',
    evidence: pickEvidence(discovery, ['description', 'uniqueSellingPoint', 'adoptionSignals']),
  }

  return {
    agentType: 'crack_mapping',
    status: 'completed',
    result,
    rawOutput: JSON.stringify(answers.cracks),
    error: null,
    modelId,
    durationMs,
    urlsFetched: [],
    toolCallCount: 0,
  }
}

function assembleVisibility(
  answers: Round1Answers,
  discovery: Record<string, unknown> | null,
  modelId: string,
  durationMs: number,
): SubAgentResult<VisibilityResult> {
  const dir = answers.visibility_direction
  const direction = dir.choice as VisibilityResult['visibility_direction']
  const abstraction = scoreTo01(answers.abstraction_depth)
  const language = scoreTo01(answers.crypto_language)

  const result: VisibilityResult = {
    visibility_direction: direction,
    abstraction_depth: abstraction,
    crypto_language_ratio: language,
    reasoning: `Judged ${direction.replace('_', ' ')} (p=${pct(choiceProb(dir, direction))}, confidence ${pct(dir.confidence)}). Abstraction depth ${(abstraction).toFixed(2)} — ${ABSTRACTION_LEVELS[Math.round(answers.abstraction_depth.score)]}.`,
    evidence: pickEvidence(discovery, ['description', 'website', 'adoptionSignals']),
  }

  return {
    agentType: 'visibility',
    status: 'completed',
    result,
    rawOutput: JSON.stringify({
      visibility_direction: answers.visibility_direction,
      abstraction_depth: answers.abstraction_depth.probabilities,
      crypto_language: answers.crypto_language.probabilities,
    }),
    error: null,
    modelId,
    durationMs,
    urlsFetched: [],
    toolCallCount: 0,
  }
}

function assembleNarrativeSeparator(
  answers: Round1Answers,
  discovery: Record<string, unknown> | null,
  modelId: string,
  durationMs: number,
): SubAgentResult<NarrativeSeparatorResult> {
  const dependency = scoreTo01(answers.narrative_dependency)
  const substitutability = scoreTo01(answers.substitutability)
  const hasCore = clamp01(answers.has_core_function.noul)
  const label = answers.narrative_label.choice === 'none' ? null : answers.narrative_label.choice

  const coreFunction = hasCore >= 0.5
    ? trimText(discovery?.description ?? discovery?.uniqueSellingPoint, 220)
    : null

  const result: NarrativeSeparatorResult = {
    narrative_dependency: dependency,
    core_function: coreFunction,
    substitutability,
    narrative_label: label,
    reasoning: `Narrative dependency ${dependency.toFixed(2)} (${NARRATIVE_DEPENDENCY_LEVELS[Math.round(answers.narrative_dependency.score)]}). Core function ${hasCore >= 0.5 ? `survives narrative removal (p=${pct(hasCore)})` : `does not survive narrative removal (p=${pct(hasCore)}) — Category 4 acid test failed`}.`,
    evidence: pickEvidence(discovery, ['categories', 'competitors', 'uniqueSellingPoint']),
  }

  return {
    agentType: 'narrative_separator',
    status: 'completed',
    result,
    rawOutput: JSON.stringify({
      narrative_dependency: answers.narrative_dependency.probabilities,
      substitutability: answers.substitutability.probabilities,
      has_core_function: answers.has_core_function,
      narrative_label: answers.narrative_label.probabilities,
    }),
    error: null,
    modelId,
    durationMs,
    urlsFetched: [],
    toolCallCount: 0,
  }
}

function assemblePowerVector(
  answers: Round1Answers,
  discovery: Record<string, unknown> | null,
  modelId: string,
  durationMs: number,
): SubAgentResult<PowerVectorResult> {
  const dir = answers.power_direction
  const teamDependency = scoreTo01(answers.team_dependency)
  const concentration = scoreTo01(answers.token_concentration)

  const result: PowerVectorResult = {
    power_direction: dir.choice as PowerVectorResult['power_direction'],
    governance_analysis: `Judged ${dir.choice} (p=${pct(choiceProb(dir, dir.choice))}, confidence ${pct(dir.confidence)}). Token concentration ${concentration.toFixed(2)} — ${TOKEN_CONCENTRATION_LEVELS[Math.round(answers.token_concentration.score)]}.`,
    team_dependency: teamDependency,
    token_concentration: TOKEN_CONCENTRATION_LEVELS[Math.round(answers.token_concentration.score)],
    reasoning: `Power is judged ${dir.choice} with ${pct(choiceProb(dir, dir.choice))} probability. Team dependency ${teamDependency.toFixed(2)} — ${TEAM_DEPENDENCY_LEVELS[Math.round(answers.team_dependency.score)]}.`,
    evidence: pickEvidence(discovery, ['investors', 'treasury', 'totalSupply', 'circulatingSupply']),
  }

  return {
    agentType: 'power_vector',
    status: 'completed',
    result,
    rawOutput: JSON.stringify({
      power_direction: answers.power_direction.probabilities,
      team_dependency: answers.team_dependency.probabilities,
      token_concentration: answers.token_concentration.probabilities,
    }),
    error: null,
    modelId,
    durationMs,
    urlsFetched: [],
    toolCallCount: 0,
  }
}

function assembleProblemRecognition(
  answers: Round1Answers,
  discovery: Record<string, unknown> | null,
  modelId: string,
  durationMs: number,
): SubAgentResult<ProblemRecognitionResult> {
  const recognition = scoreTo01(answers.recognition_level)
  const coherence = scoreTo01(answers.categorization_coherence)

  const result: ProblemRecognitionResult = {
    recognition_level: recognition,
    mainstream_awareness: RECOGNITION_LEVELS[Math.round(answers.recognition_level.score)],
    categorization_coherence: coherence,
    reasoning: `Recognition level ${recognition.toFixed(2)} (${RECOGNITION_LEVELS[Math.round(answers.recognition_level.score)]}). Categorization coherence ${coherence.toFixed(2)} — low coherence is a Consciousness Seed signal.`,
    evidence: pickEvidence(discovery, ['narrativeStrength', 'categories', 'recentNews']),
  }

  return {
    agentType: 'problem_recognition',
    status: 'completed',
    result,
    rawOutput: JSON.stringify({
      recognition_level: answers.recognition_level.probabilities,
      categorization_coherence: answers.categorization_coherence.probabilities,
    }),
    error: null,
    modelId,
    durationMs,
    urlsFetched: [],
    toolCallCount: 0,
  }
}

function assembleIdentityPolarity(
  answers: Round1Answers,
  discovery: Record<string, unknown> | null,
  modelId: string,
  durationMs: number,
): SubAgentResult<IdentityPolarityResult> {
  const pol = answers.identity_polarity
  const polarity = pol.choice as IdentityPolarityResult['polarity']
  const transcends = clamp01(answers.transcends_mirror.noul)

  const selfDescription: Record<string, string> = {
    positive: 'Defined by what it IS — a novel function with no traditional equivalent',
    negative: 'Defined in opposition — the "decentralized X" mirror pattern',
    mixed: 'Defined by what the market says it is — narrative-dependent',
  }

  const result: IdentityPolarityResult = {
    polarity,
    self_description_analysis: `${selfDescription[polarity]} (p=${pct(choiceProb(pol, polarity))}).`,
    transcendence_indicators: transcends >= 0.6
      ? ['Features/usage with no traditional-finance equivalent detected', `Transcendence probability ${pct(transcends)}`]
      : [],
    reasoning: `Identity polarity is ${polarity} (p=${pct(choiceProb(pol, polarity))}, confidence ${pct(pol.confidence)}). Transcendence of its mirror: ${pct(transcends)}.`,
    evidence: pickEvidence(discovery, ['description', 'uniqueSellingPoint', 'website']),
  }

  return {
    agentType: 'identity_polarity',
    status: 'completed',
    result,
    rawOutput: JSON.stringify({
      identity_polarity: answers.identity_polarity.probabilities,
      transcends_mirror: answers.transcends_mirror,
    }),
    error: null,
    modelId,
    durationMs,
    urlsFetched: [],
    toolCallCount: 0,
  }
}

const PRIMARY_CATEGORY_MAP: Record<string, ClassificationCategory> = {
  cat_1_crack_expander: 1,
  cat_2_infrastructure_of_disappearance: 2,
  cat_3_mirror_builder: 3,
  cat_4_narrative_vessel: 4,
  cat_5_ego_builder: 5,
  cat_6_consciousness_seed: 6,
}

const MIGRATION_TEXT: Record<string, string> = {
  stable: 'No categorical migration predicted — the project remains in its current primary category.',
  cat4_to_cat1: 'Predicted migration: Narrative Vessel → Crack Expander (Cat 4 → 1). A narrative vessel discovering a real crack is the highest-value signal in the framework.',
  cat4_to_cat2: 'Predicted migration: Narrative Vessel → Infrastructure of Disappearance (Cat 4 → 2) — narrative becoming invisible infrastructure, a high-value evolution.',
  cat3_to_cat2: 'Predicted migration: Mirror Builder → Infrastructure of Disappearance (Cat 3 → 2) — transcending the mirror into invisible infrastructure.',
  cat1_to_cat5: 'Predicted migration: Crack Expander → Ego Builder (Cat 1 → 5). WARNING: the expansion is centralizing into new authority.',
  cat6_to_cat1: 'Predicted migration: Consciousness Seed → Crack Expander (Cat 6 → 1) — the seed found its crack; validation.',
  other: 'A non-standard categorical trajectory is predicted — the project is moving between categories in a way the standard patterns do not capture.',
}

const CONTRIBUTION_TEXT: Record<ClassificationCategory, string> = {
  1: 'Expands a genuine crack in crypto\'s assumed truths — the project IS the widening of the gap.',
  2: 'Hides crypto inside ordinary infrastructure — expansion through disappearance.',
  3: 'Mirrors legacy finance\'s assumptions back at it, revealing what was never actually necessary.',
  4: 'Carries a market narrative — a scout processing market information; its value depends on whether it discovers a real crack.',
  5: 'Channels the expansion of consciousness into a new authority structure — contraction in decentralization\'s clothing.',
  6: 'Seeds a crack that does not yet exist — building ahead of what the market recognizes as a problem.',
}

function assembleClassification(
  projectName: string,
  r1: Round1Answers,
  r2: Round2Answers,
  modelId: string,
  durationMs: number,
): ClassificationResult {
  // Category weights from the per-category nouls, normalized to sum ≈ 1
  const raw = CATEGORY_IDS.map((id) => ({ category: id, p: clamp01(r2.category[id].noul) }))
  const meaningful = raw.filter((c) => c.p >= 0.03)
  const sum = meaningful.reduce((s, c) => s + c.p, 0) || 1
  const categories: CategoryWeight[] = meaningful
    .map((c) => ({
      category: c.category,
      weight: c.p / sum,
      reasoning: `Phase-one dimensions plus category judgment at ${pct(c.p)}: ${CATEGORIES[c.category].desc}.`,
    }))
    .sort((a, b) => b.weight - a.weight)

  const chosen = PRIMARY_CATEGORY_MAP[r2.primary_category.choice]
  const primary_category: ClassificationCategory = chosen ?? categories[0]?.category ?? 4

  const crackAlignment = CRACK_IDS.filter((id) => clamp01(r1.cracks[id].noul) >= 0.6)

  const trajectory = r2.migration_trajectory.choice
  const primaryName = CATEGORIES[primary_category].name
  const migrationBase = MIGRATION_TEXT[trajectory] ?? MIGRATION_TEXT.stable
  const migrationDetail =
    trajectory === 'cat1_to_cat5' ? ` Team dependency ${scoreTo01(r1.team_dependency).toFixed(2)} and token concentration ${scoreTo01(r1.token_concentration).toFixed(2)} support the centralization warning.`
    : trajectory === 'cat4_to_cat1' || trajectory === 'cat4_to_cat2' ? ` Narrative dependency ${scoreTo01(r1.narrative_dependency).toFixed(2)} with ${r1.has_core_function.noul >= 0.5 ? 'a surviving core function' : 'no surviving core function'} drives the prediction.`
    : ''

  const archetype = r2.archetype.choice
  const archetypeClause = ARCHETYPE_CLAUSES[archetype] ?? archetype.toLowerCase()

  const second = categories.find((c) => c.category !== primary_category)
  const contested = second && categories[0] && (categories[0].weight - second.weight) < 0.08

  const overall = [
    `${projectName} classifies as ${primaryName} (weight ${pct(categories.find((c) => c.category === primary_category)?.weight ?? 0)})${second ? `, with ${CATEGORIES[second.category].name} secondary at ${pct(second.weight)}` : ''}.`,
    contested ? `The category call is contested (${pct(categories[0].weight)} vs ${pct(second.weight)}) — treat the primary as provisional.` : `Category judgment confidence ${pct(r2.primary_category.confidence)}.`,
    `Power is ${r1.power_direction.choice}; narrative dependency ${scoreTo01(r1.narrative_dependency).toFixed(2)}; strongest crack resonance: ${crackAlignment.length > 0 ? crackAlignment.map((id) => `${id} (${CRACKS[id].name})`).join(', ') : 'none above threshold'}.`,
  ].join(' ')

  return {
    categories,
    primary_category,
    crack_alignment: crackAlignment,
    migration_prediction: migrationBase + migrationDetail,
    consciousness_contribution: CONTRIBUTION_TEXT[primary_category],
    archetype_alignment: `${archetype} — ${archetypeClause}.`,
    overall_assessment: overall,
  }
}

// ── Public entry point ───────────────────────────────────────────────────────

export interface TypeSafeClassificationOutput {
  subAgentResults: Record<'crack_mapping' | 'visibility' | 'narrative_separator' | 'power_vector' | 'problem_recognition' | 'identity_polarity' | 'synthesizer', SubAgentResult>
  classification: ClassificationResult
  modelId: string
  totalDurationMs: number
}

/**
 * Run the full philosophical classification as two batched TypeSafe requests.
 * Round 1: all six dimensions over the same state (parallel, one call).
 * Round 2: synthesis — needs round-1 answers as state, so a second call.
 *
 * Throws TypeSafeError on API failure (caller decides job status).
 */
export async function runTypeSafeClassification(
  symbol: string,
  projectName: string,
  discoveryData: Record<string, unknown> | null,
  onLog?: (line: string) => Promise<void> | void,
): Promise<TypeSafeClassificationOutput> {
  const modelId = typeSafeModel()
  const started = Date.now()
  const state = buildClassificationState(symbol, projectName, discoveryData)

  // ── Round 1: six dimensions, one batched request ──
  await onLog?.(`[typesafe] Round 1: asking ${Object.keys(buildRound1Questions(discoveryData)).length} dimension judgments in one batched request`)
  const t1 = Date.now()
  const r1raw = await askTypeSafe(state, buildRound1Questions(discoveryData))
  const r1: Round1Answers = {
    cracks: Object.fromEntries(
      CRACK_IDS.map((id) => [id, r1raw.answers[`crack_${id}`] as TypeSafeNoulAnswer]),
    ) as Record<CrackId, TypeSafeNoulAnswer>,
    visibility_direction: r1raw.answers.visibility_direction as TypeSafeChoiceAnswer,
    abstraction_depth: r1raw.answers.abstraction_depth as TypeSafeScoreAnswer,
    crypto_language: r1raw.answers.crypto_language as TypeSafeScoreAnswer,
    narrative_dependency: r1raw.answers.narrative_dependency as TypeSafeScoreAnswer,
    substitutability: r1raw.answers.substitutability as TypeSafeScoreAnswer,
    has_core_function: r1raw.answers.has_core_function as TypeSafeNoulAnswer,
    narrative_label: r1raw.answers.narrative_label as TypeSafeChoiceAnswer,
    power_direction: r1raw.answers.power_direction as TypeSafeChoiceAnswer,
    team_dependency: r1raw.answers.team_dependency as TypeSafeScoreAnswer,
    token_concentration: r1raw.answers.token_concentration as TypeSafeScoreAnswer,
    recognition_level: r1raw.answers.recognition_level as TypeSafeScoreAnswer,
    categorization_coherence: r1raw.answers.categorization_coherence as TypeSafeScoreAnswer,
    identity_polarity: r1raw.answers.identity_polarity as TypeSafeChoiceAnswer,
    transcends_mirror: r1raw.answers.transcends_mirror as TypeSafeNoulAnswer,
  }
  const d1 = Date.now() - t1
  await onLog?.(`[typesafe] Round 1 complete in ${(d1 / 1000).toFixed(1)}s (${r1raw.usage.input_tokens}+${r1raw.usage.output_tokens} tokens)`)

  const subAgentResults: TypeSafeClassificationOutput['subAgentResults'] = {
    crack_mapping: assembleCrackMapping(r1, discoveryData, modelId, d1),
    visibility: assembleVisibility(r1, discoveryData, modelId, d1),
    narrative_separator: assembleNarrativeSeparator(r1, discoveryData, modelId, d1),
    power_vector: assemblePowerVector(r1, discoveryData, modelId, d1),
    problem_recognition: assembleProblemRecognition(r1, discoveryData, modelId, d1),
    identity_polarity: assembleIdentityPolarity(r1, discoveryData, modelId, d1),
    synthesizer: null as unknown as SubAgentResult,
  }

  // ── Round 2: synthesis over phase-one judgments ──
  await onLog?.('[typesafe] Round 2: synthesis judgment (primary category, migration, archetype)')
  const t2 = Date.now()
  const synthesisState = {
    ...state,
    phase1_judgments: {
      crack_resonance: Object.fromEntries(CRACK_IDS.map((id) => [id, r1.cracks[id].noul])),
      visibility_direction: r1.visibility_direction.choice,
      abstraction_depth: scoreTo01(r1.abstraction_depth),
      crypto_language_ratio: scoreTo01(r1.crypto_language),
      narrative_dependency: scoreTo01(r1.narrative_dependency),
      substitutability: scoreTo01(r1.substitutability),
      has_core_function: r1.has_core_function.noul,
      narrative_label: r1.narrative_label.choice,
      power_direction: r1.power_direction.choice,
      team_dependency: scoreTo01(r1.team_dependency),
      token_concentration: scoreTo01(r1.token_concentration),
      recognition_level: scoreTo01(r1.recognition_level),
      categorization_coherence: scoreTo01(r1.categorization_coherence),
      identity_polarity: r1.identity_polarity.choice,
      transcends_mirror: r1.transcends_mirror.noul,
    },
  }
  const r2raw = await askTypeSafe(synthesisState, buildRound2Questions())
  const r2: Round2Answers = {
    category: Object.fromEntries(
      CATEGORY_IDS.map((id) => [id, r2raw.answers[`category_${id}`] as TypeSafeNoulAnswer]),
    ) as Record<ClassificationCategory, TypeSafeNoulAnswer>,
    primary_category: r2raw.answers.primary_category as TypeSafeChoiceAnswer,
    migration_trajectory: r2raw.answers.migration_trajectory as TypeSafeChoiceAnswer,
    archetype: r2raw.answers.archetype as TypeSafeChoiceAnswer,
  }
  const d2 = Date.now() - t2
  await onLog?.(`[typesafe] Round 2 complete in ${(d2 / 1000).toFixed(1)}s (${r2raw.usage.input_tokens}+${r2raw.usage.output_tokens} tokens)`)

  const classification = assembleClassification(projectName, r1, r2, modelId, d2)

  subAgentResults.synthesizer = {
    agentType: 'synthesizer',
    status: 'completed',
    result: classification,
    rawOutput: JSON.stringify({
      category: r2.category,
      primary_category: r2.primary_category,
      migration_trajectory: r2.migration_trajectory,
      archetype: r2.archetype,
    }),
    error: null,
    modelId,
    durationMs: d2,
    urlsFetched: [],
    toolCallCount: 0,
  }

  await onLog?.(`[typesafe] Classification: Cat ${classification.primary_category} (${CATEGORIES[classification.primary_category].name})`)

  return {
    subAgentResults,
    classification,
    modelId,
    totalDurationMs: Date.now() - started,
  }
}
