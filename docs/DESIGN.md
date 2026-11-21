# GymBro design system: "Ink & Dither"

*Approved 2026-11-21. Replaces LUME (mint on petrol dark), which is retired: no
LUME colour, radius or shadow should appear in new work. Tokens:
`web/src/styles/tokens.css`. Components: `web/src/ui/kit/` (import from
`ui/kit`). A live gallery of every component is at `#/kit` in preview builds.*

## 1. Principles

1. **One ink.** Each theme is one paper, one ink and one accent. No other
   colours anywhere, including errors.
2. **The number is the hero.** Every screen leads with one big heavy number
   (Schibsted Grotesk 800, tight tracking). Everything else is quieter.
3. **Weather-app hierarchy.** A small grey label sits over a bold value. No
   cards, no boxes around content, no shadows, no rounded corners; sections are
   separated by space and a dotted rule.
4. **Spec labels are the voice.** Space Mono uppercase for labels, lockups and
   notes: `[SESSION A]`, `//NOTE`, `©21.11.26`. That's the mood board, and it's
   wanted.
5. **Dither is the only ornament.** 1-bit 9×9 pixel icons, glyph dither bars
   (`█▓▒░···`), a glyph heatmap (`· ░ ▒ ▓ █`), and the PR number resolving from
   ordered dither.
6. **Verdicts without colour.** BEAT = solid ink, HIT = ink outline, MISSED =
   dashed and faded. Fill, line and dash carry the meaning.

## 2. Tokens

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--paper` | `#0e0e0e` | `#fcd0af` (FT salmon) | background |
| `--ink` | `#f2f2ee` | `#1e2152` (navy) | text, rules, solid blocks |
| `--accent` | `#fcd0af` | = ink | bars, heatmap, stat values, active tab, `//NOTE`, PR number |
| `--mid` | ink at 52% | ink at 62% | quiet labels, secondary values |
| `--rule` | ink at 18% | ink at 28% | dotted rules, empty tracks |
| `--grain` | 0 | 0.55 | paper-grain overlay (light only) |
| `--dim` / `--behind` | black | navy | sheet backdrop / behind a scaled-back app |

Theme lives on `<html data-theme="dark|light|system">`; `system` follows
`prefers-color-scheme`. The choice is stored in meta (`theme`), applied by
`useTheme()` / `initTheme()`, mirrored to localStorage so `index.html` sets it
before first paint, and `<meta name="theme-color">` tracks the paper colour.

**Destructive actions** use ink with a dashed outline and explicit wording
("Delete this set?"), never red.

LUME token names (`--bg`, `--text-mid`, `--verdict-*`, `--tier-1..5`…) still
exist as aliases onto the new tokens so unconverted screens render in the new
palette. Don't use them in new code; delete them once screens are rewritten.

## 3. Type

Fonts are bundled (offline): `@fontsource-variable/schibsted-grotesk`,
`@fontsource/space-mono` 400/700.

| Token | Spec | Use |
|---|---|---|
| `--text-hero` | 800, clamp(88–128px)/0.82, −0.055em | the screen's number |
| `--text-display` | 800, clamp(64–104px) | logger "next set" |
| `--text-num-lg` | 700 30px | unit beside a hero |
| `--text-num-md` | 650 19px | label/value values |
| `--text-title` | 650 19px | "Session A, squat + bench" |
| `--text-large-title` | 800 40px | HIG large title |
| `--text-body` | 400 15px/1.45 | sentences (15px floor) |
| `--text-quiet` | 400 13px, `--mid` | the grey label over a value |
| `--text-label` | Space Mono 11px uppercase +0.04em | spec labels |
| `--text-mono` | Space Mono 12px | stats, notes, set sheets |
| `--text-button` | Space Mono 700 13px +0.08em | primary button |

Tabular figures only where columns align (`.tnum`, inputs, stats): Schibsted's
`tnum` also widens `. , :`, so it is never global. Block glyphs aren't in Space
Mono; `--font-glyph` keeps them monospaced, and the heatmap puts every glyph in
its own `1ch` grid cell so fallback widths can't drift.

## 4. Components (`ui/kit`)

