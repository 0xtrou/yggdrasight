# Chart Enhancements — Issues & Gotchas

## 2026-03-05 Session Start

### Known Gotchas
1. Chart re-creates (dispose + re-init) on EVERY state change in dependency array — updateData effect MUST be separate
2. Alert overlays destroyed on chart dispose — MUST re-draw inside chart init effect after applyNewData()
3. Chart settings must be read from localStorage in init effect — hardcoded values would override settings
4. AVP indicator uses turnover data we don't have → always renders as 0 → stretches Y-axis
5. Sub-pane indicators (MACD, RSI, KDJ, etc.) have no height constraint → squish candle pane

### Pre-commit Command
`pnpm --filter @oculus/web typecheck` — must pass (with only pre-existing errors)
