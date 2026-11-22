# Round two: pickers, sparklines, aligned numbers, cleaner settings

Status: draft for approval. Date: 2026-11-22. Branch: `round-two` (local only).
Mockup (outside the repo, example numbers): `gymbro/mockups/round-two-ideas.html`.

## Intent

Fifteen notes from the user after using the app. Common thread: native browser controls break the design system, some numbers do not line up, some screens carry explanation that should sit behind a small (i), and a few controls are ambiguous or unneeded.

## Goals

1. **Pickers in the app's own style.** Every native `<select>` (5) becomes a list sheet. Every native date input (5) becomes a calendar sheet.
2. **Aligned numbers.** Weights and reps line up in columns; decimals are a small raised fraction in its own slot.
3. **Sparklines, not glyph trends.** Lifts list and a new "Best weight at reps" table use step sparklines.
4. **Quieter lift chart.** PR = triangle, target = diamond, no ceiling band, dotted accent target lines with a smaller label.
5. **Less clutter, same information.** (i) pop-ups replace "About these levels", "vs competitive powerlifters", and explain heatmap Less/More.
6. **Fewer, clearer controls.** No set-kind picker, no "System" theme, no benchmark-population option, a labelled on/off toggle, per-platform storage copy, a plain date in the header, session rename.

## Non-goals

- Changing stored data shape. `profile.benchmarkPopulation` stays in the data and in backups, unused, so old backups still restore.
- Keeping any powerlifter comparison. It is removed with its option.
- New colours or new type roles.

## Anti-goals

- A custom control that is harder to use than the native one: keyboard, screen reader and 48 px touch targets must all still work.
- A decimal display that changes the value it shows.

## Approaches considered

Decimals: (A) small raised ".5" in its own slot, (B) a bare superscript digit "82⁵". **Picked A**; B can be read as a power.
Sparklines: normal line or step. **Picked step**, to match the charts.
Set kind: keep a picker, hide it behind "advanced", or remove it. **Picked remove.**
PR density: every new best, or best of each month. **Picked every new best.**

## The design

### Pickers (kit components)

- **`Select`** (`ui/kit`): a field showing the current value and a chevron. Tapping opens the existing `Sheet` with one 48 px row per option, the selected row inverted (ink fill) with a pixel check. Props mirror a native select: `label`, `value`, `options`, `onChange`. Used in SessionDetail (pain area), Profile (injury area, lift), GoalParts (target subject), ProgramEditor (model override).
- **`DatePicker`** (`ui/kit`): the `DateField` field becomes a button showing the date; tapping opens a `Sheet` with a month grid. Monday first, previous/next month 48 px buttons, today outlined, the picked day filled, days after `max` or before `min` dimmed and inert, days that have a logged session marked with the dither tick. Footer: Cancel and a primary button whose label the caller sets ("Move session"). Arrow keys move the focused day, Enter picks, Escape closes; each day has an `aria-label` ("Thursday 19 November 2026, trained").
- **`InfoButton`** (`ui/kit`): a 20 px (i) with a 48 px hit area (like the toggle's) that opens a `Sheet` with a short explanation. Used for levels (replacing the "About these levels" disclosure on Progress and the lift page) and for the heatmap legend.

### Aligned numbers

- A shared `Load` display: whole kilos in a 3 `ch` right-aligned slot, then a 2 `ch` slot holding the fraction (".5", ".25", ".75") at 0.6 em raised, then `×`, then reps in a 2 `ch` right-aligned slot. Tabular numerals; if Schibsted Grotesk has no `tnum`, use Space Mono for the slots.
- Applied to: set cells (decimal slot becomes the raised fraction), session page set rows, the lift page rep table, PR rows. Inline history lines ("Back Squat 105 × 2") stay as text, since lift names vary.

### Lift chart

- PR sessions: filled up-triangle on the line (replaces the filled square). Target: diamond, at the right end of an in-range target line and as the marker in the ceiling lane (replaces the lane arrow). Latest: hollow square, unchanged. Legend shows all three.
- Remove the dither band at the ceiling and the space it took.
- Targets: dotted accent line (same `1 3` dash as the grid, accent colour), label in the micro role without bold.

### Sparklines

- **Lifts list** (Progress): `trendGlyphs` is replaced by a 72 × 22 step sparkline of that lift's e1RM over its last 12 sessions, ink 1.5 px with an accent square at the end. The `trend` accessible label stays.
- **Best weight at reps** (lift page, in place of "Best reps at weight"): one row per rep count n in 1, 2, 3, 5, 8, 10, 12 showing the heaviest weight ever lifted for **at least n reps**, with the date, and a step sparkline of that value over time. A row whose weight equals the row above is dropped, so the table collapses to the real steps. Row 1 is the heaviest weight lifted for any reps, labelled "1RM".

### Settings and clean-up

- Theme: Dark or Light. A stored "system" is read as Dark.
- Benchmark population: the Settings option, the powerlifter comparison sections on Progress and the lift page, and the code and bundled data only they used are removed.
- Toggle: the track shows ON or OFF text; the knob and fill logic stay.
- Storage: text by platform. Installed app: "The browser keeps this app's data." Android, not installed: "Install the app (Add to Home screen) and Chrome keeps your data." iPhone: the existing Home Screen text. The request button shows only while not persisted and not installed; if the request is denied, show the install text.
- Header stamp: the lockup's `©22.11.26` becomes a plain short date, "Sun 22 Nov" (also in the PR moment label).
- Session rename: a Rename action beside Change date on the session page edits `nameSnapshot` through `updateSession`.

### Set kind

- The "Set kind" picker is removed from the Adjust sheet and the Edit set sheet.
- Kind is inferred: the logger row being logged decides it (warm-up row, top set, back-off, else working). Ad-hoc and past sessions log as working; the ramp rule already shows light lead-in sets as ramp.
- Edit set gets one **Warm-up** toggle. Toggling on sets kind `warmup`; toggling off restores the set's earlier kind (or working if it had none).
- `drop` sets can no longer be created from the UI; existing ones keep their kind.

## Constraints

- Token-only styles; `npm run build` check-styles at 0 violations, `ds-allow` cap stays at 6. No new colours, no new type roles (micro is the smallest label).
- No dot separators (the `dot` rule applies).
- All touch targets at least 48 px (the (i) via its hit area).
- Local only: no push, no merge without a yes. Commit messages carry no Claude attribution.

## Left to the builder

- Whether the calendar sheet shares code with the heatmap's month logic.
- Exact sparkline point count when a lift has fewer than 12 sessions (draw what exists; none for fewer than 2).
- Which rep counts to show when the lift has no data for a given n.
- Removing dead code and data left by the powerlifter comparison, and keeping `tools/check-bundle.mjs` in step.
- Tests: `Select` and `DatePicker` models as pure functions (month grid, disabled days, keyboard moves), rep-max table, sparkline path, `Load` slot split, storage text by platform, theme pref migration, kind inference, session rename.
