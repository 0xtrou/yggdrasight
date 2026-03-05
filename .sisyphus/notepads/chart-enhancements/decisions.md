# Chart Enhancements — Decisions

## 2026-03-05 Session Start

### Execution Plan
- Wave 1 (T1 + T2): Parallel — context menu fixes + chart ratio fix
- Wave 2 (T3 → T4 → T5): Sequential — SSE route, then client hook, then chart integration
- Wave 3 (T6+T8 parallel, then T7, then T9): Feature work
- Wave FINAL (F1-F4): Parallel verification

### Key Architectural Decisions
1. Real-time stream OUTSIDE chart init useEffect — prevents SSE disconnect on chart re-render
2. Alert overlays re-drawn INSIDE chart init useEffect — overlays destroyed on chart dispose
3. Settings stored in per-asset localStorage config (same readConfig/saveConfig system)
4. Alerts stored in SEPARATE localStorage key: `oculus-chart-alerts:{symbol}`
5. One-shot alerts: triggered=true → auto-dismiss (removed from active alerts)
6. Max 10 alerts per asset
7. No React Context — local state + localStorage only
