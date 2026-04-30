## Goal

Make every date/timestamp column in the two remaining Excel exports a true Excel date cell (numeric serial + `numFmt`), so Excel sorts/filters them as dates instead of text.

## Files to edit

### 1. `src/pages/ExportPage.tsx` (T&C → Export Data page)

Currently uses `XLSX.utils.json_to_sheet(rows)` with raw ISO strings for `T1 Planned`, `T2 Planned`, and a pre-formatted `Updated` string. Result: text cells.

Changes:
- Switch to `xlsx-js-style` (already used elsewhere) and use `aoa_to_sheet` so we can write per-cell types.
- Use `isoToExcelSerial` + `DATE_NUMFMT` (`dd-mmm`) for `T1 Planned` and `T2 Planned`.
- Use `isoTimestampToExcelSerial` + `DATETIME_NUMFMT` (`dd-mmm-yyyy hh:mm`) for `Updated` (replacing the current `formatDdMmmYyyy` text).
- Keep all other columns as strings; preserve current header order and column auto-sizing.
- Header row stays at row 1; data rows from row 2 onward.

### 2. `src/lib/defect-export-utils.ts` (Defect → Advanced Export workbook)

`exportDefectsWorkbook` currently passes raw ISO strings into `XLSX.utils.json_to_sheet` for date fields like `planned_start_date`, `planned_completion_date`, `planned_closure_date`, `actual_start_date`, `actual_completion_date`, `actual_closure_date`, plus `updated_at`.

Changes:
- Define a `DATE_FIELDS` set (the 6 plan/actual date fields) and a `DATETIME_FIELDS` set (`updated_at`, plus any other timestamp columns surfaced — verify by inspecting `DefectItem` keys actually included).
- Build the Defects sheet with `aoa_to_sheet`:
  - Header row from `opts.columns` labels.
  - For each row/column, if the field is in `DATE_FIELDS`, write `{ t: 'n', v: isoToExcelSerial(raw), z: DATE_NUMFMT }` (skip when null → empty cell).
  - If in `DATETIME_FIELDS`, same pattern with `isoTimestampToExcelSerial` + `DATETIME_NUMFMT`.
  - Otherwise write the existing string/number value.
- The `Summary` and `Export Info` sheets stay as-is (no date columns that need typing; `Data Date` is a single field — leave as text to preserve current display, or optionally also convert — see Decision below).

## Shared helpers

Reuse the existing utilities — no new helpers needed:
- `isoToExcelSerial`, `isoTimestampToExcelSerial`, `DATE_NUMFMT`, `DATETIME_NUMFMT` from `src/lib/excel-date-cell.ts`.
- `xlsx-js-style` (already a dependency, used in `src/lib/excel-export.ts`).

## Decision points (defaults shown — will apply unless told otherwise)

- `Updated` / `updated_at` columns → datetime cell with format `dd-mmm-yyyy hh:mm` (matches existing pattern in `excel-export.ts`).
- `Data Date` field in Defect Export Info sheet → keep as text (it's a meta label, not a sortable column).
- Empty/null date values → empty cell (no zero serial), so Excel shows blank.

## Out of scope

- `src/lib/excel-export.ts` (T&C Subtest Master DB) and `src/lib/defect-excel-export.ts` (Defect List/Raw Data) — already correct.
- No schema/RLS changes; no migrations.
