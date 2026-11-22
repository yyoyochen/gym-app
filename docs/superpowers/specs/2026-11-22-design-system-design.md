# GymBro design system: roles, scale and a check that keeps them

Status: approved, 2026-11-22

## Why

The "Ink & Dither" system (docs/DESIGN.md, approved 2026-11-21) defines tokens,
but the screens built since then mostly ignore them. An audit on 2026-11-22
found:

- **Type:** 47 `font:` declarations bypass the 15 type tokens. That gives
  12 sans sizes (12, 14, 15, 17, 18, 19, 22, 26, 30, 40, 56, 52–72 px) and
  6 mono sizes (10, 10.5, 11, 12, 13, 15 px). Two of them sit below the 15 px
  body floor (`.led-p` 14, `.led-d` 12), and one asks Space Mono for weight
  600, which isn't installed.
- **Spacing:** `--space-*` is used 0 times, against 270 raw px values. Many are
  off the 4 px grid (3, 5, 6, 7, 9, 10, 14, 18, 22).
- **Lines:** DESIGN.md says 1.5 px is "the only solid line weight". The CSS
  uses 1 px solid (8 places), 1.5 px (2) and 2 px (2).
- **Letter spacing:** 18 distinct values, 11 of them raw.
- **A hidden third font:** Space Mono has no `░▒▓█`. Dither bars and the glyph
  heatmap fall back to the device's own monospace font (SF Mono on iPhone), so
  they change face and weight from device to device.
- **Already clean:** colour (no raw hex outside the token files) and radius
  (all 0).

The owner wants one system the whole app follows, so every screen looks like
the same app and new work can't drift again.

## Goals

- Every text style in the app is one of a fixed set of named **roles**. Each
  role has one job, and nothing else exists.
- Spacing sits on a 4 px grid, and lines come in two weights.
- The dither glyphs `░▒▓█` render in one bundled font that GymBro owns, the
  same on every device.
- A check fails the build and the test suite whenever CSS or an inline style
  goes around the tokens.
- docs/DESIGN.md is rewritten as the single reference for the system, and is
  accurate on the day it lands.
- Components exist for visual patterns that repeat 3 or more times.

## Non-goals

- No new colours, themes or visual direction. Ink & Dither stays as approved.
- No change to motion, navigation, the dither shadows or the icons.
- No redesign of any screen's layout. Only sizes, spacing and lines move.
- The Excalidraw flow and the mockups are out of scope. They can follow later.

## Anti-goals

- A screen that looks different in a way nobody chose. Every visible shift is
  either listed in the before/after review or is a bug.
- An escape hatch so wide that drift comes back through it. Exceptions are
  per line, carry a reason, and are counted.
- Any text drawn in a font the app didn't bundle.

## Constraints

- Offline-first PWA: fonts are bundled, and new font files must land in the
  service-worker precache through the normal build.
- Plain CSS, no preprocessor and no CSS-in-JS, as today.
- `tools/dither/build-css.mjs` generates `dither.css`. Edit the generator,
  never its output.
- Local only: commit to a branch, and no push until the owner says so.

## Approaches considered

- **A · Tokens as law, enforced by a check (picked).** Define the roles and
  scales, move every stray value onto a token, and add a check that fails on
  raw values. Add components only for patterns repeated 3 or more times.
  Cost: a wide CSS diff, with small (±2 px) visual shifts on several screens.
- **B · Components first.** Turn every repeated pattern into a `ui/kit`
  component so screen CSS nearly disappears. Ruled out: 2–3× the work, and
  more risk of breaking layouts that work today.
- **C · Docs only.** Write the system and migrate when screens get touched.
  Ruled out: nothing stops new drift, which defeats the point.

Glyphs: the owner chose to **keep `░▒▓█` as text**, over drawing the bars as
pixel tiles.

## Design

### Type: 16 roles, 2 families

Each role is a pair of tokens in `tokens.css`, `--text-<role>` (the `font`
shorthand) and `--track-<role>` (letter spacing), plus a class `.t-<role>` in
a new `styles/type.css` that sets font, tracking and, for caps roles,
`text-transform: uppercase`. Screen CSS uses the token pair; JSX can use the
class.

