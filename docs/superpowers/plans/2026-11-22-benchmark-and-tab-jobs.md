# Strength Level benchmark + one job per tab: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rate lifts against a local-only Strength Level table in preview builds. Then give Today, History and Progress one job each.

**Architecture:**
- **Converter:** a Node tool turns the Strength Level CSV (outside the repo) into a git-ignored JSON file.
- **Loading:** the preview build loads that JSON next to the public standards. `rate()` and `levelsAt()` prefer its table for male lifters.
- **Tabs:**
  - Today gets a 4-week calendar, cut from the same 52-week grid History draws, plus a weekly sets-by-body-part panel built from the program.
  - History takes the 52-week heatmap.
  - Progress is reordered.

**Tech Stack:** React 18 + TypeScript + Vite + Dexie, vitest, plain Node `.mjs` tools.

**Spec:**
- `docs/superpowers/specs/2026-11-22-strength-level-local-benchmark-design.md` (tasks 1–4)
- `docs/superpowers/specs/2026-11-22-tab-jobs-design.md` (tasks 5–9)

## Global Constraints

**Strength Level data**
- No Strength Level number may reach git, the production bundle or the service-worker precache.
- Only `testdata/private/` and the preview output's `__private__/` may hold it.

**Testing**
- Unit tests use made-up numbers in `__fixtures__`.
- Real-data tests run only under `GYMBRO_PRIVATE=1`.

**Commits**
- Commit messages carry no Claude attribution: no `Co-Authored-By`, no `Claude-Session`.
- Messages never name private local files.
- Never push.

**Shared definitions**
- Body-part groups, in this order:
  - Legs: quads, glutes, hamstrings, adductors, calves
  - Chest: chest
  - Back: lats, upper_back, traps
  - Shoulders: front_delts, side_delts, rear_delts
  - Arms: biceps, triceps
  - Core: abs
- A set counts 1 toward the group of its lift's first-listed muscle.
- Shading is the same for Today's calendar and History's heatmap, for the same day.
- Weeks run Monday to Sunday.

**Verification**
- Check every UI change in the browser at 390 × 844 on the seeded preview (`gymbro-s1`, port 5193, 127.0.0.1).

## Review Focus

1. **Dumbbell lifts:** Strength Level dumbbell standards are per dumbbell. Check that the app logs dumbbell weight per dumbbell too, so DB bench isn't rated at double. The test goes in Task 2.
2. **Bodyweight outside 50–141 kg:** clamp to the end rows, never extrapolate. The test goes in Task 2.
3. **A week with more sessions than the target**, e.g. 4 logged against a target of 3: planned counts the 4 logged sessions and adds none upcoming. The test goes in Task 5.
4. **No program or an empty rotation:** planned is 0 for every group. Rows with done > 0 show "x · unplanned". The test goes in Task 5.
5. **Today is a Monday:** the calendar's bottom row has one day filled and six blank. On a Sunday the row is full. The test goes in Task 6.

---

### Task 1: Strength Level converter

**Files:**
- Create: `tools/standards/strength-level.mjs`
- Test: `web/src/benchmarks/strengthLevel.convert.test.ts`
- Create: `web/src/benchmarks/__fixtures__/strength-level-sample.csv` (two exercises, three bodyweights, made-up numbers, plus one `Pull Ups` row with `< 1`)

**Interfaces:**
- Produces: `export function convertStrengthLevel(csv: string): { source: string; tables: Record<string, { bw: number[]; male: number[][] }>; unmapped: string[] }`
- Produces: `export const SL_NAME_TO_STD: Record<string, string>`
- CLI: `node tools/standards/strength-level.mjs <csv> [out=testdata/private/strength-level.json]` prints the mapped count and the unmapped names.

- [ ] **Step 1: Write the failing tests**
  - `maps Squat to back_squat with bw rows ascending`: `tables.back_squat.bw` equals the fixture's bodyweights, and `male[0]` is the five numbers of that row.
  - `skips rows that are not numbers`: `Pull Ups` is absent from `tables`.
  - `lists names it cannot map`: an exercise named `Zercher Squat` lands in `unmapped`.
- [ ] **Step 2: Run the tests and confirm they fail.**
  - Run: `npx vitest run --root web src/benchmarks/strengthLevel.convert.test.ts`
  - Expected: FAIL, module not found.
