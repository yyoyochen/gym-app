# gym-app

A strength-training log for lifters who already know what they're doing.

Before each session the app shows a **plan**: the numbers to hit for every
lift, and why. It locks when you start. Afterwards the session is **graded**
against that exact plan (beat, hit or missed), and the next plan follows
from the result.

It's a web app you install on your phone. It works offline, needs no account,
and your training log never leaves your phone.

**Open it:** https://yyoyochen.github.io/gym-app/

## Install on your phone

- **iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the link, then tap **Install app** (or menu, then **Add to Home screen**).

Once installed it opens full screen and runs with no connection.

## What it does

- **Plan, then grade.** Each lift gets a target from your history: top set plus back-offs, double progression, 5 × 5, or a fixed dose. Logging a set is two taps: Log as planned, or Adjust.
- **Day-one plans.** Setup takes about 90 seconds. Enter your best recent set for squat, bench, deadlift and overhead press, and the first session already has real targets.
- **No program needed.** On days you decide on the spot, Plan today's workout fills in a session from your goals and what you've trained this week; change anything, or build your own, and it's graded like any other.
- **Readiness.** Three quick taps (sleep, soreness, stress) ease the day's targets on a bad day.
- **Progress.** e1RM trends, strength levels against lifters like you, best weight at each rep count, PRs, weekly sets by body part and a training calendar.
- **Bring your log.** Import a CSV: the app’s own template (download it in the app), or an export from **Hevy** or **Strong** (iPhone or Android). Warm-ups, effort (RPE) and units carry over; re-importing the same file adds nothing.
- **Your data stays yours.** Everything is stored on your phone. Export a backup file any time and restore it on another device.

## Privacy

There is no server and no analytics. The app makes no network calls with your
data; once loaded, it works fully offline. Clearing the browser's site data
deletes your log, so export a backup now and then (Settings, Backup).

## Develop

Requires Node 22.

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` also runs the type check, a bundle check (no preview-only code
or private data in the output) and a design-system style check.

Personal training data for local testing goes in `testdata/private/`
(git-ignored). A pre-commit hook blocks it from commits; enable it once per clone:

```bash
git config core.hooksPath tools/hooks
```

Every push to `main` runs the tests and the build, then deploys to GitHub Pages
(`.github/workflows/pages.yml`).

## Docs

- [docs/PWA-SPEC.md](docs/PWA-SPEC.md): what the app does and why
- [docs/DESIGN.md](docs/DESIGN.md): the Ink & Dither design system
- [docs/STANDARDS-METHODOLOGY.md](docs/STANDARDS-METHODOLOGY.md): how strength levels are modeled
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions and their reasons

## Data credits

Strength levels use the app’s own modeled gym-goer standards
([methodology](docs/STANDARDS-METHODOLOGY.md)). The squat, bench and deadlift
anchors are self-reported gym percentiles from the Symmetric Strength dataset,
as published by [Strength Standards data by FitnessVolt](https://fitnessvolt.com/strength-standards/)
(CC BY 4.0). Everything else is modeled by this app; neither site endorses these
figures.

## License

Code: MIT (see [LICENSE](LICENSE)). The strength-standard anchors are
third-party data under CC BY 4.0 (see Data credits), not covered by the MIT
licence.
