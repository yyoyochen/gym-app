# Lift Detail Charts, History Cells and Dot Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Step-line charts with a fixed y-axis rule and a ceiling lane for targets, equal-size digit-aligned set cells in the lift History, and no middle-dot separators anywhere in the app.

**Architecture:** All chart logic (scale, ticks, step runs, targets, ramp inference, cell weight text) is pure TypeScript with unit tests; `LiftChart.tsx` and a new `SetCells.tsx` only paint what those functions return. The dot sweep converts three set-list builders to `string[]`, applies a fixed replacement table to every remaining site, then locks it with a `dot` rule in `tools/check-styles.mjs`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (`npm test` from repo root), hand-drawn SVG, plain CSS with tokens.

**Spec:** `docs/superpowers/specs/2026-11-22-lift-detail-charts-history-design.md` (approved 2026-11-22). Mockup (outside the repo, real numbers, never commit it): `gymbro/mockups/lift-detail-ideas.html`, served at http://127.0.0.1:5192/lift-detail-ideas.html.

All paths below are relative to the repo root. Run commands from there.

## Global Constraints

- Local only: **never `git push`**, never open a PR, never merge to `main`. Branch is `tab-jobs`.
- Commit messages: no `Co-Authored-By`, no `Claude-Session`, no "Generated with" lines, and no names of private local files (say "update .gitignore" style, nothing specific). After each commit run `git log --format=%B -1` and confirm none of those lines appear.
- The pre-commit hook prints "Private-data check passed"; never bypass it. No screenshots, mockups or real training numbers inside the repo.
- Styles use tokens only. `node tools/check-styles.mjs web/src` must stay at **0 violations** and **at most 6** `ds-allow` lines (5 are used today, so add at most one, preferably none). No new colours; chart colours come from `--ink`, `--accent`, `--mid`, `--rule`, `--paper`.
- Y-axis rule constants, exact: ceiling = **120%** of the best value in view (`CEILING = 1.2`), floor = **90%** of the lowest (`FLOOR = 0.9`), weekly volume floor = 0, plot height **150 px** (`PLOT_PX = 150`), a target is drawn in place only if it is at least **22 px** below the ceiling (`LANE_ROOM_PX = 22`), a hold longer than **42 days** is dotted (`HOLD_DAYS = 42`).
- Stored session names are never migrated. Existing names containing the middle dot keep working.
- A string that is only `'·'` (placeholder or empty-cell glyph) is not a separator and stays.
- Verification commands: unit tests `npm test`, types `npm run typecheck`, full gate `npm run build` (tsc, vite, bundle check, style check).

## Review Focus

Most likely first. Each has a test in the named task.

1. A target the lifter has already passed (`value <= current`) must read "reached", not "+0" or a negative gap. (Task 1)
2. A target below the chart floor must be dropped, not drawn off the bottom. (Task 1)
3. Degenerate series (empty, one value, all equal, all-zero volume) must not produce `NaN` or a zero-height scale. (Task 1)
4. Fractional weights (82.5, 102.5) must keep hundreds, tens, ones and the decimal point aligned, and bodyweight lifts (BW, +10) must fit the weight slot. (Task 4)
5. Stored session names with the legacy dot, with the new colon, and with long keys ("Upper 1") must all produce the same short and title text. (Task 7)

## File Structure

| File | Responsibility |
|---|---|
| `web/src/ui/progress/chartModel.ts` (new) | Pure: `ticksWithin`, `chartScale`, `stepRuns`, `fillWeeks`, `gapText` |
| `web/src/ui/progress/chartTargets.ts` (new) | Pure: which targets a lift chart gets |
| `web/src/ui/progress/LiftChart.tsx` | Paints step line / bars, ceiling band, lane, targets |
| `web/src/ui/progress/setCells.ts` (new) | Pure: `classifySets`, `cellWeight`, `anyDecimals` |
| `web/src/ui/progress/SetCells.tsx` (new) | Paints the equal-size cells |
| `web/src/ui/kit/Parts.tsx` (new) | `<Parts items>`: facts as spans with a gap, no glyph |
| `web/src/styles/track.css`, `kit.css` | New classes, tokens only |
| `tools/check-styles.mjs` (+ `.d.mts`) | New `dot` rule |
| `docs/DESIGN.md` | Chart and no-dot rules |

