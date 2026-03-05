# Chart Enhancements — Comprehensive Plan

## TL;DR

> **Quick Summary**: Fix context menu bugs + chart ratio issues, then add real-time candle streaming, price alerts with browser notifications, and a chart settings panel.
> 
> **Deliverables**:
> - Visible checkbox squares in context menu, working "Remove all indicators", no dead "Paste" item
> - AVP removed from indicator registry, sub-pane heights constrained to 100px
> - Real-time candle streaming via SSE (new API route + hook + chart.updateData integration)
> - Price alerts with horizontal lines on chart + browser notifications on price crossing
> - Chart settings modal (candle colors, grid visibility, crosshair style) persisted per-asset
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → F1-F4

---

## Context

### Original Request
User requested expanding the existing `chart-context-menu-fixes.md` plan to include all remaining chart enhancements: context menu fixes, chart ratio fix, real-time chart data, price alerts with browser notifications, and chart settings panel.

### Interview Summary
**Key Discussions**:
- Real-time data: Use SSE pattern matching existing `usePriceTicker` — NOT raw WebSocket from client
- Price alerts: "just use the browser notification" — localStorage persistence, one-shot alerts
- Chart settings: Candle colors, grid, crosshair — persisted per-asset in existing localStorage config
- Context menu: "Create Alert" placeholder already exists at line 1015-1017 with `ctxMenu.price`
- Indicators: AVP must be removed (no turnover data → always 0)

**Research Findings**:
- `/api/prices/stream/route.ts` uses ReadableStream + WebSocket → SSE pattern (134 lines) — exact template for kline stream
- `usePriceTicker.ts` uses EventSource + reconnect (91 lines) — exact template for kline hook
- klinecharts v9.8.12: `updateData(KLineData)` updates last candle if timestamp matches, appends if new
- klinecharts `createOverlay({name: 'horizontalStraightLine', points: [{value: price}], lock: true})` for alert lines
- klinecharts `setStyles(DeepPartial<Styles>)` for appearance customization
- Binance kline WS: `{symbol}@kline_{interval}` pushes updates every 250ms with `k.t/o/h/l/c/v/x` fields

### Metis Review
**Identified Gaps** (addressed):
- Real-time stream must be OUTSIDE chart init useEffect (chart re-creates on state changes, would kill SSE connection) → use separate useEffect with chartRef
- Alert overlays are destroyed on chart dispose/re-init → re-draw alerts inside chart init useEffect
- Chart settings must be read from localStorage in init useEffect and merged with defaults before setStyles() → settings overwrite hardcoded values
- Timeframe change must unsubscribe old kline stream and subscribe new interval → useKlineStream depends on interval
- Alerts fire once (one-shot) then auto-dismiss → mark as triggered in localStorage
- Multiple tabs: accept duplicate notifications (no cross-tab dedup for now)

---

## Work Objectives

### Core Objective
Fix existing chart bugs and add real-time data streaming, price alerts, and chart appearance settings to the trading terminal.

### Concrete Deliverables
- Fixed context menu (checkboxes, Remove all, no Paste)
- Fixed chart ratio (no AVP, constrained sub-pane heights)
- `/api/prices/klines/stream` SSE endpoint for live candle data
- `useKlineStream` hook for client-side candle streaming
- Live candle updates in ChartPanel via `chart.updateData()`
- Price alert system (create, persist, draw on chart, check price, notify, dismiss)
- Chart settings modal component (candle colors, grid, crosshair)
- Settings persistence in per-asset localStorage config

### Definition of Done
- [ ] Context menu checkboxes visible in both states
- [ ] "Remove all indicators" clears activeIndicators state
- [ ] No "Paste" menu item
- [ ] AVP not in indicator registry
- [ ] Sub-pane indicators render at ~100px height
- [ ] `curl -N localhost:3000/api/prices/klines/stream?symbol=BTCUSDT&interval=1m` returns SSE kline events
- [ ] Chart candles update in real-time without full re-render
- [ ] Right-click → "Create Alert" draws horizontal line at clicked price
- [ ] Alert fires browser notification when price crosses level
- [ ] Settings modal opens, color pickers work, grid toggle works
- [ ] All settings and alerts survive page reload

### Must Have
- Checkbox visual matches indicator dropdown style (14×14 bordered square, green fill when checked)
- AVP completely removed from `INDICATOR_CATEGORIES` main indicators list
- Sub-pane indicators created with `{ height: 100 }` paneOptions
- "Remove all indicators" calls `setActiveIndicators([])` (not direct chart API)
- SSE kline route follows exact pattern from `/api/prices/stream/route.ts` (ReadableStream + WS + heartbeat)
- Client hook follows exact pattern from `usePriceTicker.ts` (EventSource + reconnect)
- `chart.updateData()` called from a SEPARATE useEffect (not inside the chart init effect)
- Alert overlays re-drawn inside chart init useEffect after `applyNewData()`
- Settings read from localStorage in chart init useEffect and merged before `setStyles()`
- One-shot alerts: fire notification once, then auto-remove
- All new hooks/components in separate files (not bloating ChartPanel.tsx further)

### Must NOT Have (Guardrails)
- Do NOT modify existing `/api/prices/stream` endpoint or `usePriceTicker` hook
- Do NOT add React Context/Provider for alerts or settings — localStorage + local state is sufficient
- Do NOT add sound to alerts, server-side persistence, or service workers
- Do NOT add WebSocket fallback or raw client-side WebSocket connections
- Do NOT refactor ChartPanel.tsx into smaller components (except extracting settings modal)
- Do NOT change klinecharts version or upgrade to v10
- Do NOT add indicator parameter customization in settings
- Do NOT add animation/transitions to settings modal
- Do NOT create abstraction layers (no AlertManager class, no ChartSettingsProvider)
- Do NOT add comments explaining obvious code
- Do NOT add error boundaries or loading states beyond what exists
- Maximum 10 alerts per asset (prevent localStorage bloat)
- No cross-tab alert deduplication (accept duplicate notifications)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Framework**: none

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send SSE requests, assert event format
- **State**: Use Playwright console evaluation — Check localStorage values

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Fixes — independent, start immediately):
├── Task 1: Context menu fixes (checkboxes, Remove all, Paste) [quick]
└── Task 2: Chart ratio fix (remove AVP, sub-pane heights) [quick]

Wave 2 (Real-time streaming — foundation):
├── Task 3: SSE kline stream API route [quick]
├── Task 4: useKlineStream client hook [quick]
└── Task 5: Chart real-time integration (updateData) [deep]

Wave 3 (Features — depend on streaming + fixes):
├── Task 6: Price alert state + persistence + context menu wiring [unspecified-high]
├── Task 7: Alert overlay drawing + notification firing [deep]
├── Task 8: Chart settings modal component [visual-engineering]
└── Task 9: Settings integration (persistence + chart init merge) [unspecified-high]

Wave FINAL (Verification — after ALL tasks):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [deep]

