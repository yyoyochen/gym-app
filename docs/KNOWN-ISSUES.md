# Known issues

Found during the 2026-11-21 build and browser checks. Not fixed yet.

## Needs a product decision

- **Accessory standards are rough (confidence C).** The modeled gym-goer standard gives accessories the same spread as their base lift, so isolation lifts swing to the extremes: Preacher Curl rates 99th percentile, Cable Lateral Raise 97th. Compared with the Strength Level tables in the gymbro folder, the model is 5–10% more lenient on the main lifts at intermediate and above, but 30–60% lower at advanced/elite on isolation lifts (narrower spread).
- **Carries get an e1RM** (Farmers Walk rates "advanced, 92nd" from an e1RM per dumbbell). Carries probably shouldn't be rated.

## Smaller

- Warm-up ramps are generated for every barbell compound, including accessories like barbell rows (four ramp sets before a 60 kg row).
- Catalog keeps both "Skull Crusher" (default) and "Skull Crusher (EZ Bar)" (from import).
- `e1RM` on the lift list is system load for bodyweight lifts, without saying so.
- Plate settings are stored in an untyped `plates` meta key.
- The service worker never reloads mid-session, but the "update ready" prompt itself hasn't been checked in a browser.
- iPhone home-screen install, `navigator.storage.persist()` on Safari, and a week of real use are not tested (M6).
