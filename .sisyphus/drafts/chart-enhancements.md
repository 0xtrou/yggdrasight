# Draft: Chart Enhancements (Comprehensive)

## Requirements (confirmed)
- **Context menu fixes**: Visible checkbox squares for Lock/Hide, fix "Remove all indicators" to use setActiveIndicators([]), remove dead "Paste" item
- **Chart ratio fix**: Remove AVP from indicator registry (no turnover data → always 0), constrain sub-pane heights to ~100px
- **Real-time chart data**: Live candle updates streaming into the chart, not just static snapshot
- **Price alerts with browser notifications**: Set alert price → persist → check live price → fire notification → draw line on chart
- **Chart settings panel**: Appearance config (candle colors, grid, crosshair) — persist per-asset

## Technical Decisions
- **Streaming approach**: Use SSE (EventSource) pattern matching existing usePriceTicker, NOT raw WebSocket — server-side route proxies Binance WS kline stream to SSE
- **Alert overlay**: Use klinecharts `createOverlay` with `horizontalStraightLine` name, `lock: true`, programmatic `points: [{ value: alertPrice }]`
- **Settings storage**: Extend existing per-asset localStorage config with `chartStyles` field
- **Settings application**: `chart.setStyles(DeepPartial<Styles>)` — accepts partial config, applies immediately
- **Notification API**: Request permission on first alert creation, fire `new Notification(...)` when price crosses alert

## Research Findings

### Real-time Data Architecture
- **Current**: `useOHLCV` fetches static candles from `/api/prices/ohlcv` (Binance REST klines)
- **Current stream**: `/api/prices/stream/route.ts` connects to `wss://stream.binance.com:9443/stream?streams=...@ticker` via SSE
- **Plan**: Create `/api/prices/kline-stream/route.ts` connecting to `{symbol}@kline_{interval}` Binance WS stream
- **Client**: New `useKlineStream` hook using EventSource, returns latest candle update
- **Chart integration**: Call `chartRef.current?.updateData(klineData)` — updates last candle if timestamp matches, appends if new

### klinecharts Key APIs
- `chart.updateData(kLineData)` — update/append single candle
- `chart.applyNewData(kLineData[])` — replace all data (current usage)
- `chart.applyMoreData(kLineData[])` — prepend historical data
- `chart.setStyles(DeepPartial<Styles>)` — partial style update
- `chart.createOverlay(OverlayCreate)` — add drawing overlay
- `chart.removeOverlay(id)` — remove specific overlay

### klinecharts Styles Hierarchy
- `Styles.candle.bar` — up/down/noChange colors for body, border, wick
- `Styles.candle.type` — candle_solid, candle_stroke, ohlc, area
- `Styles.grid.show` + horizontal/vertical colors
- `Styles.crosshair.show` + horizontal/vertical line colors and text
- `Styles.xAxis/yAxis` — axis line, tick line, tick text colors/sizes

### Overlay API for Alerts
- `createOverlay({ name: 'horizontalStraightLine', points: [{ value: price }], lock: true, styles: { line: { color: '#ffaa00' } } })`
- Returns overlay ID for later removal
- `removeOverlay(id)` to clear specific alert line

### Price Ticker for Alert Checking
- `usePriceTicker([symbol])` → `{ tickers: { BTCUSDT: { price, change24h, ... } }, connected }`
- Access: `tickers[`${externalSymbol}USDT`]?.price`

### Context Menu
- "Create Alert" already exists as placeholder at line 1015-1017 in ChartPanel.tsx
- `ctxMenu.price` has the Y-axis price where user right-clicked

### localStorage Pattern
- Key: `oculus-chart-config:${externalSymbol}`
- Fields: timeframe, lockedCursor, hideMarks, indicators, barSpace, offsetRightDistance
- Will add: alerts (array of { price, id, createdAt }), chartStyles (DeepPartial<Styles>)

## Open Questions
- None — all requirements clear from previous discussion

## Scope Boundaries
- INCLUDE: Context menu fixes, AVP removal, sub-pane heights, real-time candle streaming, price alerts with notifications, chart settings panel
- EXCLUDE: Historical data loading on scroll-left (applyMoreData), custom drawing tools, alert sounds, multiple alert types (only price cross)
