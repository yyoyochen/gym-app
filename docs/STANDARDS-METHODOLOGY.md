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
The anchor source terms are unverified. FitnessVolt publishes its aggregates under CC BY 4.0 with attribution, but confirm Symmetric Strength's terms before commercial use. Do not mix in Strength Level data without a licence.

## Files
- `strength_standards_wide.csv`: one row per exercise, sex, bodyweight. Open in a spreadsheet.
- `strength_standards.json`: full structure plus metadata.
- `build_standards.py`: regenerates everything. `rate(exercise_id, sex, bodyweight_kg, value, age=None)` returns level and percentile.