Critical Path: T1 → T5 → T7 → F1-F4
Parallel Speedup: ~55% faster than sequential
Max Concurrent: 4 (Wave 3)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | F1-F4 |
| 2 | — | 5, F1-F4 |
| 3 | — | 4, 5 |
| 4 | 3 | 5, 7 |
| 5 | 2, 4 | 7, F1-F4 |
| 6 | 1 | 7, F1-F4 |
| 7 | 5, 6 | F1-F4 |
| 8 | — | 9, F1-F4 |
| 9 | 5, 8 | F1-F4 |
| F1-F4 | ALL | — |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **3 tasks** — T3 → `quick`, T4 → `quick`, T5 → `deep`
- **Wave 3**: **4 tasks** — T6 → `unspecified-high`, T7 → `deep`, T8 → `visual-engineering`, T9 → `unspecified-high`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` + `playwright`, F4 → `deep`

---

## TODOs


- [ ] 1. Fix context menu: checkboxes, Remove all indicators, remove Paste

  **What to do**:

  **Fix 1 — MenuItem checkbox (lines 275-277 of ChartPanel.tsx)**:
  Replace the current invisible checkbox rendering in the `MenuItem` component.
  Current code renders `checked ? '✓' : ''` — the unchecked state is an empty string (invisible).
  Replace with a styled 14×14 checkbox square matching the indicator dropdown pattern:
  ```tsx
  {checked !== undefined && (
    <span style={{
      width: 14, height: 14, borderRadius: 3,
      border: checked ? '1px solid #00ff88' : '1px solid #555',
      background: checked ? '#00ff88' : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, color: checked ? '#000' : 'transparent', flexShrink: 0,
    }}>✓</span>
  )}
  ```

  **Fix 2 — "Remove all indicators" (lines 1033-1040)**:
  Replace hardcoded `chart.removeIndicator('candle_pane', 'MA')` / `chart.removeIndicator('candle_pane', 'VOL')` with:
  ```tsx
  onClick={() => { setActiveIndicators([]); setCtxMenu(null); }}
  ```
  This triggers chart re-render via the dependency array at line 665, disposing the chart and re-creating with no indicators.

  **Fix 3 — Remove "Paste" menu item (line ~1025)**:
  Delete the entire line:
  ```
  <MenuItem label="Paste" shortcut="⌘V" onClick={() => setCtxMenu(null)} />
  ```

  **Must NOT do**:
  - Do NOT change the indicator dropdown checkbox style
  - Do NOT modify chart init effect or persistence logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Three surgical edits in a single file, all under 10 lines each
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for implementation, only for QA

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:247-283` — MenuItem component with current broken checkbox at lines 275-277
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:826-862` — Indicator dropdown checkbox style to copy (14×14 square, border, green fill)

  **API/Type References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:380-386` — `toggleIndicator` and `setActiveIndicators` functions
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:665` — Chart init effect dependency array includes `activeIndicators`

  **WHY Each Reference Matters**:
  - Lines 247-283: The component being fixed — checkbox at lines 275-277 is the core change
  - Lines 826-862: Copy this exact checkbox visual for consistency
  - Lines 380-386: `setActiveIndicators([])` is used in Fix 2
  - Line 665: Confirms chart effect re-runs when `activeIndicators` changes

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Checkbox visible when unchecked
    Tool: Playwright
    Preconditions: App running at localhost:3000, chart loaded with default asset
    Steps:
      1. Right-click on the chart canvas to open context menu
      2. Locate "Lock vertical cursor line by time" menu item
      3. Assert: a 14×14 square element with border '1px solid #555' and transparent background is visible before the label text
      4. Locate "Hide marks on bars" menu item
      5. Assert: same unchecked square visible before label
    Expected Result: Both toggle items show a visible empty bordered square checkbox (not invisible empty string)
    Failure Indicators: No visible element before the label text, or element has 0 width/height
    Evidence: .sisyphus/evidence/task-1-checkbox-unchecked.png

  Scenario: Checkbox visible when checked
    Tool: Playwright
    Preconditions: Context menu open
    Steps:
      1. Click "Lock vertical cursor line by time" to toggle it on
      2. Right-click chart again to re-open context menu
      3. Assert: "Lock vertical cursor line by time" shows a green-filled (#00ff88) square with dark checkmark
    Expected Result: Checked state shows filled green 14×14 square
    Failure Indicators: Square not filled, color not #00ff88
    Evidence: .sisyphus/evidence/task-1-checkbox-checked.png

  Scenario: Remove all indicators works
    Tool: Playwright
    Preconditions: Chart showing with default indicators (MA, VOL active)
    Steps:
      1. Right-click chart to open context menu
      2. Click "Remove all indicators"
      3. Assert: context menu closes
      4. Click the indicators dropdown button in the toolbar
      5. Assert: no indicator checkboxes are checked in the dropdown
    Expected Result: All indicators removed, activeIndicators state is empty array
    Failure Indicators: Indicator checkboxes still checked, or indicators still visible on chart
    Evidence: .sisyphus/evidence/task-1-remove-indicators.png

  Scenario: Paste menu item absent
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Right-click chart to open context menu
      2. Assert: no element with text "Paste" exists in the context menu
    Expected Result: "Paste" not present in menu
    Failure Indicators: Element with text "Paste" found
    Evidence: .sisyphus/evidence/task-1-no-paste.png
  ```

  **Evidence to Capture:**
  - [ ] task-1-checkbox-unchecked.png
  - [ ] task-1-checkbox-checked.png
  - [ ] task-1-remove-indicators.png
  - [ ] task-1-no-paste.png

  **Commit**: YES
  - Message: `fix(chart): visible checkboxes in context menu, fix remove-all-indicators, remove Paste`
  - Files: `apps/web/src/components/terminal/panels/ChartPanel.tsx`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

