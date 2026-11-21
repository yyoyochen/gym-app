# Strength Level as a local-only test benchmark

Status: approved, 2026-11-22

## Why

I want to see my lifts against Strength Level's tables while testing,
before I tune GymBro's own standards model. The tables come from
strengthlevel.com, so they must never ship: not in the repo, not in the
public build.

## Goals

- In my local preview builds, a loaded lift for a male lifter is rated
  against Strength Level first, whenever the table covers it. This changes
  the level, the percentile, the "next level" target and the level ladder.
- Anything the table doesn't cover falls back to the current gym-goer
  model, unchanged:
  - female lifters
  - lifts missing from the table
  - bodyweight and rep-based lifts

## Non-goals

- No in-app switch between sources. A preview build with the file uses it;
  every other build doesn't.
- No age adjustment, because Strength Level has none. The age factor is
  skipped when a Strength Level row is used.
- No change to OpenPowerlifting or to the public standards file.

## Anti-goals

- Any Strength Level number reaching git, the public build, or the service
  worker's cache.

## Approaches considered

- **Local file, preview builds only (picked).** No licence risk. The
  public app keeps the current model.
- Ship it in the repo. Ruled out: it would redistribute their data.
- Ask Strength Level for permission first. Not needed while this is only
  for testing.

## Design

**Source**
- The source file is `strength_level/strength_standards_all_kg (4).csv`,
  outside the repo.
- It has 138 exercises, each with 5 levels (Beginner to Elite) at 21
  bodyweights from 50 to 141 kg.
- It covers male lifters only.

**Converter**
- `tools/standards/strength-level.mjs <csv>` writes
  `testdata/private/strength-level.json`, which is git-ignored.
- It keeps only rows in kg, and maps each Strength Level exercise name to
  the app's standard id, e.g. "Squat" → `back_squat`.
- The mapping holds names only; it lives in the tool and has no numbers.
- Unmapped names are printed so I can extend the map.
- Output shape: `{ source, tables: { [standardId]: { bw: number[]; male: number[][] } } }`,
  where each `male` row holds the five thresholds at that bodyweight.

**Loading**
- In preview mode only, `loadGymStandards()` also fetches
  `./__private__/strength-level.json`.
- If that fetch succeeds, it attaches the result as `data.tables`.
- Production code never names the file. `tools/check-bundle.mjs` fails a
  build that contains "strength-level".
- The preview build copies the file into `__private__/`, alongside the
  Notion CSV.

**Rating**
- In `rate()` and `levelsAt()`, a loaded lift for a male lifter whose
  standard id is in `data.tables` gets these steps:
  1. Interpolate the five thresholds linearly between the two nearest
     bodyweight rows. Clamp to the table's range.
  2. Turn the lift's value into a percentile with the piecewise-linear rule
     that bodyweight standards already use:
     - between the 5/20/50/80/95 points, interpolate linearly
     - below Beginner, scale up from 0
     - above Elite, 97
  3. Take the level and the next-level target from the same thresholds.
- Confidence label: "Strength Level table".

**UI**
- The Benchmarks section's subtitle reads "vs Strength Level" when any
  rating on the screen came from the table.
- Otherwise it stays "vs gym-goers".
- Each rated lift's detail names its source.

## Tests

- Public unit tests use a tiny synthetic table, with made-up numbers in
  `__fixtures__`. They cover:
  - bodyweight interpolation
  - a value exactly on a threshold, which gives that level
  - values below Beginner and above Elite
  - the fallback for a female lifter and for an unknown id
- A private test (`GYMBRO_PRIVATE=1`) runs the real converter on the real
  CSV and checks that every catalog lift with a Strength Level equivalent
  is mapped.
- Browser check on real data at 390 × 844: Progress Benchmarks shows
  Strength Level levels, and a production build has no trace of the file.

## Left to the builder

- The exact name map, starting from the catalog's standard ids.
- Wording of the source line on a lift's detail.
