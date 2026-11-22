<!--
Copied from the source model's METHODOLOGY.md. The model itself
(build_standards.py, strength_standards.json, strength_standards_wide.csv)
lives outside this repo. The app ships only the compact table built from it:
`node tools/standards/build.mjs path/to/strength_standards.json` writes
web/public/standards/gym-standards.json; the rating code is
web/src/benchmarks/gymStandards.ts (a port of rate(), parity-tested against
the Python model in gymStandards.test.ts). The "Files" section below refers to
the source folder, not to files in this repo.
-->

# Gym-goer strength standards: methodology

Population: self-reported gym lifters, not meet competitors. Levels: beginner ~5th, novice ~20th, intermediate ~50th, advanced ~80th, elite ~95th percentile.

## What is data
- Squat, bench, deadlift anchors: p50/p75/p90 for male 20-29 from Symmetric Strength self-reported gym logs (2015-2026), read via FitnessVolt's published aggregates. Squat 273/328/386 lb, bench 206/244/283, deadlift 329/394/459.
- Lognormal fit to those points. Implied sigma: squat 0.271, bench 0.249, deadlift 0.264. p75 and p90 give nearly identical sigma, which supports the fit.
- Under-20 age factor (0.91 to 0.94) from the same source.

## What is assumed (check before relying on it)
- Reference male bodyweight 83 kg for the anchors. Not stated in the source cohort.
- Bodyweight scaling: absolute 1RM proportional to BW^0.70, flat outside 45-130 kg.
- Female values: male anchor times a factor (squat 0.58, bench 0.47, deadlift 0.59) at a 63 kg reference. Factors come from StrengthLog population averages, not matched percentiles. Lowest-confidence part of the model. Female spread is assumed equal to male.
- Overhead press = 0.65 x bench, sigma 0.26.
- Ages 30+ multipliers.
- Every accessory, machine, dumbbell, Olympic and bodyweight standard. These are ratios to a base lift (coaching rules of thumb) or editorial rep tables. Each carries confidence B or C.
- Accessory spread equals its base lift's spread. Real accessories usually vary more.

## Known limits
- Self-report inflates numbers, so percentiles read generous versus audited lifts.
- Machine and cable values depend on brand, pulley ratio and stack labeling. Treat as rough.
- Dumbbell and kettlebell values are per implement.
- No measured gym-goer dataset exists for most of these lifts. Replace ratios with logged user data when you have it.

## Licensing
Checked 2026-11-22. FitnessVolt publishes its strength-standards data under CC BY 4.0 ("free to use, adapt, and redistribute with attribution"), covering both its competition (OpenPowerlifting) and self-reported gym (Symmetric Strength) percentiles: https://fitnessvolt.com/strength-standards/strength-data/. Its one condition is a visible attribution link back to FitnessVolt on any page or product that displays the data; it also asks that the underlying source be cited.

GymBro's anchors were read from these pages (men 20-29 p50/p75/p90; under-20 ratios from the under-20 medians):
- Squat: https://fitnessvolt.com/strength-standards/squat/
- Bench press: https://fitnessvolt.com/strength-standards/bench-press/
- Deadlift: https://fitnessvolt.com/strength-standards/deadlift/

How the app complies: every place that shows a level (Progress benchmarks, each lift's Level section, the levels (i) sheet) and Settings' data credits carries the link "Strength Standards data by FitnessVolt" (CC BY 4.0) and names the Symmetric Strength dataset as the underlying source. The anchors are third-party-derived figures, not covered by GymBro's MIT licence. Symmetric Strength's own terms grant no licence and forbid scraping its service; GymBro does not use its service, only FitnessVolt's published aggregates.

Never mix in Strength Level data: its terms require permission even for free, open-source apps. It stays in local preview builds only (testdata/private/, checked by tools/check-bundle.mjs).

## Files
- `strength_standards_wide.csv`: one row per exercise, sex, bodyweight. Open in a spreadsheet.
- `strength_standards.json`: full structure plus metadata.
- `build_standards.py`: regenerates everything. `rate(exercise_id, sex, bodyweight_kg, value, age=None)` returns level and percentile.
