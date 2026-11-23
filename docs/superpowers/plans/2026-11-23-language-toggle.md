# Language toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Tasks 2 to 5 run in parallel (one agent each, disjoint files). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every word in gym-app switchable between English and Traditional Chinese with one `EN / 中文` toggle.

**Architecture:** A dictionary keyed by the English text (`t()`), split into one Chinese file per area so parallel agents never share a file. Engine sentences stay English in the engine and the database and are translated when shown (`te()`, a table of English templates compiled to patterns). Stored names (lift names, template session names) go through `tn()`. The app re-mounts on a language change.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (node), fontTools (font subsetting).

**Spec:** `docs/superpowers/specs/2026-11-23-language-toggle-design.md`

## Global Constraints

- Keys are literal English strings: `t('Start workout')`, never `t(variable)` or `t(cond ? 'a' : 'b')` (write `cond ? t('a') : t('b')`), so a test can find every key.
- Values go in `{name}` placeholders: `t('{n} sets', { n })`. English plurals are separate keys.
- Chinese style and terms: `docs/i18n-zh.md`. Kept in Latin: kg, PR, 1RM, e1RM, RPE, RIR.
- Never translate data formats (CSV headers, backup keys, meta keys, ids, matcher tokens, import vocabulary).
- Engine files (`web/src/engine/**`) are not edited: their English is pinned by parity fixtures.
- No new runtime dependency. Gates: `npm test`, `npm run build`, `node tools/check-private.mjs --all`.

## Review Focus

1. An English sentence the engine makes that no pattern matches: it must still show (in English), never blank or garbled.
2. A lift the lifter named in Chinese: shows as typed, in the phone's font (outside the font subset).
3. Switching language mid-session (logger open, sheet open): no lost logged sets; the screen re-renders in the new language.
4. An old backup restored: language choice comes with it, like the theme.
5. Values inside translated sentences equal the English ones (the promise-equals-grade invariant).

### Task 1: Core (me, first)

**Files:** create `web/src/i18n/{lang.ts,t.ts,tr.tsx,engine.ts,index.ts,zh/index.ts,zh/core.ts}`, `web/src/i18n/*.test.ts`, `tools/check-i18n.mjs`, `tools/fonts/build-zh-fonts.py`, `docs/i18n-zh.md`; modify `main.tsx`, `App.tsx` (keyed remount), `index.html` (pre-paint `lang`), `db/repo.ts` (meta `lang`), `ui/readable.ts` (ends in `te()`), `app/dates.ts`, `styles/tokens.css` + `index.css` (Chinese font faces, zh tracking), `sw/plugin.ts` + `sw-template.js` (zh fonts cached on first use, not precached), `screens/Settings.tsx` (Language row), `screens/Onboarding.tsx` (toggle on the first screen), `package.json` build (runs check-i18n).

**Produces:** `t(en: string, vars?: Record<string, string | number>): string`; `tr(en: string, parts: Record<string, ReactNode>): ReactNode`; `tn(name: string): string`; `te(sentence: string): string`; `getLang(): Lang`; `useLang(): { lang: Lang; setLang(l: Lang): Promise<void> }`; `formatDate` and `monthLabel` language-aware; `WEEKDAY_SHORT()` helpers in `app/dates.ts`.

- [ ] Tests first: `fill` placeholders; `t` returns English in `en`, Chinese in `zh`, English when a key is missing; `te` translates a template with values and nested templates, leaves unknown sentences as they are; `formatDate` in `zh` gives `11月23日 週一`; first-launch language from `navigator.language`.
- [ ] Implement, then the Language row in Settings and on onboarding's first screen.
- [ ] `tools/check-i18n.mjs`: fails on JSX text or user-facing JSX attributes with English words not wrapped in `t`/`tr`; a test fails on any `t()` key with no Chinese entry.
- [ ] Commit.

### Tasks 2 to 5 (parallel agents, each owns its files and its `zh/<area>.ts`)

2. **Today and the session flow:** `screens/{Today,Workout,Session,Review,History,PastSession,SessionDetail}.tsx`, `ui/session/**`, `app/parts/{WorkoutLiftSheet,UpdateBanner}.tsx`, `app/{workout,suggest,coach,effort}.ts` display strings, `sw/version.ts`, `ui/kit/PrMoment.tsx` → `zh/session.ts`.
3. **Progress and the kit:** `screens/{Progress,LiftDetail}.tsx`, `ui/progress/**`, `ui/kit/**`, `ui/common/**`, `ui/TabBar.tsx`, `lib/heatmap.ts`, `benchmarks/gymStandards.ts` labels → `zh/progress.ts`; lift and standard names → `zh/names.ts`.
4. **Setup and settings:** `screens/{Profile,ProgramEditor,Settings,Onboarding}.tsx`, `app/parts/**` (other than task 2's), `app/{validate,labels,tips,storageNote,program,setup,weekSets,DemoBanner}.ts(x)`, `domain/templates.ts` names → `zh/setup.ts`.
5. **Engine sentences:** `zh/engine.ts` (every template in the inventory, section 2) and its test that runs fixture outputs through `te()` and fails on English left over.

Each: wrap strings, add Chinese, `npx vitest run --root web src/i18n` green, no commit (I commit).

### Task 6: Fonts, sweep, review (me)

- [ ] Run `tools/fonts/build-zh-fonts.py` (subset to the dictionaries' characters); test that every Chinese character in `web/src/i18n/zh` is in the subset.
- [ ] Browser sweep in 中文: every screen, a script lists text nodes with English words; fix each.
- [ ] Whole-branch review, fixes, gates, commit, push (approved: "finish everything then push").
