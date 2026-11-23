# Plan Today's Workout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-off workout, suggested from goals and this week's training or built by hand, planned with numbers, locked on Start and graded like a program session.

**Architecture:** A pure suggestion module (`app/suggest.ts`) picks body parts and lifts; an app-layer module (`app/workout.ts`) stores the draft in meta, turns it into a `DayPlan` with the existing engine (`prescribe`, plus a new `chosenTarget` for a weight the lifter set) and commits it. A new screen `#/workout` edits the draft; Today links to it.

**Tech Stack:** React 18 + TypeScript, Dexie (IndexedDB), Vitest, the app's kit (`ui/kit`, `ui/common`).

**Spec:** `docs/superpowers/specs/2026-11-23-plan-todays-workout-design.md`

## Global Constraints

- Promise equals grade: the committed targets are exactly the ones the builder showed; a changed weight rebuilds the target with model code, never patches fields.
- Copy (verbatim): "Plan today's workout", "Something else today", "Today's workout", "Start workout", "Done", "Swap lift", "Remove", "+ Add a lift", "Clear and build my own", "First time: pick a weight", "Your weight".
- Session name "Today's workout"; it never advances a program's rotation.
- No middle dots in UI text; header separators are "// ".
- Gates: `npm test`, `npm run build` (typecheck, bundle check, style check: no font sizes outside the type roles), `node tools/check-private.mjs --all`.
- Commits: no Claude attribution lines; nothing is pushed.

## Review Focus

1. A lifter with no history at all (fresh install, no program): the builder still fills 3 body parts with the catalogue fallbacks, each as "First time: pick a weight", and Start works. Test in Task 3.
2. Every body part trained in the last 2 days (e.g. a 6-day-a-week lifter): focus still picks the 3 furthest behind instead of an empty workout. Test in Task 2.
3. A draft from yesterday: opening the builder today starts a fresh suggestion, not yesterday's list. Test in Task 3.
4. Starting while a session is already open: Start is not offered; the builder says to finish the open session. Test in Task 4 (screen) via `canStartWorkout`.
5. Removing every lift: Start is disabled, the list shows "+ Add a lift" only. Test in Task 3 (`planWorkout` of an empty draft returns status 'empty_session').

---

### Task 1: Engine, a target at a weight the lifter chose

**Files:**
- Modify: `web/src/engine/models.ts` (new export next to `seededTarget`; grading at line ~424 and `minimumToKeep` at ~491)
- Test: `web/src/engine/models.test.ts`

**Interfaces:**
- Produces: `chosenTarget(slot: Slot, exercise: Exercise, weight: number, ctx: PrescribeContext): Target` with `rule: 'chosen'` and `why: 'Your weight'`.

- [ ] **Step 1: Write the failing tests** (`describe('chosenTarget')`)
  - topset slot `top(2, 3, 8, 10, 75)`-style params, weight 100 → `topWeight 100`, `topReps 2`, back-off `weight 75` (floorTo 75% of 100 by the exercise increment), `targetSets 3`, `rule 'chosen'`, `why 'Your weight'`.
  - double slot `{ sets: 3, repMin: 8, repMax: 10 }`, weight 70 → `model 'double'`, `weight 70`, `targetReps 8`, `prevTop [8, 8, 8]`, criterion contains `3 × 8+ at 70kg`.
  - fixed slot `{ sets: 3, repMin: 8 }`, weight 40 → `fixedTarget` shape, criterion `Do 3 × 8 at 40kg`.
  - grading: a double `chosen` target graded with three sets of 70 × 9 at the floor is `beat`; 70 × 8 ×3 is `hit`; 70 × 7 is `missed` (same as `start_seed`).
- [ ] **Step 2:** `npm test -- --root web src/engine/models.test.ts` → FAIL (chosenTarget not exported).
- [ ] **Step 3:** Implement `chosenTarget` by sharing `seededTarget`'s topset/double/fixed branches: extract them into `targetAtWeight(slot, exercise, w, ctx, floor, inc, scale, base, why, rule)` and call it from both. In `grade` and `minimumToKeep`, treat `rule === 'chosen'` like `'start_seed'`.
- [ ] **Step 4:** same command → PASS; then `npm test` → all green.
- [ ] **Step 5:** `git commit -m "engine: chosenTarget, a plan at a weight the lifter set"`

### Task 2: Pure suggestion

**Files:**
- Create: `web/src/app/suggest.ts`, `web/src/app/suggest.test.ts`

