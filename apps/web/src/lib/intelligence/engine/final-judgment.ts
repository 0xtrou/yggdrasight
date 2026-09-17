/**
 * TypeSafe final judgment layer.
 *
 * Two requests on top of the analyst verdicts:
 *   1. judgeSignals — every recent trading signal gets its own Choice judgment
 *      against the current market snapshot, batched into ONE request (they are
 *      independent questions over the same state). Each answer's full
 *      long/short/neutral probability distribution is preserved.
 *   2. arbitrateConsensus — the FINAL arbiter: one Choice over all analyst
 *      verdicts (with their probabilities), all per-signal judgments (with
 *      theirs), and the deterministic weighted score + confluence. Its
 *      distribution decides direction/confidence; the math score stays in the
 *      result as audit input.
 *
 * Probability semantics (docs.typesafe.ai): `probabilities` are calibrated
 * per-option likelihoods summing to 1; Choice `confidence` measures how
 * CONCENTRATED the distribution is — never "probability of being correct".
 * A near-tie between long/short is genuinely contested evidence, for which
 * NEUTRAL is the honest answer.
 */

import { SignalDirection } from '@yggdrasight/core'
import type { AnalysisContext, ConsensusResult, FinalJudgment, SignalDoc, SignalJudgment } from '../types'
import { buildFullMarketState } from '../analysts/llm/base'
import {
  askTypeSafe,
  choice,
  clamp01,
  isTypeSafeConfigured,
  typeSafeModel,
  type TypeSafeChoiceAnswer,
} from './typesafe'

const MAX_SIGNALS = 10
/** Final-arbiter coin-flip guard: below this long/short gap, neutral by policy */
const FINAL_GAP_THRESHOLD = 0.05
/** Same confidence band the deterministic consensus has always emitted */
const CONFIDENCE_CAP: [number, number] = [0.15, 0.85]

const DIRECTION_MAP: Record<string, SignalDirection> = {
  long: SignalDirection.LONG,
  short: SignalDirection.SHORT,
  neutral: SignalDirection.NEUTRAL,
}

function distribution(answer: TypeSafeChoiceAnswer): { long: number; short: number; neutral: number } {
  return {
    long: Number(clamp01(answer.probabilities['long'] ?? 0).toFixed(4)),
    short: Number(clamp01(answer.probabilities['short'] ?? 0).toFixed(4)),
    neutral: Number(clamp01(answer.probabilities['neutral'] ?? 0).toFixed(4)),
  }
}

/** Pull the useful fields off a signal doc, including runtime-only extras */
function describeSignal(s: SignalDoc, index: number): Record<string, unknown> {
  const extra = s as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {
    index,
    id: s.id,
    symbol: s.symbol,
    direction: s.direction,
    confidence: typeof s.confidence === 'number' && Number.isFinite(s.confidence)
      ? Number(s.confidence.toFixed(2))
      : 0,
    opened_at: s.createdAt,
  }
  for (const key of ['status', 'timeframe', 'entryPrice', 'currentPrice', 'stopLoss', 'source']) {
    if (extra[key] !== undefined && extra[key] !== null) out[key] = extra[key]
  }
  const tps = extra['takeProfits']
  if (Array.isArray(tps) && tps.length > 0) {
    out['takeProfitLevels'] = tps.slice(0, 3).map((t) => (t as { price?: number })?.price).filter(Boolean)
  }
  return out
}

/**
 * Judge each recent signal against the current market snapshot — all signals
 * batched as independent questions in one TypeSafe request.
 * Returns [] when signals are absent or TypeSafe is unavailable; never throws.
 */
