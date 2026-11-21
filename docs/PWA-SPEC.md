# GymBro PWA — Spec v0.3

*2026-11-21. Supersedes the FastAPI/SQLite deployment; reuses the engine, design system (LUME) and the promise → grade loop.*

**Changes in v0.3 (Yoyo's decisions, 2026-11-21):**
- New: GitHub-style consistency heatmap (§3.2).
- Effort floors decided from the research (§3.3.1): top sets 2 RIR, compound back-offs 1–2 RIR, isolation work may go to 0–1 RIR.
- Pain areas are a fixed list, not free text — no AI and no API key needed (§3.3.2).
- Programs start from a built-in template and are edited in the app (§3.8). No YAML.
- The Python engine is retired once the TypeScript port matches it. The whole repo becomes one language (§7.1).
- Benchmarks default to drug-tested raw lifters, with "all raw lifters" as a toggle (§3.6). *Superseded 2026-11-21: modeled gym-goer standards are the default; OpenPowerlifting is an optional comparison (§3.6).*

**Changes in v0.2:**
- No rest alerts of any kind. Rest is a silent elapsed counter.
- Effort scale: RIR by default, RPE as an option.
- Repo is public.
- New: strength comparison against an open benchmark by bodyweight, sex and age (§3.6).
- New: Profile page for current state, goals, targets and timeline (§3.7).
- Yoyo's Notion training log is the test dataset. It never leaves the machine (§6.4).

---

## 1. What this is

A phone-first, offline, installable web app for **one experienced lifter** that does five jobs:

| # | Job | One-line test |
|---|---|---|
| 1 | **Log** what I'm doing | A working set is logged in ≤ 2 taps when I did what was planned |
| 2 | **Track** progress | I can see whether each main lift is going up, flat or down in one glance, and where it sits against lifters like me |
| 3 | **Nudge** maximal effort, safely | The app asks for the last rep when there is one in the tank, and stops me when there isn't |
| 4 | **Coach** what to do next | Every prescribed number comes with a one-line reason I'd agree with, and it leads towards the target and date I set |
| 5 | **Remind** me where I was | Opening the app after 2 hours or 2 weeks shows me exactly where I left off and what changes because of the gap |

### Who it is for

Someone who already knows the lifts, owns their program, and can rate their own effort honestly (RIR or RPE). In practice: Yoyo.

### Who it is not for

First-time gym goers, people who need exercise demos, form cues or a program picked for them, people without a working sense of effort ratings. **The app will not teach exercises or explain what a squat is.** Every screen can assume literacy, which keeps it dense and fast.

### What it is not

- Not a social app. No feed, no followers.
- Not a cloud service. No account, no server, no sync. The phone holds the data.
- Not a general logger. My Workout Logs already does that well (see `docs/competitors/myworkoutlogs/`, local only). GymBro exists for the part that app deliberately leaves out: **a prescription, a grade against it, and the next step.**
- Not a nag. No sounds, alerts, buzzes or push notifications.

---

## 2. Non-negotiables

1. **The promise shown is the promise graded.** A session's targets are committed (frozen) before the first set. The logger, the review and every later screen read the committed snapshot. Nothing ever recomputes a past promise.
2. **A day's plan is derived only from days before it.** Sets logged today never feed today's targets.
3. **Every number has a visible why.** No black-box prescriptions. The reason is on the card, not behind a tap.
4. **Goal conditions the scoreboard.** The training goal changes what the targets are *and* what counts as hitting them.
5. **Safety beats progression.** When an effort rule and a safety rule disagree, the safety rule wins and says so.
6. **Data is mine and portable.** Full export at any time, in a documented format, importable back.
7. **Personal data never reaches GitHub.** The repo is public; Yoyo's training log is test data only and is blocked from commits by tooling, not by memory (§6.4).
8. **Verified in the running app.** A feature isn't done until the real flow has been driven in a browser on a phone-sized viewport, using the real Notion log. A passing test suite is not proof.

---

## 3. Features

### 3.1 Log

- **Committed session view.** Today's session opens with every lift's target already in place: weight, reps, sets, effort cap.
- **Set rows have four states:** pending, ghost (prefilled), logged, criterion-met. These are the LUME states, unchanged.
- **One tap logs "did as planned".** Editing weight or reps is a stepper or keypad, never a modal.
- **Each set records:**
  - weight, reps
  - effort, in the user's chosen scale (RIR 0–5+ by default, or RPE 6–10 in half steps). Stored as RIR internally, so switching scales never changes history
  - set kind: warm-up / working / top / back-off / drop
  - an optional **pain flag** with body area (§3.3)
  - free note
- **Warm-ups are generated, not typed.** A ramp to the top set (e.g. bar × 8, 50% × 5, 70% × 3, 85% × 1) is offered and logged in one tap each. Warm-ups never count for grading or progress.
- **Swap or add a lift mid-session.** Swaps keep the slot's prescription model; an added lift is logged ungraded.
- **Rest: silent elapsed counter.**
  - A small "rested 2:14" label under the last logged set, counting up from absolute timestamps.
  - No countdown, no target, no sound, no vibration, no notification, no screen wake lock.
  - It exists for the Remind job (where was I, how long ago) and for the session record, not to time you.
- **Plate calculator** on tap of any weight: per-side plates, bar and collar presets. Shown as text first, drawing second.
- **Finish → review.** The verdict ledger plays once, then the session is sealed. Edits after sealing are allowed but marked "edited" in the ledger.

### 3.2 Track

- **Per-lift page:**
  - e1RM trend (Epley default, formula switchable), top set over time, working volume
  - the lift's verdict history (beat / hit / missed strip)
  - PRs: heaviest single, best e1RM, best reps at each common weight
  - benchmark position for the lift, where a benchmark exists (§3.6)
- **Goal board (home of Progress):** each target from the Profile against its current evidence and its timeline:

  | Lift | Target | By | Evidence now | Needed pace | Actual pace | State |
  |---|---|---|---|---|---|---|
  | Squat | hold 120 | Dec 31 | single @ 2 RIR → est. ~118 | hold | +0.5 kg/wk | on track |

  The evidence uses the best recent top set converted to an e1RM, never a guess.
- **Weekly volume per muscle** against a target range, with the weak-point flags the engine already computes.
- **Consistency heatmap (GitHub style):**
  - **Progress:** the last 52 weeks as a grid, one column per week, one cell per day, month labels on top. The gymapp server build already has this as a 13-week component (`web/src/lib/heatmap.ts`, `TrainingHeatmap.tsx`), with timezone-safe date math. Reuse it and widen the window.
  - **Cell shade = working sets that day,** in 4 steps (quartiles of your own non-zero days, as now). Warm-ups don't count. Days with no session stay empty; there is no "rest day" colour.
  - **Weekly target column:** a thin mark to the right of each week column, lit when that week met the Profile's sessions-per-week target (e.g. ≥ 3), half-lit when it met the minimum (e.g. ≥ 2). This shows the "3/week, min 2" goal directly.
  - **Recorded skips** (from the Today screen) show as an outlined empty cell, so "skipped" reads differently from "nothing recorded".
  - **Tap a day** → that session's verdict ledger. **Tap a week mark** → that week's sessions and volume.
  - **Today:** a compact 12-week strip of the same grid, above the lift cards.
  - Summary line under the grid: "This year: 118 sessions · 41 of 47 weeks at target · longest run 9 weeks". Plain counts, no streak flame, no confetti.
- **Consistency count:** sessions this week against the Profile's target, as a number on Today.
- **Bodyweight:** entries, a 7-day average and a weekly rate. Needs at least 7 days of data before a rate is shown.

### 3.3 Nudge — maximal effort, with safety in mind

The nudge layer runs **inside** a session, set by set, on top of the committed promise. It never changes the promise. It only suggests what to do with the next set. It appears as one quiet line under the active set — no popups, no sounds.

Rules are written in RIR. With RPE chosen, the same rules show in RPE (RPE = 10 − RIR).

**Push rules (effort):**

| When | Nudge |
|---|---|
| Last working set, previous set reported ≥ 3 RIR (≤ RPE 7) | "Last set — take it to 1–2 RIR." Rep target shown as a range. |
| Back-off sets reached prescribed reps at ≥ 4 RIR (≤ RPE 6) | "Too easy — next time +1 increment." Saved as a coach note for the next prescription, not applied today. |
| Promise already met with sets to spare | "Promise kept. Extra sets are a bonus, not required." |
| Top set at ≥ 3 RIR and readiness green | Offer one extra top set at +1 increment, still capped at the slot's RIR floor |

**Stop rules (safety), which override every push rule:**

| When | Response |
|---|---|
| Top set reported below the slot's RIR floor (default floor 2 RIR = RPE 8) | No more top sets. Back-offs drop 5–10% |
| Rep failure (fewer reps than intended, flagged "failed") on a main compound | Remaining sets drop to the back-off load. Don't repeat that weight until the next session |
| Pain flag on a set | Depends on severity, see §3.3.2. Severity 2–3 stops the lift for the day; repeated flags regress every lift that loads that area |
| Readiness red (poor sleep, sick, sore) | Top-set floor raised by 1 RIR; no extra-set offers; the session can be swapped to the minimum version |
| Load jump greater than the configured cap (default: one increment, or 5% after a layoff) | The engine refuses and shows the capped number with the reason |

Safety copy is matter-of-fact, never alarming. Missed and stopped sets use the slate "missed" treatment, not red.

**Out of scope:** bar-speed tracking, HRV, wearable data.

#### 3.3.1 Effort floors (decided from the research)

| Slot type | Default floor | Last-set nudge goes to | Raised by +1 RIR when |
|---|---|---|---|
| Top set, main compound (squat, bench, deadlift, OHP; 1–5 reps) | **2 RIR** (RPE 8) | never below 2 | readiness red · first session after an 8+ day gap · lift loads an area with a pain flag in the last 14 days |
| Back-off / working sets, compound (6–12 reps) | **2 RIR**, last set may go to **1 RIR** | 1 RIR | same as above |
| Isolation / machine / cable (arms, delts, calves, etc.) | **1 RIR**, last set may go to **0 RIR** (failure) | 0 RIR | readiness red · pain flag on that area |
| Re-entry sessions (§3.5) | **3 RIR** for every compound set | 3 RIR | — |

Maximum load jump between sessions: **one increment** (default 2.5 kg upper body, 5 kg lower body; editable per exercise). After an 8+ day gap: no jump on the first session back, then one increment.

Why these numbers:
- **Strength doesn't need sets close to failure.** A 2024 series of meta-regressions over ~55 studies found strength gains were similar across a wide range of RIR, while hypertrophy improved as sets ended closer to failure ([Robinson et al., *Sports Medicine* 2024](https://rke.abertay.ac.uk/en/publications/exploring-the-dose-response-relationship-between-estimated-resist/); [summary](https://www.fau.edu/newsdesk/articles/muscle-growth-strength-study)). An earlier meta-analysis found no overall strength difference between failure and non-failure training ([Grgic et al., *J Sport Health Sci* 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9068575)). So heavy top sets have nothing to gain from 0–1 RIR and carry the most risk.
- **RIR estimates are off by about a rep.** Lifters estimate better close to failure and on low-rep sets, but are still imprecise even at 1 RIR ([Zourdos et al.](https://pubmed.ncbi.nlm.nih.gov/30747900/)); a bench study found a mean error of about 0.65 reps ([Refalo et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10901726)). A 2 RIR target on a top set leaves room for that error without an accidental grinder.
- **Size does benefit from going closer to failure**, so working sets go to 1 RIR and isolation lifts — where a failed rep is harmless — may go to 0.
- **Individual context** (an old injury, short sleep) is covered by the +1 RIR rules rather than a lower default for everyone.

This matches what Yoyo's current plan already uses (top sets capped at RPE 8).

#### 3.3.2 Pain flag — fixed list, no AI

Free-text pain notes would need an AI to interpret them, and an AI needs an API key the app can't keep secret. Pain is a **fixed list** instead, and the rules act on the list directly:

- **Area:** neck · shoulder · elbow · wrist / hand · upper back · lower back · hip · knee · ankle / foot · other.
- **Side:** left / right / both (where it applies).
- **Severity:** 1 niggle (noticeable, didn't change the lift) · 2 changed how I lifted · 3 stopped the set.
- **Optional note:** free text kept for your own reading. The app never parses it.

Each exercise has a list of areas it loads (e.g. bench → shoulder, elbow, wrist; squat → knee, hip, lower back). That list is editable on the exercise. The rules:
- Severity 1: logged, no change today; next session holds the load for that lift.
- Severity 2–3: that lift stops for the day; the next session holds the load and asks a pain check first.
- Two flags of severity ≥ 2 on the same area in 14 days → every lift that loads that area regresses 10% and gets the +1 RIR floor until a session with no flag clears it.
- Injuries entered on the Profile ("left shoulder") work the same way, with the +1 RIR floor applied from the start.

### 3.4 Coach — what to do next

- **Today screen** answers "what am I doing today?" in one card per lift: the target, the success criterion and the why.
- **Prescriptions come from the engine (§5),** one model per lift slot, conditioned on the goal and paced by the Profile's timeline.
- **Readiness check** before committing (exists in gymapp): three quick taps (sleep / soreness / stress). It adjusts that day's targets before they're committed, so the promise already includes the adjustment.
- **Session selection** follows the program's rotation (A / B / C), with "minimum version" and "skip" as first-class choices. Skips are recorded, not hidden.
- **Next-session preview** on the review screen: "Next A: squat top single 105 @ 2 RIR, then 3 × 8 @ 82.5. Why: …"
- **Timeline coaching:** when actual pace falls behind needed pace for two checkpoints in a row, Today shows one line offering a choice: extend the date, lower the target, or keep both and accept "behind". The app never silently changes a target.
- **No AI.** Every coaching line comes from the engine's rules, so it works offline, costs nothing and needs no API key. The old AI summary (`ai.py`) is dropped.

### 3.5 Remind — where I was

The first screen on every open depends on the gap since the last activity:

| Gap | First screen |
|---|---|
| A session is in progress (any gap) | **Resume card:** lift, set number, last logged set, time since it ("rested 3:40") |
| < 24 h, nothing open | Today card, with yesterday's verdict summary under it |
| 2–7 days | Today card with "Last session: B, 3 days ago, 4/5 kept" and the next session in the rotation |
| 8–20 days | **Re-entry note.** The next session is anchored on the latest logged session for each lift, not on goals or old maxes; top sets floored at 3 RIR (RPE 7) for the first session back. The note says what changed and why |
| 21+ days | **Re-entry block.** Two sessions of 3 × 8 at roughly the last logged working weights, then normal progression. Shown as a short plan the lifter accepts or edits |

Other reminders:
- **Per-lift memory:** each lift card shows the last session's sets ("last time: 80 × 8, 8, 7") and the last note written for that lift.
- **Phase position:** "Week 5 of 9 · top double + 3 × 8 · 5 weeks to Dec 31 target".
- **Backup nudge:** if the last export was more than 14 days ago, a quiet line on Today offers an export.

### 3.6 Benchmarks — compared with lifters like me

**Default: modeled gym-goer standards (decided 2026-11-21).** Method and caveats: [STANDARDS-METHODOLOGY.md](STANDARDS-METHODOLOGY.md).
- Population: modeled self-reported gym-goers, not competitors. Levels: Beginner ≈ p5, Novice ≈ p20, Intermediate ≈ p50, Advanced ≈ p80, Elite ≈ p95 ("below beginner" under p5).
- Squat, bench and deadlift are anchored on Symmetric Strength self-reported gym logs via FitnessVolt aggregates (CC BY 4.0, attribution); the anchor source's own licence is not verified. Everything else is a ratio to a base lift or an editorial rep table, with a confidence grade per exercise: A data-anchored, B coaching ratio, C rough.
- Data: `web/public/standards/gym-standards.json`, built by `tools/standards/build.mjs` from the model's JSON (the model lives outside the repo). Rating: `web/src/benchmarks/gymStandards.ts`, a port of the model's `rate()`, parity-tested against the Python on a seeded grid.
- Mapping: each catalog exercise carries `standardId`; imported and custom exercises are matched by name (`benchmarks/standardMatch.ts`). Generic names that cover lifts with different standards (Leg Curl, Calf Raise, Face Pull, Overhead Tricep Extension) get no standard.
- What is rated (last 90 days): loaded lifts → best e1RM; pull-up / chin-up / dip with added load → the weighted standard (added-load e1RM ÷ bodyweight, with added e1RM = Epley(bw × factor + added, reps) − bw × factor); other bodyweight lifts → the best set's reps ("best set, not a max test"); holds → the best set's logged reps read as seconds.
- Needs sex and bodyweight on Profile; birth year is optional (none = the 20–29 table).
- **Progress → Benchmarks:** every mapped lift with its level, percentile, a level ladder in the tier ramp and its confidence badge, plus the caveat and attribution. **Lift page:** level, the table of every level for this lifter and "next: Advanced at X kg". **Profile targets:** the level and percentile a target would mean.
- **Settings → Benchmark population:** Gym-goers (default) / Tested lifters / All lifters. Levels always use the gym-goer model; Tested or All opens the powerlifter comparison below with that group (otherwise it is a collapsed section using the tested table).

**Optional comparison: competitive powerlifters (OpenPowerlifting), squat, bench and deadlift only.**
- The competition data is dedicated to the **public domain**. Attribution is requested, not required; the app credits it anyway on the benchmark screen and in the README.
- Download: https://data.openpowerlifting.org (bulk CSV). Docs: https://openpowerlifting.gitlab.io/opl-csv/.
- Columns used: `Sex`, `Age` / `AgeClass`, `BodyweightKg`, `Equipment`, `Event`, `Tested`, `Best3SquatKg`, `Best3BenchKg`, `Best3DeadliftKg`, `TotalKg`, `Date`.

**Build-time processing (script in `tools/benchmarks/`, output committed, raw CSV never committed):**
1. Keep full-power meets (`Event = SBD`), `Equipment = Raw` (also Wraps for squat, flagged), valid bests only.
2. One row per lifter: their best result (dedupe by lifter), so frequent competitors don't dominate.
3. Bucket by sex × age band (≤ 23, 24–34, 35–39, 40–44, 45–49, 50–54, 55–59, 60+) × bodyweight band (5 kg steps).
4. Store percentiles (5, 10, 25, 50, 75, 90, 95, 99) per lift per bucket. Smooth across neighbouring bodyweight bands where a bucket has fewer than ~200 lifters, and mark it "thin".
5. Output `web/public/benchmarks/opl-<date>.json` — aggregates only, no names, small enough to precache (target < 300 KB).
6. Two tables: **drug-tested raw lifters (default)** and all raw lifters (toggle on the Benchmarks screen).

**Why tested by default:** none of the competitive population is "the general public", but drug-tested raw lifting is the closest fair comparison for a gym-goer. It's the standard a natural lifter can actually reach, and it's what most people assume they're being compared against. Untested results raise the upper percentiles and would make a strong gym lifter look weaker than they are. If a tested bucket is too thin (under ~200 lifters after smoothing), that cell falls back to the all-raw table and says so.

**In the app:**
- **Progress → Benchmarks:** for squat, bench and deadlift, the user's current best e1RM (from the log) placed on the percentile curve for their sex, age band and bodyweight band. Example line: "Bench 85 kg e1RM → 41st percentile of raw male competitors, 35–39, 80–85 kg."
- **Lift page:** the same position as a small strip, plus the change over the last 90 days.
- **Profile targets:** when setting a target for squat/bench/deadlift, the percentile it would put you at is shown next to it.
- **What it says plainly, every time it appears:**
  - The comparison population is **competitive powerlifters**, who are stronger than the gym population. A middle percentile here is a strong gym lifter.
  - Competition lifts follow federation rules (depth, pause on bench). Gym e1RMs from reps are estimates.
- **No benchmark:** overhead press, Olympic lifts and accessories have no competition benchmark in this dataset; they are covered by the gym-goer standards above. The old git-ignored `strength_standards.csv` (scraped, proprietary) is still never used.
- **Later:** Olympic lifts if an openly licensed weightlifting dataset is confirmed (OpenWeightlifting exists; its licence is not yet checked).

### 3.7 Profile — where I am, where I'm going, by when

One page, edited rarely, that every other screen reads from.

**Where I am now**
- Sex, birth year (→ age band), height, bodyweight (prefilled from the latest bodyweight entry)
- Training age (years lifting seriously)
- Current maxes for the main lifts: **"from my log"** (default — best e1RM in the last 90 days) or entered manually with a date. Manual entries are labelled as such.
- Injuries / areas to protect (e.g. "left shoulder, since Sep 2026") — these pre-fill the pain-flag areas and add a hold-before-progress rule for lifts that load that area
- Weekly availability: sessions per week (target and minimum), max session length

**What I want (goals, multi-select, one primary)**
- Strength (raise maxes)
- Maintain strength (hold maxes)
- Hypertrophy (size, chosen rep range)
- Body composition (bodyweight target)
- Later: Olympic weightlifting

The primary goal sets the default prescription models (§5.3). Secondary goals add their targets to the goal board.

**Targets and timeline**
- Per target: lift (or bodyweight / sessions per week), value, deadline, and type (reach / hold / at least).
- The app shows, next to each target:
  - the needed pace (kg per week) vs. the user's recent actual pace from the log
  - a plain feasibility read: "comfortable", "ambitious", or "unlikely in this time" — based on the user's own recent rate, not population norms
  - the benchmark percentile it corresponds to, where available
- Optional **checkpoints** (e.g. Nov 15, Dec 1) that show up on Today on the day and on the goal board.
- Changing a target or date re-paces future prescriptions only. Committed past sessions don't change.

**Profile history:** every change is kept with a date, so the goal board can show when a target changed and why charts bend there.

### 3.8 Program — start from a template, edit in the app

**Built-in templates** (pick one at onboarding or later; all editable):

| Template | Days | Shape | Fits goal |
|---|---|---|---|
| **Full body A/B/C** (default) | 3 (min 2: A + B) | A: squat + bench · B: deadlift + OHP · C: hypertrophy accessories. Main lifts use top set + back-offs; accessories use double progression | maintain strength + size (Yoyo's current plan) |
| **Upper / Lower** | 4 | Two upper, two lower; one heavy top set per main lift per week, the other day volume | strength + size |
| **5 × 5 linear** | 3 | A/B alternating, three main lifts each | strength block |
| **Hypertrophy split** | 4–5 | Push / pull / legs (+ upper / lower), double progression throughout | size |

Templates carry exercise slots, models and default parameters, not weights. **Starting weights come from your log** (best recent e1RM per lift) or, with no history, from a one-session baseline the engine already supports ("new lift → this session sets the baseline").

**In-app program editor** (Profile → Program):
- **Sessions:** add, rename, reorder, delete; set the rotation (A → B → C) and which sessions make up the "minimum version".
- **Slots in a session:** add / remove / reorder / **swap exercise** (keeps the slot's model and set count).
- **Per slot:** model (double progression / linear 5 × 5 / top set + back-offs / fixed), sets, rep range, effort floor (pre-filled from §3.3.1), back-off %, increment.
- **Phases (optional):** dated blocks that change rep ranges or models, e.g. "weeks 1–2 re-entry 3 × 8 → weeks 4–6 top double + 3 × 8".
- **Exercises:** add your own (name, areas loaded, increment, bodyweight factor, benchmark mapping). There is no exercise library with media — names only.
- **Safety:** editing a program never changes committed sessions. Changes take effect from the next commit, and the editor says so.

The program is part of the backup file, so sharing a program = sharing an export (later: export a program on its own).

---

## 4. Screens

Four tabs. The active session is a full-screen view above the tabs, not a tab.

| Tab | Purpose | Main elements |
|---|---|---|
| **Today** | Coach + remind | Resume or re-entry card · 12-week heatmap strip + "2 of 3 this week" · readiness check · today's lift cards (target, criterion, why) · checkpoint or pace line if due · start button · backup nudge |
| **Progress** | Track | Consistency heatmap (52 weeks) · goal board · benchmarks · lift list with trend arrows · weekly muscle volume · bodyweight |
| **History** | Past sessions | Calendar + list · session detail as the verdict ledger · edit / change date / delete · log a past session |
| **Profile** | You + setup | Where I am · goals · targets & timeline · program editor (§3.8) · then Settings: units/increments/plates, effort scale (RIR/RPE), effort floors, export / import / restore, about & data credits |

**Session view** (full screen): lift cards in order, set rows, silent rest counter, plate calculator sheet, nudge line under the active set, finish button.

**Review** (after finish): verdict ledger (stamp animation once), volume delta, safety events if any, next-session preview, pace update for any target touched.

Design system: LUME as written in `DESIGN.md`. Changes:
- The Tiers tab and its luminance ramp are replaced by benchmark percentiles in Progress; the tier colours can be reused for percentile bands.
- `--timer` (rest blue) is retired with the rest countdown.

---

## 5. Coach engine

### 5.1 Port, then retire Python

- **Port the Python engine to TypeScript** (`gymcli/` is about 700 lines of pure functions: progression, strength, scoring, criteria, volume, analysis).
- Rejected: Pyodide. It's a ~10 MB first download for code this small.
- **Parity test:** run the existing Python suite against fixed inputs (synthetic data and Yoyo's private log), save the outputs as JSON fixtures, and assert the TypeScript engine produces the same results. The 5 known bugs (§5.4) are the only intended differences, each with its own test.
- **Then retire Python.** Once parity holds, the fixtures *are* the reference. The new public repo never contains Python; the old repo stays on Yoyo's machine as the archive. Reason: keeping two engines in sync is exactly the kind of moving piece the app shouldn't have, and the frozen fixtures already pin the old behaviour.
- The engine stays pure: no storage, no clock, no DOM. The app passes in history, profile and today's date.

### 5.2 Prescription models (one per lift slot)

| Model | Exists? | Used for | Promise | Grade |
|---|---|---|---|---|
| **Double progression** | yes | hypertrophy work | weight × rep range for all working sets | beat = more total reps at weight; hit = equal; missed = fewer |
| **Linear 5 × 5** | yes | strength block | 5 × 5 @ W | hit = all 5 × 5; beat = extra sets or heavier; missed = fewer |
| **Top set + back-offs** | **new** | current A/B plan | top single/double @ ≥ RIR floor, then N × reps @ % of top | hit = top set done at or above the RIR floor **and** back-offs complete; beat = top set heavier than planned, still at or above the floor; missed = otherwise |
| **Fixed / maintain** | **new** | accessories, maintenance | sets × reps @ W, no progression | hit = done; never "beat" |

**Top-set progression:** finished at floor + 1 RIR or more → next time +1 increment. At the floor → repeat. Below the floor or failed → −1 increment.

**Back-off progression:** double progression within the rep range, anchored to the top set.

### 5.3 Goals → models, timeline → pace

- **Primary goal sets defaults:**
  - Maintain strength + hypertrophy (current): top-set model for squat, bench, deadlift, OHP; double progression for the rest.
  - Strength: linear 5 × 5 or top-set model for main lifts.
  - Hypertrophy: double progression everywhere.
- **Timeline sets pace:** the engine knows the needed weekly rate for each target and uses it to choose between "repeat" and "jump" when both are allowed, never to exceed the safety caps. A "hold" target with a deadline means: keep a heavy exposure at least every N sessions so the max is tested near the date.
- Switching goals or dates re-seeds future prescriptions from recent history and never rewrites committed past promises.

### 5.4 Engine bugs to fix in the port

From `KNOWN-ISSUES.md`, fixed in the TypeScript version with a test that fails first:
1. Adding weight on the last sets earns no jump. Summarise a day by the weight actually worked, not only its maximum.
2. Deload never fires when the load drifts. Count failures by load band, not exact weight.
3. Bodyweight lifts frozen at 0 kg. Effective load = bodyweight × factor + added. Grade on added weight; e1RM on effective load. (Factors: dip/pull-up ~0.95, push-up ~0.7; editable.)
4. Set numbering collisions. IndexedDB transactions, and set order assigned at write time.
5. Midnight split. A session's date is pinned when it starts.

---

## 6. Data

### 6.1 Storage

- **IndexedDB** via a thin wrapper (Dexie or idb). One database, versioned with explicit migrations.
- On first real use, call `navigator.storage.persist()`. Profile → Settings shows whether the browser granted it.
- iPhone: home-screen web apps have their own storage that Safari's 7-day wipe doesn't apply to. The app detects a normal Safari tab and shows an "Add to Home Screen to keep your data" banner (not in demo mode).

### 6.2 Stores

| Store | Key fields | Notes |
|---|---|---|
| `profile` | sex, birthYear, heightCm, trainingAgeYears, maxes (source: log/manual, date), injuries[], availability, effortScale (RIR/RPE), history[] | Single record + dated change history |
| `goals` | id, kind, primary, targets[] (lift, value, type, deadline), checkpoints[] | |
| `exercises` | id, name, aliases[], muscles[], areasLoaded[], slotType (compound / isolation), increment, bodyweightFactor, unit, benchmarkKey | `benchmarkKey` = squat / bench / deadlift / none; `areasLoaded` drives pain rules |
| `program` | id, name, sessions[] (slots: exercise, model, params), rotation, phases[] (dated) | Replaces `config.yaml` |
| `sessions` | id, programSessionKey, nameSnapshot, startedAt, endedAt, date (pinned), readiness, note, sealed, edited | |
| `commits` | sessionId, per-slot frozen Target (weight, reps, sets, RIR floor, criterion text, why) | **Write-once.** The promise of record |
| `sets` | id, sessionId, exerciseId, exerciseNameSnapshot, order, kind, weight, reps, rir, failed, pain{area, side, severity, note}, note, loggedAt | Effort always stored as RIR |
| `bodyweight` | id, date, kg | |
| `events` | id, date, type (skip, pain, deload, re-entry, target-change), data | Feeds Remind and Track |
| `meta` | lastExportAt, persistGranted, schemaVersion, demoMode, benchmarkVersion | |

Ideas taken from the competitor teardown (not code):
- name snapshots on history rows
- per-exercise bodyweight factor
- previous-value matching by set kind (n-th working set ↔ n-th working set)
- import IDs derived from a hash of the source row, so re-importing is a no-op
- undo for the last restore

### 6.3 Import / export

- **Export:** one JSON file holding all stores plus `schemaVersion`. Documented in `docs/FORMAT.md`. CSV per set for spreadsheets.
- **Restore:** replaces everything after confirmation. A local undo copy is kept until the next restore.
- **Import:**
  - Notion CSV (`Date,Session,Exercise,Order,Set,Reps,Weight (kg),Notes`) with an alias map
  - the current gymapp SQLite data, converted once by a script
  - Strong and Hevy CSV later (v1.1)

### 6.4 Test data — Yoyo's Notion log, local only

- **Source:** a fresh export of Yoyo's Notion training log, pulled at the start of each test cycle so tests run on current data.
- **Location:** `testdata/private/` at the repo root. Also holds the personal `config.yaml`, the old `gymapp.db`, and any profile JSON built from Yoyo's real numbers.
- **Guards, all three required:**
  1. `.gitignore` entry for `testdata/private/` (plus the existing `config.yaml`, `*.db`, `server/backups/`).
  2. A pre-commit hook that rejects any staged file under `testdata/private/`, any `*.csv` outside `tools/benchmarks/fixtures/`, and any file containing marker strings from the real log (e.g. the Notion database ID).
  3. A CI job that fails the build on the same checks, in case a commit skips the hook.
- **How it's used:**
  - Engine parity and regression tests run against it locally (`npm run test:private`), skipped automatically when the folder is absent (CI, other clones).
  - Browser acceptance checks (§10) load it via the normal Notion CSV import, so import gets tested too.
  - Expected results (set counts per session, best e1RMs per lift) are computed from the CSV by a script and also kept in `testdata/private/`.
- **Public tests and the demo** use a synthetic dataset generated by `tools/synthetic/` (made-up lifter, realistic progressions and gaps). The synthetic generator is checked in; its output is reproducible from a seed.
- **History cleanup before the first push:** the current repo has no remote and has never been pushed. Its history **already contains personal files** (checked 2026-11-21): `server/data/config.yaml`, `server/data/strength_standards.csv`, `server/gymapp.db-shm`, `server/gymapp.db-wal`. `server/tests/fixtures/sample_log.csv` also needs a check. Recommended: publish from a fresh repo (new history, one initial commit) instead of rewriting this one, and keep the old repo local as the archive.

---

## 7. PWA and hosting

- **Repo:** public on GitHub. MIT licence for code. README credits OpenPowerlifting for benchmark data.
- **Hosting:** GitHub Pages, built by a GitHub Action from `web/`. Static only; no backend.
- **Manifest:** name GymBro, standalone display, LUME dial colour as theme and background, maskable icon.
- **Service worker:** precaches the app shell and the benchmark JSON (Vite PWA plugin, Workbox). Updates in the background and shows "Update ready — reload" between sessions. **Never reloads during an active session.**
- **Offline:** everything works offline after the first load. There is no network call anywhere in the app.
- **Demo mode:**
  - the public URL opens with the synthetic dataset
  - a banner explains it's a demo
  - "Start my log" wipes the sample and starts onboarding
- **Onboarding (expert, ≤ 2 minutes):**
  1. Profile basics: sex, birth year, bodyweight, units, effort scale (RIR default)
  2. Import Notion CSV / restore backup / start empty
  3. Goals, targets and dates (with "from my log" maxes if history was imported)
  4. Program: pick a template (§3.8), adjust in the editor or later
  Each step can be skipped.

### 7.1 Moving pieces — kept to a minimum

| Piece | What it is | Why it's needed |
|---|---|---|
| `web/` | Vite + React + TypeScript app, including the engine (`web/src/engine/`) | The app |
| IndexedDB | The browser's built-in database | Storage on the phone |
| Service worker + manifest | Generated by the Vite PWA plugin | Install + offline |
| `tools/` | Node/TypeScript scripts: benchmark builder, synthetic data generator, Notion CSV checker | Run by hand or in CI, never shipped |
| GitHub Action | Build, test, private-data check, deploy to Pages | Hosting |

That's the whole system: **one language (TypeScript), one package manager, one build, no server, no database server, no Python, no Docker.** Every dependency added later has to justify itself against this list.

### Platform limits (stated, not solved)

- **Storage is per device.** No sync between phone and laptop. Export / restore is the bridge.
- **Deleting the home-screen app deletes the data.** The backup nudge and export are the safety net.
- **Screen can sleep mid-session.** No wake lock by design; the session survives it, and the Resume card brings you back.

---

## 8. Scope

### v1 (the version Yoyo trains with)

- Today, session view, review, History, Progress (heatmap, goal board, benchmarks, lift pages, bodyweight), Profile + Settings
- Engine ported with parity, Python retired; models: double progression, linear 5 × 5, top set + back-offs, fixed; timeline pacing
- Four program templates and the in-app program editor
- Nudge push and stop rules (§3.3), effort floors, fixed-list pain flag, readiness check, RIR/RPE choice
- Remind: resume card, gap-based re-entry, per-lift last-time memory, checkpoints
- OpenPowerlifting benchmarks for squat, bench, deadlift
- IndexedDB storage, persist request, JSON export/restore with undo, Notion CSV import, server-data migration
- Private-test-data guards (§6.4), synthetic demo data
- PWA install, offline, GitHub Pages deploy, demo mode

### Later

- Strong / Hevy import
- Olympic-lift benchmarks (after a licence check)
- Complexes and Olympic-lift slots (when coaching resumes in 2027)
- Weekly report image

### Never

- Rest alerts, sounds, vibration, push notifications
- AI features that need an API key in the app
- Python, a backend server, or a second engine
- Accounts, sync servers, social features, exercise media, beginner programs, ads
- Scraped or proprietary strength standards

---

## 9. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Repo ready for public | Fresh repo with clean history; `testdata/private/` set up with a fresh Notion export; gitignore + pre-commit hook + CI check in place; MIT licence; competitor notes kept outside the repo |
| M1 | Engine in TypeScript | Parity fixtures generated from Python and passing in TypeScript; the 5 known engine bugs each have a failing-then-passing test; private-data tests pass locally; no Python in the new repo |
| M2 | Local data layer | IndexedDB stores, migrations, export/restore round-trip; Notion CSV import of the real log matches the expected set count |
| M3 | Profile + Program + Log + Coach | Profile drives goals and pace; a template can be picked and edited; commit → log → review works offline on a phone viewport; promise on Today == promise in review, checked in the browser |
| M4 | Nudge + safety | Each push and stop rule triggered in a scripted session in the browser, in both RIR and RPE modes |
| M5 | Remind + Track + Benchmarks | Gap scenarios each show the right first screen; goal board and benchmark positions correct for the real log |
| M6 | PWA + deploy | Installed on Yoyo's phone from GitHub Pages, airplane-mode session works, data survives a week; demo URL shows only synthetic data |

---

## 10. Acceptance checks (driven in the browser on the real Notion log, not just unit tests)

1. Start session A, log every set as planned, finish. Review shows the same criteria text as Today did, word for word.
2. Log a top set at 1 RIR with a floor of 2 RIR. No more top sets are offered; back-offs drop. Switch to RPE and repeat at RPE 9: same result, shown in RPE.
3. Flag pain on a bench set. Bench stops for the day; next session's bench holds the load and asks a pain check.
4. Close the app mid-session; reopen 90 s later. Resume card shows the right set and "rested 1:30". Nothing beeped or buzzed in between.
5. Set the device clock 12 days ahead. Re-entry note appears; top sets floored at 3 RIR; loads come from the last logged session.
6. Export, clear site data, restore. Everything returns, including committed promises and profile history.
7. Airplane mode from cold start, on the installed app. Full session works, benchmarks included.
8. Log one set before and one after midnight. They stay in one session.
9. Set a target "bench 90 by 2027-03-31". Profile shows needed vs. actual pace and a percentile; the goal board shows the same numbers.
10. Benchmarks: with the real log, squat/bench/deadlift positions match a manual lookup in the generated JSON for Yoyo's sex/age/bodyweight bucket; OHP shows "no open benchmark".
11. `git add testdata/private/<file> && git commit` is rejected by the hook; the CI check fails on a branch that contains it.
12. Heatmap on the real log: every trained day appears in the right cell (checked against the CSV's dates), shades follow working-set counts, week marks match the 3/week and 2/week rule, a recorded skip shows as an outline, and tapping a day opens that session.
13. Pick "Full body A/B/C" with an imported log: starting weights come from recent e1RMs. Swap bench for close-grip bench in session A; the next commit uses the swap and past sessions are unchanged.
14. Flag left-shoulder pain at severity 2 twice in 10 days: bench and OHP both regress 10% with a 3 RIR top-set floor; squat is unaffected.

---

## 11. Decisions and open questions

**Decided (2026-11-21):**
- No rest alerts · RIR default with RPE option · public repo · Profile page with targets and timeline · Notion log as private test data
- GitHub-style consistency heatmap
- Effort floors per §3.3.1 (top sets 2 RIR, one increment max jump)
- Fixed-list pain flag, no AI
- Templates + in-app program editor
- Python retired after parity; TypeScript only
- Benchmarks: OpenPowerlifting, drug-tested raw by default

**Still open:** none blocking M0–M1. Revisit after the first two weeks of real use: whether the effort floors feel right in practice, and whether the heatmap should count sets or tonnage.