---

### Task 1: Chart model (scale, ticks, step runs, weeks, gap text)

**Files:**
- Create: `web/src/ui/progress/chartModel.ts`
- Test: `web/src/ui/progress/chartModel.test.ts`

**Interfaces:**
- Produces:
  - `export const CEILING = 1.2, FLOOR = 0.9, PLOT_PX = 150, LANE_ROOM_PX = 22, HOLD_DAYS = 42`
  - `export interface ChartTarget { name: string; value: number }`
  - `export interface Scale { lo: number; hi: number; ticks: number[]; inRange: ChartTarget[]; pinned: ChartTarget[] }`
  - `export function ticksWithin(lo: number, hi: number): number[]`
  - `export function chartScale(i: { values: number[]; zeroBased?: boolean; targets: ChartTarget[] }): Scale`
  - `export interface Run { from: ISODate; to: ISODate; value: number; nextValue: number; dotted: boolean }`
  - `export function stepRuns(points: { date: ISODate; value: number }[], holdDays?: number): Run[]`
  - `export function fillWeeks(points: { date: ISODate; value: number }[]): { date: ISODate; value: number }[]`
  - `export function gapText(target: number, current: number): string`
- Consumes: `daysBetween`, `addDays` from `../../app/dates` / `../../engine` (as used in `stats.ts`), `mondayOf` from `./stats`.

- [ ] **Step 1: Write the failing tests** in `chartModel.test.ts`:
  - `ticksWithin(114.03, 187.2)` equals `[120, 140, 160, 180]`; `ticksWithin(0, 4668)` equals `[0, 1000, 2000, 3000, 4000]`; every result has 3 to 6 values (or 1 value when `lo >= hi`) and all lie inside `[lo, hi]`.
  - `chartScale` e1RM case: `values [126.7,126.7,140,144.7,151.7,154,151.7,156]`, `targets [{name:'Your target',value:165},{name:'Advanced',value:191.5}]` gives `hi` close to 187.2 (1 decimal), `lo` close to 114.03, `inRange` names `['Your target']`, `pinned` names `['Advanced']`.
  - A target at 180 (inside the 22 px room) is pinned; a target exactly at `hi` is pinned; a target of 110 (below `lo`) appears in neither list (Review Focus 2).
  - Two pinned targets (200 then 190) come back sorted ascending: `['B', 'A']` when B is 190.
  - Volume: `values [3200,2220,3850,3450,2640,3890,3155]`, `zeroBased: true`, no targets gives `lo` 0, `hi` close to 4668, `ticks` `[0,1000,2000,3000,4000]`.
  - Degenerate (Review Focus 3): `values []` gives `ticks []`, `inRange []`, `pinned []`; `values [100,100]` gives `hi > lo`; `values [0,0]` with `zeroBased` gives `hi > 0`. No result contains `NaN`.
  - `stepRuns`: the three-point series `2026-04-11 126.7`, `2026-09-20 126.7`, `2026-09-25 140` gives two runs; the first has `dotted: true`, the second `dotted: false`, `nextValue` 140. Boundary: `2026-01-01` to `2026-02-12` (42 days) is not dotted, to `2026-02-13` (43 days) is dotted. One point gives `[]`.
  - `fillWeeks` on `2026-09-14: 3200` and `2026-10-12: 3850` returns five points with dates `09-14, 09-21, 09-28, 10-05, 10-12` and values `3200, 0, 0, 0, 3850`.
  - `gapText(191.5, 156)` is `'+35.5'`, `gapText(165, 156)` is `'+9'`, `gapText(156, 156)` and `gapText(140, 156)` are `'reached'` (Review Focus 1).

