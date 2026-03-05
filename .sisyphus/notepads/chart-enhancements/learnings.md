# Chart Enhancements — Learnings

## 2026-03-05 Session Start

### ChartPanel.tsx Structure (1053 lines)
- Lines 22-71: Indicator registry (`IndicatorDef`, `INDICATOR_CATEGORIES`, `ALL_INDICATORS`, `DEFAULT_INDICATORS`)
- Lines 247-283: `MenuItem` component — checkbox at lines 275-277 is broken (empty string for unchecked)
- Lines 287-306: Per-asset persistence — `storageKey`, `readConfig()`, `saveConfig()`
- Lines 309-356: Lazy-init states with try/catch fallback
- Lines 358-395: Wrapped setters + re-hydration on externalSymbol change
- Lines 380-386: `toggleIndicator` and `setActiveIndicators` functions
- Lines 453-665: Chart init useEffect (main lifecycle) — dependency array at line 665
- Lines 469-508: Hardcoded `setStyles()` — Task 9 replaces candle colors with settings
- Lines 530-545: `createIndicator` calls — Task 2 adds `{ height: 100 }` to sub-pane calls
- Lines 617-630: Existing overlay creation (signal annotations) — Task 7 adds alert overlays after
- Lines 730-880: Toolbar (timeframe buttons, indicator dropdown)
- Lines 826-862: Indicator dropdown checkbox style (14×14, green fill) — reference for Task 1 + Task 8
- Lines 984-1049: Context menu — Tasks 1, 6, 9 modify here
- Lines 1015-1017: "Create Alert" placeholder — Task 6 wires this
- Lines 1033-1040: "Remove all indicators" broken — Task 1 fixes

### klinecharts v9.8.12 API
- `chart.updateData(KLineData)` — updates last candle if timestamp matches, appends new if different
- `chart.createOverlay({name, id, points, lock, styles})` — built-in `horizontalStraightLine` for alert lines
- `chart.setStyles(DeepPartial<Styles>)` — partial style update, applies immediately
- `createIndicator(name, isStack, paneOptions)` — `isStack=true`, `paneOptions: { height: 100 }` constrains sub-pane

### Binance kline WebSocket
- Stream: `wss://stream.binance.com:9443/ws/{symbol}@kline_{interval}`
- Message fields: `e, E, s, k.{t,T,i,o,c,h,l,v,x}` — x=isCandleClosed

### Template Files
- SSE route template: `apps/web/src/app/api/prices/stream/route.ts` (134 lines)
- Client hook template: `apps/web/src/hooks/usePriceTicker.ts` (91 lines)

### Pre-existing Issues (NOT ours)
- `apps/web/src/lib/intelligence/engine/opencode.ts` line 590 — syntax error
- `apps/web/src/lib/intelligence/models/discovery-job.model.ts` line 5 — type mismatch
- These should appear in typecheck but are NOT our responsibility

## 2026-03-05 Context Menu Fixes Completed

### Fix 1: Visible checkboxes in MenuItem (lines 275-283)
✅ Replaced broken empty-string checkbox with styled 14×14 square:
- Border: `1px solid #555` (unchecked) or `1px solid #00ff88` (checked)
- Background: `transparent` (unchecked) or `#00ff88` (checked)
- Checkmark color: `transparent` (unchecked) or `#000` (checked)
- Uses `inline-flex` for proper alignment

### Fix 2: "Remove all indicators" now uses state (lines 1038-1041)
✅ Replaced direct chart API calls with `setActiveIndicators([])`:
```tsx
onClick={() => { setActiveIndicators([]); setCtxMenu(null); }}
```
- This triggers the chart init effect (line 666 dependency array)
- Chart re-initializes with empty indicators list
- No need for individual `chart.removeIndicator()` calls

### Fix 3: Removed "Paste" menu item (line 1025)
✅ Deleted entire MenuItem:
```tsx
<MenuItem label="Paste" shortcut="⌘V" onClick={() => setCtxMenu(null)} />
```

### Verification
- `pnpm --filter @oculus/web typecheck` ✅ passed (no new errors)
- Commit: f74c24a — "fix(chart): visible checkboxes in context menu, fix remove-all-indicators, remove Paste"
- All three fixes surgical — only touched the targeted lines

## 2026-03-05 T6 Complete

### Alert State Pattern
- PriceAlert interface: { id, price, createdAt, triggered }
- Storage key: `oculus-chart-alerts:${externalSymbol}` (separate from chart config key)
- setAlertsAndPersist: wraps setState + localStorage.setItem in one callback
- Re-hydration: added to existing externalSymbol re-hydration useEffect
- Max 10 active (non-triggered) alerts enforced in Create Alert onClick
- Notification.requestPermission() called on first alert if permission === 'default'
- "Clear All Alerts" menu item conditionally shown only when active alerts exist

## 2026-03-05 T7 Complete

### Alert Overlay Pattern
- Alert overlays use klinecharts built-in `horizontalStraightLine` overlay
- Drawn INSIDE chart init useEffect after applyNewData() — destroyed on dispose, must be redrawn
- Adding `alerts` to chart init dep array causes chart to re-init when alerts change (redrawing overlays)
- Triggered alerts are excluded from re-draw (filter by `!a.triggered`)
- Overlay id: `alert-${alert.id}` for potential future removal
- `style` field requires `LineType.Dashed` enum (imported from klinecharts), NOT string literal `'dashed'`

### Price Crossing Detection Pattern
- `prevPriceRef = useRef<number | undefined>(undefined)` declared in component body
- Separate useEffect keyed on `[ticker, alerts, externalSymbol, setAlertsAndPersist]`
- Detects CROSSING: `(prev < price && current >= price) || (prev > price && current <= price)`
- On cross: fire `new Notification(...)`, mark alert triggered, call `setAlertsAndPersist`
- `setAlertsAndPersist` updates state + localStorage in one call
- After trigger: chart re-inits (alerts dep change), triggered alerts excluded from overlay redraw

## 2026-03-05 T9 Complete

### Chart Settings Integration Pattern
- chartSettings state lazy-init from readConfig().chartSettings ?? DEFAULT_CHART_SETTINGS
- handleSettingsChange: updates state + saveConfig + chart.setStyles() (live update without re-init)
- chartSettings added to chart init dep array → chart re-inits with new colors/grid/crosshair on change
- Re-hydration effect adds: if (cfg.chartSettings) setChartSettingsRaw(cfg.chartSettings as ChartSettings)
- grid.show and crosshair.show are top-level keys under their respective style objects
