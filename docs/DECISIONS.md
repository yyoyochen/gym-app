# Decisions log

Build decisions not already settled in [PWA-SPEC.md](PWA-SPEC.md). Newest last.

## 2026-11-21 — overnight build

**Fresh repo, not a rewrite.** The previous server build's history contains personal files (program config, database WAL files), so the public repo starts with a new history. The old repo stays local as the archive.

**Private-data guard = one script, two callers.** `tools/check-private.mjs` runs as the pre-commit hook (staged files) and in CI (all tracked files). It blocks: anything under `testdata/private/`, database files, `config.yaml`, CSVs outside fixture folders, any file containing the training-log CSV header *followed by a data row* (the header alone, as quoted in docs, is allowed), and local marker strings listed in the git-ignored `testdata/private/markers.txt`. The hook fails closed if Node can't be found. Verified by trying to commit the real log both directly and disguised as a `.txt`.

**No React plugin for Vite.** esbuild compiles JSX on its own; the plugin only adds fast refresh. Dropped as a moving piece (it also failed to install on 2026-11-21 because a transitive Babel version wasn't published yet).

**Hand-written service worker instead of vite-plugin-pwa / Workbox.** Same dependency failure, and the need is small: precache every built file, serve cache-first, install updates in the background and activate them only when the app asks (never mid-session). A ~20-line Vite plugin bakes the file list into `sw.js` at build time.

**Hash routing.** `#/today`, `#/progress`… works on any GitHub Pages sub-path with no server rewrites, and needs no router library.

**No Tailwind, React Query, Zustand or chart library.** Plain CSS on the LUME tokens; Dexie live queries for data; small SVG charts drawn by hand. Each removed dependency is one less thing to update.

**Fonts bundled, not loaded from Google Fonts.** The app makes no network calls (spec §7); `@fontsource-variable` packages ship the same two typefaces as files.

**Benchmarks exclude Wraps.** Raw only, one best result per lifter (by total), deduped per population, Mx excluded, age from `Age` or the `AgeClass` midpoint. A tested bucket with fewer than ~200 lifters (after pooling neighbouring bodyweight bands) falls back to the all-raw table and says so.

**Back-off % is a percentage everywhere** (85 = 85% of the top set): templates, editor, engine.

**Default template = Yoyo's current plan shape.** Full body A/B/C top sets are a double at ≥ 2 RIR, then 3 × 8–10 back-offs at 75% (deadlift 2 × 8–10). Strength templates keep 85% back-offs.

**Double progression reads the worked load.** Imported logs don't mark ramp sets as warm-ups, so "the heaviest set" is often one ramp single. The engine uses the committed target weight if sets were logged at it, otherwise the load with the most working sets (ties → heavier). Strength mode uses the same idea (bug (a) in the old KNOWN-ISSUES).

**Re-entry 3 × 8 is capped at an ~11-rep load.** After 21+ days off, 3 × 8 anchors on the last working weight but never above `e1RM × 30 / 41` (8 reps + 3 in reserve). This stops it from anchoring on a heavy single, which imported sessions don't label as a top set.

**Extra planned sets repeat the last promised set.** The "as planned" ghost rows used to pad with the top of the rep range (12, 20 reps), which made a normal session read as BEAT.

**Engine text is cleaned for display, not changed at source.** The Python parity fixtures pin the engine's exact strings. Every screen passes criterion/why text through `ui/readable.ts` (no `[8, 8]`, × between numbers, "bodyweight" instead of "0kg"), so all screens show identical words.

**Consistency counts weeks from the first logged session** of the year, not 1 January.

**A frozen promise keeps the effort scale it was committed in.** Switching RIR → RPE re-labels sets and future plans; a committed criterion still reads "≥ 2 RIR".

**Weeks run Sunday → Saturday** (heatmap, "n of 3 this week", consistency).

**Imported sessions don't advance the program rotation** and have no verdicts (they have no commit).