- [ ] **Step 2: Run** `npx vitest run --root web web/src/ui/progress/chartModel.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement the signatures above in `chartModel.ts`.**
  - `hi = max(values) * CEILING`, `lo = zeroBased ? 0 : min(values) * FLOOR`; if `hi <= lo` set `hi = lo + 1`.
  - `ticksWithin`: try steps `m * 10^p` for `p` from -2 up and `m` in `[1, 2, 5]` (ascending overall); return the first whose ticks inside `[lo, hi]` number 3 to 6; round each tick to 3 decimals.
  - `room = (hi - lo) * LANE_ROOM_PX / PLOT_PX`; a target is `pinned` if `value > hi - room`, `inRange` if `lo <= value <= hi - room`, dropped if `value < lo`. `pinned` sorted ascending by value.
  - `stepRuns`: one run per consecutive pair; `dotted` when `daysBetween(from, to) > holdDays`.
  - `fillWeeks`: insert `{date: mondayOf-step, value: 0}` for each missing Monday between first and last (weeks are 7 days apart).
  - `gapText`: `'reached'` when `target <= current`, else `+` followed by the difference rounded to 1 decimal with no trailing `.0`.

- [ ] **Step 4: Run the same test file.** Expected: PASS. Then `npm test`; expected: all green.

- [ ] **Step 5: Commit**
```bash
git add web/src/ui/progress/chartModel.ts web/src/ui/progress/chartModel.test.ts
git commit -m "feat: chart scale, step runs and target placement as pure functions"
git log --format=%B -1
```

---

### Task 2: Which targets a lift chart gets

**Files:**
- Create: `web/src/ui/progress/chartTargets.ts`
- Test: `web/src/ui/progress/chartTargets.test.ts`

**Interfaces:**
- Consumes: `ChartTarget` (Task 1); `NextStep` from `../../benchmarks/liftRating` and `LEVEL_LABEL` from `../../benchmarks/gymStandards`; `GoalTarget` from `../../domain/types`.
- Produces: `export function liftChartTargets(i: { metric: 'e1rm' | 'top' | 'volume'; next: NextStep | null | undefined; loadType?: string; goals: GoalTarget[]; subject: string }): ChartTarget[]` (sorted ascending by value).

- [ ] **Step 1: Write the failing tests:**
  - e1rm, `next {level:'advanced', value:191.5, unit:'kg', added:false}`, one goal `{subject:'conventional_deadlift', value:165, type:'reach', deadline:'2027-03-01', id:'g'}` and `subject: 'conventional_deadlift'` gives `[{name:'Your target', value:165}, {name:'Advanced', value:191.5}]` (name comes from the level label map).
  - Next step is omitted when `added: true`, when `unit` is `'reps'` or `'seconds'`, or when `loadType === 'dumbbell_each'`; the goal still shows.
  - `metric: 'top'` and `metric: 'volume'` give `[]` even with next and goals.
  - A goal whose `subject` differs is ignored; with two goals for the subject only the one with the earliest `deadline` is used.
  - No next and no goal gives `[]`.

- [ ] **Step 2: Run the file.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `liftChartTargets`.**
- [ ] **Step 4: Run the file, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: pick the next-level and personal targets for a lift chart` (same attribution check as Task 1).

---

### Task 3: Step-line LiftChart, ceiling lane, and its wiring in the lift page

**Files:**
- Modify: `web/src/ui/progress/LiftChart.tsx`, `web/src/screens/LiftDetail.tsx`, `web/src/styles/track.css`

**Interfaces:**
- Consumes: Task 1 functions and constants, Task 2 `liftChartTargets`.
- Produces: `LiftChart({ points, label, kind?, targets?, empty? })` where `kind: 'step' | 'bars'` (default `'step'`) and `targets: ChartTarget[]` (default `[]`); `LinePoint` unchanged.

Layout (same as the approved mockup, 342 px wide viewBox, plot `PLOT_PX` tall, left 34, right 6):
- Vertical stack from the top: pinned-target rows (13 px each, only when there are pinned targets), the **ceiling band**, then the plot. Total height is computed, not fixed.
- Ceiling band: two text rows of the glyph font (`▒` then `░`, denser one nearest the plot) using the `--font-glyph` family, spanning the plot width with `textLength` and `lengthAdjust="spacing"`.
- Pinned target row: right-aligned label `"<name> <value> kg   <gapText>"` in the micro caps role, accent colour, with a small solid up-arrow polygon at the right end. Several rows stack, nearest target at the bottom.
- In-range target: a dashed accent line at its real height, label `"<name> <value> kg"` above-left, `gapText` above-right.
- Step line (`kind: 'step'`): for each `Run` a horizontal path from its date to the next at its value, then a vertical path; `dotted` runs use a dasharray (`2 3`). PR squares at PR points and the hollow accent square at the last point stay as today.
- Bars (`kind: 'bars'`): points pass through `fillWeeks`; one solid ink bar per week, no fill pattern, a 4 px by 2 px ink tick for a 0-value week; no targets, no lane.
- Y scale from `chartScale({ values, zeroBased: kind === 'bars', targets })`; ticks from `scale.ticks`; `aria-label` is `label` plus a sentence naming each pinned target and its gap.