- [ ] 2. Fix chart ratio: remove AVP indicator, constrain sub-pane heights

  **What to do**:

  **Fix 1 — Remove AVP from indicator registry (line ~40 of ChartPanel.tsx)**:
  In `INDICATOR_CATEGORIES[0].indicators` (the "Main" category), remove the `{ name: 'AVP', desc: 'Average Price' }` entry.
  AVP calculates `totalTurnover / totalVolume` but our OHLCV data has no `turnover` field (see `Candle` interface in `useOHLCV.ts` lines 5-12) — AVP always computes to 0, which stretches the Y-axis range to include 0 and squishes candles.

  **Fix 2 — Constrain sub-pane indicator heights (chart init effect, around line 538)**:
  When creating sub-pane indicators (type !== 'main'), pass `{ height: 100 }` as the third argument to `createIndicator`:
  ```tsx
  // For sub-pane indicators:
  chart.createIndicator(name, true, { height: 100 })
  // For main-pane indicators:
  chart.createIndicator(name, true, { id: 'candle_pane' })
  ```
  This prevents sub-pane indicators from consuming too much vertical space. klinecharts `PaneOptions` interface (types line 575-583) supports `height?: number`.

  **Must NOT do**:
  - Do NOT add turnover data to the Candle interface
  - Do NOT modify the OHLCV API route
  - Do NOT change indicator dropdown behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two surgical edits — remove an array entry, add an argument to function calls
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: QA only

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5, F1-F4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:22-71` — Indicator registry with INDICATOR_CATEGORIES, including AVP at ~line 40
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:530-545` — Chart init indicator creation loop (createIndicator calls)

  **API/Type References**:
  - `node_modules/.pnpm/klinecharts@9.8.12/node_modules/klinecharts/dist/index.d.ts:575-583` — PaneOptions interface with `height?: number`
  - `apps/web/src/hooks/useOHLCV.ts:5-12` — Candle interface (no turnover field)

  **External References**:
  - klinecharts source `index.esm.js:2288-2299` — AVP calculation showing `totalTurnover / totalVolume` dependency
  - klinecharts source `index.esm.js:4202-4204` — createIndicator isStack behavior

  **WHY Each Reference Matters**:
  - Lines 22-71: Find and remove AVP from the indicators array
  - Lines 530-545: Add `{ height: 100 }` to sub-pane createIndicator calls
  - PaneOptions types: Confirms height is a valid option
  - useOHLCV Candle: Proves no turnover field exists

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AVP not in indicator list
    Tool: Playwright
    Preconditions: App running at localhost:3000
    Steps:
      1. Click the indicators dropdown button in the toolbar
      2. Assert: no entry with text "AVP" or "Average Price" in the dropdown
    Expected Result: AVP is not listed as an available indicator
    Failure Indicators: AVP text found in dropdown
    Evidence: .sisyphus/evidence/task-2-no-avp.png

  Scenario: Sub-pane indicators have constrained height
    Tool: Playwright
    Preconditions: Chart loaded
    Steps:
      1. Open indicator dropdown
      2. Enable MACD, RSI, and KDJ (3 sub-pane indicators)
      3. Wait 2s for chart to re-render
      4. Measure the chart container height and the main candle pane height
      5. Assert: main candle pane occupies at least 40% of chart container height
    Expected Result: Candle pane is not squeezed to a tiny band — remains usable
    Failure Indicators: Candle pane height < 40% of container, candles barely visible
    Evidence: .sisyphus/evidence/task-2-constrained-panes.png

  Scenario: Chart renders normally with multiple main indicators
    Tool: Playwright
    Preconditions: Chart loaded, AVP removed
    Steps:
      1. Enable MA, EMA, BOLL, SAR (all main-pane indicators)
      2. Wait 2s
      3. Assert: chart Y-axis range is close to price range (not stretching to 0)
      4. Assert: candles fill the main pane normally
    Expected Result: No Y-axis stretching to 0, candles visible at normal scale
    Failure Indicators: Y-axis starts at 0, candles compressed at top
    Evidence: .sisyphus/evidence/task-2-normal-ratio.png
  ```

  **Evidence to Capture:**
  - [ ] task-2-no-avp.png
  - [ ] task-2-constrained-panes.png
  - [ ] task-2-normal-ratio.png

  **Commit**: YES
  - Message: `fix(chart): remove AVP indicator, constrain sub-pane heights to 100px`
  - Files: `apps/web/src/components/terminal/panels/ChartPanel.tsx`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

- [ ] 3. Create SSE kline stream API route

  **What to do**:

  Create `apps/web/src/app/api/prices/klines/stream/route.ts` following the exact pattern from `/api/prices/stream/route.ts` (134 lines).

  **Implementation**:
  1. Accept query params: `symbol` (default: 'BTCUSDT'), `interval` (default: '1m')
  2. Build Binance combined stream URL: `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`
  3. Use ReadableStream with WebSocket inside `start()` controller
  4. On WS message, parse Binance kline format and emit SSE event:
     ```json
     {
       "type": "kline",
       "timestamp": k.t,  // kline start time in ms
       "open": parseFloat(k.o),
       "high": parseFloat(k.h),
       "low": parseFloat(k.l),
       "close": parseFloat(k.c),
       "volume": parseFloat(k.v),
       "closed": k.x,  // is candle closed
       "symbol": d.s
     }
     ```
  5. Send heartbeat every 30s
  6. Reconnect on WS close with 3s delay
  7. Cleanup (close WS) when stream controller errors (client disconnect)
  8. Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`
  9. Export `dynamic = 'force-dynamic'` and `runtime = 'nodejs'`

  **Binance kline WS message format** (for reference):
  ```json
  {
    "e": "kline",
    "E": 1638747660000,
    "s": "BTCUSDT",
    "k": {
      "t": 1638747660000,  // kline start time
      "T": 1638747719999,  // kline close time
      "i": "1m",           // interval
      "o": "9638.9",       // open
      "c": "9639.8",       // close
      "h": "9639.8",       // high
      "l": "9638.6",       // low
      "v": "156",          // volume
      "x": false            // is candle closed
    }
  }
  ```

  **Must NOT do**:
  - Do NOT modify existing `/api/prices/stream/route.ts`
  - Do NOT use combined stream format (single stream is sufficient)
  - Do NOT add authentication or rate limiting

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation following an exact existing template
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, independent)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/src/app/api/prices/stream/route.ts` — **THE template**. Copy this pattern exactly: ReadableStream, WebSocket in start(), SSE encoding, heartbeat, cleanup, reconnect. This is the primary reference.

  **API/Type References**:
  - `apps/web/src/app/api/prices/ohlcv/route.ts` — Shows Binance API URL patterns and error handling style

  **External References**:
  - Binance Spot WS docs: stream name `{symbol}@kline_{interval}`, endpoint `wss://stream.binance.com:9443/ws/`
  - Binance kline payload: `e, E, s, k.{t,T,i,o,c,h,l,v,x}` fields documented above

  **WHY Each Reference Matters**:
  - `/api/prices/stream/route.ts`: The EXACT template — copy its structure (ReadableStream, WS, heartbeat, cleanup, reconnect) and adapt for kline data
  - `/api/prices/ohlcv/route.ts`: Shows how symbol params are handled, Binance error patterns
  - Binance docs: Ensures correct WS URL and message parsing

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SSE endpoint returns kline events
    Tool: Bash (curl)
    Preconditions: Dev server running at localhost:3000
    Steps:
      1. Run: curl -N -s "http://localhost:3000/api/prices/klines/stream?symbol=BTCUSDT&interval=1m" --max-time 15 2>/dev/null | head -5
      2. Parse each SSE line (strip 'data: ' prefix, parse JSON)
      3. Assert: first event has type='connected'
      4. Assert: subsequent events have type='kline'
      5. Assert: kline events contain fields: timestamp (number), open (number), high (number), low (number), close (number), volume (number), closed (boolean), symbol (string)
    Expected Result: Valid SSE stream with connected event followed by kline events every ~250ms
    Failure Indicators: No output, non-JSON output, missing fields, connection refused
    Evidence: .sisyphus/evidence/task-3-sse-kline-output.txt

  Scenario: SSE endpoint handles custom symbol and interval
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. Run: curl -N -s "http://localhost:3000/api/prices/klines/stream?symbol=ETHUSDT&interval=5m" --max-time 10 2>/dev/null | head -3
      2. Assert: kline events contain symbol='ETHUSDT'
    Expected Result: Stream works with different symbol/interval params
    Failure Indicators: Wrong symbol in events, connection error
    Evidence: .sisyphus/evidence/task-3-sse-custom-params.txt

  Scenario: SSE endpoint returns heartbeat
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. Run: curl -N -s "http://localhost:3000/api/prices/klines/stream?symbol=BTCUSDT&interval=1m" --max-time 35 2>/dev/null | grep heartbeat | head -1
      2. Assert: heartbeat event received within 35 seconds
    Expected Result: Heartbeat event with type='heartbeat' received
    Failure Indicators: No heartbeat within timeout
    Evidence: .sisyphus/evidence/task-3-sse-heartbeat.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-sse-kline-output.txt
  - [ ] task-3-sse-custom-params.txt
  - [ ] task-3-sse-heartbeat.txt

  **Commit**: YES (groups with Task 4)
  - Message: `feat(chart): add kline SSE stream endpoint and client hook`
  - Files: `apps/web/src/app/api/prices/klines/stream/route.ts`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

