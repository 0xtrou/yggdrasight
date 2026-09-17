/**
 * TypeSafe System One client — typed judgments over application state.
 *
 * Zero-dependency `fetch` client (no SDK package) so it resolves identically
 * from Next.js API routes and from standalone Bun workers under scripts/.
 *
 * Contract: https://docs.typesafe.ai/api.md
 *   POST {TYPESAFE_API_URL}
 *   Authorization: Bearer $TYPESAFE_API_KEY
 *   { state, model, questions: { <id>: { type, instructions, criteria } } }
 *
 * Three judgment primitives:
 *   noul   → { noul: P(yes) }
 *   choice → { choice, probabilities, confidence }
 *   score  → { score, probabilities, confidence, legend }
 *
 * All independent questions over the same state MUST be batched into one
 * request — they run in parallel and extra questions barely affect latency.
 * A second request is only warranted when later questions need earlier
 * answers to construct new state.
 */

// ── Configuration ────────────────────────────────────────────────────────────

const TYPESAFE_API_URL = process.env.TYPESAFE_API_URL ?? 'https://api.typesafe.ai/v1/systemone'
const TYPESAFE_MODEL = process.env.TYPESAFE_MODEL ?? 'jev-latest'

export function isTypeSafeConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY)
}

export function typeSafeModel(): string {
  return TYPESAFE_MODEL
}

// ── Question types ───────────────────────────────────────────────────────────

export interface TypeSafeNoul {
  type: 'noul'
  instructions: string | object | unknown[]
  criteria?: { true?: string; false?: string }
}

export interface TypeSafeChoice {
  type: 'choice'
  instructions: string | object | unknown[]
  /** option name → rubric (string, structured object, or null when self-explanatory) */
  criteria: Record<string, string | object | null>
}

export interface TypeSafeScore {
  type: 'score'
  instructions: string | object | unknown[]
  /** ordered level descriptions, low → high (2–10 levels); describe situations, not degrees */
  criteria: (string | object)[]
}

export type TypeSafeQuestion = TypeSafeNoul | TypeSafeChoice | TypeSafeScore

// ── Answer types ─────────────────────────────────────────────────────────────

export interface TypeSafeNoulAnswer {
  type: 'noul'
  /** P(yes), 0–1. Near 0.5 = both outcomes similarly likely, NOT medium intensity. */
  noul: number
}

export interface TypeSafeChoiceAnswer {
  type: 'choice'
  /** highest-probability option */
  choice: string
  /** distribution across every option, sums to 1 */
  probabilities: Record<string, number>
  /** 0–1, derived from how concentrated the distribution is */
  confidence: number
}

export interface TypeSafeScoreAnswer {
  type: 'score'
  /** probability-weighted position on the level line (may be fractional) */
  score: number
  confidence: number
  /** level number (string keys) → description */
  legend: Record<string, string | object>
  /** probability per level (string keys), sums to 1 */
  probabilities: Record<string, number>
}

export type TypeSafeAnswer = TypeSafeNoulAnswer | TypeSafeChoiceAnswer | TypeSafeScoreAnswer

/** Map a question type to its answer type */
export type AnswerFor<Q extends TypeSafeQuestion> =
  Q extends { type: 'noul' } ? TypeSafeNoulAnswer
  : Q extends { type: 'choice' } ? TypeSafeChoiceAnswer
  : Q extends { type: 'score' } ? TypeSafeScoreAnswer
  : never

// ── Errors ───────────────────────────────────────────────────────────────────

export class TypeSafeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message)
    this.name = 'TypeSafeError'
  }
}

// ── Request ──────────────────────────────────────────────────────────────────

interface AskOptions {
  model?: string
  /** per-attempt timeout (default 120s — batched judgments over large state) */
  timeoutMs?: number
  /** retries for 429/529/network errors with exponential backoff (default 3) */
  retries?: number
}

const RETRYABLE_STATUS = new Set([429, 529])

/**
 * Ask a batch of independent questions over one shared state.
 *
 * @example
 * const { answers } = await askTypeSafe(
 *   { ticket: '...', order: {...} },
 *   { department: choice('Which team handles this?', { billing: null, ... }) },
 * )
 * answers.department.choice // 'billing'
 */
export async function askTypeSafe<Q extends Record<string, TypeSafeQuestion>>(
  state: string | object | unknown[],
  questions: Q,
  options?: AskOptions,
): Promise<{
  model: string
  answers: { [K in keyof Q]: AnswerFor<Q[K]> }
  usage: { input_tokens: number; output_tokens: number }
}> {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    throw new TypeSafeError('TYPESAFE_API_KEY is not set — add it to apps/web/.env.local or the worker environment')
  }

  const body = JSON.stringify({
    state,
    model: options?.model ?? TYPESAFE_MODEL,
    questions,
  })

  const retries = options?.retries ?? 3
  const timeoutMs = options?.timeoutMs ?? 120_000

  let lastError: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.min(30_000, 1_000 * 2 ** (attempt - 1))
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(TYPESAFE_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      })

      const text = await res.text()

      if (res.ok) {
        const parsed = JSON.parse(text) as {
          model: string
          answers: { [K in keyof Q]: AnswerFor<Q[K]> }
          usage: { input_tokens: number; output_tokens: number }
        }
        return parsed
      }

      // Rate limit / overload → retry with backoff. Everything else fails fast.
      if (RETRYABLE_STATUS.has(res.status)) {
        lastError = new TypeSafeError(`TypeSafe request failed with ${res.status} (retry ${attempt + 1}/${retries})`, res.status, text)
        continue
      }

      throw new TypeSafeError(`TypeSafe request failed with ${res.status}: ${text.slice(0, 500)}`, res.status, text)
    } catch (err) {
      if (err instanceof TypeSafeError && err.status && !RETRYABLE_STATUS.has(err.status)) throw err
      // Network failure or abort → treat as retryable
      lastError = err
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new TypeSafeError('TypeSafe request failed after retries')
}

// ── Ergonomic question builders ──────────────────────────────────────────────

export function noul(instructions: string | object | unknown[], criteria?: TypeSafeNoul['criteria']): TypeSafeNoul {
  return { type: 'noul', instructions, ...(criteria ? { criteria } : {}) }
}

export function choice(instructions: string | object | unknown[], criteria: TypeSafeChoice['criteria']): TypeSafeChoice {
  return { type: 'choice', instructions, criteria }
}

export function score(instructions: string | object | unknown[], criteria: TypeSafeScore['criteria']): TypeSafeScore {
  return { type: 'score', instructions, criteria }
}

// ── Answer helpers ───────────────────────────────────────────────────────────

/** Normalize a Score answer's 0..(levels-1) position into 0..1 */
export function scoreTo01(answer: TypeSafeScoreAnswer): number {
  const maxLevel = Math.max(0, Object.keys(answer.probabilities).length - 1)
  if (maxLevel === 0) return 0
  return clamp01(answer.score / maxLevel)
}

/** P(option) from a Choice answer, defaulting to 0 for unknown options */
export function choiceProb(answer: TypeSafeChoiceAnswer, option: string): number {
  const p = answer.probabilities[option]
  return typeof p === 'number' && Number.isFinite(p) ? clamp01(p) : 0
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}