**Interfaces:**
- Consumes: `BodyPart`, `BODY_PARTS`, `bodyPartOf` from `app/weekSets.ts`; `GoalKind`, `Exercise`, `Slot`, `ISODate` from `domain/types`.
- Produces:
  - `GOAL_WEEK_SETS: Record<GoalKind, Record<BodyPart, number>>` (spec values: strength/maintain Legs 12, Back 10, Chest 8, Shoulders 6, Arms 4, Core 3; hypertrophy/bodycomp Legs 15, Back 14, Chest 12, Shoulders 10, Arms 8, Core 4).
  - `interface PartWeek { part: BodyPart; done: number; target: number; lastTrained: ISODate | null }`
  - `pickFocus(rows: PartWeek[], today: ISODate, n = 3): BodyPart[]`
  - `interface LiftUse { sets90: number; lastDate: ISODate | null }`
  - `interface DraftSlot { slot: Slot; weight?: number; part: BodyPart | null }`
  - `slotFor(ex: Exercise, goal: GoalKind, main: boolean, id: string): Slot` (spec call 2 numbers; main = topset for strength/maintain, double 3 × 6–10 for hypertrophy/bodycomp)
  - `suggestWorkout(i: { focus: BodyPart[]; rows: PartWeek[]; exercises: Exercise[]; use: Map<string, LiftUse>; goalLiftIds: Set<string>; goal: GoalKind; today: ISODate; maxMinutes?: number; newId: () => string }): DraftSlot[]`
  - `estimateMinutes(slots: Slot[]): number` (3 per working set + 2 per lift; topset working sets = 1 + backoffSets)
  - `reasonLine(row: PartWeek | null, liftLast: ISODate | null, isGoal: boolean, today: ISODate, liftName: string): string`
  - `FALLBACK_LIFT: Record<BodyPart, string>` = Legs `back-squat`, Chest `barbell-bench-press`, Back `barbell-row`, Shoulders `overhead-press`, Arms `db-curl`, Core `plank`.

- [ ] **Step 1: Write the failing tests**
  - `pickFocus`: rows with done/target Legs 0/12, Chest 4/8, Back 2/10, Shoulders 6/6 → `['Legs', 'Back', 'Chest']`; Legs lastTrained yesterday → Legs skipped, `['Back', 'Chest', 'Shoulders']`; every part trained yesterday → still 3 parts, furthest behind first (Review Focus 2).
  - `suggestWorkout`: focus Legs, Chest, Back with history for back-squat (20 sets), leg-press (5), bench (12), barbell-row (9) and `goalLiftIds` {bench} → slots in focus order `back-squat, barbell-bench-press, barbell-row`, plus a second Legs lift `leg-press` (fewer than 4 lifts); squat and bench are `topset` with `top(2,3,8,10,75)` numbers for goal 'maintain'; row is `double` 3 × 8–12.
  - a lift trained yesterday is skipped for its part; a part with no history uses `FALLBACK_LIFT`.
  - `maxMinutes: 40` drops the last lift while `estimateMinutes` > 40.
  - `reasonLine`: `Legs 0 of 15 sets this week, last squat 6 days ago`; goal lift: `Chest 0 of 7, Goal Board lift`; no history: `Legs 0 of 12 sets this week, first time`.
- [ ] **Step 2:** `npm test -- --root web src/app/suggest.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. Focus ranks by `done / target` ascending (ties: Legs, Back, Chest, Shoulders, Arms, Core order), skipping `lastTrained` within 2 days unless that leaves fewer than `n`. Lifts per part: exercises whose `muscles[0]` maps to the part, ranked goal lift first, then `sets90` desc, skipping `lastDate` within 2 days.
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5:** `git commit -m "workout: suggestion from goals and this week's sets"`

### Task 3: Draft storage, planning and Start

**Files:**
- Create: `web/src/app/workout.ts`, `web/src/app/workout.test.ts` (fake-indexeddb, like `app/coach.test.ts`)
- Modify: `web/src/db/repo.ts` (MetaValues: `workoutDraft: WorkoutDraft`)

**Interfaces:**
- Consumes: Task 1 `chosenTarget`; Task 2 everything; `prescribe`, `liftHistory`, `slotPlan`-equivalent from `app/coach.ts` (export `slotPlan` if needed); `startSession`, `putCommit`, `getMeta`, `setMeta`.
- Produces:
  - `interface WorkoutDraft { date: ISODate; focus: BodyPart[]; slots: DraftSlot[] }`
  - `WORKOUT_KEY = 'workout'` (session `programSessionKey`), `WORKOUT_NAME = "Today's workout"`
  - `loadDraft(db, today): Promise<WorkoutDraft>`: the stored draft if its date is today, else a fresh `suggestDraft`.
  - `suggestDraft(db, today, focus?: BodyPart[]): Promise<WorkoutDraft>`
  - `saveDraft(db, d: WorkoutDraft): Promise<void>`
  - `planWorkout(db, d: WorkoutDraft, today, now, opts?: { readiness?: Readiness }): Promise<DayPlan & { reasons: string[] }>`: status `'planned'`, `sessionKey WORKOUT_KEY`, `sessionName WORKOUT_NAME`; each slot: `chosenTarget` when `weight` is set (a lift with no history and a weight becomes model `fixed`), else `prescribe`; empty draft → status `'empty_session'`.
  - `commitWorkout(db, plan, readiness, now): Promise<Session>`: starts the session and stores the commit with `plan.slots.map(s => s.target)`; deletes the draft.

- [ ] **Step 1: Write the failing tests**
  - fresh DB, no program, no history → `loadDraft` gives 3 slots from `FALLBACK_LIFT` and `planWorkout` targets are baselines (`isNew` true) (Review Focus 1).
  - a stored draft dated yesterday is replaced by a fresh one (Review Focus 3).
  - a slot with `weight: 70` on barbell-row with history plans `rule 'chosen'`, `weight 70`.
  - empty draft → `status 'empty_session'` (Review Focus 5).
  - `commitWorkout` → session named "Today's workout", commit targets equal the plan's targets (deep equal), draft gone, and `planToday` afterwards returns the committed plan (open session); a program's `nextRotationKey` is unchanged.
- [ ] **Step 2:** `npm test -- --root web src/app/workout.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Body-part rows: `weekBodyPartSets` for `done` and the program's `planned`; target = planned if > 0 else `GOAL_WEEK_SETS[goal]` (spec call 4); `lastTrained` from the last 7 days of sets. `use` from sets in the last 90 days.
- [ ] **Step 4:** same command → PASS; `npm test` → green.
- [ ] **Step 5:** `git commit -m "workout: draft, plan and start a one-off workout"`

