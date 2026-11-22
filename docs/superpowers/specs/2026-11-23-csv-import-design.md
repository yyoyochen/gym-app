# CSV import: GymBro template, Hevy and Strong

Status: approved in conversation 2026-11-22 ("Approve the import design", after format research). Branch: `polish` (local only).

## Intent

Experienced lifters arrive with a log in another app. Today GymBro imports one CSV shape and calls it "Notion". Replace that with one "Import a CSV" that reads three shapes: GymBro's own template (today's columns, no Notion naming), and the exports of the two biggest trackers with CSV export, Hevy and Strong.

## Goals

1. One entry, **Import a CSV**, in the setup sheet and in Settings. The format is detected from the header row.
2. **Download the template**: a CSV with the GymBro header and two example rows.
3. Hevy and Strong exports import with their warm-ups, effort (RPE → RIR) and units right.
4. Re-importing the same file adds nothing (as today).

## Non-goals

- Cardio, timed holds and distance work (they are skipped and counted).
- Supersets, workout durations, body measurements.
- Writing back to Hevy or Strong.

## Anti-goals

- Pounds stored as kilograms, or a warm-up counted as a working set.
- A rest-timer or note row turned into a set.

## Formats (from 13 real Hevy and about 20 real Strong exports; see the research report summarised here)

**GymBro template.** `Date,Session,Exercise,Order,Set,Reps,Weight (kg),Notes` (today's Notion columns, matched by name).

**Hevy** (`workout_data.csv`). Header:
`"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"`; imperial files have `weight_lbs` / `distance_miles` instead (each column on its own). Comma, double-quoted strings, `.` decimals. `start_time` follows the device locale, local time: `18 Nov 2026, 18:22`, `Jun 19, 2026, 9:40 AM`, `14 ott 2026, 20:39` (localised month names). `set_index` is 0-based per exercise. `set_type`: `normal`, `warmup`, `failure` (taken to failure), `dropset`. `rpe` empty or a number. Bodyweight sets have an empty weight; assisted lifts (`… (Assisted)`) carry the assistance as a positive weight. Notes hold a literal `\n` for line breaks. Rows run newest workout first.

**Strong, iOS** (comma). `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE` (older files lack Duration/RPE). `Date` `2026-10-20 06:05:12`. **No unit anywhere**: weight is in the user's setting. Reps may be floats (`5.0`).

**Strong, Android** (semicolon, all quoted). `"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"` — unit in the header (`(kg)`, `(lb)`/`(lbs)`). Older Android files have a `Weight Unit` column per row and may use decimal commas (`12,5`).

**Strong `Set Order`:** numbers, `W` warm-up, `F` failure (taken to failure), `D` drop set, and rows to skip: `Rest Timer`, `Note`.

## The design

- **Detection:** sniff `,` vs `;` from the header line; map columns by name, case-insensitive. `exercise_title` + `set_type` = Hevy; `Exercise Name` + `Set Order` = Strong; `Date` + `Exercise` = GymBro template. Anything else: an error naming the three accepted shapes.
- **Units:** kg columns as is; lb columns × 0.45359237, kept to 2 decimals. A Strong file with no unit (iOS) asks **kg or lb** before importing (kg preselected).
- **Sets:** Hevy `warmup` / Strong `W` → warm-up; `dropset` / `D` → drop set; `failure` / `F` → working set with 0 RIR (unless RPE says otherwise); else working. RPE → RIR = 10 − RPE. Rows with no reps (timed, cardio), rest-timer and note rows are skipped and counted.
- **Order:** exercises in a workout keep their first-appearance order; sets number 1…n per exercise in file order (Hevy `set_index` + 1).
- **Sessions:** one per workout: Hevy `title` + `start_time`, Strong `Workout Name` + `Date` (or `Workout #`). The session date is the local date in that timestamp.
- **Names:** "`Name (Equipment)`" is matched against the catalogue by trying "Equipment Name", the plain name, and the common Hevy/Strong names added as catalogue aliases (squat, bench, deadlift, overhead press, rows, RDL, incline DB press, lateral raise, triceps pushdown, …). Unknown names become new lifts, as today.
- **Assisted lifts:** a positive Hevy/Strong weight on an "(Assisted)" lift is stored as negative added load (GymBro's convention).
- **Imported sessions** are history without promises, as today. Tips stay on after an import.
- **Copy:** "Import a CSV" with the line "A GymBro template, or an export from Hevy or Strong. Re-importing the same file adds nothing." The setup sheet's first choice reads "Import a CSV / GymBro template, Hevy or Strong". The word Notion leaves the UI.

## Left to the builder

- Module layout (a format layer that produces today's row type, then the existing planner and writer).
- The month-name table for localised Hevy dates (English, Italian, Spanish, French, German, Portuguese, Dutch at least); an unreadable date skips the row with a reason.
- Tests use synthetic files shaped like the real ones; real exports stay out of the repo.
