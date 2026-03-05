# Learnings - Oculus Trading

## P0.3 - packages/core

- `tsconfig.base.json` uses `moduleResolution: "Bundler"` — package exports work with `"main": "./src/index.ts"` (no build step needed for internal consumption)
- Zod schemas use `z.nativeEnum()` for TypeScript enums — avoids duplicating enum values
- `z.coerce.date()` used for date fields to accept both string and Date inputs
- pnpm workspace resolves `@oculus/core` automatically via `pnpm-workspace.yaml`
- All 8 source files pass LSP diagnostics and `tsc --noEmit` clean

## [2026-03-04] P1 Manual Trading

### What was built
- **API Routes**: `GET+POST /api/signals` and `GET+PATCH+DELETE /api/signals/[id]` — full CRUD with Zod validation from `@oculus/core`
- **SSE Price Stream**: `/api/prices/stream` — server-side Binance WebSocket → browser SSE bridge with reconnection + heartbeat
- **useSignals hook**: Client-side data layer with optimistic updates, cross-instance sync via `window.dispatchEvent('signals-updated')`
- **usePriceTicker hook**: EventSource-based SSE consumer for live BTC/ETH/SOL/BNB prices
- **NewSignalModal**: Bloomberg-style dark modal with LONG/SHORT toggle, Zod-validated form fields
- **SignalFeedPanel**: Replaced mock data with live DB queries, loading/empty/error states
- **StatsPanel**: Real-time computed stats (win rate = TP_HIT / (TP_HIT + SL_HIT), profit factor, avg PnL)
- **StatusBar**: Now shows live Binance prices with 24h % change
- **TopBar**: Added amber "+" button next to nav tabs to trigger modal

