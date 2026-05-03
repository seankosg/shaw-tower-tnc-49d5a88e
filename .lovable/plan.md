# Docs Import — View Log (parity with T&C / Defect)

## Goal
Provide the same Import History / Row Detail UX for the Docs (As-Built) module as already exists for T&C (`/import/logs`) and Defect (`/defects/import/logs`).

## Scope of parity
- Batch list (file, type, date, uploader, data date, duration, status, total/success/skipped/rejected)
- Row-level log table per batch (raw row no, document no, action, reason)
- Field-level log table (per-row expandable + summary chips + CSV export)
- Filters: action / reason / outcome / search; render limit
- Per-batch actions: **Rollback** and **Delete** (admin / superuser only)
- Deep-link via `?batch=<id>&tab=...`
- Sidebar entry under Docs

## Out of scope
- Schedule-change audit tab (Defect-specific; no equivalent in Docs)
- Changing existing import behavior beyond writing field logs

---

## Technical plan

### 1. Database
Migration:
- Extend `import_field_logs.kind` CHECK to include `'docs'`.
- Add RPC `delete_docs_import_batch(_batch_id uuid)` — admin/superuser only:
  - Delete `docs_change_log` rows referencing this batch (best-effort).
  - Delete `docs_drawings` rows where `source_upload_id = _batch_id` (only if the batch is the most recent source for that drawing — otherwise just clear `source_upload_id`).
  - Delete `import_field_logs` where `upload_id = _batch_id AND kind = 'docs'`.
  - Delete `docs_upload_row_logs` and `docs_upload_batches` rows.
- Add RPC `rollback_docs_import_batch(_batch_id uuid, _force boolean)` — restores `raw_payload` snapshot if available; otherwise marks batch as rolled back without data revert (matches Defect behavior). Mark `rolled_back_at`/`rolled_back_by` on `docs_upload_batches`.

(If the snapshot route is too involved for v1, ship Delete only and leave Rollback as a follow-up — but the page UI will already be wired for it.)

### 2. Importer wiring (`DocsImportContext.tsx`)
Currently writes `docs_upload_row_logs` only. Add field-level logging:
- Build `PendingFieldLog[]` per row using `buildFieldLog('docs' as any, …)` (after kind check is widened).
- For inserts: log every non-null payload field as `applied` (raw → applied).
- For updates: diff payload vs `existing.raw_payload`; log `applied` for changes, `unchanged` for equal, `auto_filled` for `subcontractor_name='TBA'` default, `derived` for normalized A/B/C statuses.
- For skipped/rejected rows: log a single `info` / `rejected_invalid` field entry with reason.
- Bulk insert into `import_field_logs` in 500-row chunks (mirror Defect importer pattern).

Widen `FieldLogKind` in `src/lib/import-field-log.ts` from `'tnc' | 'defect'` → `'tnc' | 'defect' | 'docs'`.

### 3. New page `src/pages/docs/DocsImportLogsPage.tsx`
Clone `DefectImportLogsPage.tsx` and adapt:
- Batch source: `docs_upload_batches` (filter `sub_module='as_built'`).
- Row log source: `docs_upload_row_logs` (cols: `id, raw_row_no, document_no, action_taken, reason_code, reason_detail`).
- Field log source: `import_field_logs` filtered `kind='docs'`.
- Remove Schedule Changes tab; keep Rows + Fields tabs only.
- Delete button → call `delete_docs_import_batch` RPC.
- Rollback button → `<RollbackDialog kind="docs" …>` (extend RollbackDialog: add `docs` case calling `rollback_docs_import_batch`).
- "Type" column shows "Docs / As-Built".

### 4. Routing & navigation
- `src/App.tsx`: add route `/docs/import/logs` → `DocsImportLogsPage` inside the existing `DocsImportProvider` block.
- `src/pages/docs/DocsImportPage.tsx`: add a "View import history" button in the header (same pattern as `ImportPage` / `DefectImportPage`).
- `src/components/layout/AppSidebar.tsx`: add `{ label: 'Import Logs', icon: History, path: '/docs/import/logs' }` under the Docs group, right after Import.

### 5. UI helpers reused as-is
- `FieldLogTable`, `FieldLogSummaryChips`, `downloadFieldLevelCsv` from `src/components/import/FieldLogTable.tsx`
- `fetchAllByUploadId` from `src/lib/fetch-all-rows.ts`
- `formatDateTimeDdMmmYyyy`, `formatDdMmm`, `formatDuration` from `src/lib/format.ts`

### 6. Acceptance checklist
- Navigate `/docs/import/logs` → see batch list with same columns as Defect.
- Click a batch → tabs `Row Logs` and `Field Logs`; deep-link works.
- Filters and search behave identically; CSV export downloads field-level CSV.
- Admin sees Rollback + Delete; non-admin does not.
- A fresh import after this change writes field-level logs visible in the new tab.

---

## Files

**New**
- `src/pages/docs/DocsImportLogsPage.tsx`
- `supabase/migrations/<ts>_docs_import_logs.sql` (kind check widen + RPCs)

**Modified**
- `src/lib/import-field-log.ts` — widen `FieldLogKind`
- `src/contexts/DocsImportContext.tsx` — emit `import_field_logs` rows
- `src/components/import/RollbackDialog.tsx` — add `docs` kind branch
- `src/App.tsx` — register route
- `src/components/layout/AppSidebar.tsx` — add nav entry
- `src/pages/docs/DocsImportPage.tsx` — add "View import history" button
