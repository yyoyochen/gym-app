# GymBro Design System — "LUME"

*Direction, tokens, and component specs. Pairs with `design-tokens.css`. 2026-08-01.*

---

## 1. Direction: LUME (instrument-dial dark)

GymBro's interface is a **precision instrument dial**, not a gym poster: dive watches and cockpit gauges are the real-world objects engineered for exactly our conditions — numbers read at arm's length, in dim light, by someone mid-effort — so the app borrows their logic: a deep petrol green-black "dial" surface, luminous mint numerals, and everything non-numeric receding into quiet labels. The verdict moment is styled as a **stamped ledger entry** — promise stated, result recorded, verdict sealed — because the product's whole differentiator is that it closes the promise→grade loop, and a ledger reads as evidence while confetti reads as marketing. This deliberately occupies the open territory from research: serious and evidence-based like Strong, legible and warm like Hevy, with none of the arcade skin of GymLevels — and zero overlap with the old iron/chalk/plate-red system.

**Personality in three words:** calibrated, luminous, matter-of-fact.

**Signature element:** the **verdict ledger row** — every target is a two-line pair (the promise in quiet text, the result in mono numerals) joined by a 3px vertical **verdict tick** on the left edge whose color is the verdict. The tick motif repeats at small scale everywhere a promise exists (TargetCard, SetLogger criterion state, Review scorecard), so the core loop is visible in the pixels.

---

## 2. Color system

Dark-first. The base is petrol green-black (a tinted dark, never neutral gray — neutral-gray-plus-blue-accent is the sea of sameness). No pure black, no pure white.

### 2.1 Raw palette

| Token | Hex | Name |
|---|---|---|
| `--ink-950` | `#0B100E` | Dial — app background |
| `--ink-900` | `#111917` | Surface — cards |
| `--ink-800` | `#18211E` | Raised — sheets, inputs, chips |
| `--ink-700` | `#1F2A26` | Hairline — borders, dividers |
| `--ink-600` | `#2B3833` | Hairline-strong — focused borders, table rules |
| `--white-100` | `#F2F7F4` | Text high — headings, committed numbers |
| `--white-60` | `#9FADA6` | Text mid — body, labels |
| `--white-35` | `#66736D` | Text low — ghost values, disabled |
| `--lume` | `#57E6AE` | Lume mint — the instrument glow |
| `--lume-deep` | `#34B48A` | Deep mint — quieter positive |
| `--gold` | `#E8B84B` | Gold — PR and Elite only |
| `--rest-blue` | `#78AEE0` | Rest blue — rest timer only |
| `--slate` | `#8B98A3` | Slate — the "missed" non-color |
| `--ember` | `#E06C5F` | Ember — destructive actions only (Settings) |

### 2.2 Semantic aliases

| Semantic | Maps to | Usage |
|---|---|---|
| `--bg` / `--surface` / `--raised` | ink-950 / 900 / 800 | Layering |
| `--border` / `--border-strong` | ink-700 / ink-600 | Hairlines |
| `--text` / `--text-mid` / `--text-ghost` | white-100 / 60 / 35 | Type |
| `--accent` | lume | CTA, active tab, focus ring, live numerals |
| `--verdict-beat` | lume `#57E6AE` | Exceeded the promise — **filled** treatment |
| `--verdict-hit` | lume-deep `#34B48A` | Kept the promise — **outline** treatment |
| `--verdict-missed` | slate `#8B98A3` | Promise not met — outline, zero saturation drama |
| `--pr` | gold | PR markers on charts, PR chip. Nothing else is gold below Elite. |
| `--timer` | rest-blue | RestTimerBar exclusively — rest is "cool", work is "lume" |
| `--danger` | ember | Delete/reset in Settings. Never used for "missed". |