- [ ] 4. Create useKlineStream client hook

  **What to do**:

  Create `apps/web/src/hooks/useKlineStream.ts` following the exact pattern from `usePriceTicker.ts` (91 lines).

  **Implementation**:
  1. Accept params: `symbol: string`, `interval: string`
  2. Return: `{ latestCandle: KlineUpdate | null, connected: boolean }`
  3. Define `KlineUpdate` interface:
     ```typescript
     export interface KlineUpdate {
       timestamp: number  // ms
       open: number
       high: number
       low: number
       close: number
       volume: number
       closed: boolean  // is candle closed
     }
     ```
  4. Use EventSource connecting to `/api/prices/klines/stream?symbol=${symbol}&interval=${interval}`
  5. On `msg.type === 'kline'`: set `latestCandle` state with parsed fields
  6. On `msg.type === 'connected'`: set `connected = true`
  7. Reconnect on error with 5s delay (matching usePriceTicker pattern)
  8. Clean up EventSource on unmount or when symbol/interval changes
  9. Use `useRef` for EventSource and reconnect timer (matching usePriceTicker)

  **Must NOT do**:
  - Do NOT modify usePriceTicker.ts
  - Do NOT add any data transformation beyond what the SSE endpoint provides
  - Do NOT buffer multiple candle updates

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation following an exact existing template
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 3 for the endpoint)
  - **Parallel Group**: Wave 2 (sequential after Task 3)
  - **Blocks**: Task 5, Task 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `apps/web/src/hooks/usePriceTicker.ts` — **THE template**. Copy this exact pattern: EventSource, mounted guard, reconnect timer ref, 5s reconnect delay, cleanup on unmount. Adapt for kline data.

  **API/Type References**:
  - Task 3's SSE endpoint returns `{ type: 'kline', timestamp, open, high, low, close, volume, closed, symbol }`

  **WHY Each Reference Matters**:
  - `usePriceTicker.ts`: The EXACT template — same EventSource lifecycle, same reconnect pattern, same cleanup

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hook compiles without errors
    Tool: Bash
    Preconditions: Hook file created
    Steps:
      1. Run: pnpm --filter @oculus/web typecheck
      2. Assert: no errors in useKlineStream.ts
    Expected Result: Clean typecheck
    Failure Indicators: TypeScript errors in new file
    Evidence: .sisyphus/evidence/task-4-typecheck.txt

  Scenario: Hook exports correct interface
    Tool: Bash
    Preconditions: Hook file created
    Steps:
      1. Read useKlineStream.ts
      2. Assert: exports `useKlineStream` function
      3. Assert: exports `KlineUpdate` interface with timestamp, open, high, low, close, volume, closed fields
      4. Assert: function accepts (symbol: string, interval: string) params
      5. Assert: function returns { latestCandle: KlineUpdate | null, connected: boolean }
    Expected Result: Correct exports and types
    Failure Indicators: Missing exports, wrong types
    Evidence: .sisyphus/evidence/task-4-exports.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-typecheck.txt
  - [ ] task-4-exports.txt

  **Commit**: YES (groups with Task 3)
  - Message: `feat(chart): add kline SSE stream endpoint and client hook`
  - Files: `apps/web/src/hooks/useKlineStream.ts`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

