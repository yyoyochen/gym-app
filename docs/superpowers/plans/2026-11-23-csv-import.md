# CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "Import a CSV" that reads the GymBro template, Hevy exports and Strong exports (iOS and Android).

**Architecture:** A format layer (`import/formats.ts`) turns a Hevy or Strong table into the existing row type (`NotionRow`, extended with optional `kind`, `rir`, `group`), so the existing planner and writer in `import/notion.ts` do the rest. `importCsv` detects the format and dispatches; the UI panel replaces the Notion panel.

**Tech Stack:** TypeScript, Dexie, vitest with fake-indexeddb, React.

**Spec:** `docs/superpowers/specs/2026-11-23-csv-import-design.md`

Paths are relative to `web/src/` unless they start with `docs/`.

## Global Constraints

- Tokens only; check-styles 0 violations; no spaced middle dots in .ts/.tsx; 48 px targets.
- The word "Notion" leaves user-facing copy (code names may stay).
- Tests use synthetic CSVs shaped like real exports; no real export file is committed.
- Local only, no push; no Claude attribution in commits.
- Gates: `npm test`, `npm run typecheck`, `npm run build`, `node tools/check-private.mjs --all`.

## Review Focus

1. **A Strong iOS file imported as kg when it was lb** (no unit in the file): the UI must ask before importing. Test in Task 3 (`needsUnit is true only for a Strong file without a unit`).
2. **Hevy localised dates** (`14 ott 2026, 20:39`, `Jun 19, 2026, 9:40 AM`): read, not skipped. Test in Task 2.
3. **Rest-timer and note rows** in Strong: never become sets. Test in Task 2.
4. **Two Hevy workouts with the same title on one day** stay two sessions. Test in Task 3.
5. **Re-importing the same Hevy file** adds nothing. Test in Task 3.

---

### Task 1: Semicolon CSVs

**Files:** Modify `import/csv.ts`; Test `import/csv.test.ts` (create if absent).

**Interfaces:** Produces `parseCsv(text: string, delimiter?: ',' | ';'): string[][]` and `sniffDelimiter(text: string): ',' | ';'` (more `;` than `,` outside quotes on the first line → `;`).

- [ ] Write failing tests: a quoted semicolon file parses into fields; `sniffDelimiter` picks `;` for the Strong Android header and `,` for Hevy; commas inside a quoted semicolon field stay in the field.
- [ ] Run `npx vitest run --root web src/import/csv.test.ts`; expect FAIL.
- [ ] Implement; run again; expect PASS. Commit `feat(import): semicolon CSVs`.

### Task 2: Hevy and Strong rows

**Files:** Create `import/formats.ts`, `import/formats.test.ts`; Modify `import/notion.ts` (`NotionRow` gets optional `kind?: SetKind`, `rir?: number`, `group?: string`).

