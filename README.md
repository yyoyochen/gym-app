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

Strength benchmarks use data from the OpenPowerlifting project,
https://www.openpowerlifting.org. A copy of the data can be downloaded at
https://data.openpowerlifting.org.

## License

MIT
