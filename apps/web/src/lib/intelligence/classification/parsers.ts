/**
 * Classification Response Parsers
 *
 * Parse structured JSON output from each of the 7 classification agents.
 * Follows the same robust extraction pattern as discover-worker.ts.
 */

import type {
  CrackMappingResult,
  VisibilityResult,
  NarrativeSeparatorResult,
  PowerVectorResult,
  ProblemRecognitionResult,
  IdentityPolarityResult,
  ClassificationResult,
  AgentType,
  CrackId,
  ClassificationCategory,
} from './types'

// ── Generic JSON extraction (robust: handles prose + JSON mixed output) ──────

function extractFirstJson(text: string): Record<string, unknown> | null {
  // 1. Try direct parse (clean output)
  try {
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed)
    }
  } catch { /* nope */ }

  // 2. Try code block extraction
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlockMatch) {
    try { return JSON.parse(jsonBlockMatch[1]!) } catch { /* nope */ }
  }

  // 3. Find JSON by balanced brace matching — scan for { and count braces
  //    This handles prose before/after JSON correctly
  const candidates: string[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      let depth = 0
      let inString = false
      let escaped = false
      for (let j = i; j < text.length; j++) {
        const ch = text[j]!
        if (escaped) { escaped = false; continue }
        if (ch === '\\' && inString) { escaped = true; continue }
        if (ch === '"' && !escaped) { inString = !inString; continue }
        if (inString) continue
        if (ch === '{') depth++
        if (ch === '}') {
          depth--
          if (depth === 0) {
            candidates.push(text.substring(i, j + 1))
            break
          }
        }
      }
    }
  }

  // Try candidates from largest to smallest (largest is most likely the full JSON)
  candidates.sort((a, b) => b.length - a.length)
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed
      }
    } catch { /* try next */ }
  }

  // 4. Last resort — try known keys with non-greedy approach
  const knownKeys = ['crack_ids', 'visibility_direction', 'narrative_dependency', 'power_direction', 'recognition_level', 'polarity', 'categories', 'primary_category']
  for (const key of knownKeys) {
    const idx = text.indexOf(`"${key}"`)
    if (idx === -1) continue
    // Walk backwards from the key to find the opening brace
    const braceIdx = text.lastIndexOf('{', idx)
    if (braceIdx === -1) continue
    const fragment = text.substring(braceIdx)
    // Try progressive end-finding
    for (let end = fragment.length; end > 20; end--) {
      const slice = fragment.substring(0, end)
      if (slice.lastIndexOf('}') === -1) continue
      const trimSlice = slice.substring(0, slice.lastIndexOf('}') + 1)
      try { return JSON.parse(trimSlice) } catch { continue }
    }
  }

  return null
}

// ── Type guards & validators ────────────────────────────────────────────────

function isValidCrackId(n: unknown): n is CrackId {
  return typeof n === 'number' && n >= 1 && n <= 9 && Number.isInteger(n)
}

function isValidCategory(n: unknown): n is ClassificationCategory {
  return typeof n === 'number' && n >= 1 && n <= 6 && Number.isInteger(n)
}

function clamp01(n: unknown): number {
  if (typeof n !== 'number' || isNaN(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function ensureStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.filter((v): v is string => typeof v === 'string')
}

function ensureString(val: unknown, fallback: string = ''): string {
  return typeof val === 'string' ? val : fallback
}

// ── Individual parsers ──────────────────────────────────────────────────────

export function parseCrackMapping(text: string): CrackMappingResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  const crackIds = (Array.isArray(raw.crack_ids) ? raw.crack_ids : [])
    .filter(isValidCrackId)

  const resonanceStrength: Partial<Record<CrackId, number>> = {}
  if (raw.resonance_strength && typeof raw.resonance_strength === 'object') {
    for (const [k, v] of Object.entries(raw.resonance_strength as Record<string, unknown>)) {
      const crackId = Number(k)
      if (isValidCrackId(crackId) && typeof v === 'number') {
        resonanceStrength[crackId] = clamp01(v)
      }
    }
  }

  const primaryCrack = isValidCrackId(raw.primary_crack) ? raw.primary_crack : (crackIds[0] ?? null)

  return {
    crack_ids: crackIds,
    resonance_strength: resonanceStrength,
    primary_crack: primaryCrack,
    reasoning: ensureString(raw.reasoning, 'No reasoning provided'),
    evidence: ensureStringArray(raw.evidence),
  }
}

export function parseVisibility(text: string): VisibilityResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  const validDirections = ['more_visible', 'less_visible', 'neutral'] as const
  const direction = validDirections.includes(raw.visibility_direction as typeof validDirections[number])
    ? raw.visibility_direction as typeof validDirections[number]
    : 'neutral'

  return {
    visibility_direction: direction,
    abstraction_depth: clamp01(raw.abstraction_depth),
    crypto_language_ratio: clamp01(raw.crypto_language_ratio),
    reasoning: ensureString(raw.reasoning, 'No reasoning provided'),
    evidence: ensureStringArray(raw.evidence),
  }
}