The old type tokens are renamed or deleted, with no aliases, the same way the
LUME aliases were removed on 2026-11-21.

**Schibsted Grotesk: numbers and words**

| Role | Spec | Job | Absorbs |
|---|---|---|---|
| `hero` | 800 · clamp(88–128px)/0.82 · −0.055em | the screen's number | existing token |
| `display` | 800 · clamp(64–104px)/0.84 · −0.05em | logger "next set" | existing token |
| `num-xl` | 800 · 56px/0.86 · −0.045em | BigNumber `lg`, onboarding question | `.bignum.lg` 56, `.onb-q` 52–72 |
| `title-lg` | 800 · 40px/1 · −0.04em | large title, next-rest number | `--text-large-title`, `.next-r` |
| `num-lg` | 700 · 30px/1.05 · −0.02em | unit beside a hero, PR sub, big input | `.pr-sub`, `input.field.big` |
| `num-md` | 700 · 22px/1.05 · −0.02em | stepper input, date stamp, kept unit | `.stepper-input` 22, `.kept .bignum-u` 600 22, `.tk-sdate b` 26 |
| `title` | 650 · 19px/1.25 · −0.01em | session and screen titles | existing token |
| `value` | 650 · 17px/1.25 · −0.01em | row values, headings, action-sheet buttons | 8 hard-coded 17px rows, `--text-num-md` 19, `--text-heading`, `.asheet-btn` 18 |
| `body` | 400 · 15px/1.45 · 0 | sentences; the 15 px floor | existing token |
| `body-strong` | 500 · 15px/1.35 · 0 | promise, criteria, captions | `.promise-text` 17, `.lg-spec-crit`, `.bignum-c`, `.tk-hrow-v` |
| `quiet` | 400 · 13px/1.35 · 0, `--mid` | the grey label over a value | `.led-p` 14, `.led-d` 12, `.tk-led-p` |

The 15 px floor applies to running text. `quiet` (13 px) and the mono roles
are labels, never sentences.

**Space Mono: the spec-sheet voice**

| Role | Spec | Job | Absorbs |
|---|---|---|---|
| `label` | 400 · 11px/1.25 · caps +0.04em | spec labels, legends, day initials | `.tk-since`, `.tk-legend`, `.gheat-legend`, `.rweeks-d` |
| `stamp` | 700 · 11px/1 · caps +0.1em | verdicts, level chips, ready mark | `.std-level`, `.ready-mark`, `.lg-spec-name` 12, `.feas` 600 12, setup 10.5 ×2, base 700 11 |
| `mono` | 400 · 12px/1.35 · 0 | stats, `//notes`, set sheets | `.tk-fun` |
| `button` | 700 · 13px/1 · caps +0.08em | buttons | setup 13 |
| `micro` | 400 · 10px/1.2 · caps +0.04em | chart ticks, tab captions, small units | `.tk-tick`, `.tk-sdate span`, `.tk-scount small` |

The "Absorbs" column comes from the audit and is a starting map, not a
complete list. Every remaining raw `font:` declaration is assigned a role
during migration.

### Dither glyphs: a bundled "GymBro Glyph" font

- A generator, `tools/dither/build-glyph-font` (Python fontTools, which is
  already installed), writes `web/src/styles/fonts/gymbro-glyph.woff2`. The
  font is GymBro's own work, so there is no licence question.
- It contains 4 glyphs: `░` (U+2591), `▒` (U+2592), `▓` (U+2593) and `█`
  (U+2588). `·` and `→` stay in Space Mono, which has them.
- `░`, `▒` and `▓` are drawn as the same Bayer 4×4 patterns at 25 / 50 / 75%
  that `dither.css` uses, so bars, heatmap and shadows share one texture.
  `█` is solid.
- Each glyph's advance width equals Space Mono's, so `1ch` grids and glyph
  strings line up with the mono text around them. Vertical extent matches
  Space Mono's ascender and descender, as standard block elements do.
- Pattern cell size: 1/7 em, so a cell is exactly 2 px at the 14 px bar size,
  matching the 2 px dither cells.
- `@font-face { font-family: 'GymBro Glyph'; unicode-range: U+2588, U+2591-2593 }`
  goes first in `--font-glyph`. The system fallbacks stay behind it.
