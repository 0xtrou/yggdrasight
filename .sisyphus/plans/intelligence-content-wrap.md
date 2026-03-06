# Intelligence Page: Disable Horizontal Scroll, Wrap Content

## TL;DR

> **Quick Summary**: Fix horizontal overflow in GlobalDiscoveryPanel by adding proper text wrapping and overflow constraints to all content sections.
> 
> **Deliverables**:
> - All text content wraps instead of overflowing horizontally
> - No horizontal scrollbar on the intelligence page
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single file change
> **Critical Path**: Task 1 only

---

## Context

### Original Request
"disable the horizontal scroll, make the content wrapped"

### Root Cause
The `GlobalDiscoveryPanel.tsx` has several areas that can cause horizontal overflow:
1. **Project table grids** use fixed `gridTemplateColumns: '36px 1fr 60px 80px 60px 80px'` — the `1fr` column with long project names (e.g. "Artificial Superintelligence Alliance (ASI, OA, FET, AGIX)") may not truncate/wrap
2. **Emerging trends pills** use `flexWrap: 'wrap'` but each pill contains long text that doesn't break
3. **Market Direction / Executive Summary / Cross-Pillar Insights** text blocks have no `word-wrap: break-word` or `overflow-wrap`
4. **The outer container** at line 309 has no `overflow-x: hidden`
5. **The scrollable body** at line 448 only sets `overflowY: auto` without constraining horizontal overflow

---

## Work Objectives

### Core Objective
Prevent horizontal scrolling on the intelligence page by making all content wrap properly.

### Must Have
- No horizontal scrollbar anywhere in the GlobalDiscoveryPanel
- Long project names in tables truncate with ellipsis (not wrap — tables should stay aligned)
- Long text paragraphs (market direction, executive summary, cross-pillar insights) wrap naturally
- Emerging trend pills wrap their text content

### Must NOT Have
- Do NOT change the layout structure (keep vertical stacking as-is)
- Do NOT change colors, fonts, or spacing
- Do NOT touch any other files

---

## TODOs

- [ ] 1. Fix horizontal overflow in GlobalDiscoveryPanel

  **What to do**:
  
  In `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx`, apply these CSS fixes:

  **A. Outer container (line ~309, the root `<div>`):**
  - Add `overflow: 'hidden'` to prevent any horizontal bleed

  **B. Scrollable body container (line ~448, `maxHeight: '500px'`):**
  - Add `overflowX: 'hidden'` alongside existing `overflowY: 'auto'`

  **C. Project table — ProjectTable component, the grid row (line ~153-169):**
  - On the project name `<span>` (line ~172), add: `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'`, `minWidth: 0`
  - On each grid row div, add `minWidth: 0` to prevent grid blowout
  
  **D. Project table — grid header (line ~124-146):**
  - Add `minWidth: 0` to the header grid container

  **E. Text content blocks (Market Direction ~616-626, Executive Summary ~629-638, Cross-Pillar Insights ~665-674):**
  - Add `wordBreak: 'break-word'`, `overflowWrap: 'break-word'` to each text `<div>` that renders the long paragraph content (the inner `<div>` with `marginTop: '2px'`)

  **F. Emerging trends container (line ~647-648, the flex container with trend pills):**
  - Each trend `<span>` pill (line ~649-657): add `wordBreak: 'break-word'`, `overflowWrap: 'break-word'` so long trend text wraps within the pill

  **G. Category breakdown badges (CategoryBreakdown component, line ~243-266):**
  - Already has `flexWrap: 'wrap'` — no change needed

  **H. Expanded project detail (line ~180-216):**
  - The description/reason divs: add `wordBreak: 'break-word'`, `overflowWrap: 'break-word'`

  **I. History table grid (line ~726-741, gridTemplateColumns: '50px 1fr 60px 60px 60px 80px'):**
  - The summary column already has `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'` — verify this is sufficient, add `minWidth: 0` if missing

  **Must NOT do**:
  - Do not change layout structure
  - Do not change any colors or spacing

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx:309-312` — Root container div that needs `overflow: 'hidden'`
  - `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx:448-451` — Scrollable body that needs `overflowX: 'hidden'`
  - `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx:124-146` — Project table header grid
  - `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx:153-177` — Project table row grid + name span
  - `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx:616-674` — Text content blocks (market direction, executive summary, cross-pillar)
  - `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx:647-658` — Emerging trends pills
  - `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx:180-216` — Expanded project detail section
  - `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx:726-741` — History table grid

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No horizontal scrollbar on intelligence page
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:3000/intelligence
      2. Wait 3s for data to load
      3. Evaluate JS: document.querySelector('[style*="GLOBAL INTELLIGENCE"]')?.closest('div')?.scrollWidth <= document.querySelector('[style*="GLOBAL INTELLIGENCE"]')?.closest('div')?.clientWidth
      4. Take screenshot
    Expected Result: scrollWidth <= clientWidth (no horizontal overflow)
    Evidence: .sisyphus/evidence/task-1-no-horizontal-scroll.png

  Scenario: Long project names truncate with ellipsis
    Tool: Playwright
    Steps:
      1. On intelligence page, find "Artificial Superintelligence Alliance" row
      2. Verify it does not push other columns off-screen
      3. Take screenshot of the project table area
    Expected Result: Name truncates, all 6 grid columns visible within viewport
    Evidence: .sisyphus/evidence/task-1-name-truncation.png

  Scenario: Long text blocks wrap properly
    Tool: Playwright
    Steps:
      1. Scroll to MARKET DIRECTION section
      2. Verify text wraps within its container (no horizontal overflow)
      3. Scroll to EXECUTIVE SUMMARY, verify same
    Expected Result: All paragraph text wraps within container bounds
    Evidence: .sisyphus/evidence/task-1-text-wrap.png
  ```

  **Commit**: YES
  - Message: `fix(intelligence): disable horizontal scroll, wrap all content in GlobalDiscoveryPanel`
  - Files: `apps/web/src/components/terminal/GlobalDiscoveryPanel.tsx`

---

## Commit Strategy

- **1**: `fix(intelligence): disable horizontal scroll, wrap all content in GlobalDiscoveryPanel` — GlobalDiscoveryPanel.tsx

---

## Success Criteria

### Final Checklist
- [ ] No horizontal scrollbar on `/intelligence` page
- [ ] Long project names truncate with ellipsis in tables
- [ ] All text paragraphs wrap naturally
- [ ] Emerging trend pills wrap text content
- [ ] No layout or styling regressions
