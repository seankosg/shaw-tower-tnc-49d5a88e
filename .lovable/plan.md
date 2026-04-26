## Goal

Both Import History tables (T&C `ImportLogsPage` and Defect `DefectImportLogsPage`) currently show: File, Type, Date, Status, Total, Success, Skipped, Rejected. We will add three new columns:

1. **Uploader** — name of the user who ran the import
2. **Data Date** — the data-as-of date set during import
3. **Duration** — how long the import took to run

## Changes

### 1. `src/pages/ImportLogsPage.tsx` (T&C side)

- Extend the `UploadBatch` interface with `uploaded_by`, `data_date`.
- Update the batches query to also select `uploaded_by, data_date`.
- After fetching batches, fetch profiles in one round-trip:
  - `supabase.from('profiles').select('user_id, name, login_id').in('user_id', [...uniqueUploaderIds])`
  - Build a `Map<user_id, displayName>` (prefer `name`, fall back to `login_id`).
- After fetching batches, fetch completion times for duration:
  - Single query: `supabase.from('upload_row_logs').select('upload_id, processed_at').in('upload_id', batchIds)`
  - Reduce client-side to `Map<upload_id, maxProcessedAt>`. Duration = `max(processed_at) - uploaded_at`. If no row logs (e.g., failed before any rows), show `—`.
- Add a `formatDuration(ms)` helper in this file (or in `src/lib/format.ts`):
  - `< 1s` → `<1s`
  - `< 60s` → `Xs`
  - `< 60min` → `Xm Ys`
  - else → `Xh Ym`
- Insert three new columns in the table header (between Date and Status feels natural):
  - `Uploader`, `Data Date`, `Duration`
- Render the cells with `cursor-pointer` + `onClick={() => selectBatch(b.id)}` to match existing rows.
- Update the `colSpan` for the "Loading..." and "No import history" empty rows (currently 8/9 → 11/12).

### 2. `src/pages/DefectImportLogsPage.tsx` (Defect side)

Same changes as above, but:
- `DefectBatch` interface adds `uploaded_by`, `data_date`.
- Query `defect_upload_batches` with the new fields.
- Duration source table is `defect_upload_row_logs` (also has `processed_at` and `upload_id`).
- Same profiles fetch and duration computation logic.
- Same three new header cells, same colSpan updates.

### 3. `src/lib/format.ts`

Add and export:

```ts
export const formatDuration = (ms: number | null | undefined): string => { ... }
```

so both pages can reuse it.

## Display details

- **Uploader**: show `name`; if missing, `login_id`; if neither, `—`.
- **Data Date**: use the existing `formatDdMmm` helper (`dd-MMM`); show `—` if null.
- **Duration**: derived from `max(processed_at) - uploaded_at`. Show `—` for batches with no row logs. Tooltip (`title=`) shows the exact ms-rounded value e.g. `12.4s`.

## Out of scope

- No DB migration. We don't add a `completed_at` column — duration is derived from row logs, which is sufficient for the existing data model.
- No changes to the detail view, only the history list table.