- [ ] **Step 3: Implement `convertStrengthLevel` and `SL_NAME_TO_STD`.** The map:

  | Strength Level name | Standard id |
  |---|---|
  | Squat | back_squat |
  | Bench Press | bench_press |
  | Deadlift | deadlift |
  | Shoulder Press | overhead_press |
  | Front Squat | front_squat |
  | Safety Bar Squat | safety_bar_squat |
  | Dumbbell Bulgarian Split Squat | bulgarian_split_squat_db |
  | Dumbbell Lunge | lunge_db |
  | Bent Over Row | barbell_row |
  | Pendlay Row | pendlay_row |
  | Dumbbell Row | db_row |
  | Barbell Shrug | barbell_shrug |
  | Close Grip Bench Press | close_grip_bench |
  | Dumbbell Bench Press | db_bench |
  | Incline Bench Press | incline_bench |
  | Incline Dumbbell Bench Press | incline_db_bench |
  | Good Morning | good_morning |
  | Goblet Squat | goblet_squat |
  | Hip Thrust | hip_thrust |
  | Landmine Press | landmine_press |
  | Romanian Deadlift | romanian_deadlift |
  | Sumo Deadlift | sumo_deadlift |
  | Hex Bar Deadlift | trap_bar_deadlift |
  | T Bar Row | t_bar_row |
  | Seated Dumbbell Shoulder Press | seated_db_press |
  | Dumbbell Lateral Raise | lateral_raise |
  | Push Press | push_press |
  | Power Clean | power_clean |
  | Power Snatch | power_snatch |
  | Snatch | snatch |
  | Clean and Jerk | clean_and_jerk |

  - Parse with a plain split; there are no quoted commas in the file.
  - Run the CLI main only when `process.argv[1]` is this file.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Run the real file.**
  - Run: `node tools/standards/strength-level.mjs "../strength_level/strength_standards_all_kg (4).csv"`
  - Expected: "31 mapped" and the unmapped list printed.
  - Check that `git status` doesn't show the output file.
- [ ] **Step 6: Commit.** Message: "Standards: local-only Strength Level table converter".

### Task 2: Rate against a table when present

**Files:**
- Modify: `web/src/benchmarks/gymStandards.ts`. Add `tables?` to `GymStandardsData`, add `tableThresholds`, and branch in `rate()` and `levelsAt()`.
- Modify: `web/src/benchmarks/liftRating.ts`. Add `source` to `LiftRating`.
- Test: `web/src/benchmarks/gymStandards.table.test.ts`

**Interfaces:**
- Produces: `GymStandardsData.tables?: Record<string, { bw: number[]; male: number[][] }>`
- Produces: `export function tableThresholds(data: GymStandardsData, id: string, sex: StdSex, bodyweightKg: number): number[] | null`. Returns null for female lifters, unknown ids, and when `tables` is absent. It clamps bodyweight to `[bw[0], bw[last]]` and interpolates each threshold linearly.
- Produces: `LiftRating.source: 'model' | 'strength-level'`

- [ ] **Step 1: Write the failing tests** (fixture table: bw `[60, 80]`, male rows `[[40,60,80,100,120],[50,70,90,110,130]]`, on the loaded standard `bench_press` of the existing test data):
  - `interpolates thresholds between bodyweight rows`: at 70 kg, the thresholds are `[45,65,85,105,125]`.
  - `a value on a threshold gets that level`: rating 85 at 70 kg gives `intermediate` and percentile 50.
  - `below beginner scales from 0`: 22.5 at 70 kg gives percentile 2.5.
  - `above elite is 97`.
  - `clamps bodyweight outside the table`: at 200 kg, the thresholds equal the 80 kg row.
  - `female and unknown ids use the model`: the result equals `rate()` without `tables`.
  - `levelsAt returns the table thresholds`.
  - In `liftRating.test.ts`: a table-rated lift has `source: 'strength-level'`, and the confidence text is "Strength Level table".
  - `rates DB bench on per-dumbbell weight`: check the existing DB bench rating test, and assert that the value passed to `rate` is the logged per-dumbbell e1RM, not doubled.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement.**
  - In `rate()`, for a loaded standard with `tableThresholds(...)` non-null, use the same piecewise-linear percentile as the bodyweight branch. Extract that branch into `pctFromPoints(values: number[], value: number): number` and reuse it.
  - Age is ignored on this path.
  - `levelsAt()` returns those thresholds.
- [ ] **Step 4: Run all tests.**
  - Run: `GYMBRO_PRIVATE=1 npx vitest run --root web`
  - Expected: all pass, and the existing parity tests are unchanged.
- [ ] **Step 5: Commit.** Message: "Standards: rate against a bodyweight table when one is loaded".

