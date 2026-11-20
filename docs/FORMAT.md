# GymBro backup format

Profile → Settings → Export writes one JSON file. Restore reads the same file back. The code is in `web/src/db/backup.ts`.

## Top level

```json
{
  "format": "gymbro-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-11-21T09:30:00.000Z",
  "profile": [], "exercises": [], "program": [], "sessions": [],
  "commits": [], "sets": [], "bodyweight": [], "events": [], "meta": []
}
```

- `format` is always `"gymbro-backup"`.
- `schemaVersion` is the IndexedDB schema version that wrote the file. An app restores files with the same or a lower version, upgrading older files step by step (`migrateExport`). A file from a newer app is refused.
- `exportedAt` is an ISO 8601 instant in UTC.
- Each other key holds every row of the IndexedDB store with that name. Rows are sorted (by id, date or key) so two exports of the same data are byte-identical apart from `exportedAt`.

Dates (`date`, `deadline`, `since`) are calendar dates, `YYYY-MM-DD`, with no timezone. Instants (`startedAt`, `endedAt`, `loggedAt`, `committedAt`, `at`) are epoch milliseconds. Weights are kg.

## Stores

The row shapes are the TypeScript types in `web/src/domain/types.ts`. Optional fields can be left out.

| Key | Row type | Primary key | Notes |
|---|---|---|---|
| `profile` | `Profile` + `id: "me"` + `history: {at, profile}[]` | `id` | At most one row. `history` keeps each earlier version with the time it was replaced. Goals and targets are in `primaryGoal`, `goals`, `targets` and `checkpoints`. |
| `exercises` | `Exercise` | `id` | `id` is a slug of the name (`back-squat`). `areasLoaded` drives the pain rules. `bodyweightFactor` 0 means not a bodyweight lift. |
| `program` | `Program` | `id` | The active one is `meta.activeProgramId`. |
| `sessions` | `Session` | `id` | `date` is set when the session starts and does not change if a set is logged after midnight. Imported sessions have `importKey` and `programSessionKey: "import:<label>"`. |
| `commits` | `Commit` | `sessionId` | The frozen promise. Write-once: the app never overwrites one. |
| `sets` | `SetEntry` + `date` | `id` | `date` is a copy of the session's date, used for indexing. `rir` is always reps in reserve; RPE = 10 − RIR. `slotOrder` is the slot within the session and `setOrder` the set within the slot, both 1-based. `importFlags` marks values that were blank in an imported file (`blank_weight`, `blank_reps`), which are stored as 0. |
| `bodyweight` | `BodyweightEntry` | `id` | |
| `events` | `AppEvent` | `id` | `type`: `skip`, `pain`, `deload`, `reentry`, `target_change`, `export`. |
| `meta` | `{key, value}` | `key` | `schemaVersion`, `lastExportAt`, `demoMode`, `benchmarkVersion`, `activeProgramId`, `lastRestoreAt`. `persistGranted` describes this browser, so it is never exported or overwritten by a restore. |

## Restore rules

1. The file is checked first. It needs the right `format`, a known `schemaVersion`, every store as an array, well-formed rows, no duplicate keys, and every set and commit must point to a session in the file. If anything fails, nothing changes and the errors are listed.
2. The data currently in the app is saved as an undo copy. This copy is kept until the next restore and is not part of any export.
3. All stores are cleared and filled from the file in one transaction. Either everything is replaced or nothing is.
4. **Undo last restore** puts the saved copy back, also in one transaction, and then deletes the copy.

## CSV export (one row per set)

This is for spreadsheets. The app cannot restore from it. The columns are:

`date, session, session_key, exercise, exercise_id, slot, set, kind, weight_kg, reps, rir, failed, pain_area, pain_side, pain_severity, note, logged_at`

Fields are quoted per RFC 4180, lines end in CRLF, and `logged_at` is an ISO 8601 instant.

## Notion import (input, not a backup)

The Notion training-log CSV has the columns Date, Session, Exercise, Order, Set, Reps, Weight (kg) and Notes. They are matched by header name, so their order doesn't matter. The rules:

- Each row is one set.
- Rows are grouped into sessions by date and Session label. A blank label is allowed.
- Order becomes `slotOrder` and Set becomes `setOrder`.
- Exercise names go through the alias map you supply, then the exercise catalog. Names that match neither get new exercises with keyword-based defaults.
- Each session's `importKey` is a hash of its rows, so importing the same file again adds nothing.
- If a session with the same date and label is already there but its rows have changed, it is reported as a conflict and left alone.