- [ ] **Step 1: Rewrite `LiftChart.tsx`** to the layout above. Keep `figure.tk-chart`, `tk-grid`, `tk-base`, `tk-tick`, `tk-line`, `tk-pr`, `tk-last`. Add classes `tk-band`, `tk-hold` (dasharray), `tk-target` (dashed accent line), `tk-target-tx` (`font: var(--text-micro)`, `letter-spacing: var(--track-micro)`, `text-transform: uppercase`, `font-weight: var(--font-strong)`, accent fill), `tk-arrow` (accent fill), `tk-bar` (ink fill, crisp edges) in `track.css`. Token-only values.
- [ ] **Step 2: Wire `LiftDetail.tsx`.** `standing` already holds `next`/`loadType`; `profile?.targets ?? []` holds goals. Pass `targets={liftChartTargets({ metric, next: standing?.kind === 'rated' ? standing.next : null, loadType: standing?.loadType, goals: profile?.targets ?? [], subject: ex.id })}` and `kind={metric === 'volume' ? 'bars' : 'step'}`. Update the legend: swatch text unchanged, plus `<i className="tk-sw hold" />no sessions` shown only when `stepRuns(points).some(r => r.dotted)` and metric is not volume (add `.tk-sw.hold` in `track.css`, a dotted `--hair`-style swatch).
- [ ] **Step 3: Gate.** `npm run typecheck && npm test && npm run build`. Expected: all pass, `check-styles: 0 violations`.
- [ ] **Step 4: Browser check.** Build the private preview with `~/.gymbro-preview/build-s1.sh`, open the live app (port 5193), clear the service worker, seed with `import('./__private__/seed.js')`, open the Conventional Deadlift page at 390 px. Confirm: step line with dotted long hold, ceiling 120% (no line touches the ceiling), Advanced pinned in the lane with `+35.5`, a personal target (add one in Profile if none) drawn in place, Weekly vol shows bars with no lane, Top set has no level line, light and dark both readable, no console errors. Compare with http://127.0.0.1:5192/lift-detail-ideas.html. Keep any screenshot outside the repo (`~/.gymbro-preview`).
- [ ] **Step 5: Commit** `feat: step-line lift chart with ceiling lane and target markers`.

---

### Task 4: Set classification and cell weight text

**Files:**
- Create: `web/src/ui/progress/setCells.ts`
- Test: `web/src/ui/progress/setCells.test.ts`

**Interfaces:**
- Produces:
  - `export type CellRole = 'top' | 'work' | 'ramp'`
  - `export function classifySets(sets: { weight: number; kind: string }[]): CellRole[]` (same length and order)
  - `export function cellWeight(weight: number, bodyweightFactor: number): { int: string; dec: string }`
  - `export function anyDecimals(sets: { weight: number }[]): boolean`

- [ ] **Step 1: Write the failing tests:**
  - `classifySets` on weights `[60,80,100,120,130,100]` (all `kind 'working'`) gives `['ramp','ramp','ramp','work','top','work']`; `[100]` gives `['top']`; `[100,100,100]` gives `['top','work','work']`; `[100,120,120]` gives `['work','top','work']` (100 is not below 96); `[80,100]` gives `['work','top']` (80 is not below 80% of 100); `[0,0]` gives `['top','work']`; a set with `kind: 'warmup'` is always `'ramp'` (`[20 warmup, 100]` gives `['ramp','top']`). The top is the first set at the maximum weight.
  - `cellWeight(100, 0)` is `{int:'100', dec:''}`; `cellWeight(82.5, 0)` is `{int:'82', dec:'.5'}`; `cellWeight(102.5, 0)` is `{int:'102', dec:'.5'}`; `cellWeight(0, 1)` is `{int:'BW', dec:''}`; `cellWeight(10, 1)` is `{int:'+10', dec:''}`; `cellWeight(7.5, 1)` is `{int:'+7', dec:'.5'}`.
  - `anyDecimals([{weight:100},{weight:82.5}])` is true; `[{weight:100}]` is false.