- [ ] 5. Integrate real-time candle updates into ChartPanel

  **What to do**:

  Wire the `useKlineStream` hook into `ChartPanel.tsx` to feed live candle updates to the chart.

  **Implementation**:
  1. Import `useKlineStream` from `@/hooks/useKlineStream`
  2. Call the hook with current symbol and timeframe:
     ```tsx
     const { latestCandle, connected: klineConnected } = useKlineStream(
       `${externalSymbol}USDT`,
       timeframe
     )
     ```
  3. Add a NEW, SEPARATE useEffect (NOT inside the chart init effect) that calls `chart.updateData()` when `latestCandle` changes:
     ```tsx
     useEffect(() => {
       if (!latestCandle || !chartRef.current) return
       chartRef.current.updateData({
         timestamp: latestCandle.timestamp,
         open: latestCandle.open,
         high: latestCandle.high,
         low: latestCandle.low,
         close: latestCandle.close,
         volume: latestCandle.volume,
       })
     }, [latestCandle])
     ```
  4. This effect MUST be separate from the chart init effect (line 454) because:
     - The chart init effect disposes and re-creates the chart on many state changes
     - If the SSE connection were inside it, it would disconnect/reconnect on every re-render
     - `chartRef.current` may be null temporarily during re-init — the guard handles this
  5. Optionally show a small connection indicator (green/red dot) near the timeframe buttons

  **Must NOT do**:
  - Do NOT put the useKlineStream hook or updateData call inside the chart init useEffect (line 454)
  - Do NOT auto-scroll to latest candle when user is scrolled back in history
  - Do NOT modify useOHLCV.ts (it still provides initial historical data)
  - Do NOT add loading/error states for the stream connection

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding the chart lifecycle (init/dispose/re-init) and carefully placing the updateData effect to avoid conflicts with the init effect
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Tasks 2, 4)
  - **Blocks**: Task 7, Task 9, F1-F4
  - **Blocked By**: Task 2 (chart ratio fix), Task 4 (kline hook)

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:453-665` — Chart init useEffect. New updateData effect goes AFTER this effect, NOT inside it
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:309-356` — State declarations. Add `useKlineStream` call near other hook calls

  **API/Type References**:
  - `apps/web/src/hooks/useKlineStream.ts` (from Task 4) — `useKlineStream(symbol, interval)` returns `{ latestCandle, connected }`
  - klinecharts `chart.updateData(KLineData)` — updates last candle if timestamp matches, appends new candle if different timestamp
  - `apps/web/src/hooks/useOHLCV.ts` — `useOHLCV(symbol, interval)` still provides initial data via `applyNewData()`

  **WHY Each Reference Matters**:
  - Lines 453-665: Must understand the chart init lifecycle to place updateData effect correctly (after, not inside)
  - Lines 309-356: Placement context for the useKlineStream hook call
  - useKlineStream: The data source for real-time updates
  - klinecharts updateData: The API for feeding live data — timestamp matching determines update vs append

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Chart updates candles in real-time
    Tool: Playwright
    Preconditions: App running, chart loaded with 1m timeframe
    Steps:
      1. Navigate to localhost:3000
      2. Set timeframe to 1m (if not already)
      3. Take screenshot of the last candle
      4. Wait 5 seconds
      5. Take another screenshot of the last candle
      6. Assert: the last candle's close/high/low has visually changed between the two screenshots (candle wick or body moved)
    Expected Result: Chart candle updates live without full re-render
    Failure Indicators: No visual change in 5s on a 1m chart, or entire chart flickers/resets
    Evidence: .sisyphus/evidence/task-5-realtime-before.png, .sisyphus/evidence/task-5-realtime-after.png

  Scenario: Timeframe change reconnects stream
    Tool: Playwright
    Preconditions: Chart showing 1m data with live updates
    Steps:
      1. Click 5m timeframe button
      2. Wait 3s for chart to reload
      3. Assert: chart shows 5m candles (different candle count/spacing)
      4. Wait 5s
      5. Assert: last candle continues to update live (not frozen)
    Expected Result: Stream reconnects on timeframe change, continues live updates
    Failure Indicators: Chart frozen after timeframe change, no live updates
    Evidence: .sisyphus/evidence/task-5-timeframe-change.png

  Scenario: Chart init doesn't break streaming
    Tool: Playwright
    Preconditions: Chart showing with live updates
    Steps:
      1. Toggle an indicator (e.g., enable MACD) — this triggers chart re-init
      2. Wait 3s
      3. Assert: live updates resume (last candle still updating)
    Expected Result: Indicator toggle (which re-inits chart) doesn't permanently break streaming
    Failure Indicators: Live updates stop after toggling indicator
    Evidence: .sisyphus/evidence/task-5-indicator-toggle.png
  ```

  **Evidence to Capture:**
  - [ ] task-5-realtime-before.png
  - [ ] task-5-realtime-after.png
  - [ ] task-5-timeframe-change.png
  - [ ] task-5-indicator-toggle.png

  **Commit**: YES
  - Message: `feat(chart): integrate real-time candle updates via updateData`
  - Files: `apps/web/src/components/terminal/panels/ChartPanel.tsx`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

- [ ] 6. Price alert state, persistence, and context menu wiring

  **What to do**:

  Add alert state management, localStorage persistence, and wire the existing "Create Alert" context menu item.

  **Implementation**:
  1. Define alert type in ChartPanel.tsx:
     ```typescript
     interface PriceAlert {
       id: string
       price: number
       createdAt: number
       triggered: boolean
     }
     ```
  2. Add alerts state with lazy-init from localStorage:
     ```tsx
     const [alerts, setAlerts] = useState<PriceAlert[]>(() => {
       try {
         const stored = localStorage.getItem(`oculus-chart-alerts:${externalSymbol}`)
         return stored ? JSON.parse(stored) : []
       } catch { return [] }
     })
     ```
  3. Add wrapped setter that persists to localStorage:
     ```tsx
     const setAlertsAndPersist = useCallback((updater: PriceAlert[] | ((prev: PriceAlert[]) => PriceAlert[])) => {
       setAlerts(prev => {
         const next = typeof updater === 'function' ? updater(prev) : updater
         localStorage.setItem(`oculus-chart-alerts:${externalSymbol}`, JSON.stringify(next))
         return next
       })
     }, [externalSymbol])
     ```
  4. Add re-hydration effect when externalSymbol changes:
     ```tsx
     useEffect(() => {
       try {
         const stored = localStorage.getItem(`oculus-chart-alerts:${externalSymbol}`)
         setAlerts(stored ? JSON.parse(stored) : [])
       } catch { setAlerts([]) }
     }, [externalSymbol])
     ```
  5. Wire "Create Alert" context menu item (line 1015-1017) — the placeholder already exists:
     ```tsx
     <MenuItem
       label={`Create Alert at ${ctxMenu.price?.toFixed(2)}`}
       onClick={() => {
         if (ctxMenu.price == null) return
         const activeAlerts = alerts.filter(a => !a.triggered)
         if (activeAlerts.length >= 10) {
           // Max 10 alerts per asset
           setCtxMenu(null)
           return
         }
         const newAlert: PriceAlert = {
           id: `alert-${Date.now()}`,
           price: ctxMenu.price,
           createdAt: Date.now(),
           triggered: false,
         }
         setAlertsAndPersist(prev => [...prev, newAlert])
         setCtxMenu(null)
       }}
     />
     ```
  6. Add "Clear Alerts" context menu item after "Create Alert":
     ```tsx
     {alerts.filter(a => !a.triggered).length > 0 && (
       <MenuItem
         label={`Clear All Alerts (${alerts.filter(a => !a.triggered).length})`}
         onClick={() => { setAlertsAndPersist([]); setCtxMenu(null); }}
       />
     )}
     ```
  7. Request Notification permission on first alert creation:
     ```tsx
     if (Notification.permission === 'default') {
       Notification.requestPermission()
     }
     ```

  **Must NOT do**:
  - Do NOT add sound effects to alerts
  - Do NOT add server-side alert persistence
  - Do NOT add React Context for alert state
  - Do NOT allow more than 10 active alerts per asset

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple interconnected pieces — state, persistence, context menu wiring, Notification API permission
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (partially, with Task 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (context menu must be fixed first for clean menu structure)

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:287-306` — Existing `readConfig()`/`saveConfig()` localStorage persistence pattern. Alerts use a separate key but same wrapped-setter pattern
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:309-356` — Lazy-init state pattern with try/catch fallback
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:358-395` — Wrapped setters + re-hydration on externalSymbol change

  **API/Type References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:984-1049` — Context menu structure. "Create Alert" placeholder at lines 1015-1017
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:247-283` — MenuItem component interface
  - Web API: `Notification.permission`, `Notification.requestPermission()`

  **WHY Each Reference Matters**:
  - Lines 287-306: Copy this localStorage persistence pattern for alerts (separate key, same approach)
  - Lines 309-356: Copy lazy-init pattern for alerts state
  - Lines 358-395: Copy wrapped setter + re-hydration pattern for alert state on symbol change
  - Lines 984-1049: Context menu location where "Create Alert" already has a placeholder — wire it up

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create alert from context menu
    Tool: Playwright
    Preconditions: App running, chart loaded
    Steps:
      1. Right-click on chart at a specific price level
      2. Assert: context menu shows "Create Alert at XX,XXX.XX" with the right-clicked price
      3. Click the "Create Alert" item
      4. Assert: context menu closes
      5. Evaluate in console: JSON.parse(localStorage.getItem('oculus-chart-alerts:BTC'))
      6. Assert: array contains 1 alert with price, id, createdAt, triggered=false
    Expected Result: Alert created and persisted in localStorage
    Failure Indicators: No alert in localStorage, wrong price value
    Evidence: .sisyphus/evidence/task-6-create-alert.png

  Scenario: Clear all alerts
    Tool: Playwright
    Preconditions: At least 1 alert exists
    Steps:
      1. Right-click chart
      2. Assert: "Clear All Alerts (N)" menu item visible
      3. Click "Clear All Alerts"
      4. Evaluate: JSON.parse(localStorage.getItem('oculus-chart-alerts:BTC'))
      5. Assert: array is empty
    Expected Result: All alerts cleared from state and localStorage
    Failure Indicators: Alerts remain in localStorage
    Evidence: .sisyphus/evidence/task-6-clear-alerts.png

  Scenario: Notification permission requested on first alert
    Tool: Playwright
    Preconditions: Fresh browser context (notification permission not set)
    Steps:
      1. Right-click chart, click "Create Alert"
      2. Assert: Notification.permission is 'default' or 'granted' (browser prompted)
    Expected Result: Browser prompts for notification permission
    Failure Indicators: No permission prompt, Notification.requestPermission not called
    Evidence: .sisyphus/evidence/task-6-notification-permission.png

  Scenario: Max 10 alerts enforced
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Create 10 alerts by right-clicking at different price levels
      2. Right-click chart, click "Create Alert" for 11th time
      3. Evaluate localStorage: assert still 10 alerts (11th was rejected)
    Expected Result: Maximum 10 alerts per asset enforced
    Failure Indicators: More than 10 alerts in localStorage
    Evidence: .sisyphus/evidence/task-6-max-alerts.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-create-alert.png
  - [ ] task-6-clear-alerts.png
  - [ ] task-6-notification-permission.png
  - [ ] task-6-max-alerts.txt

  **Commit**: YES (groups with Task 7)
  - Message: `feat(chart): price alerts with browser notifications and chart overlays`
  - Files: `apps/web/src/components/terminal/panels/ChartPanel.tsx`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

