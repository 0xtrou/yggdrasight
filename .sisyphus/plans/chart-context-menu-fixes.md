# Chart Context Menu Fixes

## TL;DR

> **Quick Summary**: Fix context menu checkboxes, broken indicator scaling, remove dead menu items, fix "Remove all indicators".
> 
> **Deliverables**:
> - Visible checkbox squares for "Lock vertical cursor" and "Hide marks on bars"
> - Chart ratio fixed when multiple main indicators are active (remove AVP, constrain sub-pane heights)
> - "Remove all indicators" works with dynamic indicator system
> - Non-functional "Paste" item removed
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - single file, two sequential tasks
> **Critical Path**: Task 1 → Task 2 → F1

---

## Context

### Original Request
User reported checkboxes for "Lock vertical cursor line by time" and "Hide marks on bars" are not visible in the context menu. Screenshot shows no checkbox indicator next to these items.

### Root Cause — Checkboxes
In `MenuItem` component (lines 275-277 of ChartPanel.tsx), the `checked` state renders as:
- Checked: `✓` text in green — works but small
- Unchecked: empty string `''` — **invisible**, no visual indicator at all

The indicator dropdown already has a proper checkbox pattern (filled square with checkmark) that should be reused here.

### Root Cause — Chart Ratio Broken
When multiple main indicators are selected (e.g. MA + BOLL + SAR + AVP), the chart Y-axis stretches from ~0 to the actual price, squishing candles into a tiny band at the top.

**AVP is the culprit**: The AVP (Average Price) indicator calculates `totalTurnover / totalVolume`. Our OHLCV data from `useOHLCV` hook only provides `time, open, high, low, close, volume` — **no `turnover` field**. So AVP always computes to 0, which pulls the Y-axis range down to 0.

**Sub-pane height**: When multiple sub-pane indicators are added, klinecharts divides vertical space equally between all panes, shrinking the candle pane. Sub-panes should be constrained to ~100px height.

The indicator dropdown already has a proper checkbox pattern (filled square with checkmark) that should be reused here.

Additionally:
- "Remove all indicators" (line 1036-1037) is hardcoded to only remove MA and VOL, not dynamic indicators
- "Paste" menu item (line 1025) is non-functional

---

## Work Objectives

### Core Objective
Make context menu checkboxes visible and fix broken menu items.

### Concrete Deliverables
- Visible checkbox squares in context menu for toggle items
- Working "Remove all indicators" with dynamic indicator system
- Cleaner menu without dead items

### Definition of Done
- [ ] Checkbox squares visible for both checked and unchecked states
- [ ] AVP removed from indicator registry (requires turnover data we don't have)
- [ ] Sub-pane indicators created with constrained height (100px)
- [ ] "Remove all indicators" clears `activeIndicators` state to `[]`
- [ ] No "Paste" menu item present
- [ ] Zero TypeScript errors

### Must Have
- Checkbox visual matches the indicator dropdown style (14x14 bordered square, green fill when checked, dark empty when unchecked)
- AVP removed from INDICATOR_CATEGORIES main indicators list
- Sub-pane indicators created with `{ height: 100 }` paneOptions
- "Remove all indicators" resets the `activeIndicators` state

### Must NOT Have (Guardrails)
- Do NOT change the indicator dropdown component
- Do NOT modify chart data loading, signal markers, or persistence system
- Do NOT add new dependencies

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Framework**: none

### QA Policy
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Task 1 — context menu fixes):
└── Task 1: Fix MenuItem checkbox + Remove all indicators + Remove Paste [quick]

Wave 2 (Task 2 — chart ratio fix):
└── Task 2: Remove AVP from registry + constrain sub-pane heights [quick]

