# Language toggle: English and Traditional Chinese

Status: draft. Approach 1 chosen in conversation 2026-11-23 ("1"). Fonts picked on the mockup `~/.gymbro-preview/mockups/zh-fonts.html` (kept outside the repo): **pending**.

## Intent

The owner trains in Taipei and wants the whole app readable in Traditional Chinese, switchable with one `EN / 中文` toggle like gym-sim's, but drawn in gym-app's own design language. "Everything" means every word a lifter sees: screens, buttons, sheets, banners, errors, and the sentences the app writes itself (plans, reasons, grades, tips).

## Goals

1. A Language row in Settings, Appearance (a Segmented `EN / 中文`, beside Theme), and the same control on the first onboarding screen.
2. First launch follows the phone's language (`zh-*` gives 中文, anything else English). After that the lifter's choice wins.
3. Every user-facing string goes through one `t()` and has a Chinese entry. Switching re-renders at once, no reload.
4. Engine and app-layer sentences (plan criteria, `why` lines, reasons, grades, `describeSets`, tips) come out in the chosen language.
5. Built-in lift names are translated; names the lifter typed stay as typed.
6. Dates read the Chinese way: `11月23日 週一`; weekday initials `一 二 三 四 五 六 日`.
7. `<html lang>` follows the choice (`en` or `zh-Hant-TW`), so screen readers read the right language.
8. A Chinese font sits behind each English font, so Latin letters and numbers keep the current look.

## Non-goals

- Simplified Chinese or any other language.
- Translating data formats: CSV import/export column names, backup JSON keys, meta keys, ids. Files keep loading in either language.
- Translating what the lifter typed (lift names, notes, program names).
- Changing units: kg stays kg.

## Anti-goals

- A screen that shows English in Chinese mode (a missed string). A test and a build check must catch it, not the owner's eyes.
- A plan sentence whose numbers differ between languages (the promise-equals-grade invariant: translation changes words only, never values).
- A heavier app for English users than it needs to be: Chinese font files load only in Chinese mode.
- Machine-translation tone. Terms follow what Taiwan gyms say.

## Approaches (picked: 1)

1. **Dictionary keyed by the English text, `t("Plan today's workout")`, picked.** Same pattern as gym-sim's `g0_i18n.js`. No new dependency, code stays readable, and a missing entry is easy to test. `{name}` placeholders handle values; Chinese has no plurals, so English plural forms are separate keys.
2. A translation library (i18next / react-intl): plural and format helpers we don't need for a 2-language app, about 40 kB against a size-checked bundle.
3. Named keys (`t('today.plan')`) in two files: sturdier against English copy edits, but every screen gets harder to read and the change touches far more code.

## Decided

- **Kept in Latin letters:** kg, PR, 1RM, e1RM, RPE, RIR.
- **Glossary (approved terms):** Squat 深蹲, Bench 臥推, Deadlift 硬舉, Overhead press 肩推, Set 組, Reps 次, Top set 最重組, Back-off 遞減組, Warm-up 熱身, Plan 計畫, Beat / Hit / Missed 超越 / 達成 / 未達.
- **Toggle look:** the existing Segmented control (`.seg`), options `EN` and `中文`.
- **Where the choice lives:** meta (exported with backups, like the theme) plus a localStorage mirror read before first paint, so the app never flashes the wrong language.

## Size (inventory, 2026-11-23, about plus or minus 10%)

- About 1,000 unique visible strings (aria labels included) in about 100 of 160 source files; about 60 are sentence fragments split across JSX that must become one template each, since Chinese word order differs.
- About 135 engine and app sentence templates (about 110 with values), 7 tips, 30 validation messages, about 28 plural sites.
- 156 lift names users see: 63 in `domain/catalog.ts`, 93 more in `public/standards/gym-standards.json`.
- 9 hand-made month and weekday arrays in 8 files; `formatDate` has 31 callers; no `Intl` use.
- Text outside React: the PR moment canvas (`ui/kit/PrMoment.tsx`), SVG `<text>`/`<title>` in the charts and heatmaps, the update banner (`sw/version.ts`), `index.html` and the web manifest.

## Engine sentences are translated when shown, not when made (author's call)

The engine's sentences are saved into the database (`Target.criterion`, `why`, `principle`, `LiftResult.detail`) the moment a session is committed, and their English wording is pinned by the Python parity fixtures. So the engine keeps writing English, and the UI translates each sentence as it is shown, by matching it against a table of the engine's templates (English pattern to Chinese template, values carried across unchanged). `ui/readable.ts` already rewrites engine text this way.

- Why: old sessions read in Chinese too, the parity fixtures stay untouched, and the values in a sentence can't change in translation (the pattern only moves them).
- The guard: a test runs every engine template (from the fixtures and generated cases) through the table and fails on any sentence left in English.
- Cost if wrong: an engine wording change silently falls back to English until the table is updated; the test catches it in the suite.

## Fonts (pending the owner's pick on the mockup)

- Schibsted Grotesk gets a Chinese sans behind it; Sometype Mono gets a Chinese font behind it (candidates: Noto Sans TC, Chiron Hei HK, Chiron GoRound TC, Huninn, PingFang TC system; Cubic 11 pixel, LXGW WenKai Mono TC, or the same sans).
- Bundled fonts are cut down at build time to the characters the dictionary actually uses, so they stay small and work offline. Characters outside that set (a lift name the lifter typed in Chinese) fall back to the phone's own font.
- Big roles that use negative letter spacing in English (num-xl, title-lg, num-lg, num-md, title, value) use 0 for Chinese text; caps roles keep their small positive spacing.

## Left to the builder

- Module layout for `t()` and the dictionary file(s).
- Lift names: a Chinese name map keyed by exercise id (matching and ids stay English).
- Running the work in parallel: after the core (`t()`, language setting, dates, fonts) lands, screens split into groups that separate agents translate at once, each owning its own files.
- The check that flags screen text not wrapped in `t()`, and where it runs (tests or `npm run build`).
- The subset step for fonts and its place in the build.