- [ ] 7. Alert overlay drawing on chart + notification firing on price crossing

  **What to do**:

  Draw horizontal alert lines on the chart using klinecharts overlays, and fire browser notifications when live price crosses alert levels.

  **Implementation — Alert Overlay Drawing**:
  1. Inside the chart init useEffect (after `applyNewData()` at ~line 511), re-draw alert overlays:
     ```tsx
     // Re-draw alert overlays (overlays are destroyed on chart dispose/re-init)
     const activeAlerts = alerts.filter(a => !a.triggered)
     activeAlerts.forEach(alert => {
       chart.createOverlay({
         name: 'horizontalStraightLine',
         id: `alert-${alert.id}`,
         points: [{ value: alert.price }],
         lock: true,
         styles: {
           line: { color: '#ffaa00', style: 'dashed', dashedValue: [4, 4] },
         },
       })
     })
     ```
  2. Add `alerts` to the chart init useEffect dependency array (currently at line 665)
  3. When alerts change (new alert created or cleared), the chart re-inits and re-draws overlays

  **Implementation — Price Crossing Detection + Notification**:
  4. Add a SEPARATE useEffect that checks live price against alerts:
     ```tsx
     useEffect(() => {
       const currentPrice = tickers[`${externalSymbol}USDT`]?.price
       if (!currentPrice || alerts.length === 0) return
       
       const activeAlerts = alerts.filter(a => !a.triggered)
       let changed = false
       const updatedAlerts = alerts.map(alert => {
         if (alert.triggered) return alert
         // Price crossed the alert level (either direction)
         if (
           (currentPrice >= alert.price && alert.price > 0) ||
           (currentPrice <= alert.price && alert.price > 0)
         ) {
           // More precise: check if price is within 0.1% of alert
           const pctDiff = Math.abs(currentPrice - alert.price) / alert.price
           if (pctDiff <= 0.001) {
             // Fire notification
             if (Notification.permission === 'granted') {
               new Notification(`Price Alert: ${externalSymbol}`, {
                 body: `Price reached ${alert.price.toFixed(2)} (current: ${currentPrice.toFixed(2)})`,
                 icon: '/favicon-192.png',
               })
             }
             changed = true
             return { ...alert, triggered: true }
           }
         }
         return alert
       })
       if (changed) {
         setAlertsAndPersist(updatedAlerts)
       }
     }, [tickers, alerts, externalSymbol, setAlertsAndPersist])
     ```
  5. **IMPORTANT**: The crossing detection logic above is a starting point. The executor should refine it:
     - Track previous price to detect when price CROSSES the level (was below, now above; or was above, now below)
     - Use `prevPriceRef = useRef<number>()` to compare previous vs current
     - Trigger when: `(prevPrice < alert.price && currentPrice >= alert.price) || (prevPrice > alert.price && currentPrice <= alert.price)`
     - This prevents false triggers when price fluctuates near the level

  **Must NOT do**:
  - Do NOT add sound effects
  - Do NOT add a notification queue or throttle — one-shot alerts fire once then auto-dismiss
  - Do NOT create a separate AlertManager class
  - Do NOT add alert editing or modification (create-only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful integration with chart lifecycle (overlays re-drawn on init), price crossing detection logic, and browser Notification API
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Tasks 5, 6)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 5 (real-time integration, for chartRef), Task 6 (alert state + persistence)

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:617-630` — Existing overlay creation pattern (simpleAnnotation for signal markers). Follow this for alert overlays.
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:453-665` — Chart init useEffect. Alert overlays go after `applyNewData()` at ~line 511. Add `alerts` to dependency array at line 665.

  **API/Type References**:
  - klinecharts `chart.createOverlay({ name, id, points, lock, styles })` — returns overlay ID
  - klinecharts `chart.removeOverlay(id)` — remove specific overlay
  - klinecharts source `index.esm.js:4634-4657` — `horizontalStraightLine` overlay implementation (full-width horizontal line at Y coordinate)
  - Web API: `new Notification(title, { body, icon })` for browser notifications
  - `apps/web/src/hooks/usePriceTicker.ts` — `tickers[symbol]?.price` for current live price

  **WHY Each Reference Matters**:
  - Lines 617-630: Shows how existing overlays (signal annotations) are created in the init effect — alert overlays follow same placement
  - Lines 453-665: The chart lifecycle — overlays are destroyed on dispose, so they MUST be re-drawn inside init
  - horizontalStraightLine source: Confirms it draws full-width horizontal line at a Y value
  - Notification API: For firing price alerts
  - usePriceTicker: Live price source for crossing detection

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Alert line drawn on chart
    Tool: Playwright
    Preconditions: App running, chart loaded
    Steps:
      1. Right-click chart at a specific price, click "Create Alert"
      2. Wait 2s for chart to re-render with overlay
      3. Take screenshot of chart
      4. Assert: horizontal dashed line in #ffaa00 (amber) color visible at the alert price level
    Expected Result: Visible horizontal alert line on chart at the correct price
    Failure Indicators: No line visible, line at wrong price, wrong color
    Evidence: .sisyphus/evidence/task-7-alert-line.png

  Scenario: Alert line survives timeframe change
    Tool: Playwright
    Preconditions: Alert created on chart
    Steps:
      1. Click different timeframe button (e.g., 5m)
      2. Wait 3s for chart to re-init
      3. Assert: alert line still visible at the correct price level
    Expected Result: Alert overlay re-drawn after chart re-init
    Failure Indicators: Alert line disappears after timeframe change
    Evidence: .sisyphus/evidence/task-7-alert-survives-reinit.png

  Scenario: Alert line removed after triggering
    Tool: Playwright
    Preconditions: Alert exists, price is close to alert level (or use console to simulate)
    Steps:
      1. Create alert at current price level (so it triggers immediately)
      2. Wait 5s for price tick to match
      3. Assert: alert marked as triggered in localStorage
      4. Assert: alert line removed from chart (or marked differently)
    Expected Result: One-shot alert fires and auto-dismisses
    Failure Indicators: Alert fires repeatedly, line stays on chart indefinitely
    Evidence: .sisyphus/evidence/task-7-alert-triggered.png
  ```

  **Evidence to Capture:**
  - [ ] task-7-alert-line.png
  - [ ] task-7-alert-survives-reinit.png
  - [ ] task-7-alert-triggered.png

  **Commit**: YES (groups with Task 6)
  - Message: `feat(chart): price alerts with browser notifications and chart overlays`
  - Files: `apps/web/src/components/terminal/panels/ChartPanel.tsx`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

- [ ] 8. Chart settings modal component

  **What to do**:

  Create a standalone `ChartSettingsModal.tsx` component with controls for chart appearance.

  **Implementation**:
  1. Create `apps/web/src/components/terminal/panels/ChartSettingsModal.tsx`
  2. Accept props:
     ```typescript
     interface ChartSettingsModalProps {
       open: boolean
       onClose: () => void
       settings: ChartSettings
       onSettingsChange: (settings: ChartSettings) => void
     }
     
     export interface ChartSettings {
       candleUpColor: string
       candleDownColor: string
       gridVisible: boolean
       crosshairVisible: boolean
     }
     
     export const DEFAULT_CHART_SETTINGS: ChartSettings = {
       candleUpColor: '#00ff88',
       candleDownColor: '#ff3b3b',
       gridVisible: true,
       crosshairVisible: true,
     }
     ```
  3. UI layout:
     - Fixed position overlay (modal) with dark background (#1a1a1a, border #333)
     - Header: "Chart Settings" with X close button
     - Section: **Candle Colors**
       - "Up Color" — `<input type="color">` with current value and hex label
       - "Down Color" — `<input type="color">` with current value and hex label
     - Section: **Display**
       - "Show Grid" — checkbox toggle (use same 14×14 square style from indicator dropdown)
       - "Show Crosshair" — checkbox toggle
     - Footer: "Reset to Defaults" button
  4. Call `onSettingsChange` immediately on every control change (live preview)
  5. Style: JetBrains Mono font, dark theme matching existing terminal aesthetic

  **Must NOT do**:
  - Do NOT add indicator parameter customization
  - Do NOT add animation/transitions
  - Do NOT add font size or font family settings
  - Do NOT add tab/section navigation — keep it flat/simple
  - Do NOT create a React Context for settings

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with color pickers, toggles, modal layout, dark theme styling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7 — independent component)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: None (standalone component, no chart dependencies)

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:730-880` — Toolbar styling (font family, sizes, colors, dark theme) to match
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:826-862` — Checkbox style (14×14 square) to reuse for grid/crosshair toggles

  **API/Type References**:
  - HTML `<input type="color">` — Native browser color picker, returns hex value via onChange

  **WHY Each Reference Matters**:
  - Lines 730-880: Match the existing visual style (dark theme, JetBrains Mono, colors)
  - Lines 826-862: Reuse the same checkbox pattern for visual consistency

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Settings modal renders correctly
    Tool: Playwright
    Preconditions: Settings modal triggered (Task 9 wires context menu item, but can test standalone)
    Steps:
      1. Render ChartSettingsModal with open=true and default settings
      2. Assert: modal visible with dark background
      3. Assert: "Chart Settings" header text visible
      4. Assert: two color inputs visible (Up Color, Down Color)
      5. Assert: two checkbox toggles visible (Grid, Crosshair)
      6. Assert: "Reset to Defaults" button visible
    Expected Result: All controls render correctly
    Failure Indicators: Missing controls, wrong layout, light theme colors
    Evidence: .sisyphus/evidence/task-8-settings-modal.png

  Scenario: Color picker changes candle color
    Tool: Playwright
    Preconditions: Settings modal open
    Steps:
      1. Find the "Up Color" color input
      2. Change value to '#0000ff' (blue)
      3. Assert: onSettingsChange called with candleUpColor='#0000ff'
    Expected Result: Color change propagates via callback
    Failure Indicators: Callback not fired, wrong color value
    Evidence: .sisyphus/evidence/task-8-color-change.png

  Scenario: Reset to defaults works
    Tool: Playwright
    Preconditions: Settings modified (e.g., colors changed)
    Steps:
      1. Click "Reset to Defaults" button
      2. Assert: Up Color reset to #00ff88, Down Color reset to #ff3b3b
      3. Assert: Grid and Crosshair both checked/enabled
    Expected Result: All settings reset to DEFAULT_CHART_SETTINGS values
    Failure Indicators: Values not reset, partial reset
    Evidence: .sisyphus/evidence/task-8-reset-defaults.png
  ```

  **Evidence to Capture:**
  - [ ] task-8-settings-modal.png
  - [ ] task-8-color-change.png
  - [ ] task-8-reset-defaults.png

  **Commit**: YES (groups with Task 9)
  - Message: `feat(chart): chart settings modal with per-asset persistence`
  - Files: `apps/web/src/components/terminal/panels/ChartSettingsModal.tsx`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