- The generator is committed, and so is its output, as with `dither.css`.

### Spacing: 4 px grid

| Token | px | Typical job |
|---|---|---|
| `--space-half` | 2 | dither offsets only (one pixel cell) |
| `--space-1` | 4 | icon to label, tight pairs |
| `--space-2` | 8 | inside a row |
| `--space-3` | 12 | between rows |
| `--space-4` | 16 | inside a section |
| `--space-6` / `--gutter` | 24 | screen sides |
| `--section` | 28 | between sections (was 26) |
| `--space-8` | 32 | big breaks |
| `--space-12` | 48 | touch target |
| `--space-16` | 64 | page bottom clearance |

`--space-5` (20), `--space-7` (28) and `--space-10` (40) are deleted;
`--section` covers 28.

Off-grid values snap to the nearest step, judged in place:

- 3 → 4
- 5, 6, 7, 9 → 4 or 8
- 10 → 8 or 12
- 14 → 12 or 16
- 18 → 16
- 22 → 24

Fixed dimensions are geometry, not spacing, and stay raw: tab-box width,
heatmap cells, touch heights already tokenised as `--touch-*`.

### Lines: two weights

| Token | Spec | Job |
|---|---|---|
| `--hair` | 1px dotted, `--rule` colour | dividers between rows, empty tracks, quiet outlines |
| `--rule-w` | 1.5px solid, ink | section heads, outlines that carry meaning (HIT, active tab, inputs, Lockup) |

1 px solid and 2 px both become one of these two. The selected calendar day
(2 px inset accent ring) becomes 1.5 px.

### Components for repeated patterns

Rule: a visual pattern that appears 3 or more times across screens becomes a
`ui/kit` component. The audit found two candidates:

- **Value row:** label left, `value` right, hair divider. It appears in
  `.lg-row`, `.tk-srow`, `.srow`, `.toggle-row` and similar.
- **Legend:** a `label`-role strip with glyph swatches. It appears in
  `.tk-legend`, `.gheat-legend` and the square heatmap legend.

The builder confirms both counts and adds any other pattern that reaches 3.
Patterns below 3 stay as screen CSS on tokens.

### The check: `tools/check-styles.mjs`

The check runs inside `npm run build` (next to `check-bundle`), and as a vitest
test so `npm test` fails too. It scans `web/src/styles/*.css`, except
`tokens.css`, `type.css` and the generated `dither.css`, and `web/src/**/*.tsx`
`style={{}}` objects. It fails on:

1. Any `font`, `font-size`, `font-weight` or `font-family` value that isn't
   `var(--text-*)`, `var(--font-*)` or `inherit`.
2. A `letter-spacing` that isn't `var(--track-*)`, `0` or `inherit`.
3. `padding`, `margin`, `gap`, `row-gap` or `column-gap` with a raw length other
   than `0`. Allowed: `var(--space-*)`, `var(--gutter)`, `var(--section)`,
   `calc()` of those, and `env(safe-area-*)`.
4. A border width that isn't `var(--hair)`, `var(--rule-w)` or `0`.
5. A hex, `rgb()` or `hsl()` colour.
6. A non-zero `border-radius`.
7. A `box-shadow` or `text-shadow`.
8. In TSX inline styles, `fontSize`, `fontWeight`, `letterSpacing`, `padding*`,
   `margin*` or `gap` with a number or raw px.

Escape hatch: a same-line comment `/* ds-allow: <reason> */`. The check prints
every allowed line with its reason and a count. Two lines are known to need
it: the page-edge `box-shadow` used during push, and the computed heatmap
geometry in `SquareHeatmap` / `RecentWeeks`.

The check has its own unit tests, using fixture CSS that breaks each rule
once.

### docs/DESIGN.md

DESIGN.md is rewritten as the single reference. Its sections:

- principles (unchanged)
- colour tokens (unchanged)
- type roles: the tables above, with the glyph font
- spacing and lines
- the components table, updated with today's kit:
  - `SquareHeatmap` and `RecentWeeks` (Monday-first)
  - the tab bar's active box
  - the new row and legend components
  - an honest status for `GlyphHeatmap`