- [ ] **Step 2: Run the file.** Expected: FAIL.
- [ ] **Step 3: Implement.** Ramp rule: a non-warmup set is `'ramp'` when it comes before the top set and `weight < 0.8 * topWeight`. Use `kg()` from `../../app/coach` for the string form of the weight, then split on `.`.
- [ ] **Step 4: Run the file, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: ramp inference and cell weight text for the lift history`.

---

### Task 5: Equal-size set cells in the lift History

**Files:**
- Create: `web/src/ui/progress/SetCells.tsx`
- Modify: `web/src/screens/LiftDetail.tsx`, `web/src/styles/track.css`

**Interfaces:**
- Consumes: Task 4 functions.
- Produces: `SetCells({ sets, bodyweightFactor, decimals }: { sets: SetEntry[]; bodyweightFactor: number; decimals: boolean })`.

Design (spec "History cells", mockup "Cells"):
- One `<span class="tk-cell {top|ramp|work}">` per set holding three or four slot elements: integer weight (3 `ch`, right-aligned), optional decimal slot (2 `ch`, left-aligned, present only when `decimals` is true), `×` (1 `ch`, muted), reps (2 `ch`, right-aligned). Slots use the `mono` role font so `ch` is the mono advance.
- The list container is `display: grid; grid-template-columns: repeat(auto-fill, minmax(<cell width>, 1fr))` so every cell in a list is the same size and the list wraps (4 per row without decimals, fewer with). `--cell-w` is a custom property of the container set from `decimals` (6 `ch` plus padding, or 8 `ch` plus padding). Cells center their slots.
- Top: filled ink with paper text. Work: `--rule-w` solid ink outline. Ramp: `--rule-w` dotted outline in `--mid`, text `--mid`. All three have the same border width so heights are equal. A failed set draws its reps with `text-decoration: line-through` and the cell gets an `aria-label` ending "failed".
- The History row for the lift page changes its columns to `8ch 1fr 9px`, session name on the second date line truncates with an ellipsis.
- Under the list, a `Legend` (kit) with three small sample cells: Top, Work, Ramp.
- `LiftDetail` removes its local `Parts` helper and `setsLine` import; each row renders `<SetCells sets={d.sets} bodyweightFactor={ex.bodyweightFactor} decimals={anyDecimals(visibleSets)} />` where `visibleSets` are the sets of the 30 rows shown.

- [ ] **Step 1: Implement** the component, CSS (tokens only; `ch` widths and `grid-template-columns` are not style-check properties) and the LiftDetail edit.
- [ ] **Step 2: Gate.** `npm run typecheck && npm test && npm run build`. Expected: pass, 0 violations, no new `ds-allow`.
- [ ] **Step 3: Browser check at 390 px** on the seeded deadlift page. Using the page console, confirm: all `.tk-cell` elements in one list have identical width and height; for each of the weight, decimal and reps slots the right edge (or left edge for decimals) takes the same value in every row of the same column; `document.documentElement.scrollWidth <= 390`; the 7-set day wraps without clipping the chevron; ramp, work and top styles match the mockup; light and dark. Test a decimal lift (for example a 2.5 kg plate lift in the seed) and a bodyweight lift page.
- [ ] **Step 4: Commit** `feat: equal-size aligned set cells in the lift history`.

---

### Task 6: Parts component and the three set-list builders

**Files:**
- Create: `web/src/ui/kit/Parts.tsx`
- Modify: `web/src/ui/kit/index.ts`, `web/src/styles/kit.css`, `web/src/ui/progress/stats.ts`, `web/src/app/coach.ts`, `web/src/engine/remind.ts`, `web/src/screens/SessionDetail.tsx`, `web/src/screens/Review.tsx`, `web/src/screens/Today.tsx`, and every file `npm run typecheck` then reports
- Test: update `web/src/ui/progress/stats.test.ts`, `web/src/app/coach.test.ts`, `web/src/engine/remind.test.ts`

**Interfaces:**
- Produces:
  - `export function Parts({ items, className }: { items: readonly string[]; className?: string }): JSX.Element` rendering `<span class="parts">` of `<span class="part">`, one per item, no separator glyph.
  - `loadParts(sets, load?): string[]` replaces `loadLine` in `stats.ts` (returns `[]` when there are no working sets).
  - `setsParts(sets: SetEntry[], scale: EffortScale): string[]` replaces `setsLine` in `coach.ts` (returns `[]` when none).
  - `lastTimeParts(sets: SetEntry[]): string[]` replaces `lastTimeLine` in `engine/remind.ts` (returns `[]` when none); `SlotPlan.lastTime` becomes `string[]`.
- CSS: `.parts { display: flex; flex-wrap: wrap; column-gap: var(--space-3); row-gap: var(--space-half); }` and `.part { white-space: nowrap; }` in `kit.css`; delete `.tk-part` from `track.css`.

- [ ] **Step 1: Update the three existing test files first (RED).** New expectations: `loadParts([w(20,5,'warmup'), w(100,2,'top'), w(80,8), w(80,8), w(80,7,'working',true)])` equals `['100 × 2', '80 × 8, 8, 7✕']`; `loadParts([w(0,10), w(10,6)], x => (x === 0 ? 'BW' : 'BW+' + x))` equals `['BW × 10', 'BW+10 × 6']`; `loadParts([])` equals `[]`; `setsParts(sets, 'rir')` equals `['105 × 2 @ 2 RIR', '87.5 × 8, 7✕']` and with `'rpe'` equals `['105 × 2 @ RPE 8', '87.5 × 8, 7✕']`; `lastTimeParts([set(100,1,{kind:'top'}), set(82.5,8), set(82.5,8)])` equals `['100 × 1', '82.5 × 8, 8']`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (names missing).
- [ ] **Step 3: Implement the builders and `Parts`.** Rename in place, keep the logic, drop `.join(' · ')` and the `last time:` prefix. In `SessionDetail.tsx` `DoneLine` renders `Nothing logged` for `[]`, otherwise `<Parts items={...} className="tk-led-r">`. In `Review.tsx` both `led-r` lines use `<Parts>` (the swapped-name prefix stays as its own span). In `Today.tsx` `lastTop(parts: string[])` reduces over the array (no split).
- [ ] **Step 4: Gate.** `npm run typecheck && npm test && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `refactor: set lists are arrays of parts, rendered with a gap instead of a dot`.