### Patterns used
- Next.js 15 App Router API routes with `export const dynamic = 'force-dynamic'`
- `await context.params` pattern for Next.js 16+ dynamic route params (params is a Promise now)
- Mongoose `.lean()` for GET queries, `.toJSON()` for single doc returns (uses the transform in schema)
- `as unknown as Record<string, unknown>` double-cast pattern to destructure lean() results (lean() returns intersection types that TS won't let you spread directly)
- `connectDB()` at the top of every API route handler — not at module level
- `window.dispatchEvent` + `addEventListener` pattern for cross-component signal refresh (avoids prop drilling or context)
- Native `WebSocket` in Node 24 for server-side Binance connection — no ws package needed
- `ReadableStream` + `TextEncoder` for SSE streaming response

### Gotchas
- Mongoose lean() documents have type `ISignalDocument & { _id: ObjectId }` — you can't destructure them directly with `as Record<string, unknown>` in strict TS; need double cast through `unknown`
- Signal model has `confidence` field (0-1 range) but Zod schema has `confidenceScore` (0-100) — need to divide by 100 when mapping
- Signal model uses `source: string` but Zod schema has `source: ProviderType` + `sourceProvider: string` — model field maps to Zod's `source`
- page.tsx converted from server component to client component to manage modal state — layout.tsx still serves as the server component root

## [2026-03-04] P2 Ingest

### What was built
- **`apps/web/src/lib/ingest/detect.ts`**: `detectProvider(body)` — sniffs TradingView vs generic WEBHOOK via `action` field + symbol colon or `interval` presence
- **`apps/web/src/lib/ingest/parsers/tradingview.ts`**: Full TradingView alert normalizer — strips exchange prefix from symbol, maps action→direction, interval→timeframe, price/stop/target→entryPrice/stopLoss/takeProfits
- **`apps/web/src/lib/ingest/parsers/generic.ts`**: Best-effort generic parser — tries multiple key aliases per field, handles array `takeProfits` AND single `target`/`tp`, maps assetClass from payload
- **`apps/web/src/lib/ingest/normalize.ts`**: Async router — dispatches to correct parser then runs `CreateSignalSchema.parse()` for final Zod validation
- **`apps/web/src/app/api/webhooks/ingest/route.ts`**: POST endpoint — optional secret check via `x-webhook-secret` header, detect→normalize→Signal.create→201

### Decisions
- ZodError duck-typed in route (`'issues' in err`) since `zod` is not a direct dep of `apps/web` (it's provided by `@oculus/core`)
- Generic parser errors classified as 400 via `err instanceof Error` check; DB errors fall through to 500
- WEBHOOK_SECRET is optional (dev-friendly): if env var not set, secret check is skipped
- `indicators` and `tags` must always be passed even if empty (`{}` and `[]` respectively) — Zod schema requires them (no `.optional()`)

### Gotchas
- Subagent omitted `indicators: {}` and `tags: []` from both parser return objects — TypeScript caught it at typecheck
- Subagent's edit on parsers lost closing `}` of function — had to add manually
- `zod` is not a direct dependency of `apps/web`; importing `ZodError` directly from `'zod'` in a route causes TS2307 error; use duck-typing instead

### [2026-03-04] P2 Ingest — Revision Notes
- Rewrote all 5 ingest files to simpler, more concise versions
- `route.ts` checks `err.name === 'ZodError'` instead of duck-typing — works because the Error object created by zod retains its constructor name even through @oculus/core re-export
- Both parsers explicitly include `indicators: {}` and `tags: []` — Zod schema has `.default()` but parser should be explicit
- TradingView parser extracts exchange from both `exchange` field and symbol prefix (e.g. `BINANCE:BTCUSDT` → exchange=BINANCE, symbol=BTCUSDT)
- Generic parser uses `tryPrice()` helper to probe multiple field name aliases per price field
- `pnpm typecheck` passes clean (3/3 packages, 0 errors)

## [2026-03-04] P3 Charts

### What was built
- **`apps/web/src/app/api/prices/ohlcv/route.ts`**: `GET /api/prices/ohlcv?symbol=BTCUSDT&interval=1h&limit=500` — proxies Binance klines REST API, transforms raw array format to `{ time, open, high, low, close, volume }` objects with time in Unix seconds
- **`apps/web/src/hooks/useOHLCV.ts`**: React hook — fetches OHLCV on mount and when symbol/interval change, returns `{ candles, loading, error }`, properly cancels in-flight requests on cleanup
- **`apps/web/src/components/terminal/panels/ChartPanel.tsx`**: Full replacement — live candlestick chart using lightweight-charts v5, volume histogram, signal entry/TP markers, BTC/ETH/SOL/BNB symbol tabs, 1m/5m/15m/1h/4h/1d/1w timeframe tabs, live price via usePriceTicker, loading/error overlays

### lightweight-charts v5 API changes (vs v4)
- `series.setMarkers()` **removed** from `ISeriesApi` — now use `createSeriesMarkers(series, markers)` plugin from `'lightweight-charts'`
- `chart.addCandlestickSeries()` replaced with `chart.addSeries(CandlestickSeries, options)`
- `chart.addHistogramSeries()` replaced with `chart.addSeries(HistogramSeries, options)`
- Import `createSeriesMarkers` and `type SeriesType` alongside `createChart`, `CandlestickSeries`, `HistogramSeries`
- `time` field must be Unix seconds (number), NOT milliseconds — Binance returns ms, divide by 1000

### Decisions
- Chart is destroyed and re-created (not updated) when candles change — simpler than trying to call setData on existing series refs across symbol/interval changes
- Chart colors are hardcoded hex inside `createChart()` options because lightweight-charts doesn't support CSS variables; JSX style props still use `var(--color-terminal-*)`
- Signal markers only rendered for signals where `signal.symbol` matches the active base symbol AND `createdAt` falls within chart time range
- Volume histogram uses `priceScaleId: 'volume'` with `scaleMargins: { top: 0.8, bottom: 0 }` to render in bottom 20% of chart

### Gotchas
- `lightweight-charts` package is installed in `apps/web` (NOT root) — `pnpm add lightweight-charts` run in `apps/web/`
- When casting series for `createSeriesMarkers`, need `as ISeriesApi<SeriesType, Time>` to satisfy the generic overload
- `ResizeObserver` must be disconnected in useEffect cleanup to avoid memory leaks

## [2026-03-04] P4 Market Intel

### What was built
- **`apps/web/src/app/api/market/global/route.ts`**: Aggregates CoinGecko global market data + Alternative.me Fear & Greed index into a single JSON response. Uses `next: { revalidate: 60 }` on both upstream fetches for 60s cache. Returns 503 with `{ error: 'upstream unavailable' }` on any upstream failure.
- **`apps/web/src/hooks/useMarketGlobal.ts`**: Polling hook — fetches `/api/market/global` on mount then every 60s via `setInterval`. Returns `{ data, loading, error }`. Exports `MarketGlobalData` type.
- **`apps/web/src/components/terminal/panels/StatsPanel.tsx`**: MARKET INTEL section now shows live BTC Dominance (amber when >50%), Fear & Greed (color-coded by value range), and Total MCap (formatted as `$X.XXt` or `$XXXb`). Loading shows `LOADING...` in dim; errors show `ERR` in red.

### Patterns used
- `Promise.all` for parallel upstream fetches in API route — both CoinGecko and Alternative.me are independent
- `next: { revalidate: 60 }` on fetch options for Next.js ISR-style caching on API routes
- `mountedRef` + `clearInterval` cleanup pattern matching existing hooks (`useOHLCV`, `usePriceTicker`)
- `formatMarketCap()` helper for human-readable market cap formatting ($Xt, $Xb, $Xm)
- Conditional `valueColor` ternary chains in JSX for color-coding by value thresholds

### API details
- CoinGecko global: `https://api.coingecko.com/api/v3/global` — free, no API key, response nested under `.data`
- Fear & Greed: `https://api.alternative.me/fng/` — free, returns `{ data: [{ value: string, value_classification: string }] }` — note `value` is a string, must `Number()` it
- Both APIs are public and rate-limited; the 60s revalidate cache prevents hitting limits


## [2026-03-04] P4.3 Fundamentals Panel

### What was built
- **`apps/web/src/app/api/market/coins/route.ts`**: `GET /api/market/coins?ids=...` — proxies CoinGecko `/coins/markets` endpoint, transforms snake_case response to camelCase `{ id, symbol, name, currentPrice, marketCap, volume24h, priceChange24h, rank }`. Uses `next: { revalidate: 60 }` and `User-Agent: oculus-trading/1.0`.
- **`apps/web/src/hooks/useMarketCoins.ts`**: Polling hook — fetches `/api/market/coins` on mount then every 60s. Returns `{ coins: CoinData[], loading, error }`. Exports `CoinData` type. Same `mountedRef` + `clearInterval` pattern as `useMarketGlobal`.
- **`apps/web/src/components/terminal/panels/FundamentalsPanel.tsx`**: Bloomberg-style coin table — columns: #, SYM, PRICE, 24H%, MCAP, VOL. Alternating row backgrounds, green/red 24H% coloring, `formatMarketCap` defined locally (not imported from StatsPanel).
- **`apps/web/src/components/terminal/PanelGrid.tsx`**: Added second grid row (`gridTemplateRows: 'auto 200px'`), FundamentalsPanel spans full width via `gridColumn: '1 / -1'`.

### Patterns used
- CoinGecko markets endpoint returns snake_case: `current_price`, `market_cap`, `total_volume`, `price_change_percentage_24h`, `market_cap_rank` — transform in API route, not client-side
- `formatMarketCap` duplicated locally rather than exporting from StatsPanel — keeps panels decoupled
- CSS grid `gridTemplateRows: 'auto 200px'` — first row takes remaining space, second row is fixed 200px strip
- `gridColumn: '1 / -1'` spans all columns in CSS grid without knowing column count
- `toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })` for price formatting with thousands separators

### Gotchas
- CoinGecko `price_change_percentage_24h` can be null for some coins — would need null guard in production
- `ids` query param accepts comma-separated CoinGecko IDs (not symbols) — `bitcoin` not `btc`
- `pnpm typecheck` passes clean (3/3 packages, 0 errors)
## [2026-03-04] KLineChart v9 Migration

### What was done
- Replaced lightweight-charts with klinecharts v9.8.12 in ChartPanel.tsx
- Used `init(containerRef.current)` with DOM element directly (not string ID)
- Used `dispose(container)` for cleanup before re-init and in effect cleanup
- Applied Bloomberg terminal dark theme via `chart.setStyles()` with hardcoded hex values
- Added VOL indicator in candle_pane via `chart.createIndicator('VOL', false, { id: 'candle_pane' })`
- Used `simpleAnnotation` built-in overlay for signal entry & TP hit markers
- Preserved all header/tab JSX with CSS variable styling unchanged

### Key API Notes (klinecharts v9)
- `init()` accepts `HTMLElement | string` and returns `Nullable<Chart>`
- `dispose()` accepts `HTMLElement | Chart | string`
- `applyNewData()` expects `KLineData[]` with `timestamp` in **milliseconds** (useOHLCV returns seconds → ×1000)
- `createIndicator(name, isStack, paneOptions)` — use `{ id: 'candle_pane' }` to overlay on main pane
- `createOverlay({ name, lock, points, extendData, styles })` — `extendData` is the text label string
- `simpleAnnotation` overlay draws line + arrow + text above the point
- `Styles` type does NOT include `background` — bg handled by container CSS (`var(--color-terminal-bg)`)
- `CandleBarColor` requires `noChangeColor`, `noChangeBorderColor`, `noChangeWickColor` fields

### Gotchas
- `pnpm add klinecharts` installs v10-beta by default — must specify `klinecharts@^9` for v9 stable
- The `Styles` type in v9 doesn't have a `background` property — the task's `background: { color }` would cause type errors; use container CSS background instead
- `OverlayStyle.text` is `TextStyle` which has `backgroundColor` as a required-ish field; `DeepPartial` wrapper makes it optional in `styles` override
- `StateLineStyle` (used by grid, crosshair) has `show`, `style`, `size`, `color`, `dashedValue` — partial application works with `DeepPartial`
- `ResizeObserver` callback should just call `chart.resize()` — no need to pass dimensions (klinecharts reads container size)