export async function judgeSignals(ctx: AnalysisContext): Promise<SignalJudgment[]> {
  if (!isTypeSafeConfigured()) return []

  let signals: SignalDoc[] = []
  try {
    signals = (await ctx.getSignals()).slice(0, MAX_SIGNALS)
  } catch (err) {
    console.warn(`[final-judgment] Signals unavailable, skipping per-signal judgments: ${err instanceof Error ? err.message : err}`)
    return []
  }
  if (signals.length === 0) return []

  try {
    const marketState = await buildFullMarketState(ctx)
    const described = signals.map(describeSignal)

    const questions: Record<string, ReturnType<typeof choice>> = {}
    described.forEach((signal, i) => {
      questions[`signal_${i}`] = choice(
        {
          question: `Judging trading signal #${i}: given the CURRENT market state below, which stance does the evidence now support for this signal's premise on ${ctx.symbol}?`,
          signal: signal,
          rules: [
            'The signal was created earlier — today\'s price action may have confirmed, invalidated, or moved past it.',
            'Judge the signal on its own merits against current data; a stale or invalidated signal does not become neutral just because it is old.',
          ],
        },
        {
          long: 'Current evidence supports the LONG side for this signal',
          short: 'Current evidence supports the SHORT side for this signal',
          neutral: 'Evidence genuinely balanced — no actionable stance for this signal',
        },
      )
    })

    const started = Date.now()
    const { answers } = await askTypeSafe(
      { ...marketState, signals_under_judgment: described },
      questions,
    )
    const durationMs = Date.now() - started
    console.log(`[final-judgment] ${signals.length} signal judgment(s) in ${durationMs}ms`)

    const judgments: SignalJudgment[] = []
    described.forEach((signal, i) => {
      const answer = answers[`signal_${i}`] as TypeSafeChoiceAnswer | undefined
      if (!answer) return
      judgments.push({
        signalId: String(signal['id'] ?? `${signal['symbol']}@${signal['opened_at']}`),
        symbol: String(signal['symbol'] ?? ctx.symbol),
        originalDirection: DIRECTION_MAP[signal['direction'] as string] ?? SignalDirection.NEUTRAL,
        originalConfidence: typeof signal['confidence'] === 'number' ? signal['confidence'] : 0,
        direction: DIRECTION_MAP[answer.choice] ?? SignalDirection.NEUTRAL,
        probabilities: distribution(answer),
        judgedAt: new Date().toISOString(),
      })
    })
    return judgments
  } catch (err) {
    console.warn(`[final-judgment] Per-signal judgment failed: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

/**
 * The FINAL arbiter. Takes the deterministic consensus (kept as audit input:
 * weighted score, confluence, analyst breakdown), the per-signal judgments,
 * and the full market state, and lets TypeSafe decide the final
 * direction/confidence. Returns the consensus unchanged when TypeSafe is
 * unavailable or the call fails — the math verdict is always the fallback.
 */
export async function arbitrateConsensus(
  consensus: ConsensusResult,
  signalJudgments: SignalJudgment[],
  marketState: Record<string, string>,
): Promise<ConsensusResult> {
  if (!isTypeSafeConfigured()) return consensus
  if (consensus.analysts.length === 0) return consensus

  try {
    const state = {
      ...marketState,
      deterministic_consensus: {
        weighted_score: Number(consensus.score.toFixed(4)),
        confluence: Number(consensus.confluence.toFixed(3)),
        math_direction: consensus.direction,
        note: 'Weighted sum of direction x confidence x analyst weight with a +/-0.08 threshold. Provided as one input, not the verdict.',
      },
      analyst_verdicts: consensus.analysts.map((a) => {
        const ind = a.indicators ?? {}
        return {
          analyst: a.meta.name,
          lens: a.meta.id,
          weight: a.meta.weight,
          direction: a.direction,
          confidence: Number(a.confidence.toFixed(3)),
          p_long: typeof ind['p_long'] === 'number' ? ind['p_long'] : undefined,
          p_short: typeof ind['p_short'] === 'number' ? ind['p_short'] : undefined,
          p_neutral: typeof ind['p_neutral'] === 'number' ? ind['p_neutral'] : undefined,
          indicators: ind,
          reason: a.reason.slice(0, 200),
        }
      }),
      signal_judgments: signalJudgments.length > 0 ? signalJudgments : 'none',
    }

    const started = Date.now()
    const { answers } = await askTypeSafe(state, {
      final_direction: choice(
        {
          role: 'You are the FINAL arbiter of this trading consensus. Every prior judgment is an input for you to weigh — not the verdict.',
          how_to_decide: [
            'Weigh each analyst by its weight and the confidence of its verdict; deterministic analysts carry hard indicator math, TypeSafe analysts carry calibrated probabilities.',
            'Confluence matters: a direction shared by many independent lenses outweighs a single strong call.',
            'Per-signal judgments show whether existing positions are confirmed or invalidated by current data.',
            'Contradictions between strong lenses are genuine uncertainty — do not average them away by force.',
            'NEUTRAL is a real answer when long and short evidence is genuinely near-equal, not a failure state.',
          ],
        },
        {
          long: 'Weighing ALL inputs, bullish evidence dominates — LONG is the final stance',
          short: 'Weighing ALL inputs, bearish evidence dominates — SHORT is the final stance',
          neutral: 'Weighing ALL inputs, the evidence is genuinely balanced — no actionable final stance',
        },
      ),
    })

    const answer = answers.final_direction
    const probs = distribution(answer)
    let direction = DIRECTION_MAP[answer.choice] ?? SignalDirection.NEUTRAL
    if ((direction === SignalDirection.LONG || direction === SignalDirection.SHORT)
      && Math.abs(probs.long - probs.short) < FINAL_GAP_THRESHOLD) {
      direction = SignalDirection.NEUTRAL
    }

    // P(final direction) is the decision strength; capped to the band the
    // deterministic consensus has always emitted
    const rawConfidence = direction === SignalDirection.NEUTRAL
      ? clamp01(answer.confidence)
      : clamp01(direction === SignalDirection.LONG ? probs.long : probs.short)
    const confidence = Math.min(CONFIDENCE_CAP[1], Math.max(CONFIDENCE_CAP[0], rawConfidence))

    const finalJudgment: FinalJudgment = {
      model: typeSafeModel(),
      direction,
      probabilities: probs,
      concentration: Number(clamp01(answer.confidence).toFixed(4)),
      durationMs: Date.now() - started,
    }

    return {
      ...consensus,
      direction,
      confidence: Number(confidence.toFixed(3)),
      timeframeAnalyses: consensus.timeframeAnalyses.map((tf) => ({
        ...tf,
        direction,
        confidence: Number(confidence.toFixed(3)),
      })),
      signalJudgments: signalJudgments.length > 0 ? signalJudgments : undefined,
      finalJudgment,
    }
  } catch (err) {
    console.warn(`[final-judgment] Arbitration failed — keeping deterministic verdict: ${err instanceof Error ? err.message : err}`)
    return consensus
  }
}