---

### Task 7: Session names accept colon and legacy dot; new templates use the colon

**Files:**
- Modify: `web/src/ui/session/text.tsx`, `web/src/domain/templates.ts`
- Test: add `web/src/ui/session/text.test.ts` (or extend the existing text test if one exists)

**Interfaces:**
- Produces: `sessionNames(name: string): { short: string; title: string }` unchanged signature.

- [ ] **Step 1: Write the failing tests** (Review Focus 5): `sessionNames('A: Squat + Bench')` is `{short:'Session A', title:'Session A, Squat + Bench'}`; the legacy name `'A · Squat + Bench'` gives the identical result; `sessionNames('U1: Heavy bench')` gives `{short:'Session U1', title:'Session U1, Heavy bench'}`; the long key `'Upper 1: Heavy bench'` gives `{short:'Upper 1', title:'Upper 1: Heavy bench'}`, and its legacy form `'Upper 1 · Heavy bench'` gives `{short:'Upper 1', title:'Upper 1 · Heavy bench'}` (unchanged from today); `'Full body'` passes through as short and title.
- [ ] **Step 2: Run the file.** Expected: FAIL on the colon cases.
- [ ] **Step 3: Implement.** Regex accepts `^(\S{1,3})(?: · |: )(.+)$`; the fallback `short` splits on the legacy dot or the first colon. Write the legacy dot as the escape `·` (a named constant) so no literal separator remains in the file. In `templates.ts` change the 9 session names to the colon form (`'A: Squat + Bench'`, `'Upper 1: Heavy bench'`, ...) and the template `shape` string `'A: squat + bench · B: deadlift + OHP · C: accessories'` to use `; ` between sessions. Update any test or fixture that asserts these names.
- [ ] **Step 4: Gate.** `npm run typecheck && npm test`. Expected: pass.
- [ ] **Step 5: Commit** `feat: session names use a colon, legacy names still parse`.

---

### Task 8: Dot sweep, group A (settings and profile side)