| Component | Notes |
|---|---|
| `PixelIcon name scale` | 18 icons on a 9×9 grid (`icons.ts`), crisp at integer scales |
| `Lockup mid left? right?` | boxed header, middle cell inverted, `©dd.mm.yy` default |
| `BigNumber value unit? caption? size` | hero / display / lg |
| `LabelValue`, `LabelValueGrid items columns variant` | pairs grid, or `stats` (ink label, accent value) |
| `DitherBar value cells label valueText` | `role="meter"` |
| `GlyphHeatmap counts weeks end thresholds? weekTarget? onSelect?` | Sunday-first, Mon/Wed/Fri, months, optional Wk row |
| `Verdict kind` | beat / hit / missed / new |
| `Button` / `LinkButton variant icon iconEnd block` | primary ink block · outline · quiet · danger (dashed) |
| `Stepper` | changes on touch-down, repeats while held (500 ms, then 160 → 60 ms), typeable |
| `Segmented` | ink thumb on a spring; drag the thumb across; arrow keys |
| `Toggle` | square knob, stretches while held |
| `Sheet open title onClose detents?` | see §5 |
| `ActionSheet`, `ConfirmButton` | confirm before irreversible actions |
| `showHud(text)` | "Session saved" confirmation |
| `showPrMoment({value, unit, caption, lift, pairs})`, `DitherNumber` | the PR moment |
| `NavBar title backLabel right` | large title that collapses into the bar |
| `PageStack`, `go`, `back`, `useNav` | navigation (§5) |
| `useTheme`, `haptic` | theme preference; `navigator.vibrate(10)` where supported |

`ui/common` re-exports `Sheet`, `Stepper`, `Segmented`, `ConfirmButton` from
the kit, so older screens get the new behaviour without import changes.

## 5. Motion (Apple HIG feel, Android-safe)

- **Springs, not curves.** `motion/spring.ts` solves the damped oscillator
  analytically (iOS `response` + `dampingFraction`), seeded with the finger's
  release velocity, so a fling carries into the settle. Presets: push 0.35/1,
  sheet 0.4/1, thumb 0.32/0.78. A wall-clock watchdog finishes any spring whose
  frames stop (backgrounded page).
- **Push / pop.** The new page slides in over the old one, which parallaxes 30%
  and dims; pop is the reverse. Tab switches are instant.
- **Android back.** No custom edge swipe: Android's system gesture owns the
  edges. Every push is a real history entry stamped with its stack index
  (`history.state.gbIdx`); a lower index on popstate means pop, so the system
  back gesture/button plays the pop. `go(path, {replace, transition})`,
  `back(fallback)`. Plain `<a href="#/…">` links work too. Scroll is saved per
  entry and restored on pop. The document never scrolls; each page is its own
  scroller inside a fixed frame.
- **Sheets.** Medium and large detents (or one "fit" stop for short content),
  grabber, drag anywhere except text fields and `[data-no-drag]` controls,
  fling projected with UIScrollView deceleration, rubber-band past the top,
  fling down to dismiss, the app scales back at the large detent. Focus trap,
  Esc, backdrop tap, focus returns to the opener. Closing animates whether the
  parent sets `open={false}` or unmounts the sheet.
- **Press feedback on touch-down** for `.btn` and `[data-press]`, cancelled if
  the finger drifts into a scroll, fading on release.
- **Large titles** collapse into the navbar (with an ink rule) on scroll.
- **Action sheet**: slide a finger across the buttons and release to pick.
- **HUD**: pops in, draws its pixel icon row by row, fades after 1.5 s.
- **PR moment**: the number resolves from coarse Bayer dither to solid type on a
  canvas, with `haptic('pr')`.
- **Haptics**: `haptic('commit')` on set commit, `haptic('pr')` on the PR
  moment; the Settings "Haptics" toggle persists the choice in meta (`haptics`,
  default on) via `useHaptics()` / `initHaptics()`, and `haptic()` respects it.

## 6. Accessibility

- Contrast: ink on paper is about 17:1 (dark) and 10.6:1 (light); accent salmon on
  dark is about 13.5:1. `--mid` is for labels, never the only carrier of a value.
- Touch targets are at least 48px; the primary block is 58px.
- `prefers-reduced-motion`: springs jump to their end, the PR number shows
  solid at once, CSS durations drop to ~0.
- Meaning never rests on colour (there is only one): verdicts use fill, outline
  and dash; bars are `role="meter"`; the heatmap has a text summary.
- Modals trap focus and restore it; the app frame is `inert` behind them.

## 7. Anti-patterns

- A second hue, red for errors, or green for "good".
- Cards, borders around content, drop shadows, rounded corners.
- Body text under 15px; long text in Space Mono (keep mono to labels, stats, notes).
- A custom left-edge swipe-back (Android owns it), or navigation that bypasses
  history (`location.hash =` from code: use `go`).
- Count-up numbers, confetti, looping motion. The one celebration is the PR moment.
- Tabular figures on running text.