**Interfaces:**
- `type CsvFormat = 'gymbro' | 'hevy' | 'strong'`
- `detectFormat(header: string[]): CsvFormat | null`
- `parseHevyDateTime(s: string): { date: ISODate; time: string } | null` — `18 Nov 2026, 18:22`, `8 Jun 2026, 20:13`, `Jun 19, 2026, 9:40 AM`, `14 ott 2026, 20:39`; month names en/it/es/fr/de/pt/nl (first three letters, accents stripped, trailing dot allowed).
- `unitOfStrong(header: string[]): 'kg' | 'lb' | 'row' | null` (`row` = a `Weight Unit` column; null = unknown, ask).
- `parseHevy(table: string[][]): ParsedNotion` and `parseStrong(table: string[][], unit: 'kg' | 'lb'): ParsedNotion` — rows in the existing `NotionRow` shape, plus `kind`, `rir`, `group` (the workout's key: Hevy `title|start_time`, Strong `Workout #` or `Workout Name|Date`), `order` = exercise first-appearance index in the workout, `set` = 1…n per exercise in file order, weight in kg (lb × 0.45359237, 2 decimals), assisted lifts negative, RPE → `rir = 10 − rpe`, `failure`/`F` → working with `rir` 0 when no RPE, `warmup`/`W` → warmup, `dropset`/`D` → drop; skipped with a reason: rest-timer rows, note rows, rows with no reps (timed/cardio), unreadable dates. Decimal commas accepted. Hevy notes: literal `\n` → newline.

- [ ] Write failing tests with synthetic files: the Hevy sample (warm-up + normal + localised date + lb file + 0-based set_index → sets 1, 2), the Strong iOS sample (`Rest Timer` and `F` rows; floats `5.0`), the Strong Android sample (`W`, `Note`, `Rest Timer`, `Weight (kg)`), an old Android file with `Weight Unit` per row and `12,5`; `detectFormat` for all three shapes and null for junk.
- [ ] Run `npx vitest run --root web src/import/formats.test.ts`; expect FAIL.
- [ ] Implement; PASS. Commit `feat(import): read Hevy and Strong exports`.

### Task 3: One import for all three, and names that match

**Files:** Modify `import/notion.ts` (export `importCsv`, `needsUnit`, `planNotionImport` uses `group` and carries `kind`/`rir`; writer stores them), `domain/catalog.ts` (aliases + `(Equipment)` matching in `findInCatalog`); Tests `import/importCsv.test.ts`, `domain/catalog.test.ts`.

**Interfaces:**
- `importCsv(db: GymDb, text: string, opts?: { aliases?: AliasMap; unit?: 'kg' | 'lb' }): Promise<NotionImportResult & { format: CsvFormat }>` — throws a plain error naming the three shapes when the header matches none; throws when a Strong file needs a unit and none is given.
- `needsUnit(text: string): boolean`.
- `findInCatalog('Bench Press (Barbell)')` → Barbell Bench Press; also Squat, Deadlift, Overhead Press, Bent Over Row, Romanian Deadlift (Barbell), Incline Bench Press (Dumbbell), Lateral Raise (Dumbbell), Triceps Pushdown (Cable - Straight Bar), Triceps Rope Pushdown, Pull Up (Assisted).
- `NotionImportResult` gains `skippedRows` reasons from the format layer (existing `skipped`).

- [ ] Write failing tests: a Hevy file imports with warm-ups as warm-ups, RIR from RPE, lb converted, `Squat (Barbell)` on the Back Squat lift; same file twice → second run `sessionsAdded` 0; two same-titled Hevy workouts on one day → two sessions; Strong iOS without unit → `needsUnit` true and `importCsv` without `unit` rejects; GymBro template still imports (existing tests stay green); catalog name matches above.
- [ ] Run the two test files; FAIL.
- [ ] Implement; PASS; full `npm test`. Commit `feat(import): one CSV import for the template, Hevy and Strong`.

### Task 4: The panel, the template and the copy

**Files:** Rename `app/parts/ImportNotionPanel.tsx` → `app/parts/ImportCsvPanel.tsx`; Modify `screens/Onboarding.tsx`, `screens/Settings.tsx`; Create `app/csvTemplate.ts` + test; docs `docs/PWA-SPEC.md`.

**Interfaces:** `CSV_TEMPLATE: string` (header + two example rows, kg); `ImportCsvPanel({ onDone })`.

- [ ] Failing test: `CSV_TEMPLATE` parses with `importCsv`-compatible detection as `gymbro` and its two rows import.
- [ ] Implement the panel: copy "A GymBro template, or an export from Hevy or Strong. Re-importing the same file adds nothing."; "Download the template" (downloads `gymbro-template.csv`); file picker "Choose a CSV"; when `needsUnit`, a kg/lb Segmented and an "Import" button; result block as today plus the detected format ("Read as a Hevy export"). Settings group "Import a CSV"; setup sheet choice "Import a CSV / GymBro template, Hevy or Strong".
- [ ] `npm test && npm run typecheck && npm run build`; browser check at 390 px with synthetic Hevy and Strong files. Commit `feat: Import a CSV panel with a template`.