**Files (modify):** `web/src/screens/Profile.tsx`, `Settings.tsx`, `Onboarding.tsx`, `ProgramEditor.tsx`, `web/src/app/parts/GoalParts.tsx`, `RestorePanel.tsx`, `ImportNotionPanel.tsx`, `TemplatePicker.tsx`, `web/src/dev/KitGallery.tsx`, and tests that assert the changed strings.

**Replacement table (apply to every non-comment dot in these files, and in Task 9):**

| Form | Replace with | Example |
|---|---|---|
| Field label plus unit or qualifier | Parentheses | `Height · cm` becomes `Height (cm)`; `Since · optional` becomes `Since (optional)`; `Increment · kg · blank = exercise default` becomes `Increment (kg, blank = exercise default)`; `Alias file · optional .json` becomes `Alias file (optional, .json)` |
| File or format on a button | Parentheses | `Export backup · JSON` becomes `Export backup (JSON)` |
| Title or button followed by a name or date | Colon | `Edit set · Deadlift` becomes `Edit set: Deadlift`; `Start logging · 12 Nov` becomes `Start logging: 12 Nov` |
| Two things named together (column header, action) | `and` or comma | `Level · pace` becomes `Level and pace`; `Adjust weight · reps · effort` becomes `Adjust weight, reps, effort` |
| Facts in a string prop (meta, label, valueText, title, aria-label, a returned sentence) | `, ` | `12 sessions · 3 weeks at target` becomes `12 sessions, 3 weeks at target`; `Intermediate · 54th percentile of gym-goers` becomes `Intermediate, 54th percentile of gym-goers` |
| Facts in JSX text you control, two or more | `<Parts items={[...]} />` | `Pain · left shoulder · 2` becomes `<Parts items={['Pain', 'left shoulder', '2']} />` |
| Clauses that already contain commas or colons | `; ` | `A: squat + bench; B: deadlift + OHP` |
| Placeholder `'·'` alone | unchanged | `glyphs \|\| '·'` |

- [ ] **Step 1: Find the work (RED gate).** Run
```bash
grep -rnE "(\s·|·\s)" web/src --include='*.ts' --include='*.tsx' | grep -vE '\.test\.' | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*)' | grep -E "screens/(Profile|Settings|Onboarding|ProgramEditor)|app/parts|dev/KitGallery"
```
Expected: a non-empty list (35 lines when this plan was written).
- [ ] **Step 2: Apply the table** to every listed line. Where a parser splits on the dot (`Profile.tsx` `label.split(' · ')[0]` for the validation name), parse the new form (`label.replace(/\s*\(.*\)$/, '')`). Update tests that assert these strings in the same step.
- [ ] **Step 3: Re-run the Step 1 command.** Expected: no output.
- [ ] **Step 4: Gate.** `npm run typecheck && npm test && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `refactor: no middle-dot separators in settings, profile and program screens`.

---

### Task 9: Dot sweep, group B (everything else)

**Files (modify):** every remaining file the gate command lists, expected to include `screens/Today.tsx`, `Review.tsx`, `Session.tsx`, `SessionDetail.tsx`, `PastSession.tsx`, `History.tsx`, `Progress.tsx`, `LiftDetail.tsx`, `ui/progress/{data,standards,consistency,StandardLadder,Heatmap}`, `ui/session/{logger,LiftBlock,SetSheet}`, `ui/kit/Controls.tsx`, and their tests.

- [ ] **Step 1: Find the work.** Run the Task 8 grep without the final `grep -E` filter. Expected: a non-empty list (about 65 lines left after Tasks 6 to 8; 100 across the app when this plan was written).
- [ ] **Step 2: Apply the Task 8 replacement table.** Specific decisions the table does not cover: `nextLabel` becomes `Next: warm-up 1 of 2` and `Next: set 2 of 4, back-off`; `levelValueText` becomes `Intermediate, 55th`; `standingText`, `ratedValueText`, `levelTableText`, `summaryLine`, `paceLine` become comma sentences; the Progress `meta` strings use commas. Update `logger.test.ts`, `standards.test.ts`, `consistency.test.ts`, `stats.test.ts`, `remind.test.ts`, `parity.test.ts` titles and any other test asserting the old strings in the same step.
- [ ] **Step 3: Re-run the Step 1 command.** Expected: no output.
- [ ] **Step 4: Gate.** `npm run typecheck && npm test && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `refactor: no middle-dot separators in the rest of the app`.

---

