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

## 2026-11-21 — gym-goer strength standards

**The modeled gym-goer standards are the default benchmark** (Yoyo's decision). OpenPowerlifting stays as an optional "vs competitive powerlifters" section for squat, bench and deadlift. `Profile.benchmarkPopulation` is now `'gym' | 'tested' | 'all'`, default `'gym'`.

**Schema 2 migrates the setting.** A stored `'tested'` that no saved profile version ever changed is the old default and becomes `'gym'`; `'all'`, or a switch back to `'tested'`, is kept. Backups at schema 1 and older undo copies are migrated the same way.

**The shipped table is rebuilt, not copied.** `tools/standards/build.mjs` recomputes the squat/bench/deadlift lognormal fits at full precision from the anchor percentiles in the model's JSON (the JSON stores them rounded to 4 decimals) and checks them against the rounded values, so the TypeScript `rate()` matches the Python exactly (same level on every case, percentile to the model's own 0.1 rounding). The normal CDF and its inverse are written out in `benchmarks/normal.ts` (no dependency).

**Weighted pull-up / chin-up / dip.** The model's value is added-load 1RM ÷ bodyweight. The app estimates the added-load 1RM as Epley(bw × factor + added, reps) − bw × factor, using the exercise's bodyweight factor (0.95) like every other bodyweight e1RM in the app, and divides by the full bodyweight as the model defines. Using factor 1.0 instead would add ~0.05 × bw × reps / 30 kg (≈ 0.7 kg at 80 kg × 5 reps). The weighted standard is used whenever added-load sets exist in the 90-day window; otherwise the reps table, labelled "best set, not a max test".

**Holds have no seconds field.** Plank, dead hang and L-sit read the logged reps as seconds and say so.

**Dumbbell standards are per dumbbell**, matching how DB lifts are logged. Generic catalog entries that merge lifts with different standards (Leg Curl, Calf Raise, Face Pull incl. band, Rear Delt Fly incl. reverse pec deck, Overhead Tricep Extension, Hanging Knee/Leg Raise) have no standard rather than a guess; Bulgarian Split Squat defaults to the dumbbell version, Preacher Curl to EZ-bar.


## 2026-11-21 — design system: Ink & Dither replaces LUME

**LUME is retired** (owner rejected mint on dark). The approved look is "Ink & Dither" ([DESIGN.md](DESIGN.md)): one ink per theme, big heavy grotesk numbers, Space Mono spec labels, 1-bit pixel icons and glyph dither as the only ornament. Dark (`#0e0e0e` paper, `#f2f2ee` ink, FT salmon `#fcd0af` accent) is the default; light is salmon paper with navy ink, ink as accent, plus paper grain. No other colours, including for errors: destructive actions are ink with a dashed outline and explicit wording.

**Fonts:** Schibsted Grotesk (variable) and Space Mono 400/700, bundled via @fontsource. Instrument Sans and Spline Sans Mono are removed.

**Tabular figures are not global.** Schibsted's `tnum` also widens `. , :`, which spaced out ordinary sentences. It applies only where columns align.

**Motion is the Apple HIG feel, ported from the approved prototype** into `ui/kit/motion/spring.ts`: an analytic damped-spring solver (response + damping fraction) seeded with release velocity, rubber-banding, fling projection, a velocity tracker. A wall-clock watchdog ends any spring whose frames stop, so a page is never left half-pushed when the tab is backgrounded.

**Android back, not an iOS edge swipe.** The owner uses Android, whose system back gesture owns the screen edges, so there is no custom swipe-back. Every push is a real history entry stamped with its stack index in `history.state`; on popstate a lower index means pop and the pop animation plays. `go()` / `back()` live in `ui/kit/navigation.ts` (`ui/router.ts` re-exports them); plain `#/…` links are stamped on arrival. Tab switches are instant, and popping back over one is too.

**The document no longer scrolls.** The app is a fixed frame; each page is its own scroller. This lets push/pop slide whole pages and a sheet scale the app back at its large detent, and lets scroll be saved per history entry and restored on pop. Screens that called `window.scrollTo` now call `scrollPageTo`.

**Sheets close with a ghost.** Callers either pass `open={false}` or unmount the sheet; in both cases the panel is cloned on unmount and springs out with the fling velocity, so every existing call site gets the exit animation.

**ConfirmButton is an action sheet now**, not a two-tap button. Its old "Tap again to …" labels are turned into a question ("Wipe everything?") until screens pass proper ones.

**Theme is stored in meta (`theme`: system/dark/light, default dark)** and mirrored to localStorage only so `index.html` can set `data-theme` before first paint. `<meta name="theme-color">` follows the paper colour.

**Preview-only code is compiled out of production.** `vite build --mode preview` adds `window.__gymbro` (data-layer functions for local seeding scripts) and a `#/kit` component gallery. Both hang off `import.meta.env.MODE === 'preview'`, a build-time constant, so production builds drop them; `tools/check-bundle.mjs` (run by `npm run build`) fails if either string reaches `dist/`.

**PR detection is a pure helper, not wired yet.** `app/bests.ts` `isNewBest()` (heavier than any earlier working set, else a better e1RM by more than 0.05 kg; never on a lift's first log). The logger and Review are marked `TODO(PrMoment)` for the screen rewrites.
