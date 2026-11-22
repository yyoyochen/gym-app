# GymBro

A workout logger for lifters who already know what they're doing. It states a
promise before each session, grades the session against that exact promise, and
tells you what to do next. Offline, installable, no account; your data stays on
your phone.

Status: in development. Spec: [docs/PWA-SPEC.md](docs/PWA-SPEC.md).

## Develop

```bash
npm install
npm run dev
```

```bash
npm test
```

Personal training data for local testing goes in `testdata/private/` (git-ignored).
A pre-commit hook blocks it from commits; enable it once per clone:

```bash
git config core.hooksPath tools/hooks
```

## Data credits

Strength levels use a modeled gym-goer standard ([docs/STANDARDS-METHODOLOGY.md](docs/STANDARDS-METHODOLOGY.md)).
Its squat, bench and deadlift anchors come from Symmetric Strength self-reported
gym logs, via FitnessVolt's published aggregates (CC BY 4.0, attribution). The
licence of the anchor source itself has not been verified.

## License

MIT