Wave FINAL (Verification):
└── Task F1: Visual QA via Playwright [quick]
```

### Dependency Matrix
- **1**: None → F1
- **2**: None → F1 (can run parallel with Task 1)

### Agent Dispatch Summary
- **1**: **2** — T1 → `quick`, T2 → `quick`
- **FINAL**: **1** — F1 → `quick` + `playwright`

---

## TODOs

- [ ] 1. Fix context menu: checkboxes, Remove all indicators, remove Paste

  **What to do**:

  **Fix 1 — MenuItem checkbox (lines 275-277)**:
  Replace the current checkbox rendering in the `MenuItem` component:
  ```
  // CURRENT (line 275-277):
  {checked !== undefined && (
    <span style={{ color: '#00ff88', fontSize: 11, width: 16 }}>{checked ? '✓' : ''}</span>
  )}
  ```
  With a styled checkbox square matching the indicator dropdown pattern:
  ```tsx
  {checked !== undefined && (
    <span style={{
      width: 14,
      height: 14,
      borderRadius: 3,
      border: checked ? '1px solid #00ff88' : '1px solid #555',
      background: checked ? '#00ff88' : 'transparent',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      color: checked ? '#000' : 'transparent',
      flexShrink: 0,
    }}>✓</span>
  )}
  ```

  **Fix 2 — "Remove all indicators" (lines 1033-1040)**:
  Replace the hardcoded MA/VOL removal:
  ```
  // CURRENT:
  onClick={() => {
    chartRef.current?.removeIndicator('candle_pane', 'MA')
    chartRef.current?.removeIndicator('candle_pane', 'VOL')
    setCtxMenu(null)
  }}
  ```
  With dynamic indicator clearing:
  ```tsx
  onClick={() => {
    setActiveIndicators([])
    setCtxMenu(null)
  }}
  ```
  This works because `activeIndicators` is in the chart init effect's dependency array — setting it to `[]` will re-create the chart with no indicators.

  **Fix 3 — Remove "Paste" menu item (line ~1025)**:
  Delete this line entirely:
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
    - No skills needed — pure inline style changes and state wiring
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for implementation, only for QA

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:247-283` — MenuItem component with current broken checkbox
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:826-862` — Indicator dropdown checkbox style to match (14x14 square, border, green fill)

  **API/Type References**:
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:380-386` — `toggleIndicator` and `setActiveIndicators` functions
  - `apps/web/src/components/terminal/panels/ChartPanel.tsx:665` — Chart init effect dependency array includes `activeIndicators`

  **WHY Each Reference Matters**:
  - Lines 247-283: This is the component being fixed — the checkbox rendering at lines 275-277 is the core change
  - Lines 826-862: Copy this exact checkbox pattern for visual consistency
  - Lines 380-386: `setActiveIndicators([])` is used in Fix 2 to clear all indicators
  - Line 665: Confirms chart effect will re-run when `activeIndicators` changes to `[]`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Checkbox visible when unchecked
    Tool: Playwright
    Preconditions: App running at localhost:3000, chart loaded
    Steps:
      1. Right-click on the chart canvas to open context menu
      2. Look at "Lock vertical cursor line by time" row
      3. Assert: a 14x14 square with border `1px solid #555` and transparent background is visible before the label
      4. Look at "Hide marks on bars" row
      5. Assert: same unchecked square visible
    Expected Result: Both toggle items show an empty bordered square checkbox
    Evidence: .sisyphus/evidence/task-1-checkbox-unchecked.png

  Scenario: Checkbox visible when checked
    Tool: Playwright
    Preconditions: Context menu open
    Steps:
      1. Click "Lock vertical cursor line by time" to toggle it on
      2. Right-click chart again to re-open context menu
      3. Assert: "Lock vertical cursor line by time" now shows a green-filled square with ✓
    Expected Result: Checked state shows green (#00ff88) filled 14x14 square with dark checkmark
    Evidence: .sisyphus/evidence/task-1-checkbox-checked.png

  Scenario: Remove all indicators works
    Tool: Playwright
    Preconditions: Chart showing with MA and VOL indicators active
    Steps:
      1. Right-click chart to open context menu
      2. Click "Remove all indicators"
      3. Assert: context menu closes
      4. Assert: chart re-renders without any indicator overlays or sub-panes
      5. Open indicator dropdown — verify no checkboxes are checked
    Expected Result: All indicators removed from chart, activeIndicators state is empty
    Evidence: .sisyphus/evidence/task-1-remove-indicators.png

  Scenario: Paste menu item removed
    Tool: Playwright
    Preconditions: Context menu open
    Steps:
      1. Right-click chart to open context menu
      2. Assert: no "Paste" text exists in the context menu
    Expected Result: "Paste ⌘V" item is not present in menu
    Evidence: .sisyphus/evidence/task-1-no-paste.png
  ```

  **Evidence to Capture:**
  - [ ] task-1-checkbox-unchecked.png
  - [ ] task-1-checkbox-checked.png
  - [ ] task-1-remove-indicators.png
  - [ ] task-1-no-paste.png

  **Commit**: YES
  - Message: `fix(chart): visible checkboxes in context menu, fix remove-all-indicators, remove dead Paste item`
  - Files: `apps/web/src/components/terminal/panels/ChartPanel.tsx`
  - Pre-commit: `pnpm --filter @oculus/web typecheck`

---

## Final Verification Wave

- [ ] F1. **Visual QA** — `quick` + `playwright` skill
  Open the app in browser. Right-click chart. Verify: checkboxes visible for Lock/Hide items (both checked and unchecked states). Verify: no Paste item. Click "Remove all indicators" — verify chart clears. Screenshot all states.
  Output: `Checkboxes [PASS/FAIL] | Remove All [PASS/FAIL] | No Paste [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **1**: `fix(chart): visible checkboxes in context menu, fix remove-all-indicators, remove dead Paste item` — ChartPanel.tsx, `pnpm --filter @oculus/web typecheck`

---

## Success Criteria

### Verification Commands
```bash
pnpm --filter @oculus/web typecheck  # Expected: only pre-existing discovery-job.model.ts error
```

### Final Checklist
- [ ] Checkbox squares visible in both checked/unchecked states
- [ ] "Remove all indicators" clears activeIndicators state
- [ ] No "Paste" menu item
- [ ] Zero new TypeScript errors
