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