- [ ] 9. Settings integration: persistence + chart init merge + context menu wiring

  **What to do**:

  Wire ChartSettingsModal into ChartPanel, persist settings per-asset, and apply settings during chart init.

  **Implementation**:
  1. Import `ChartSettingsModal`, `ChartSettings`, `DEFAULT_CHART_SETTINGS` from `./ChartSettingsModal`
  2. Add settings state with lazy-init from localStorage:
     ```tsx
     const [chartSettings, setChartSettings] = useState<ChartSettings>(() => {
       const cfg = readConfig()
       return cfg.chartSettings ?? DEFAULT_CHART_SETTINGS
     })
     const [showSettings, setShowSettings] = useState(false)
     ```
  3. Add wrapped setter that persists:
     ```tsx
     const handleSettingsChange = useCallback((settings: ChartSettings) => {
       setChartSettings(settings)
       saveConfig({ chartSettings: settings })
       // Apply styles immediately to current chart
       if (chartRef.current) {
         chartRef.current.setStyles({
           candle: {
             bar: {
               upColor: settings.candleUpColor,
               downColor: settings.candleDownColor,
               upBorderColor: settings.candleUpColor,
               downBorderColor: settings.candleDownColor,
               upWickColor: settings.candleUpColor,
               downWickColor: settings.candleDownColor,
             },
           },
           grid: { show: settings.gridVisible },
           crosshair: { show: settings.crosshairVisible },
         })
       }
     }, [saveConfig])
     ```
  4. In the chart init useEffect (line 469-508 styles block), replace hardcoded candle colors with settings values:
     ```tsx
     chart.setStyles({
       candle: {
         bar: {
           upColor: chartSettings.candleUpColor,
           downColor: chartSettings.candleDownColor,
           // ... rest of bar colors derived from settings
           upBorderColor: chartSettings.candleUpColor,
           downBorderColor: chartSettings.candleDownColor,
           upWickColor: chartSettings.candleUpColor,
           downWickColor: chartSettings.candleDownColor,
           noChangeColor: '#888888',
           noChangeBorderColor: '#888888',
           noChangeWickColor: '#888888',
         },
       },
       grid: {
         show: chartSettings.gridVisible,
         horizontal: { color: '#1a1a1a' },
         vertical: { color: '#1a1a1a' },
       },
       crosshair: {
         show: chartSettings.crosshairVisible,
         // ... rest unchanged
       },
       // ... rest of styles unchanged (axes, separator, etc.)
     })
     ```
  5. Add `chartSettings` to chart init useEffect dependency array
  6. Add re-hydration for settings on externalSymbol change:
     ```tsx
     // In the existing re-hydration effect for symbol change:
     const cfg = readConfig()
     setChartSettings(cfg.chartSettings ?? DEFAULT_CHART_SETTINGS)
     ```
  7. Wire context menu "Settings" item:
     ```tsx
     <MenuItem label="Settings..." onClick={() => { setShowSettings(true); setCtxMenu(null); }} />
     ```
  8. Render ChartSettingsModal:
     ```tsx
     <ChartSettingsModal
       open={showSettings}
       onClose={() => setShowSettings(false)}
       settings={chartSettings}
       onSettingsChange={handleSettingsChange}
     />
     ```

  **Must NOT do**:
  - Do NOT add settings beyond candle colors, grid visibility, crosshair visibility
  - Do NOT create a React Context for settings
  - Do NOT modify the settings modal component (Task 8)
  - Do NOT change non-candle style values (axis colors, separator, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple integration points — persistence, chart init styles, context menu, re-hydration, live style updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Tasks 5, 8)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 5 (chart integration must be stable), Task 8 (modal component)

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:287-306` — readConfig/saveConfig pattern. Add `chartSettings` to the config schema
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:469-508` — Current hardcoded styles in chart init. Replace candle colors + grid + crosshair with settings values
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:358-395` — Re-hydration effect pattern. Add chartSettings re-hydration
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:984-1049` — Context menu. Wire "Settings..." item here

  **API/Type References**:
  - `apps/web/src/components/terminal/panels/ChartSettingsModal.tsx` (from Task 8) — ChartSettings type, DEFAULT_CHART_SETTINGS constant, ChartSettingsModal component
  - klinecharts `chart.setStyles(DeepPartial<Styles>)` — accepts partial styles, applies immediately

  **WHY Each Reference Matters**:
  - Lines 287-306: Extend saveConfig to include chartSettings field
  - Lines 469-508: Replace hardcoded colors with settings values so they survive chart re-init
  - Lines 358-395: Add chartSettings to re-hydration so settings load correctly on symbol change
  - Lines 984-1049: Wire the "Settings..." menu item to open the modal
  - setStyles: For live preview (apply settings without chart re-init)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Settings persist across page reload
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Open context menu, click "Settings..."
      2. Change Up Color to blue (#0000ff)
      3. Close settings modal
      4. Reload the page
      5. Assert: chart candles show blue for up candles (not default green)
      6. Open settings — assert Up Color shows #0000ff
    Expected Result: Custom candle color persists across reload
    Failure Indicators: Color resets to default green on reload
    Evidence: .sisyphus/evidence/task-9-settings-persist.png

  Scenario: Settings survive timeframe change
    Tool: Playwright
    Preconditions: Custom settings applied (e.g., blue up candles)
    Steps:
      1. Click different timeframe button (5m)
      2. Wait 3s for chart re-init
      3. Assert: candle colors still use custom settings (blue up candles)
    Expected Result: Settings applied during chart re-init
    Failure Indicators: Colors revert to defaults after timeframe change
    Evidence: .sisyphus/evidence/task-9-settings-survive-reinit.png

  Scenario: Grid toggle works
    Tool: Playwright
    Preconditions: Settings modal open
    Steps:
      1. Uncheck "Show Grid" toggle
      2. Assert: chart grid lines disappear immediately (live preview)
      3. Check "Show Grid" toggle
      4. Assert: chart grid lines reappear
    Expected Result: Grid visibility toggles in real-time
    Failure Indicators: Grid doesn't hide/show, requires chart re-render
    Evidence: .sisyphus/evidence/task-9-grid-toggle.png

  Scenario: Settings are per-asset
    Tool: Playwright
    Preconditions: Custom settings on BTC (blue up candles)
    Steps:
      1. Switch to ETH asset (click ETH in asset list)
      2. Assert: chart uses default settings (green up candles) — not BTC's custom blue
      3. Switch back to BTC
      4. Assert: chart uses BTC's custom settings (blue up candles)
    Expected Result: Each asset has independent settings
    Failure Indicators: Settings bleed between assets
    Evidence: .sisyphus/evidence/task-9-per-asset-settings.png
  ```

  **Evidence to Capture:**
  - [ ] task-9-settings-persist.png
  - [ ] task-9-settings-survive-reinit.png
  - [ ] task-9-grid-toggle.png
  - [ ] task-9-per-asset-settings.png

  **Commit**: YES (groups with Task 8)
  - Message: `feat(chart): chart settings modal with per-asset persistence`
  - Files: `apps/web/src/components/terminal/panels/ChartPanel.tsx`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm --filter @oculus/web typecheck`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (real-time data + alerts working together, settings persisting through chart re-renders). Test edge cases: create alert then change timeframe, toggle indicator while streaming. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `fix(chart): visible checkboxes in context menu, fix remove-all-indicators, remove Paste` — ChartPanel.tsx
- **T2**: `fix(chart): remove AVP indicator, constrain sub-pane heights` — ChartPanel.tsx
- **T3+T4**: `feat(chart): add kline SSE stream endpoint and client hook` — route.ts, useKlineStream.ts
- **T5**: `feat(chart): integrate real-time candle updates via updateData` — ChartPanel.tsx
- **T6+T7**: `feat(chart): price alerts with browser notifications and chart overlays` — ChartPanel.tsx
- **T8+T9**: `feat(chart): chart settings modal with per-asset persistence` — ChartSettingsModal.tsx, ChartPanel.tsx

---

## Success Criteria

### Verification Commands
```bash
pnpm --filter @oculus/web typecheck  # Expected: only pre-existing discovery-job.model.ts error
curl -N -s "http://localhost:3000/api/prices/klines/stream?symbol=BTCUSDT&interval=1m" --max-time 10 | head -3  # Expected: SSE kline events
```

### Final Checklist
- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] Context menu checkboxes visible
- [ ] Chart ratio normal with multiple indicators
- [ ] Live candle updates streaming
- [ ] Price alerts fire notifications
- [ ] Chart settings persist across reload
- [ ] Zero new TypeScript errors
