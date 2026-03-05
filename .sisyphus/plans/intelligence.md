# Intelligence System — Build Plan

## Architecture

```
apps/web/src/lib/intelligence/
├── types.ts                          # All core types: AnalystVerdict, AnalystMeta, AnalysisContext, ConsensusResult
├── analysts/
│   ├── index.ts                      # Registry: export const ANALYSTS: Analyst[] = [trend, signalConsensus, marketRegime]
│   ├── trend.analyst.ts              # RSI(14) + EMA(20/50) crossover — uses OHLCV
│   ├── signal-consensus.analyst.ts   # Aggregates existing Signal docs from MongoDB
│   └── market-regime.analyst.ts      # BTC dominance + Fear & Greed + volume
├── engine/
│   ├── consensus.ts                  # Pure function: AnalystVerdict[] → ConsensusResult
│   ├── context.ts                    # Builds AnalysisContext with lazy-cached data providers
│   └── runner.ts                     # Orchestrates: context → analysts → consensus → return
└── models/
    └── verdict.model.ts              # Mongoose IntelligenceVerdict model (apps/web only)

apps/web/src/app/api/intelligence/
├── analyze/route.ts                  # POST { symbol, timeframes } → ConsensusResult
└── verdicts/route.ts                 # GET ?symbol=&limit= → historical verdicts

apps/web/src/hooks/
└── useIntelligence.ts                # Client hook: trigger + display analysis results

apps/web/src/components/terminal/
├── TopBar.tsx                        # Lift activeTab to page.tsx (prop-based)
├── IntelGrid.tsx                     # Intelligence layout (parallel to PanelGrid)
└── panels/
    └── IntelligencePanel.tsx         # Main intel panel: verdict + per-module breakdown
```

---

## Tasks

- [ ] **T1: Types & Interfaces** — Create `apps/web/src/lib/intelligence/types.ts` with all core interfaces: `AnalystMeta`, `AnalystVerdict`, `Analyst`, `AnalysisContext`, `ConsensusResult`, `VerdictRecord`. Reuse `SignalDirection`, `Timeframe`, `MarketRegime` from `@oculus/core`. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T2: Consensus Engine** — Create `apps/web/src/lib/intelligence/engine/consensus.ts`. Pure function `buildConsensus(verdicts: AnalystVerdict[]): ConsensusResult`. Weighted directional scoring: numeric(direction) × confidence × meta.weight. Threshold ±0.2. Final confidence = weighted avg of agreeing analysts, penalized by disagreement ratio. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T3: Analysis Context Builder** — Create `apps/web/src/lib/intelligence/engine/context.ts`. Exports `buildContext(symbol, timeframes)` that returns an `AnalysisContext` with lazy-cached data providers: `getCandles(tf)` (fetches OHLCV internally via Binance), `getSignals()` (queries MongoDB Signal), `getMarketGlobal()` (fetches CoinGecko global). Cache per request (Map keyed by tf). Gate: `pnpm typecheck` = 0 errors.

- [ ] **T4: Trend Analyst** — Create `apps/web/src/lib/intelligence/analysts/trend.analyst.ts`. Computes RSI(14) using Wilder's exponential smoothing and EMA(20)/EMA(50) crossover from OHLCV candles. Outputs direction + confidence + reason. Meta: `{ id: 'trend', name: 'Trend & Momentum', weight: 1.5 }`. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T5: Signal Consensus Analyst** — Create `apps/web/src/lib/intelligence/analysts/signal-consensus.analyst.ts`. Fetches recent signals for the symbol from MongoDB via `ctx.getSignals()`, counts long vs short in the last 7 days, weights by confidence. Meta: `{ id: 'signal-consensus', name: 'Signal Consensus', weight: 1.0 }`. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T6: Market Regime Analyst** — Create `apps/web/src/lib/intelligence/analysts/market-regime.analyst.ts`. Uses `ctx.getMarketGlobal()` — BTC dominance trend, Fear & Greed index, and total market cap change to output a directional bias. Meta: `{ id: 'market-regime', name: 'Market Regime', weight: 0.8 }`. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T7: Analyst Registry** — Create `apps/web/src/lib/intelligence/analysts/index.ts` exporting `ANALYSTS: Analyst[]` array with all 3 analysts. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T8: Runner** — Create `apps/web/src/lib/intelligence/engine/runner.ts`. `runAnalysis(symbol, timeframes)` builds context, runs all ANALYSTS in parallel via `Promise.all`, calls `buildConsensus`, returns full `ConsensusResult`. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T9: Verdict Model** — Create `apps/web/src/lib/intelligence/models/verdict.model.ts`. Mongoose schema for `IntelligenceVerdict` — stores symbol, timeframes, direction, confidence, analystBreakdown[], createdAt. Pattern: `mongoose.models.IntelligenceVerdict || mongoose.model(...)`. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T10: Analyze API Route** — Create `apps/web/src/app/api/intelligence/analyze/route.ts`. `POST { symbol, timeframes }` → calls `runAnalysis`, persists to MongoDB via verdict model, returns JSON. Gate: `pnpm typecheck` = 0 errors + `curl` verification returns `{ verdict: { direction, confidence, analysts } }`.

- [ ] **T11: Verdicts API Route** — Create `apps/web/src/app/api/intelligence/verdicts/route.ts`. `GET ?symbol=&limit=` → returns historical verdicts from MongoDB sorted by createdAt desc. Gate: `pnpm typecheck` = 0 errors + `curl` verification.

- [ ] **T12: useIntelligence Hook** — Create `apps/web/src/hooks/useIntelligence.ts`. Client hook exposing `analyze(symbol, timeframes)` trigger, `result: ConsensusResult | null`, `loading`, `error`, `history: VerdictRecord[]`. Follows `useSignals.ts` pattern exactly. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T13: IntelligencePanel** — Create `apps/web/src/components/terminal/panels/IntelligencePanel.tsx`. Displays: overall BUY/SELL/NEUTRAL verdict with confidence bar, per-analyst breakdown rows (name, direction badge, confidence), last-run timestamp, "ANALYZE" button, recent verdict history. Bloomberg terminal aesthetic. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T14: IntelGrid + Tab Wiring** — Create `apps/web/src/components/terminal/IntelGrid.tsx` (layout for INTEL tab with IntelligencePanel full-width + symbol selector). Lift `activeTab` state from `TopBar.tsx` to `apps/web/src/app/page.tsx`. Conditionally render `PanelGrid` vs `IntelGrid` based on active tab. Gate: `pnpm typecheck` = 0 errors.

- [ ] **T15: Chart Verdict Overlay** — Modify `apps/web/src/components/terminal/panels/ChartPanel.tsx` to accept an optional `verdict` prop and render a `simpleAnnotation` overlay badge (e.g. `▲ BUY 72%`) at the latest candle's position using `chart.createOverlay`. Gate: `pnpm typecheck` = 0 errors.
