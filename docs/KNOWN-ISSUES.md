# Known issues

Found during the 2026-11-21 build and browser checks. Not fixed yet.

## Needs a product decision

- **Safety stop vs. the promise.** When a top set goes past the RIR floor, the nudge says "back-offs drop to X kg", but the ghost rows still prefill the committed back-off load, and "log as planned" logs the heavier weight. The lift is already graded MISSED by then (the top set broke the floor), so lowering the ghost load wouldn't change the verdict — it would only make the safe choice the one-tap choice.
- **Benchmarks against competitive powerlifters put gym-level lifts below the 5th percentile** (e.g. squat ~117 / bench ~89 / deadlift ~156 e1RM at 80–85 kg, 35–39, tested raw). The caveat is shown every time, but the screen may be more discouraging than useful.

## Smaller

- After finishing a session, Today immediately shows the next session in the rotation with no "done today" state.
- Warm-up ramps are generated for every barbell compound, including accessories like barbell rows (four ramp sets before a 60 kg row).
- Catalog keeps both "Skull Crusher" (default) and "Skull Crusher (EZ Bar)" (from import).
- `e1RM` is shown for carries (Farmers Walk) and for bodyweight lifts as system load, without saying which.
- Plate settings are stored in an untyped `plates` meta key.
- The service worker never reloads mid-session, but the "update ready" prompt itself hasn't been checked in a browser.
- iPhone home-screen install, `navigator.storage.persist()` on Safari, and a week of real use are not tested (M6).
