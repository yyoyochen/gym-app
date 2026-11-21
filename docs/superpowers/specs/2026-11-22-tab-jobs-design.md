# One job per tab: Today, History, Progress

Status: approved, 2026-11-22

## Why

Today, Progress and History all show the same thing (which days I trained,
shaded by working sets) in three different shapes. Each tab should answer
one question instead:

- **Today:** what have I done lately, and is this week on plan?
- **History:** the long view, and a way back to any session.
- **Progress:** am I moving toward my targets, and how do I compare to
  other gym-goers?

## Goals

1. Today shows a rolling 4-week calendar and a "this week" panel of sets
   done vs planned per body part.
2. History's first view is the 52-week heatmap (moved from Today), followed
   by every session.
3. Progress has no heatmap and leads with targets and benchmarks.

## Non-goals

- No drill-down from a body part into its muscles (later, if wanted).
- No editable weekly-volume targets; "planned" comes from the program.
- No change to the engine's existing `weeklySetsPerMuscle` (it splits a set
  evenly; this panel counts differently, see below).
- The old text-glyph heatmap (`GlyphHeatmap`) stays in the kit for now.

## Anti-goals

- The same day must not look different on two screens: Today's calendar
  and History's heatmap use the same shading for the same day.
- Today must not turn into a dashboard. The calendar and the panel replace
  the 52-week heatmap; nothing else on Today grows.

## Approaches considered

**Today's calendar**
- This month (History's current calendar, moved). Readable dates, but it
  takes half the screen and is nearly empty on the 1st.
- **Rolling 4 weeks (picked).** Always shows recent weeks, and each row
  carries its week-at-target mark.
- This week only. Smallest, but loses last week.

**Counting a set toward body parts** (bench = chest, front delts, triceps)
- **Main muscle only (picked).** A set counts 1 toward the group of the
  lift's first-listed muscle. Whole numbers; matches "10 chest sets a week".
  Pressing doesn't show as shoulder or arm work.
- Split evenly (the engine's current rule). Honest but gives "6.7/10".
- Full credit to every group. Inflates arms and shoulders.

## Design

### Today

Replaces the "Last 52 weeks" block, in the same place on the page.

```
 M  T  W  T  F  S  S
 2  3 ▒4  5 ▒6  7 ▓8    ━
▒9 10 11 ▒12 ▒13 14 15  ━
16 ░17 18 █19 20 [21] 22 ─

THIS WEEK                    SETS
Legs       ▓▓▓▓▓▓▓▓░░░░     8/12
Chest      ▓▓▓▓▓▓░░░░░░     6/10
...
```

**Calendar**
- Four rows, Monday to Sunday. The oldest week is on top and this week is
  on the bottom.
- Each day shows its date number and a shaded tile: ░ ▒ ▓ █ for working sets.
- The levels match History's heatmap for the same day: the same rule, with
  the maximum taken over the same 52 weeks.
- Today is outlined; future days are blank.
- A mark at the end of each row shows that week against the weekly target:
  met, partly met, or none. This is the same rule as the heatmap's week
  marks.
- Tapping a trained day opens its session (the first session if there
  are two).

**This-week panel**
- One row per body part, in a fixed order: Legs, Chest, Back, Shoulders,
  Arms, Core.
- Each row has a dither bar and an "x/y" count.
- A row is hidden only when both x and y are 0.
- If x is over y, the bar is full and the number shows it, e.g. "12/10".
- If y is 0 and x isn't, the row shows "4 · unplanned".

**Done (x)**
- Working sets this week, Monday to Sunday.
- Each set counts 1 toward the group of its lift's first-listed muscle.
- Lifts with no muscles tagged are skipped.

**Planned (y)**
- Weekly target = the profile's sessions-per-week target.
- y = the program's planned sets for each session already logged this
  week, plus the planned sets for the next sessions in the rotation, until
  the week has that many sessions.
- The minimum version doesn't lower y. Imported sessions with no program
  session add to x but not to y.

**Body-part groups**

| Group | Muscles |
|---|---|
| Legs | quads, glutes, hamstrings, adductors, calves |
| Chest | chest |
| Back | lats, upper_back, traps |
| Shoulders | front_delts, side_delts, rear_delts |
| Arms | biceps, triceps |
| Core | abs |

A muscle tag that isn't in this table is skipped. The code needs a test
proving every muscle in the catalog belongs to a group.

### History

- The 52-week `SquareHeatmap` goes at the top. It keeps the week marks and
  the legend, and tapping a day opens its session.
- Below it, every session, newest first, under month headings. The row
  design stays as it is.
- The month calendar, the month arrows and the day filter are removed.
- "Log past session" stays.

### Progress

- Remove the heatmap.
- New order:
  1. Goal board
  2. Benchmarks
  3. Lifts · 90 days
  4. Training summary: the stats grid and the fun line
- The "vs gym-goers" bars inside the summary repeat Benchmarks, so they
  are removed.

## Left to the builder

- Spacing, labels and empty states, following `docs/DESIGN.md`.
- Use the same per-slot set counts that the session planner already
  resolves, including phase overrides.
- The tests:
  - grouping
  - done and planned counts across a week boundary
  - the calendar's 4-week window on a Monday and on a Sunday
- Check everything in the browser at 390 × 844, on real data.