**Verdict color logic (load-bearing):** beat and hit are the *same hue* at two intensities because both fulfilled the promise — beat just exceeded it. Missed is a desaturated slate, not red: it's a data point, not a failure state. Red (`--ember`) is reserved for destructive UI actions so a missed lift can never visually rhyme with "delete". This is how "matter-of-fact, not shameful" is enforced by the palette itself.

**Tier ramp** (Beginner → Elite, a luminance ramp of one hue — evidence rising, not rainbow ranks):

| Tier | Token | Hex |
|---|---|---|
| Beginner | `--tier-1` | `#5C6B64` |
| Novice | `--tier-2` | `#4E8A76` |
| Intermediate | `--tier-3` | `#3FAE8C` |
| Advanced | `--tier-4` | `#57E6AE` |
| Elite | `--tier-5` | `#E8B84B` (the only place gold and lume meet) |

Contrast notes: `--lume` on `--ink-950` ≈ 11:1; `--text-mid` on `--ink-900` ≈ 6.5:1; `--slate` on `--ink-900` ≈ 5:1 (used at 15px+ only). Ghost text `--white-35` is intentionally sub-AA — it is placeholder, never information of record.

---

## 3. Typography

Two families from Google Fonts, both variable, both self-hostable:

```css
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Spline+Sans+Mono:wght@400..700&display=swap');
```

- **Spline Sans Mono** — every number that matters: weights, reps, timers, e1RM, percentiles, verdict counts. A humanist mono (warm, not IDE — Liftosaur is the anti-pattern) that is inherently tabular: set-table columns align, timer digits never jitter, ghost and committed values occupy identical width. Also used for the stamped verdict words (`BEAT` / `HIT` / `MISSED`) in uppercase with wide tracking — the "engraved dial label" voice.
- **Instrument Sans** — all UI text: titles, body, buttons, labels, the "why" copy. Geometric-grotesque with enough character to not read as Inter-default; the name is a happy accident.

**Rule: if it's a value, it's mono; if it's a word, it's sans.** A set row like `100 kg × 5` is mono; "Complete all 5 sets" is sans. Never mix within one token of data.

### Scale (mobile-first, px / line-height / family / weight)