### Task 3: Load the private table in preview builds only

**Files:**
- Modify: `web/src/ui/progress/standards.ts`. In `loadGymStandards()`, when `import.meta.env.MODE === 'preview'`, also fetch `./__private__/strength-level.json`. Ignore any failure, and set `data.tables` from the result.
- Modify: `tools/check-bundle.mjs`. Add `strength-level` to the forbidden pattern and to the failure message.
- Modify: `web/src/sw` precache plugin (wherever it lists precache files). Make sure `__private__/` is never precached.

**Interfaces:**
- Consumes: `GymStandardsData.tables` (Task 2).

- [ ] **Step 1: Build production and confirm it's clean.**
  - Run: `npx vite build web && node tools/check-bundle.mjs web/dist` (use the dist path the repo already uses)
  - Expected: "Bundle check passed".
  - Also confirm `grep -r "strength-level" web/dist` finds nothing.
- [ ] **Step 2: Build the preview, copying the private files.**
  - Run: `npx vite build web --mode preview --outDir ~/.gymbro-preview/s1 --emptyOutDir`
  - Then copy the Notion CSV, `exercise-aliases.json`, `seed.js` and `strength-level.json` into `s1/__private__/`.
- [ ] **Step 3: Commit.** Message: "Preview builds load the private standards table; bundle check forbids it in production".

### Task 4: Show the source in the UI

**Files:**
- Modify: `web/src/screens/Progress.tsx`. The Benchmarks meta reads `vs Strength Level · 90 days` when any shown rating has `source === 'strength-level'`, and `vs gym-goers · 90 days` otherwise.
- Modify: `web/src/screens/LiftDetail.tsx`. The "Level" section meta follows the same rule for that lift.
- Modify: `web/src/ui/progress/standards.ts`. `confidenceWord` returns "Strength Level table" for a table-sourced rating.

- [ ] **Step 1: Browser check at 390 × 844** on `#/progress` and `#/lift/<back squat id>`.
  - The levels move as the comparison predicts. Squat stays Novice, with a lower percentile than before.
  - The subtitles read "vs Strength Level".
- [ ] **Step 2: Commit.** Message: "Benchmarks name their source".

### Task 5: Weekly sets by body part

**Files:**
- Create: `web/src/app/weekSets.ts`
- Test: `web/src/app/weekSets.test.ts`

**Interfaces:**
- Produces: `export const BODY_PARTS = ['Legs','Chest','Back','Shoulders','Arms','Core'] as const; export type BodyPart = typeof BODY_PARTS[number]`
- Produces: `export function bodyPartOf(muscle: string): BodyPart | null`
- Produces: `export function slotPlannedSets(slot: Slot): number`. Returns `1 + (backoffSets ?? 0)` for `topset`, and `params.sets` otherwise. The caller applies `effectiveSlot` first.
- Produces: `export interface BodyPartRow { part: BodyPart; done: number; planned: number }`
- Produces: `export function weekBodyPartSets(inp: { sets: SetEntry[]; sessions: Session[]; exercises: Record<string, Exercise>; program: Program | null; nextKey: string | null; target: number; today: ISODate }): BodyPartRow[]`
  - Rows come in `BODY_PARTS` order.
  - Rows with done = 0 and planned = 0 are dropped.
  - Only sets and sessions from Monday of `today`'s week through `today` count.

- [ ] **Step 1: Write the failing tests:**
  - `every catalog muscle has a body part`: over `CATALOG`, `bodyPartOf(m) !== null` for each muscle.
  - `counts a set toward its first muscle only`: 3 bench sets give Chest 3, Shoulders 0, Arms 0.
  - `ignores warm-ups and last week's sets`.
  - `planned = logged program sessions + upcoming rotation up to target`: rotation A,B,C, target 3, one A logged this week, `nextKey` B. Planned equals the sets of A + B + C, through `effectiveSlot`.
  - `more sessions than target`: 4 logged, target 3. Planned covers the 4 logged sessions and adds nothing.
  - `no program`: every planned is 0, and done still counts.
  - `imported sessions add done, not planned`: `programSessionKey` `import:x`.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Upcoming keys walk the rotation from `nextKey`, for `max(0, target − loggedProgramSessions)` steps.
  - A key that isn't in `program.sessions` is skipped.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.** Message: "Weekly sets by body part, done vs planned".

### Task 6: Recent-weeks calendar component