export function parseNarrativeSeparator(text: string): NarrativeSeparatorResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  return {
    narrative_dependency: clamp01(raw.narrative_dependency),
    core_function: typeof raw.core_function === 'string' ? raw.core_function : null,
    substitutability: clamp01(raw.substitutability),
    narrative_label: typeof raw.narrative_label === 'string' ? raw.narrative_label : null,
    reasoning: ensureString(raw.reasoning, 'No reasoning provided'),
    evidence: ensureStringArray(raw.evidence),
  }
}

export function parsePowerVector(text: string): PowerVectorResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  const validDirections = ['concentrating', 'distributing', 'mixed'] as const
  const direction = validDirections.includes(raw.power_direction as typeof validDirections[number])
    ? raw.power_direction as typeof validDirections[number]
    : 'mixed'

  return {
    power_direction: direction,
    governance_analysis: ensureString(raw.governance_analysis, 'No governance analysis provided'),
    team_dependency: clamp01(raw.team_dependency),
    token_concentration: typeof raw.token_concentration === 'string' ? raw.token_concentration : null,
    reasoning: ensureString(raw.reasoning, 'No reasoning provided'),
    evidence: ensureStringArray(raw.evidence),
  }
}

export function parseProblemRecognition(text: string): ProblemRecognitionResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  return {
    recognition_level: clamp01(raw.recognition_level),
    mainstream_awareness: ensureString(raw.mainstream_awareness, 'No awareness data'),
    categorization_coherence: clamp01(raw.categorization_coherence),
    reasoning: ensureString(raw.reasoning, 'No reasoning provided'),
    evidence: ensureStringArray(raw.evidence),
  }
}

export function parseIdentityPolarity(text: string): IdentityPolarityResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  const validPolarities = ['positive', 'negative', 'mixed'] as const
  const polarity = validPolarities.includes(raw.polarity as typeof validPolarities[number])
    ? raw.polarity as typeof validPolarities[number]
    : 'mixed'

  return {
    polarity,
    self_description_analysis: ensureString(raw.self_description_analysis, 'No analysis provided'),
    transcendence_indicators: ensureStringArray(raw.transcendence_indicators),
    reasoning: ensureString(raw.reasoning, 'No reasoning provided'),
    evidence: ensureStringArray(raw.evidence),
  }
}

export function parseClassificationResult(text: string): ClassificationResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .filter((c: unknown): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c: Record<string, unknown>) => ({
      category: (isValidCategory(c.category) ? c.category : 4) as ClassificationCategory,
      weight: clamp01(c.weight),
      reasoning: ensureString(c.reasoning, ''),
    }))
    .filter((c) => c.weight > 0)

  if (categories.length === 0) return null

  const primaryCategory = isValidCategory(raw.primary_category)
    ? raw.primary_category
    : categories.reduce((a, b) => a.weight >= b.weight ? a : b).category

  const crackAlignment = (Array.isArray(raw.crack_alignment) ? raw.crack_alignment : [])
    .filter(isValidCrackId)

  return {
    categories,
    primary_category: primaryCategory,
    crack_alignment: crackAlignment,
    migration_prediction: ensureString(raw.migration_prediction, 'No prediction available'),
    consciousness_contribution: ensureString(raw.consciousness_contribution, 'Unknown'),
    archetype_alignment: ensureString(raw.archetype_alignment, 'Unknown'),
    overall_assessment: ensureString(raw.overall_assessment, 'No assessment available'),
  }
}

// ── Parser dispatch map ─────────────────────────────────────────────────────

export const AGENT_PARSERS: Record<AgentType, (text: string) => unknown> = {
  crack_mapping: parseCrackMapping,
  visibility: parseVisibility,
  narrative_separator: parseNarrativeSeparator,
  power_vector: parsePowerVector,
  problem_recognition: parseProblemRecognition,
  identity_polarity: parseIdentityPolarity,
  synthesizer: parseClassificationResult,
}