### Task 4: The builder screen

**Files:**
- Create: `web/src/screens/Workout.tsx`, `web/src/app/parts/WorkoutLiftSheet.tsx`
- Modify: `web/src/App.tsx` (route `workout`, tab `today`), `web/src/styles/screens.css` (builder rows, focus chips)
- Test: `web/src/app/workout.test.ts` (adds `canStartWorkout`)

**Interfaces:**
- Consumes: Task 3 functions; `ExercisePicker`; kit `NavBar`, `Button`, `Segmented`, `Stepper`, `Sheet`, `ConfirmButton`.
- Produces: `canStartWorkout(open: Session | null, plan: { status: string }): boolean` in `app/workout.ts`.

- [ ] **Step 1: Write the failing test:** `canStartWorkout(openSession, planned)` false; `(null, empty_session)` false; `(null, planned)` true (Review Focus 4).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement it, then the screen per the mockup (`~/.gymbro-preview/mockups/plan-workout.html`, screen 3): NavBar "Today's workout" back to Today; focus chips label "Focus", each `Part done/target`, toggling re-runs `suggestDraft` with the new focus; header "N lifts" with "about N min"; each row: name, criterion summary ("Top 100 × 2, then 3 × 8 at 75" / "3 × 8 at 70" / "First time: pick a weight"), reason line, tap → sheet; "+ Add a lift" (picker, adds a `slotFor` slot); "Clear and build my own" (empty slots, focus []); pinned "Start workout" (disabled unless `canStartWorkout`; with an open session show "Finish the session in progress first."; Start commits with readiness `green`, since the builder has no check-in). Every change `saveDraft`s.
  Sheet (screen 4): title = lift name; Segmented "Top set + back-offs" / "Straight sets" (topset vs double; main lifts default topset); Stepper Weight (kg; step = exercise increment), Sets, Reps; "// Last time: …" from the plan's `lastTime`; Done, Swap lift (picker), Remove.
- [ ] **Step 4:** `npm test` → green; `npm run build` → 0 style violations.
- [ ] **Step 5:** Browser at 390 × 844 (`~/.gymbro-preview/build-s1.sh`, fresh service worker): open `#/workout`, toggle a chip, edit a weight, add and remove a lift, Start → logger opens with the same numbers; Review grades it. Fresh origin `fresh.localhost:5193` after setup with no program: builder fills and starts.
- [ ] **Step 6:** `git commit -m "workout: builder screen and lift sheet"`

### Task 5: Today entry points and docs

**Files:**
- Modify: `web/src/screens/Today.tsx`, `docs/DECISIONS.md`, `README.md` (feature list line)

- [ ] **Step 1:** Today, `plan.status === 'no_program'`: drop the sentence; primary LinkButton "Plan today's workout" → `#/workout`. With a program and `canStart`: a quiet link "Something else today" → `#/workout` under the pinned Start. Empty program session: keep "Edit the program" and add the same link.
- [ ] **Step 2:** Browser check both states (preview with program; fresh origin without). `npm test`, `npm run build`, `node tools/check-private.mjs --all` → all pass.
- [ ] **Step 3:** DECISIONS entry (one-off workouts: suggestion rules, calls 1–4, rotation untouched); README line under "What it does".
- [ ] **Step 4:** `git commit -m "Today: plan a one-off workout, with or without a program"`