### Task 10: Lock it with a style-check rule, document it, verify the whole app

**Files:**
- Modify: `tools/check-styles.mjs`, `tools/check-styles.d.mts`, `web/src/styles/checkStyles.test.ts`, `docs/DESIGN.md`
- Create: `web/src/styles/__fixtures__/bad.ts.txt`

**Interfaces:**
- Produces: `export function checkText(text: string, file: string): StyleResult` (rule id `dot`); `checkStyles` runs it on every `.ts` and `.tsx` file that is not a test.

- [ ] **Step 1: Write the failing tests** in `checkStyles.test.ts`: `checkText("const a = 'Height · cm';", 'a.ts')` has one violation with rule `dot`; the same with the dot written as the escape `'·'` has none; `"const EMPTY = '·';"` (lone glyph) has none; a `//` comment line and a `/* ... */` block containing a spaced dot have none; JSX text `<span> · {unit}</span>` has one; `fixture bad.ts.txt` yields rules `['dot', 'dot']`. Also assert `checkStyles('web/src')` has zero violations.
- [ ] **Step 2: Run** `npx vitest run --root web web/src/styles/checkStyles.test.ts`. Expected: FAIL (`checkText` missing).
- [ ] **Step 3: Implement `checkText`.** Blank out `/* */` blocks (keep newlines), blank `//` to line end when it starts a line or follows whitespace, then report each line where `·` has whitespace on either side or starts or ends a quoted string with whitespace inside it. A `·` with no whitespace neighbour is allowed. Report line numbers; honour the existing `ds-allow:` same-line escape. Add the declaration to `check-styles.d.mts`.
- [ ] **Step 4: Run the file, then the full gate.** `npm test && npm run build`. Expected: pass, `check-styles: 0 violations`, `allowed` count unchanged at 5.
- [ ] **Step 5: Document** in `docs/DESIGN.md`: (a) the y-axis rule with the exact constants, the ceiling lane, the step line and 42-day dotted hold; (b) "No middle dot as a separator", the replacement table, the placeholder exception and that `check-styles` enforces it.
- [ ] **Step 6: Whole-app browser pass** on the seeded private preview at 390 px, dark and light. For each hash route (`#/today`, `#/progress`, `#/history`, `#/profile`, `#/settings`, a lift page, a session page, a past session) run in the console `document.body.innerText.split('\n').filter(l => /\s·|·\s/.test(l))`. Expected: an empty array on every route. Open the action sheet and the set sheet and run the same check. No console errors.
- [ ] **Step 7: Private-data and attribution check.** `node tools/check-private.mjs --all` passes; `git log --format=%B -3` shows no attribution lines.
- [ ] **Step 8: Commit** `feat: style check fails on a middle dot used as a separator`.

---

## Self-Review

- **Spec coverage:** goal 1 (step line, no fill) Task 3; goal 2 (y-axis rule) Tasks 1 and 3; goal 3 (lane and in-place targets) Tasks 1 to 3; goal 4 (cells) Tasks 4 and 5; goal 5 (dot sweep and check) Tasks 6 to 10; targets sources (next level, `profile.targets`) Task 2; Top set and Weekly volume rules Tasks 2 and 3; ramp inference Task 4; legend Task 5; stored names Task 7; DESIGN.md Task 10; constraints in Global Constraints.
- **Type consistency:** `ChartTarget`, `Scale`, `Run`, `stepRuns`, `fillWeeks`, `gapText` are defined in Task 1 and used in Tasks 2 and 3; `classifySets`, `cellWeight`, `anyDecimals` in Task 4 and used in Task 5; `Parts`, `loadParts`, `setsParts`, `lastTimeParts` in Task 6 and used in Tasks 8 and 9.
- **Decisions made on the user's behalf (flag in the final report):** failed sets show as struck-through reps in cells (the slot is 2 digits, so no `✕` char); the `@ RIR` text on top sets no longer appears in History cells; a `kind: 'warmup'` set is shown as a ramp cell (the old line hid warm-ups); decimal weights reserve a 2 `ch` decimal slot only on lists that contain one, so those lists hold 3 cells per row instead of 4; targets below the chart floor are dropped; with several personal goals for one lift only the earliest deadline is drawn; the legacy dot is kept readable in `sessionNames` through a `·` constant rather than a `ds-allow`.