- motion (unchanged)
- accessibility (unchanged)
- anti-patterns, plus a line on the check and the escape hatch

`docs/design-tokens.css` duplicates `tokens.css`. It is deleted, and DESIGN.md
points to `tokens.css` alone.

The `#/kit` gallery gains a "Type roles" section that renders every role from
`.t-*`, so the live gallery and the doc can't disagree.

### Verification

- `npm test` and `npm run build` pass. The check reports 0 violations and
  lists the allowed lines.
- Screens are captured at 390 × 844 in dark and light, before and after, from
  the preview build on real data:
  - Today
  - Session/logger
  - Session detail
  - Progress
  - Lift detail
  - History
  - Profile
  - Setup
  - Onboarding
  - the PR moment
  - an action sheet
- Every visible difference is either one of the listed merges or gets fixed.
- On the live app, the computed `font-family` of a dither bar resolves to
  GymBro Glyph, and the production build's precache includes the woff2.

## Visible changes the owner has seen

These were shown in the specimen (`mockups/design-system.html`):

- Row values all become 17 px (today: 17 px ×8, 19 px ×7).
- The ledger's 12 / 14 px grey lines become 13 px `quiet`.
- The History date stamp goes 26 → 22 px.
- The onboarding question goes from fluid 52–72 px to a fixed 56 px.
- Small bold mono at 10.5, 11, 12 px and weight 600 all become `stamp`
  (11 px bold caps).
- The section gap goes 26 → 28 px. Selected-day ring 2 → 1.5 px.

## Settled after the builder check (my calls)

- **Old type tokens.**
  - `--text-num-md` (19 px) and `--text-num-sm` (16 px) both move to `value`
    (17 px). `--text-heading` moves to `value`, and `--text-large-title` to
    `title-lg`.
  - Migrate every existing `--text-num-md` use first. Only then reuse the name
    for the new 22 px role, so no call site changes meaning silently.
  - 18 CSS lines use these old names today.
- **Roles are fixed.** There are no weight or case variants of a role. If a
  screen needs bold at 17 px, that is `value`, or a new role added here.
  - A rule block that uses a caps role (`label`, `stamp`, `button`, `micro`)
    writes `text-transform: uppercase` next to it.
  - The check enforces this: a caps role without the uppercase line fails.
- **Shadows.** Of the 4 hand-written shadows:
  - The 2 page-edge push shadows get `ds-allow`.
  - The 2 calendar-day rings (`.cal-day.today`, `.cal-day.sel`) become
    `outline: var(--hair|--rule-w)` with a negative `outline-offset`.
  - The check's border rule (4) also covers `outline` widths.
- **Inline styles (rule 8).** Only the listed props are checked. `width`,
  `height`, `left`, `top`, `transitionDelay` and grid placement are geometry,
  and pass.
  - The TSX escape is `// ds-allow: <reason>`, or `{/* ds-allow: <reason> */}`
    inside JSX, on the same line.
  - The scanner is a regex over `style={{…}}`, with no TypeScript parser.
- **Spacing tokens.** `--space-*` has 0 uses today, so deleting `--space-5`,
  `--space-7` and `--space-10` breaks nothing.
- **Glyph font metrics.** The generator reads Space Mono's advance width,
  ascender and descender from the bundled `@fontsource/space-mono` 400 woff2
  in `node_modules`. Nothing is hard-coded.
  - The 14 px dither bar wins: 1/7 em cells, exactly 2 px.
  - `GlyphHeatmap` (11 px) now renders only in the `#/kit` gallery, so smearing
    there is acceptable and gets a note.
- **Verification data.** Use the s1 preview build (`~/.gymbro-preview/build-s1.sh`,
  Notion seed, port 5193).
  - Unregister the service worker and clear caches first.
  - The PR moment and the action sheet are reached from `#/kit`.

## Left to the builder

- The role for each remaining stray `font:` declaration, and the snap
  direction for each off-grid spacing value. When a call is close, keep what
  looks closest to today.
- Final names and props for the row and legend components.
- How the check parses CSS: a regex per declaration is enough, and no new
  dependency is needed.
- Whether any 11 px glyph use outside `#/kit` turns up during migration. If
  one does, note it in the ledger.