| Token | Spec | Used for |
|---|---|---|
| `display` | 44/48 mono 600 | Rest countdown, verdict "4 / 6", tier percentile |
| `num-lg` | 28/32 mono 600 | Weight in active set row, e1RM headline |
| `num-md` | 20/24 mono 500 | Set-table values, plate strip numbers |
| `num-sm` | 15/20 mono 500 | Inline numerals in criterion strings, chart axes |
| `title` | 22/28 sans 650 | Screen titles, exercise names on detail |
| `heading` | 17/24 sans 600 | Card titles, exercise names in lists |
| `body` | 15/22 sans 450 | "Why" text, coach panel, criteria. **15px floor — nothing readable is smaller** (Caliber's small-font complaint). |
| `label` | 12/16 sans 550, uppercase, +0.08em tracking | Eyebrows: "TARGET", "PROMISE", "REST", tier names |
| `micro` | 11/14 mono 500 | Chart tick labels, plate denominations only |

`font-variant-numeric: tabular-nums` is set globally as a belt-and-braces (mono is already tabular; Instrument Sans numerals inside sentences also get it).

---

## 4. Spacing, radius, elevation

- **Spacing:** 4px base — `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Screen gutter 16px; card padding 16px; section gap 24px; thumb-reach bottom zone (CTA + tab bar) gets 12px breathing above the tab bar.
- **Touch targets:** 48px minimum height for anything tappable mid-workout; the set-commit button is 56px. Arm's-length rule: any mid-workout tap target ≥ 48×48.
- **Radius:** `--radius-sm: 8px` (chips, inputs), `--radius-md: 12px` (buttons, set rows), `--radius-lg: 16px` (cards, sheets), `--radius-full: 999px` (timer pill, tab indicator). Verdict ticks and hairline rules are square — instrument engraving doesn't round.
- **Elevation:** dark UIs layer by **luminosity + hairline, not shadow**. Level 0 = `--bg`; level 1 = `--surface` + `--border` hairline; level 2 = `--raised` + `--border`. One shadow token exists (`--shadow-sheet`) for modals/bottom-sheets only: `0 -8px 32px rgb(0 0 0 / 0.5)`. Nothing else casts a shadow.
- **Focus:** 2px `--lume` outline with 2px offset, always visible on keyboard focus.

---

## 5. Motion

Motion is rationed to four moments. Everything else is instant.

**What animates:**
1. **Set commit** — the row settles: checkmark draws in, ghost values solidify from `--text-ghost` to `--text`, 180ms `ease-out`. The single most-repeated interaction gets the single most-polished micro-moment.
2. **Rest timer bar** — continuous linear depletion. The only ambient motion in the app.
3. **Verdict reveal (Review)** — ledger rows stagger in top-to-bottom, 60ms apart, each 320ms ease-out; verdict ticks draw last. Runs **once** per session review, never on re-visit. It's a stamp, not a slot machine.
4. **Tier progress fill** — the progress-to-next bar fills to its value on first view, 480ms ease-out, once.

**What never animates:** numbers never count up (evidence doesn't roll like a jackpot); no confetti, particles, or pulsing; no parallax; no looping attention-seekers; no skeleton shimmer mid-workout; tab switches are instant.

**`prefers-reduced-motion: reduce`:** all four moments render in their end state instantly; the rest timer bar becomes a static bar with the mono countdown carrying all information. Durations are tokens (`--dur-*`) so this is one media query.

---

## 6. Component specs

### TargetCard (Dashboard)
`--surface` card, `--radius-lg`, hairline border. Left edge carries a 3px vertical **verdict tick** in `--text-ghost` (unstamped — today's promise is not yet judged). Layout: `label` eyebrow "TARGET · BENCH PRESS" → criterion in `body` with numerals in `num-sm` mono ("Complete all **5×5 @ 100 kg**") → "why" line in `body` at `--text-mid`, prefixed with a small ⓘ-free plain word "Why:" — the why is always visible, never behind a tap (Juggernaut's black box is the cautionary tale). Ghost of last session bottom-right in `micro` mono.

### SetLogger row (Workout — the flagship)
56px row, `--radius-md`, columns: `set # | previous | weight | reps | commit`. Four states:
- **pending** — `--raised` background, empty inputs, `--border`.
- **ghost** — previous session's values pre-filled in `--text-ghost` mono; committing as-is is one tap (Hevy/Strong convention adopted wholesale).
- **logged** — values solidify to `--text`, background drops to `--surface`, commit button becomes a quiet `--lume-deep` check.
- **criterion-met** — when the logged set satisfies its slice of the promise, the row's left verdict tick lights `--lume` (3px, full row height). No toast, no banner — the tick is the feedback.
Commit button: 56×56, `--lume` fill, `--ink-950` glyph — the brightest object on screen because it's the most-pressed. Weight value is tappable → opens PlateStrip sheet pre-loaded.

### RestTimerBar
Pinned pill above the tab bar, `--radius-full`, `--raised` background. Fill depletes in `--timer` (rest-blue) left-to-right; countdown in `display` mono sits center; ±15s ghost buttons flank it (48px targets). At 0:00 the pill border flashes once to `--lume` (180ms) and fires the local notification. Rest-blue exists *only* here: cool color = recovering, lume = working. Goal-conditioning is visible: strength targets default the bar to 3:00, hypertrophy to 1:30 — the label reads "REST · STRENGTH 3:00".

### PlateStrip
Bottom sheet (`--shadow-sheet`). A per-side loading diagram drawn with flat rectangles on the dial background: bar hairline in `--border-strong`, plates as vertical slabs sized proportionally to real plate diameter, each labeled beneath in `micro` mono (25 · 20 · 10 · 2.5). Plates are monochrome `--ink-600` fills with `--text` labels — **not** competition-color-coded by default (Settings toggle enables IPF colors for those who think in them). Header: total in `num-lg`, "per side" breakdown in `num-md`.

### ScorecardList verdict row (Review — the signature)
The report card. Each row is the **verdict ledger pair**: line 1 = the promise as stated on the TargetCard, `body` at `--text-mid`, in quotes; line 2 = the result in mono ("5 · 5 · 5 · 5 · **6** @ 100 kg") plus a detail string in `body` ("+1 rep on the final set"). Left edge: the 3px verdict tick, full row height, in the verdict color. Right edge: the verdict chip — `SPLINE MONO 12px uppercase +0.1em`: **BEAT** = `--lume` fill with `--ink-950` text; **HIT** = `--lume-deep` 1px outline, transparent fill; **MISSED** = `--slate` outline, `--slate` text, and its detail string states the delta plainly ("4 of 5 sets at 100 kg — 1 set short"). Above the list, the session header: "KEPT" eyebrow, then `display` mono "4 / 6", then one sans sentence of context. AI coach panel sits *below* the ledger as a `--raised` card with a "COACH" eyebrow — commentary never interleaves with evidence.

### TierLadderRow (Tiers)
One row per tier, Beginner→Elite ascending. Structure: tier swatch (12px square, `--tier-n` — square, engraved, not a badge), tier name in `heading`, the evidence in mono at `--text-mid` ("bench 72nd percentile @ 76 kg BW"). Current tier row gets `--surface` background + hairline; future tiers stay on `--bg` at `--text-mid`. Progress-to-next: a 4px bar under the current row in the *next* tier's color, with the delta in mono ("+7.5 kg to Intermediate"). No XP, no stars, no crest iconography — the percentile *is* the content (presented like Symmetric Strength, not GymLevels).

### GoalToggle
Segmented control, `--raised` track, `--radius-full`. Two segments: STRENGTH / HYPERTROPHY in `label` type. Selected segment: `--surface` thumb + `--text`; unselected: `--text-mid`. No color change per goal — the goal's identity shows in the *content* it reconditions (criteria strings, rest defaults, verdict logic), which crossfade in 150ms. A one-line footnote under the toggle states the consequence: "Targets and grading now judge for strength."

### TabBar
5 tabs: Dashboard · Workout · Lifts · Tiers · Settings. `--bg` with top hairline, 64px + safe-area. Active tab: `--lume` glyph + `label` caption; inactive: `--text-mid` glyph, caption always visible (no mystery-meat icons). During an active session, the Workout tab glyph carries a 6px `--lume` dot — the only persistent indicator in the app.

---

## 7. Anti-patterns (explicit, from research)

1. **No arcade grammar.** No XP bars, confetti, streak flames, pixel ranks, or count-up number animations (GymLevels/Menos territory). Tiers are a monochrome luminance ramp anchored to population percentiles; the verdict reveal is a stamp that plays once. If a treatment would look at home in a mobile game, it's out.
2. **No generic-tracker skin.** No neutral-gray cards with a single blue accent, no spreadsheet-chrome set tables, no social-feed surface anywhere (the Hevy/Strong sea of sameness). The tinted petrol base, mono numerals, and verdict-tick motif must be present on every screen — remove them and the screen is off-system.
3. **No ephemeral or hidden reasoning.** Verdicts and "why" text never live in toasts, tooltips, truncated coach notes, or glossary pages (Juggernaut's black box, Alpha's buried glossary, Boostcamp's truncation complaints). Every prescribed number carries its visible one-line why; every verdict carries its persistent detail string; body text never drops below 15px (Caliber's clutter complaint).

---

## 8. Token source of truth

All values above are encoded in [`design-tokens.css`](./design-tokens.css) as `:root` custom properties with a Tailwind v4 `@theme` block. Components consume semantic aliases (`--verdict-beat`, `--timer`), never raw palette values.
