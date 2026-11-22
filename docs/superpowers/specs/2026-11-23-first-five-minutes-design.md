# First five minutes: setup, starting numbers and in-place tips

Status: draft for approval. Date: 2026-11-23. Branch: `onboarding` (local only, off `main`).
Mockup (outside the repo, example numbers): `gymbro/mockups/onboarding-flow.html`.

## Intent

GymBro's user is an experienced lifter: knows the lifts, rates effort honestly
(RIR or RPE), knows their own numbers, owns a plan or is happy to start from a
template. They may never have used a logging app. The first five minutes must
get them from install to a first session they understand, without teaching
lifting, and show the one idea that sets GymBro apart: **a promise before the
session, a grade against it after.**

Today a new user goes through four setup steps (About you, Your history, Goals,
Program) and then meets no guidance at all. Worse, with no history every lift's
first session is a "baseline" with no promise, so the core idea only appears a
week later, on each lift's second session.

## Goals

1. Setup takes about 90 seconds: four screens, each skippable where it makes sense.
2. Session one has **real promises** for the lifts the user gave numbers for.
3. The app explains itself in place: six short tips, each shown once, at the
   moment the thing it explains first appears.
4. Nothing an experienced lifter already knows is explained (no exercise demos, no
   form cues, no "what is RIR" beyond one line on the effort-scale choice).

## Non-goals

- Teaching lifting, programming or effort ratings.
- A guided walkthrough that drives the user through their first real workout.
- An intro slideshow.
- Changing how the planner works once a lift has real history.

## Anti-goals

