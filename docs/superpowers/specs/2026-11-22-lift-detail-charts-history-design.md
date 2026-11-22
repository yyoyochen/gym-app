# Lift detail: step-line charts, ceiling lane, and cell History

Status: approved by the user 2026-11-22 (replacements as proposed in the Dot sweep table). Date: 2026-11-22. Branch: `tab-jobs` (local only).
Mockup (kept outside the repo, uses real numbers): `gymbro/mockups/lift-detail-ideas.html`.

## Intent

The lift page chart is a point-to-point line on a y-axis that stretches to fit
the next level, so the user's own progress looks small. The History rows are one
long line of sets joined by middle dots, which is hard to read and clips on the
longest days. The user wants charts with more of the app's pixel/dither feel, a
visible "next level" target, and History they can read at a glance.

## Goals

1. e1RM, Top set and Weekly volume charts draw a **step line** (value holds until
   the next session) with no shaded fill.
2. One **y-axis rule** for all three charts, so targets never distort the scale.
3. **Targets live in a ceiling lane** above the plot when they are out of range,
   at their real height when they are comfortably in range.
4. History rows show each set as an **equal-size cell** with digit-aligned numbers.
5. **Dot sweep:** no middle dot (·) used as a separator anywhere in the app, and a
   style-check rule so it cannot come back (see "Dot sweep" below).

## Non-goals

- A weekly-volume target or benchmark. The app has none and the user chose none.
  The volume chart shows only the trend.
- Changing stored data. Warm-up detection is display only.
- Shading, gradients or area fills under any line.

## Anti-goals

- A target that squashes the data into the bottom of the chart.
- A flat line across a long break that reads as "held that strength".
- Cells that change width with their numbers, so columns drift.

## Approaches considered

Chart look: shaded (dither fade under the line), pixel (full 2 px cell build),
level bands (background banded by level). Shading was "too messy" and bands were
not carried forward. Two step-line variants were drawn instead, quiet and pixel.
**Picked: quiet** (smooth 1.5 px stroke, dotted grid, faint dither band at the
ceiling). Pixel stays available later through the same drawing code.

History layout: cells, ramp bars, summary table. **Picked: cells.**

Ceiling percent: 110, 115, 120. **Picked: 120%.** At 115% a label next to a target
near the top ran into the ceiling band.

## The design

### Y-axis rule (all three charts)

- Ceiling = **120% of the best value in view**. Floor = **90% of the lowest**
  (weekly volume floors at 0). Ticks are "nice" values, 3 to 6 of them.
- A target is drawn **at its real height** only if it is at least 22 px (of the
  150 px plot) below the ceiling, so its label has room.
- Any other target (at, near or above the ceiling) is **pinned in the ceiling
  lane**: a row above the plot, right-aligned, with a pixel up-arrow, its name and
  value, and the gap to the current value ("Advanced 191.5 kg +35.5"). Several
  pinned targets stack, nearest at the bottom. Pinned targets never change the scale.
- The lane sits above a thin dither band (two rows, 50% then 25%) that marks the
  ceiling edge.

### Step line

- Horizontal run from each session to the next, then a vertical step. The run is
  drawn **dotted when the gap is longer than 6 weeks**, because there is no data.
- PR sessions get a filled square, the latest point a hollow accent square, as today.
- Weekly volume uses solid bars with no fill pattern and a small tick for weeks
  with no volume. It has no target line and no lane.

### Targets on the e1RM chart

- **Next level**: from `standing.next` (`rateExercise`), already computed on this page.
- **Your target**: from `profile.targets` where `subject` is this lift (`GoalTarget`).
  Shown only if one exists.
- Top set chart: same step line and rule, **no level line**, because levels are
  e1RM-based. (My call, not yet confirmed by the user.)

### History cells

- Each set is one cell, **all the same size**. Four cells per row, wrapping to more rows.
- A cell holds weight in a 3-digit slot, "×", and reps in a 2-digit slot, in the mono
  face, both **right-aligned**, so hundreds, tens and ones line up down the page and
  across sessions. Slot widths are fixed in `ch`, so a missing hundreds digit leaves
  a blank slot and never shifts the number.
- Fill = top set, outline = work set, dotted outline = ramp. Borders are 1.5 px on all
  three so cell height is identical.
- Ramp is inferred at display time: a set **before the day's heaviest set and lighter
  than 80% of it**. All 1,307 imported sets are stored as `working` (the Notion log
  has no warm-up flag), so this is the only source of ramp information.
- A legend below the list explains the three cell styles.

## Dot sweep (app-wide)

The user does not want the middle dot as a delimiter ("very AI feel"). Scan on
2026-11-22: 149 lines contain it in `web/src`, in ~35 non-test files; 47 are code
comments (left alone), ~100 are user-visible. They fall into five kinds:

| Kind | Examples | Replacement (proposed, awaiting the user's pick) |
|---|---|---|
| Joined facts in one line | "12 sessions · 3 weeks at target", "Intermediate · 54th percentile", set lists | Separate spans with a gap, no glyph (the `Parts` pattern already in LiftDetail, SessionDetail, Today). The functions that build these lines (`stats.ts`, `standards.ts`, `consistency.ts`, `coach.ts` setsLine, `logger.ts`) return `string[]`; a `joinParts` helper gives ", " for plain text (aria, title). |
| Label qualifiers | "Height · cm", "Since · optional", "Plates available · kg" | Parentheses: "Height (cm)", "Since (optional)". |
| Button and sheet titles | "Export backup · JSON", "Edit set · Deadlift" | "Export backup (JSON)", "Edit set: Deadlift". |
| Stored session names | "A · Squat + Bench" in `domain/templates.ts`, parsed by `sessionNames` | New templates use "A: Squat + Bench". **Existing stored names keep the dot**, so `sessionNames` accepts both forms. No data migration. |
| Placeholders, not delimiters | `EMPTY = '·'` (dither.ts), unknown-trend glyph, `glyphs \|\| '·'` | Kept. A string that is only "·" is a placeholder, not a separator. |

- **Style check:** `tools/check-styles.mjs` gains a `dot` rule for `.ts`/`.tsx`
  strings: a `·` with whitespace beside it is a violation, a lone `'·'` is not.
  Comments are ignored. No `ds-allow` needed (cap stays at 6).
- **Tests:** 9 test files assert on dot strings and are updated with the code they cover.
- **Order:** the chart and History work first, then the sweep as its own tasks on
  the same branch, with separate commits, so each can be reviewed or reverted alone.

## Constraints

- Design-system rules apply: tokens only, `npm run build` check-styles stays at 0
  violations and at most 6 `ds-allow` lines. Cell slot widths need a token or one
  documented `ds-allow`.
- Chart colours come from `--ink`, `--accent`, `--mid`, `--rule`. No new colours.
- Local only. No push, no merge to `main`.

## Left to the builder

- Where the chart code lives (`ui/progress/LiftChart.tsx` is the current home).
- How a `GoalTarget` value compares with e1RM for the "your target" line. Assumed
  to be a kg figure comparable to e1RM; confirm against `validate.ts` before drawing.
- Accessibility text for the chart (summary sentence including pinned targets).
- Tests: the dot rule in the style check (fixture with a bad and a good string), `sessionNames` with both name forms, the y-axis rule (ceiling, floor, pinned vs in-range, stacking), the 6-week
  dotted hold, ramp inference, and digit alignment of cell slots.
