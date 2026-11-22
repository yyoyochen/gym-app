# First Five Minutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A four-screen setup that asks for starting numbers, seeds real first-session promises from them, and six in-place tips shown once.

**Architecture:** Starting sets live on the profile and reach the engine only through a new `PrescribeContext.startingSet` field, used when a lift has no history. Tips are a pure picker (`app/tips.ts`) over a `meta.tipsSeen` list, rendered by a kit `Tip` component that sits in the page flow. The setup screens are a rewrite of `screens/Onboarding.tsx` on the existing step routing.

**Tech Stack:** React 18 + TypeScript, Vite, Dexie (IndexedDB), vitest with fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-23-first-five-minutes-design.md`

All paths below are relative to `web/src/` unless they start with `docs/` or `tools/`.

## Global Constraints

- Tokens only; `npm run build` check-styles at 0 violations; at most 6 `ds-allow` (4 used today); no new colours or type roles.
- No spaced middle-dot separators in .ts/.tsx (the `dot` rule).
- Caps roles (label, stamp, button, micro) need `text-transform: uppercase`; spacing via `var(--space-*)`; borders via `--hair`, `--rule-w` or `--focus-w`; no raw font-size.
- Touch targets at least 48 px.
- User copy: plain words; never "commit" (say "locks").
- Starting sets are never stored as sets or sessions.
- Local only: no push. Commit messages carry no Claude attribution and name no private local files.
- Tests use synthetic numbers; personal data stays out of the repo.
- Gates: `npm test`, `npm run typecheck`, `npm run build`, `node tools/check-private.mjs --all` (run from the repo root).

## Review Focus

1. **A starting set for a lift that already has history** (Notion import, then setup): the starting set must be ignored and normal progression used. Test in Task 1 (`ignores the starting set once the lift has a logged session`).
2. **A malformed `startingSets` entry from an old or hand-edited backup** (reps 0, reps 30, negative weight, missing field): it must be ignored, not crash or seed a silly number. Test in Task 2 (`startingSetFor skips malformed entries`).
3. **Tips flashing for an existing user before startup suppression finishes**: an unset `tipsSeen` must show no tip at all. Test in Task 3 (`pickTip shows nothing before tips are initialised`).
4. **Restore of a backup made before tips existed, or with `tipsSeen: []`**: the restored log means every tip is marked seen. Test in Task 3 (`suppressTipsIfReturning marks all seen when a logged session exists`).
5. **Two tips qualifying on one screen** (Today: promise and readiness; logger: log and undo): only the lower number shows; the goal nudge never shows alongside a tip. Test in Task 3 (`pickTip returns the lowest unseen tip, nudge last`).

---

### Task 1: Seed first targets from a starting set

**Files:**
- Modify: `domain/types.ts` (Profile, new `StartingSet`)
- Modify: `engine/models.ts` (PrescribeContext, prescribe, new `seededTarget`)
- Test: `engine/models.test.ts`

**Interfaces:**
- Produces: `interface StartingSet { exerciseId: string; weight: number; reps: number; date: ISODate }` exported from `domain/types.ts`; `Profile.startingSets?: StartingSet[]`.
- Produces: `PrescribeContext.startingSet?: { weight: number; reps: number }`. Target `rule` for a seed is `'start_seed'`, `isNew: false`.

- [ ] **Step 1: Write the failing tests** in a new `describe('prescribe: seeded from a starting set')`, no history, green readiness, RIR scale:

```ts
// Bench 100 × 3 → e1RM 110 (Epley). UPPER increment 2.5, LOWER 5. Floors: top 2, compound 2.
it('top set: the top reps at the floor, back-offs at their share', () => {
  // fullbody A bench: top(2, 3, 8, 10, 75)
  const t = prescribe(benchTopSlot, bench, [], { today: T, startingSet: { weight: 100, reps: 3 } });
  expect(t).toMatchObject({ model: 'topset', topWeight: 95, topReps: 2, weight: 70, targetReps: 8, targetSets: 3, isNew: false, rule: 'start_seed' });
  expect(t.why).toBe('from your starting set 100 × 3: a double with 2 in reserve ≈ 95 kg');
});
it('double progression: the minimum reps at the floor, every working set', () => {
  // dbl(3, 6, 10)
  const t = prescribe(benchDoubleSlot, bench, [], { today: T, startingSet: { weight: 100, reps: 3 } });
  expect(t).toMatchObject({ model: 'double', weight: 85, targetReps: 6, isNew: false, rule: 'start_seed' });
  expect(t.why).toBe('from your starting set 100 × 3: a 6-rep set with 2 in reserve ≈ 85 kg');
});
it('5 × 5 linear: the slot reps at the floor', () => {
  // squat 140 × 5 → e1RM 163.3; 5 reps with 2 in reserve → 132.4 → 130
  const t = prescribe(squatLinearSlot, squat, [], { today: T, startingSet: { weight: 140, reps: 5 } });
  expect(t).toMatchObject({ model: 'linear5x5', weight: 130, targetReps: 5, targetSets: 5, isNew: false, rule: 'start_seed' });
});
it('fixed: the slot reps at the floor', () => {
  // synthetic fixed slot { sets: 3, repMin: 5, repMax: 5, rirFloor: 2 }; 110 / (1 + 7/30) = 89.2 → 87.5
  const t = prescribe(benchFixedSlot, bench, [], { today: T, startingSet: { weight: 100, reps: 3 } });
  expect(t).toMatchObject({ model: 'fixed', weight: 87.5, targetReps: 5, targetSets: 3, isNew: false, rule: 'start_seed' });
});
it('a seed is not held by the one-increment jump cap', () => {
  const t = prescribe(benchTopSlot, bench, [], { today: T, startingSet: { weight: 200, reps: 1 }, gapDays: 30 });
  expect(t.topWeight).toBeGreaterThan(150);
  expect(t.why).not.toContain('held');
});
it('ignores the starting set once the lift has a logged session', () => {
  const t = prescribe(benchTopSlot, bench, [oneLoggedBenchSession], { today: T, startingSet: { weight: 100, reps: 3 } });
  expect(t.rule).not.toBe('start_seed');
});
it('no starting set keeps the baseline', () => {
  expect(prescribe(benchTopSlot, bench, [], { today: T }).rule).toBe('baseline');
});
it('a seeded promise grades like any other', () => {
  const t = prescribe(benchTopSlot, bench, [], { today: T, startingSet: { weight: 100, reps: 3 } });
  expect(grade(t, loggedAsPrescribed(t)).verdict).toBe('hit');
});
```

Build the slot fixtures with the template helpers' shapes (or `programFromTemplate`), and the exercises from `defaultCatalog()`. `loggedAsPrescribed` may reuse the helper the existing property test uses.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root web src/engine/models.test.ts` (from the repo root)
Expected: FAIL, `startingSet` unknown / rule `baseline`.