- A tip that covers content, blocks a tap, or must be dismissed to continue.
- Tips showing up for someone who already uses the app (Yoyo's install).
- Starting numbers leaking into History, Progress, PRs or volume as if they
  were logged sets.

## Approaches considered

Session one: (A) ask for one recent best set per main lift so the planner can
promise numbers on day one, or (B) keep session one a baseline and explain why.
**Picked A**: the first session is where the user decides whether the app is worth it.

Teaching: (A) tips in place, shown once; (B) a guided first session with
step-by-step overlays; (C) a three-card tour after setup. **Picked A**, plus one
"How GymBro works" screen at the end of setup. B blocks a real workout and fights
the sheets; C is skipped by experienced lifters and teaches before context.

## The design

### Setup (replaces the current four steps)

The first-run gate (`app/firstRun.ts`: no profile and no sessions) is unchanged.
Progress shows `01/04` … `04/04` in the lockup and the existing dither bar.

1. **About you.** Effort scale (RIR or RPE, with one line: "RIR: reps left in the
   tank. RPE: 10 minus that."), bodyweight, and, under "For strength levels
   (optional)", sex and birth year. A text link, "Have a log already? Import or
   restore", opens a sheet with the three choices that today form the "Your
   history" step: Import a Notion CSV, Restore a backup, Explore with demo data.
   Choosing one keeps its current behaviour.
2. **Program.** Pick one of the built-in templates (`domain/templates.ts`), each
   row showing name, days a week and what each session holds. The first template
   is preselected. Same effect as today's Program step.
3. **Your numbers.** For each **main lift** of the chosen program (compound
   slots whose exercise has a `benchmarkKey`, i.e. squat, bench, deadlift and
   overhead press variants, in program order, first occurrence only, at most 4;
   this works for every template, including the ones with no top-set slots), one row: "best set in the
   last month", weight × reps, entered with the existing steppers or number field.
   Reps are limited to 1 to 12 (a best set, not an endurance set). Each row has Skip. Copy: "Your best set in the last month for each lift. GymBro
   sets your first targets from these." and, under the rows, "Skip a lift and its
   first session is a baseline: you log, it measures."
4. **How GymBro works.** Three numbered lines: "A promise before you lift: each
   session shows the numbers to hit, and why." / "Two taps a set: did what it says?
   Log as planned. If not, adjust." / "A grade after: beat, hit or missed, and the
   next promise follows from it." Then "Small tips will point things out the first
   time you meet them." Primary button **Start session A** (starts the session
   exactly as Today's Start does, readiness unanswered = good); secondary **Look
   around first** (goes to Today).

Goals and targets leave setup (see "Goal suggestion" below).

### Starting numbers (engine)

- Stored on the profile as `startingSets: { exerciseId, weight, reps, date }[]`
  (date = the day setup saved it). Optional field; old profiles and backups
  without it stay valid.
- **Never stored as sets or sessions.** History, Progress, PRs, volume, levels and
  the heatmap do not see them.
- When the planner prescribes a lift that has **no logged session before that
  day** and has a starting set, it seeds the first target from the starting set's
  **e1RM** (Epley, as everywhere else), whatever the slot's model:
  - **Top set:** the existing `topset_seed` arithmetic: the weight for the slot's
    top reps at the floor RIR, then back-offs as usual.
  - **Double progression:** the weight for the slot's **minimum reps** at the floor
    RIR, for the slot's sets ("3 × 8+ at 75 kg").
  - **5 × 5 linear and fixed:** the weight for the slot's reps at the floor RIR.
  - All rounded down to the exercise's increment. The usual one-increment jump cap
    does **not** apply to a seed (there is no previous weight to jump from).
  - A slot whose exercise has no starting set keeps today's baseline target.
- The seed is applied only where the target is prescribed. The starting set is
  **not** added to the lift's history, so "Last time" still reads "First time",
  and History, Progress, PRs, volume, levels and the heatmap never see it.
- The promise's "why" names the source: "from your starting set 105 × 3: a triple
  with 2 in reserve ≈ 100 kg".
- Once the lift has a real logged session, its starting set is ignored.
- **Fixing a typo:** Profile gets a "Starting numbers" list, shown only while at
  least one lift with a starting set has no logged session yet. Each row can be
  edited or removed. It disappears once every such lift has been logged.
- Profile's existing "Current maxes" section is unrelated and unchanged.

### Tips

- **Component:** `Tip` in `ui/kit`: an accent-outlined block with a small pointer
  at the top-left, "Tip" in the micro role, the text, a footer with "n of 6" and a
  **Got it** text button (48 px hit area). It sits in the normal flow directly under
  the thing it explains; the page moves down to make room. It never overlays,
  never traps focus, never blocks a tap. Screen readers read it as a `note`.
- **Storage:** `meta.tipsSeen: string[]` (tip ids). Got it adds the id. A tip
  shows only when its condition is true and its id is not in the list.
- **Order:** at most one tip on screen at a time; if two qualify on the same
  screen, the lower number shows.
- **Settings:** a "Show tips again" button clears `tipsSeen`.
- **Existing users:** the first time this version loads, if the database already
  holds a logged session that is not demo data, every tip id is written to
  `tipsSeen` (they see none; Settings can bring them back). The same check runs
  right after **restoring a backup** (a restored log means a returning user, even
  if the backup predates tips). It does **not** run after a Notion import: that
  user is new to GymBro and should get the tips. Demo mode and new installs see
  tips.

| # | id | Where | Shows when | Text |
|---|---|---|---|---|
| 1 | `promise` | Today, under the promise card | Today shows a planned session | This is today's promise: the numbers to hit, with the reason under them. It locks when you start, and the session is graded against it. |
| 2 | `log` | Logger, under the Log as planned / Adjust buttons | The logger is open on a session | Did exactly what it says? Log as planned. Different weight or reps? Adjust. Warm-ups are listed first and count separately. |
| 3 | `undo` | Logger, under the rest line | At least one set is logged in this session | Logged. Undo is there for 10 seconds; after that, tap any set in the list to edit it. Back keeps the session running. |
| 4 | `grade` | Review, under the per-lift grades | Review of a finished session with graded lifts | Beat means more than promised, hit means exactly it, missed means short. Next time's promise is built from today, so a beat moves you up. |
| 5 | `readiness` | Today, under Readiness | A planned session and at least one finished session exist | Three quick taps before you start. A bad night or sore legs eases today's targets; skip them and they count as good. |
| 6 | `progress` | Progress, under the lifts list | Two or more finished sessions | Each lift's trend and level. Tap a lift for its chart, its next level and your best weight at each rep count. |

### Goal suggestion

Seven days after the first finished session, Today shows one dismissible card
(same look as a tip, not counted in "n of 6"): "Have a target in mind? Set a goal
and its date in Profile, and GymBro will tell you if you're on pace." with a link
to Profile's Targets section. Dismissing it stores `goalNudge` in `tipsSeen`. It
never shows if the profile already has a target.

## Constraints

- Design system: tokens only, check-styles at 0 violations, at most 6 `ds-allow`,
  no new colours or type roles, no middle-dot separators, 48 px touch targets.
- Copy rules: plain words, no "commit" in user-facing text (use "locks").
- Local only: no push, no merge without a yes. Commit messages carry no Claude
  attribution.
- Personal data stays out of the repo; tests use synthetic numbers.

## Left to the builder

- Which component renders each setup screen (reuse `Segmented`, `Stepper`,
  `Select`, `Choice` where they fit).
- How the seed is wired into `prescribe` (a context field such as
  `startingSet`, or a separate seeding function before the model runs).
- The exact moment tip 3 appears (immediately after the first log, or after the
  undo window).
- Tests: setup flow model (which lifts are asked for, for all four templates),
  starting-set seeding per model including the no-cap rule, that starting sets
  never appear in history-based stats or "Last time", tip conditions and
  ordering, existing-user suppression at startup and after restore (not after a
  Notion import), the Starting numbers list in Profile, the goal nudge timing.
