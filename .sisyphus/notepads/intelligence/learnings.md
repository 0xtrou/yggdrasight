# Intelligence System — Learnings

## [2026-03-04] Pre-build architecture analysis

### Codebase patterns confirmed
- API route pattern: `export const dynamic = 'force-dynamic'`, try/catch, `NextResponse.json()`, `await connectDB()` before DB ops — see `apps/web/src/app/api/signals/route.ts`
- Hook pattern: `'use client'`, `useState/useEffect/useCallback/useRef(mountedRef)`, native fetch() — see `apps/web/src/hooks/useSignals.ts`
- Panel pattern: `'use client'`, inline `style={{}}`, CSS vars (`var(--color-terminal-*)`), NO Tailwind color classes — see any panel in `apps/web/src/components/terminal/panels/`
- Mongoose model pattern: `mongoose.models.X || mongoose.model('X', schema)`, `timestamps: true`, `toJSON` transform `_id → id`
- Cross-instance sync: `window.dispatchEvent(new Event('signals-updated'))`

### Available from @oculus/core (READ ONLY)
- `SignalDirection`: LONG | SHORT | NEUTRAL
- `Timeframe`: M1 | M5 | M15 | M30 | H1 | H4 | H8 | H12 | D1 | W1 | MN
- `MarketRegime`: TRENDING_UP | TRENDING_DOWN | RANGING | VOLATILE | ACCUMULATION | DISTRIBUTION
- `Exchange`, `ProviderType`, `AssetClass`, `SignalStatus`

### TopBar
- `INTEL` tab already declared in NAV_TABS — just not wired to content yet
- `activeTab` state is internal to TopBar — needs to be lifted to page.tsx to drive layout switching

### PanelGrid
- 3-col grid: `1fr 2fr 1fr` + bottom row for FundamentalsPanel
- Intel layout will be a SEPARATE component rendered when `activeTab === 'INTEL'`
- DO NOT touch PanelGrid.tsx

### Consensus algorithm
- Weighted directional scoring: convert direction to numeric (long=1, short=-1, neutral=0)
- Score = Σ(direction_numeric × confidence × weight) / Σ(weight)
- Threshold: score > 0.2 → LONG, score < -0.2 → SHORT, else NEUTRAL
- Confidence of final verdict = weighted avg of *agreeing* analysts only, penalized by disagreement ratio
- Weight comes from `meta.weight` (static per module), NOT from analyst's own confidence output

### RSI implementation
- MUST use Wilder's exponential smoothing, NOT simple moving average
- Seed: first RS = SMA of first 14 gains / SMA of first 14 losses
- Subsequent: avg_gain = (prev_avg_gain × 13 + current_gain) / 14

### Critical gotchas
- `packages/core` and `packages/db` are READ ONLY — never modify
- New DB models go in `apps/web/src/lib/intelligence/models/` NOT in packages/db
- klinecharts canvas: hex colors only (CSS vars don't work inside canvas renderer)
- All new intelligence types in `apps/web/src/lib/intelligence/types.ts`
- Analyst interface = ONE function only: `analyze(ctx) → Promise<AnalystVerdict>`, no lifecycle methods
- Confidence anti-pattern: NEVER use analyst's own confidence output as its weight

## [2026-03-04] IntelGrid rewrite — Bloomberg-style 3-column layout

### Implementation details
- IntelGrid.tsx rewritten from 16-line stub to 672-line full Bloomberg-style terminal layout
- 3 columns: LEFT (280px verdict+timeframes+history), CENTER (flex-1 analysts+mtf+volume), RIGHT (280px market context+key levels+signals stats+history)
- Header row (28px) with symbol selector (BTC/ETH/SOL/BNB), ANALYZE button, last updated timestamp
- Symbol state drives `useIntelligence(pair)` where pair = `${symbol}USDT`
- All 3 hooks used directly: `useIntelligence`, `useMarketGlobal`, `useSignals`

### Key patterns used
- Section header: 9px, 0.12em letter-spacing, dim color, panel bg, border top+bottom
- Data row: 11px, 5px 10px padding, border-bottom
- Confidence bar: 2px height, direction color, width = confidence*100%
- Direction chip: ▲ LONG / ▼ SHORT / — NEUTRAL with up/down/amber colors
- Key-levels analyst indicators: `nearestResistance`, `nearestSupport`, `proximityToResistance`, `proximityToSupport` (NOT `resistance`/`support` directly)
- MTF alignment indicators: `h1`, `h4`, `d1` (bias strings), `alignment` (number)
- Volume profile indicators: `obv`, `obvTrend`, `volumeRatio`

### Signal stats computation
- Filter signals by base symbol (strip non-alpha chars, check startsWith)
- Win rate = tp_hit / (tp_hit + sl_hit)
- Signal.direction uses lowercase 'long'/'short'/'neutral' (enum values)

### Decisions
- IntelligencePanel.tsx left untouched (still importable but not used by IntelGrid)
- `useMemo` for signal stats and timeframe breakdown to avoid recomputes
- Loading state shows full-viewport "COMPUTING..." when loading && !result