- [ ] **Step 3: Implement**

In `prescribe`, right after `base` is built and before the re-entry branch: `if (!last && ctx.startingSet) return seededTarget(slot, exercise, ctx, floor, inc, scale, base);`.

`seededTarget` math, for every model: `e1 = epley(w + bodyShare, r)`; the weight for `n` reps is `max(0, floorTo(e1 / (1 + (n + floor.floor) / 30) - bodyShare + EPS, inc))`, where `n` = `topReps` for top set, `repMin` for double, `fixed` and linear (linear uses 5 × 5 as `linearTarget` does; the 1 × 5 deadlift slot keeps `p.sets`). No `capLoad`.
- Top set: back-offs `floorTo(pct * top + EPS, inc)`, `targetReps: p.repMin`, `targetSets: nB`, criterion in the same words `topsetTarget` builds.
- Double and linear: build a `LegacyTarget` (`is_new: false`, `prev_top: []`, `added_weight: false`, `target_sets` null for double, the slot's sets for linear) and pass it through `fromLegacy`, then set `rule: 'start_seed'`.
- Fixed: `fixedTarget(base, w, p.sets, p.repMin, why, 'start_seed')`.
- why: `` `from your starting set ${pyG(w)} × ${r}: a ${repWord(n)} with ${floor.floor} in reserve ≈ ${pyG(weight)} kg` `` (for top set, `weight` is the top weight).

Add `StartingSet` and `startingSets?: StartingSet[]` to `domain/types.ts`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --root web src/engine/models.test.ts`
Expected: PASS. If a floor differs from 2 for these slots, the test values are wrong, not the engine: recompute and ledger a ruling.

- [ ] **Step 5: Commit**

```bash
git add web/src/domain/types.ts web/src/engine/models.ts web/src/engine/models.test.ts
git commit -m "feat(engine): seed a lift's first target from a starting set"
```

---

### Task 2: Main lifts, starting-set helpers and planner wiring

**Files:**
- Create: `app/setup.ts`
- Test: `app/setup.test.ts`
- Modify: `app/coach.ts` (planToday passes `startingSet`)
- Test: `app/coach.test.ts`

**Interfaces:**
- Consumes: `StartingSet`, `PrescribeContext.startingSet` (Task 1).
- Produces, in `app/setup.ts`:
  - `MAIN_LIFT_IDS: readonly string[]` = `[EX.squat, EX.bench, EX.deadlift, EX.ohp]`.
  - `mainLifts(program: Program): string[]`: exercise ids of slots whose exercise is in `MAIN_LIFT_IDS`, in program order (sessions, then slots), first occurrence only, at most 4.
  - `interface NumberRow { exerciseId: string; weight: number | null; reps: number; skipped: boolean }`.
  - `startingSetsFromRows(rows: NumberRow[], date: ISODate): StartingSet[]`: drops skipped rows and rows with weight null or ≤ 0; reps rounded and clamped to 1–12.
  - `startingSetFor(profile: Profile | undefined, exerciseId: string): { weight: number; reps: number } | undefined`: ignores entries whose weight is not a finite number > 0 or whose reps is not an integer 1–12.
  - `pendingStartingSets(db: GymDb, profile: Profile | undefined): Promise<StartingSet[]>`: valid starting sets whose lift has no logged session.

- [ ] **Step 1: Write the failing tests** (`app/setup.test.ts`)

```ts
it('main lifts per template, program order, first occurrence', () => {
  expect(mainLifts(programFromTemplate('fullbody-abc'))).toEqual([EX.squat, EX.bench, EX.deadlift, EX.ohp]);
  expect(mainLifts(programFromTemplate('upper-lower'))).toEqual([EX.bench, EX.ohp, EX.squat, EX.deadlift]);
  expect(mainLifts(programFromTemplate('linear-5x5'))).toEqual([EX.squat, EX.bench, EX.ohp, EX.deadlift]);
  expect(mainLifts(programFromTemplate('hypertrophy-split'))).toEqual([EX.bench, EX.squat, EX.ohp, EX.deadlift]);
});
it('a program with no main lifts asks for none', () => { /* program of accessories only → [] */ });
it('rows become starting sets: skipped and empty dropped, reps clamped 1–12', () => {
  expect(startingSetsFromRows([
    { exerciseId: 'a', weight: 100, reps: 3, skipped: false },
    { exerciseId: 'b', weight: 80, reps: 5, skipped: true },
    { exerciseId: 'c', weight: null, reps: 5, skipped: false },
    { exerciseId: 'd', weight: 60, reps: 20, skipped: false },
  ], '2026-11-23')).toEqual([
    { exerciseId: 'a', weight: 100, reps: 3, date: '2026-11-23' },
    { exerciseId: 'd', weight: 60, reps: 12, date: '2026-11-23' },
  ]);
});
it('startingSetFor skips malformed entries', () => {
  const p = { ...defaultProfile(), startingSets: [
    { exerciseId: 'x', weight: 100, reps: 0, date: '2026-11-23' },
    { exerciseId: 'y', weight: -5, reps: 3, date: '2026-11-23' },
    { exerciseId: 'z', weight: 100, reps: 3, date: '2026-11-23' },
  ] } as Profile;
  expect(startingSetFor(p, 'x')).toBeUndefined();
  expect(startingSetFor(p, 'y')).toBeUndefined();
  expect(startingSetFor(p, 'z')).toEqual({ weight: 100, reps: 3 });
});
it('pendingStartingSets drops lifts that have been logged', async () => { /* freshDb, two starting sets, log a session for one → only the other */ });
```

And in `app/coach.test.ts`:

```ts
it('a starting set makes session one a real promise, and Last time stays First time', async () => {
  // fresh db, default program, profile.startingSets = [{ exerciseId: EX.squat, weight: 140, reps: 3, date: TODAY }]
  const plan = await planToday(db, TODAY, at(TODAY, 9));
  const squat = plan.slots.find(s => s.exercise.id === EX.squat)!;
  expect(squat.target.rule).toBe('start_seed');
  expect(squat.target.isNew).toBe(false);
  expect(squat.lastTime).toEqual([]);
  const bench = plan.slots.find(s => s.exercise.id === EX.bench)!;
  expect(bench.target.rule).toBe('baseline');
});
it('starting sets never reach history-based stats', async () => {
  // same setup: db.sets.count() === 0, db.sessions.count() === 0, liftHistory(db, EX.squat, TODAY) is []
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root web src/app/setup.test.ts src/app/coach.test.ts`
Expected: FAIL, module `./setup` not found; coach rule `baseline`.

- [ ] **Step 3: Implement** `app/setup.ts` as in Interfaces; in `planToday` pass `startingSet: startingSetFor(profile, exercise.id)` into the `prescribe` context. `pendingStartingSets` uses `getExerciseHistory(db, id, { limit: 1 })`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --root web src/app/setup.test.ts src/app/coach.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/setup.ts web/src/app/setup.test.ts web/src/app/coach.ts web/src/app/coach.test.ts
git commit -m "feat: main lifts and starting sets reach the planner"
```

---

### Task 3: Tips model, storage and returning-user suppression

**Files:**
- Create: `app/tips.ts`
- Test: `app/tips.test.ts`
- Modify: `db/repo.ts` (`MetaValues.tipsSeen: string[]`)
- Modify: `main.tsx` (call `initTips` once at startup)
- Modify: `app/parts/RestorePanel.tsx` (call `suppressTipsIfReturning` after a restore)

**Interfaces:**
- Produces, in `app/tips.ts`:
  - `TIP_IDS = ['promise', 'log', 'undo', 'grade', 'readiness', 'progress'] as const`; `type TipId = typeof TIP_IDS[number]`; `type CardId = TipId | 'goalNudge'`.
  - `TIP_TEXT: Record<TipId, string>` (the spec table, verbatim) and `GOAL_NUDGE_TEXT` = "Have a target in mind? Set a goal and its date in Profile, and GymBro will tell you if you're on pace."
  - `tipNumber(id: TipId): number` (1-based).
  - `pickTip(qualifying: Partial<Record<CardId, boolean>>, seen: readonly string[] | null): CardId | null`.
  - `goalNudgeDue(firstFinished: ISODate | null, today: ISODate, hasTarget: boolean): boolean`: true when 7 or more days have passed since the first finished session and the profile has no target.
  - `getTipsSeen(db): Promise<string[] | null>` (null = not initialised), `markTipSeen(db, id: CardId)`, `resetTips(db)` (sets `[]`), `initTips(db)` (only when unset: all ids incl. `goalNudge` if a session exists and `demoMode` is not true, else `[]`), `suppressTipsIfReturning(db)` (same check, runs even when set).

- [ ] **Step 1: Write the failing tests**

```ts
it('pickTip returns the lowest unseen tip, nudge last', () => {
  expect(pickTip({ promise: true, readiness: true }, [])).toBe('promise');
  expect(pickTip({ promise: true, readiness: true }, ['promise'])).toBe('readiness');
  expect(pickTip({ readiness: true, goalNudge: true }, [])).toBe('readiness');
  expect(pickTip({ goalNudge: true }, [])).toBe('goalNudge');
  expect(pickTip({ promise: false }, [])).toBeNull();
});
it('pickTip shows nothing before tips are initialised', () => {
  expect(pickTip({ promise: true }, null)).toBeNull();
});
it('numbers follow the table', () => { expect(tipNumber('promise')).toBe(1); expect(tipNumber('progress')).toBe(6); });
it('goal nudge: 7 days after the first finished session, never with a target', () => {
  expect(goalNudgeDue('2026-11-01', '2026-11-07', false)).toBe(false);
  expect(goalNudgeDue('2026-11-01', '2026-11-08', false)).toBe(true);
  expect(goalNudgeDue('2026-11-01', '2026-11-20', true)).toBe(false);
  expect(goalNudgeDue(null, '2026-11-20', false)).toBe(false);
});
it('initTips: new install gets an empty list', async () => { /* freshDb → [] */ });
it('initTips: an existing log marks every tip seen', async () => { /* a session row, no demoMode → all six + goalNudge */ });
it('initTips: demo data still sees tips', async () => { /* session + demoMode true → [] */ });
it('initTips runs once: a later call keeps the list', async () => { /* set ['promise'], init → ['promise'] */ });
it('suppressTipsIfReturning marks all seen when a logged session exists', async () => { /* tipsSeen [] + a session → all */ });
it('markTipSeen adds once; resetTips clears', async () => { /* … */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root web src/app/tips.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** as in Interfaces. "A logged session" = `db.sessions.count() > 0`. In `main.tsx`: `void initTips(getDb()).catch(e => console.error(e))`. In `RestorePanel`, after `restoreBackup` resolves and before `onRestored`: `await suppressTipsIfReturning(getDb())`. Notion import does not call it.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --root web src/app/tips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/tips.ts web/src/app/tips.test.ts web/src/db/repo.ts web/src/main.tsx web/src/app/parts/RestorePanel.tsx
git commit -m "feat: tips list with once-only startup and restore suppression"
```

---

### Task 4: The Tip component and the six tips in place

**Files:**
- Create: `ui/kit/Tip.tsx` (export from `ui/kit/index.ts`)
- Modify: `styles/kit.css` (`.tip`)
- Create: `app/parts/ScreenTip.tsx`
- Modify: `screens/Today.tsx`, `screens/Session.tsx`, `screens/Review.tsx`, `screens/Progress.tsx`, `screens/Settings.tsx`
- Test: `ui/kit/Parts.test.ts` or a new `ui/kit/Tip.test.ts` for `tipFooter`

**Interfaces:**
- Consumes: `pickTip`, `TIP_TEXT`, `GOAL_NUDGE_TEXT`, `tipNumber`, `markTipSeen`, `getTipsSeen`, `goalNudgeDue`, `resetTips` (Task 3).
- Produces: `Tip({ text, footer, onDismiss, children? })` (presentational, `role="note"`); `tipFooter(n: number, of: number): string` → `"1 of 6"`; `ScreenTip({ id, shown }: { id: CardId; shown: CardId | null })` renders the Tip for `id` only when `shown === id`, Got it calls `markTipSeen`. The goal nudge has no "n of 6" footer and carries a link to `#/profile` ("Set a goal").

- [ ] **Step 1: Write the failing test**

```ts
it('tip footer counts out of six', () => { expect(tipFooter(3, 6)).toBe('3 of 6'); });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root web src/ui/kit/Tip.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the component and place the tips**

Look follows `gymbro/mockups/onboarding-flow.html` `.tip`: accent outline at `--rule-w`, a small notch at the top-left (a rotated square with the accent border on two sides, paper fill), "Tip" in the micro role, the text, a footer with "n of 6" left and a **Got it** text button right (48 px hit area). Normal flow; no overlay, no focus move.

Placement and conditions (each screen reads `getTipsSeen` with `useLive` and calls `pickTip` once with all of its candidates):
- Today: `promise` under the `.promise` block when `showPlan`; `readiness` under `ReadinessCheck` when `canStart` and at least one finished (`sealed`) session exists; `goalNudge` when `goalNudgeDue(first sealed session date, today, profile.targets.length > 0)`, placed under the bars.
- Session: `log` under `.next-actions` when `focus && next && !session.sealed`; `undo` under the rested line when a set is logged and the session is not sealed (shown at once after the first log, while Undo is still there).
- Review: `grade` under the ledger when at least one slot is graded and not new.
- Progress: `progress` under the Lifts section when two or more finished sessions exist.
- Settings: a "Show tips again" button calling `resetTips`, with a short HUD or quiet confirmation.

- [ ] **Step 4: Run tests, typecheck and build**

Run: `npx vitest run --root web src/ui/kit/Tip.test.ts && npm run typecheck && npm run build`
Expected: PASS; check-styles 0 violations, `ds-allow` count ≤ 6.

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/kit/Tip.tsx web/src/ui/kit/Tip.test.ts web/src/ui/kit/index.ts web/src/styles/kit.css web/src/app/parts/ScreenTip.tsx web/src/screens/Today.tsx web/src/screens/Session.tsx web/src/screens/Review.tsx web/src/screens/Progress.tsx web/src/screens/Settings.tsx
git commit -m "feat: six in-place tips and a goal nudge, shown once"
```

---

### Task 5: The four setup screens

**Files:**
- Modify: `screens/Onboarding.tsx` (rewrite the steps)
- Modify: `styles/*.css` only if a new class is needed (tokens only)
- Test: `app/setup.test.ts` (`setupSteps`)

**Interfaces:**
- Consumes: `mainLifts`, `NumberRow`, `startingSetsFromRows` (Task 2); `initTips` (Task 3); `planToday`, `commitSession` (`app/coach.ts`); `sessionNames` (`app/labels.ts`).
- Produces: `SETUP_STEPS = ['About you', 'Program', 'Your numbers', 'How GymBro works'] as const` exported from `app/setup.ts`.

- [ ] **Step 1: Write the failing test**

```ts
it('setup has four steps in order', () => {
  expect(SETUP_STEPS).toEqual(['About you', 'Program', 'Your numbers', 'How GymBro works']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root web src/app/setup.test.ts`
Expected: FAIL, `SETUP_STEPS` not exported.

- [ ] **Step 3: Implement the screens** (copy from the spec, verbatim)

1. **About you:** effort scale first, with "RIR: reps left in the tank. RPE: 10 minus that."; bodyweight; a group "For strength levels (optional)" with sex and birth year; current validation and save. A text link "Have a log already? Import or restore" opens a `Sheet` holding the three current choices (Import a Notion CSV, Restore a backup, Explore with demo data) with their current behaviour: restore and demo go to Today; a finished import closes the sheet and setup continues.
2. **Program:** `TemplateList`, first template preselected; saving as today; Next.
3. **Your numbers:** a row per `mainLifts(program)` lift **that has no logged session** (an imported lift is not asked for); weight field and reps stepper (1–12); a Skip control per row. Copy: "Your best set in the last month for each lift. GymBro sets your first targets from these." and below the rows "Skip a lift and its first session is a baseline: you log, it measures." If no row is left: "Your log already covers these lifts. GymBro plans from it." Next saves `profile.startingSets = startingSetsFromRows(rows, today)`.
4. **How GymBro works:** the three numbered lines and "Small tips will point things out the first time you meet them." Primary `Start {short session name}`: `planToday(db, today, now, {})`, then if `planned`, `commitSession(db, plan, 'green', now)` and `go('session/<id>', { replace: true })`; else go to Today. Secondary "Look around first" goes to Today.

Call `initTips(db)` on mount (a wipe from demo or Settings clears meta). Goals leave setup.

- [ ] **Step 4: Run tests, typecheck and build**

Run: `npx vitest run --root web src/app/setup.test.ts && npm run typecheck && npm run build`
Expected: PASS; check-styles 0 violations.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/Onboarding.tsx web/src/app/setup.ts web/src/app/setup.test.ts web/src/styles
git commit -m "feat: four-screen setup with starting numbers"
```

---

### Task 6: Starting numbers in Profile

**Files:**
- Modify: `screens/Profile.tsx`
- Test: `app/setup.test.ts` (`editStartingSet`, `removeStartingSet`)

**Interfaces:**
- Consumes: `pendingStartingSets`, `StartingSet` (Task 2).
- Produces, in `app/setup.ts`: `editStartingSet(list: StartingSet[], exerciseId: string, weight: number, reps: number): StartingSet[]` (reps clamped 1–12, date kept) and `removeStartingSet(list: StartingSet[], exerciseId: string): StartingSet[]`.

- [ ] **Step 1: Write the failing tests**

```ts
it('editing a starting set keeps its date and clamps reps', () => {
  const l = [{ exerciseId: 'a', weight: 100, reps: 3, date: '2026-11-23' }];
  expect(editStartingSet(l, 'a', 102.5, 15)).toEqual([{ exerciseId: 'a', weight: 102.5, reps: 12, date: '2026-11-23' }]);
});
it('removing a starting set', () => {
  expect(removeStartingSet([{ exerciseId: 'a', weight: 1, reps: 1, date: '2026-11-23' }], 'a')).toEqual([]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root web src/app/setup.test.ts`
Expected: FAIL, not exported.

- [ ] **Step 3: Implement** a `Group label="Starting numbers"` shown only while `pendingStartingSets` is non-empty, one row per pending set ("Back Squat 140 × 3"), an Edit sheet with weight and reps steppers and a Remove action. "Current maxes" is untouched.

- [ ] **Step 4: Run tests, typecheck and build**

Run: `npx vitest run --root web src/app/setup.test.ts && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/Profile.tsx web/src/app/setup.ts web/src/app/setup.test.ts
git commit -m "feat: edit or remove starting numbers in Profile"
```

---

### Task 7: Docs and the end-to-end check

**Files:**
- Modify: `docs/PWA-SPEC.md` (the onboarding bullet), `docs/DESIGN.md` (Tip component)

- [ ] **Step 1: Update the docs** to the new setup, starting numbers and tips (short; point at the spec).

- [ ] **Step 2: Run every gate**

Run: `npm test && npm run typecheck && npm run build && node tools/check-private.mjs --all`
Expected: all pass; check-styles 0 violations.

- [ ] **Step 3: Browser check at 390 × 844** on a preview build with an empty database: setup start to finish with two starting sets and one skip; session one shows a real promise for the seeded lifts and a baseline for the skipped one; tips 1, 2, 3 appear in order and Got it hides each for good; Settings "Show tips again" brings them back. Then on the seeded preview data: no tips show.

- [ ] **Step 4: Commit**

```bash
git add docs/PWA-SPEC.md docs/DESIGN.md
git commit -m "docs: setup, starting numbers and tips"
```
