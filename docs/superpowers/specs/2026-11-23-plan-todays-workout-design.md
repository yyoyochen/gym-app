# Plan today's workout

Status: approved in conversation 2026-11-23 ("A", then "Approve" on the mockup `~/.gymbro-preview/mockups/plan-workout.html`, kept outside the repo).

## Intent

Two kinds of lifter use the app. Some follow a program: the next session is planned and they press Start. Others, the owner included on many days, decide what to train about ten minutes before the gym. Today only serves the first: with no program it can only say "Plan a program".

Give the second kind a way to plan a one-off workout fast, and keep the app's core idea for it: a plan with numbers before you lift, locked when you start, graded after. Either the app suggests the whole workout from the goals and what was trained this week, or the lifter builds it, and both can be adjusted before starting. Today must stay as uncluttered as it is.

## Goals

1. Today, no program: one primary button, **Plan today's workout**, opens a builder already filled with a suggested workout.
2. Today, with a program: unchanged (next session, session picker, Start), plus one quiet link, **Something else today**, to the same builder.
3. The builder: focus chips (body parts, with this week's sets), the planned lifts with their numbers and a one-line reason each, **+ Add a lift**, **Clear and build my own**, and a pinned **Start workout**.
4. Each lift can be changed in a sheet: model (Top set + back-offs, or Straight sets), weight, sets, reps; plus Swap and Remove. The sheet shows "Last time" for the lift.
5. Start locks the workout as the plan (a commit, like a program session) and opens the logger. It is graded and reviewed exactly like a program session.

## Non-goals

- Saving a one-off workout as a program session or a template.
- Changing how program sessions are planned or graded.
- A time-of-day or equipment-aware suggestion.

## Anti-goals

- A plan whose numbers differ from what is graded (the promise-equals-grade invariant still holds: the committed targets are exactly what the builder showed).
- A suggestion that repeats a body part trained in the last 2 days when others are behind.
- More than one new primary button on Today.

## The suggestion (approved as proposed)

- **Body parts:** this week's working sets per body part (`app/weekSets.ts` counting) against a weekly target. Pick the 3 furthest behind (by the share of the target done), skipping any body part trained in the last 2 days unless every one was. The focus chips start with those 3 on; tapping a chip toggles it and re-suggests.
- **Weekly targets per body part:** the program's planned sets when there is a program (as Today's panel computes them); with no program, a default by primary goal:
  - strength / maintain: Legs 12, Back 10, Chest 8, Shoulders 6, Arms 4, Core 3
  - hypertrophy / bodycomp: Legs 15, Back 14, Chest 12, Shoulders 10, Arms 8, Core 4
- **Lifts:** for each chosen body part, the lifter's own lifts for it (first-listed muscle maps to the part), ranked: a Goal Board target lift first, then most working sets in the last 90 days, skipping lifts trained in the last 2 days. One lift per body part, plus a second for the part furthest behind when the workout has fewer than 4 lifts. If the lifter has no history for a body part, the catalogue's main lift for it (squat, bench, row, overhead press, curl, plank).
- **Numbers:** the main lifts (squat, bench, deadlift, overhead press, and any Goal Board lift) get Top set + back-offs; everything else Straight sets. Sets and reps from the primary goal, same defaults as the templates (`defaultParams`). Weights come from the existing engine: each lift is prescribed with `prescribe()` from its own history, exactly as a program slot would be, so the reason line is the engine's `why`.
- **Length:** with `maxSessionMinutes` set, drop the last lift while the estimate is over it (estimate: 3 min per working set plus 2 min per lift). The builder shows "about N min".
- **Reason line under each lift:** "Legs 0 of 15 sets this week, last squat 6 days ago" (body part progress, then the days since the lift, or "Goal Board lift").

## Editing

- The sheet edits the lift's slot: model, sets, reps (repMin = repMax = reps for Straight sets; top reps for Top set), and weight. A changed weight is kept as an override: the plan uses that weight and says so in the reason ("Your weight").
- Clear and build my own empties the list (focus chips off); + Add a lift uses the existing exercise picker, then plans the lift with the engine like a suggested one.
- The draft survives leaving and coming back the same day (stored in meta), and is dropped the next day or once started.

## Start, log, grade

- Start commits like `commitSession`: a session named "Today's workout" (no program session key), the targets exactly as shown, readiness from the Today check-in if shown, the same reentry handling. From there the logger, Review and grading are unchanged.
- Rotation: a one-off workout does not advance a program's rotation.

## Copy

- Today, no program: drop the long sentence; the button reads **Plan today's workout**. Programs live under Profile, Program (unchanged).
- Today, with a program: the link reads **Something else today**.
- Builder title **Today's workout**, Start button **Start workout**, sheet buttons **Done**, **Swap lift**, **Remove**.

## Calls made after the builder check (author's calls, flagged for review)

1. **Straight sets is the `double` model** (double progression), not `fixed`: an accessory in one-off workouts should still progress and can still be beaten. The sheet's Reps is the bottom of the range; the top is Reps + 2 (Reps + 3 for isolation lifts).
2. **Sets and reps by goal**, taken from the templates the owner uses:
   - strength / maintain: main lifts Top set, top 2 then 3 × 8–10 at 75%; other lifts 3 × 8–12 (isolation 3 × 12–15).
   - hypertrophy / bodycomp: main lifts Straight sets 3 × 6–10; other lifts 3 × 10–15 (isolation 3 × 12–20).
3. **A changed weight keeps the lift's model and grading at the new weight**, so "beat" stays possible and the criterion shown is the one graded (the target is rebuilt by the same model code at the given weight, never patched after). For Top set, the Weight field is the top-set weight and the back-offs follow from the back-off %. A lift with no history is a baseline ("First time: pick a weight"); if the lifter types a weight it becomes a plain N × R at W plan (`fixed`, graded hit or missed). New users mostly have numbers for the four main lifts already from setup (starting sets).
4. **With a program, a body part the program plans 0 sets for gets the goal default target**, so "Something else today" can offer arms or core on a program lifter's off-plan day.

## Left to the builder

- Module layout: a pure suggestion function (inputs: week sets, exercises, history summary, goal, targets, today) so it is unit-testable, and an app-layer planner that turns slots into a `DayPlan` like `planToday`.
- Where the draft is stored in meta and its key name.
- The exact catalogue fallback lift ids per body part.