**Files:**
- Create: `web/src/ui/kit/RecentWeeks.tsx` (export from `web/src/ui/kit/index.ts`)
- Modify: `web/src/styles/kit.css` (`.rweeks*` styles, accent shades as in `.sqheat-on`)
- Test: `web/src/ui/kit/RecentWeeks.test.ts`

**Interfaces:**
- Consumes: `heatmapGrid` from `./dither`, `cellPixels` from `./SquareHeatmap`. Call `heatmapGrid` with `weeks: 52` and use its last 4 columns, so levels match History.
- Produces: `export function recentWeeks(g: HeatGrid, n = 4): { days: HeatCell[][]; marks: ('met'|'part'|'none')[] }`, rows oldest first.
- Produces: `export function RecentWeeks(props: { counts: Record<string, number>; end: ISODate; weekTarget: number; onSelect?: (date: ISODate) => void }): JSX.Element`
  - Mon–Sun header.
  - 7 day tiles per row. Each tile shows its date number over a shaded tile (`cellPixels` pattern, scaled to fill).
  - Today is outlined; future tiles are blank.
  - Each row has a week mark at its end.

- [ ] **Step 1: Write the failing tests:**
  - `takes the last 4 weeks, oldest first`.
  - `a Monday today leaves six future days blank`.
  - `a Sunday today fills the row`.
  - `levels equal the 52-week grid's for the same date`.
- [ ] **Step 2: Run the tests and confirm they fail.** Then implement, and run them until they pass.
- [ ] **Step 3: Commit.** Message: "Kit: RecentWeeks calendar".

### Task 7: Today: calendar + this-week panel

**Files:**
- Modify: `web/src/screens/Today.tsx`. Replace the "Last 52 weeks" `.stack` block with two things:
  - `<RecentWeeks>`, using the existing `counts`, `today`, `target` and the session-tap handler.
  - A "This week" panel: one row per `BodyPartRow`, with label, `DitherBar` (`value = min(done, planned)/planned`, or full when planned is 0 and done > 0) and text.
    - The text is `${done}/${planned}`, or `${done} · unplanned` when planned is 0.
    - Numbers are whole, since sets are counted whole.
- Modify: the Today loader, to also load this week's sets, sessions, exercises, program and next key. Use the same db helpers `planToday` and `loadConsistency` already call.

- [ ] **Step 1: Browser check at 390 × 844 on real data.**
  - 4 rows, with today outlined.
  - The marks match "This week x of 3".
  - The panel's rows add up to this week's working sets.
  - Tapping a day opens its session.
- [ ] **Step 2: Commit.** Message: "Today: recent weeks and this week's sets by body part".

### Task 8: History: 52-week heatmap + all sessions

**Files:**
- Modify: `web/src/screens/History.tsx`
  - Remove the month calendar, the month navigation, the day filter, the `DENSITY`/`BAYER` defs and the `tk-cal` markup.
  - Add `<SquareHeatmap weeks={52} weekTarget legend onSelect>`, using the same `counts` and week marks as Today.
  - Below it, every session newest first, under month headings (`monthLabel`), using the existing `SessionRow`.
  - Keep "Log past session".
  - The lockup is `History //${sessions} sessions`.
- Modify: `web/src/styles/*.css`. Delete the now-unused `.tk-cal*`, `.tk-month` and `.tk-legend` rules, if nothing else uses them.

- [ ] **Step 1: Browser check.**
  - The heatmap fills the width.
  - Tapping a day opens the session.
  - Month headings come in descending order.
  - There's no console error.
- [ ] **Step 2: Commit.** Message: "History: year heatmap and the full session list".

### Task 9: Progress: targets first, no heatmap

**Files:**
- Modify: `web/src/screens/Progress.tsx`. Order:
  1. Goal board
  2. Benchmarks
  3. Lifts · 90 days
  4. Training summary: the stats grid and the fun line
- Remove the `SquareHeatmap` and the summary's "Levels vs gym-goers" `tk-bars`.
- Drop any imports this leaves unused.

- [ ] **Step 1: Run the full suite and typecheck.**
  - Run: `npx tsc -p web --noEmit && GYMBRO_PRIVATE=1 npx vitest run --root web`
  - Expected: no type errors, and all tests pass.
- [ ] **Step 2: Browser check of all four tabs at 390 × 844, dark and light.** Send the screenshots.
- [ ] **Step 3: Commit.** Message: "Progress: goals and benchmarks first, no heatmap".
- [ ] **Step 4: Fresh-reviewer pass over the branch diff since `2bbaa57`.** Fix what it confirms, then rerun Step 1.
