
# Goal

Bring the ABD Raw Data page to **functional + visual parity** with the T&C Raw Data bulk action bar. Today T&C uses the rich `BulkActionBar` (bulk edit + Duplicate + Reassign + Export `.xlsx` / Copy TSV + Hide / Permanent delete + permission counters). ABD only has a stripped-down `DocsBulkEditBar` (edit only). We will reuse the **same shared component** for ABD and wire it to the `docs_drawings` table.

# What changes

## 1. Generalize `BulkActionBar` to support ABD (`drawing` entity)

Currently the shared bar is hard-coded around two entities: `subtest` and `defect` (declared in `src/lib/bulk-actions.ts` as `BulkEntity = 'subtest' | 'defect'`). We extend it with a third entity, `drawing`, mirroring the same surface area:

- Add `'drawing'` to the `BulkEntity` union.
- `getEditableScopeMap`: for `drawing` we don't have a per-row RPC, so resolve scope client-side from the user's role + team:
  - admin / superuser → all rows editable (`full`)
  - d_superuser → rows where `row.team === profile.team` (`team`)
  - everyone else → not editable from this bar (drawings are normally edited inline; bulk actions stay admin-grade)
  - This matches the existing RLS we put in place for `docs_drawings` and avoids needing a new RPC.
- `applyBulkDelete` for `drawing`:
  - **Soft**: `update docs_drawings set is_active=false` for the editable ids (RLS already gates this).
  - **Hard**: chunked `delete from docs_drawings where id in (...)`. There are no FKs into `docs_drawings`, so no cascade RPC is needed; admin/superuser policy already restricts the operation.
- `previewBulkDelete` for `drawing`: count related `docs_change_log` rows for those drawing ids so the cascade-impact panel still renders meaningful numbers (label: "Change log entries").
- `applyBulkDuplicate` for `drawing`:
  - Read full source rows from `docs_drawings`.
  - For each row, compute next available `document_no` per `(project_id, sub_module)` by appending `-2`, `-3`, … if a collision occurs (same retry-on-`23505` pattern used for subtests).
  - Drop `id`, `created_at`, `updated_at`, `row_version`; reset `data_source_type='manual'`, `source_upload_id=null`, `is_active=true`, `updated_by=userId`.
  - Options:
    - **Reset actual dates** → clear `submitted_date`, `approved_date`, `sub1_actual_response_date`, `sub2_actual_response_date`, `sub3_actual_response_date`, `sub1_submission_date`, `sub2_submission_date`, `sub3_submission_date`, `sub1_approval_date`, `sub2_approval_date`, `sub3_approval_date`.
    - **Reset progress / status** → clear `current_status`, `aconex_status`, `sub1_approval_status`, `sub2_approval_status`, `sub3_approval_status`, set `is_submitted=false`.
- `BulkDuplicateDialog`: extend its `entity === 'subtest' ? ... : ...` copy to also handle `'drawing'` (label key = `document_no`, reset-text wording for ABD).
- `BulkDeleteDialog`: same — `labelKey = 'document_no'` for `drawing`, and add `'change_log'` cascade label entry (already present generically).
- `BulkReassignDialog`: no changes — it is entity-agnostic.

## 2. Default export columns for `drawing`

In `src/components/raw-data/BulkEditBar.tsx` (the back-compat wrapper) and/or `BulkActionBar` itself, register a default `ExportColumn[]` set for `drawing` so the Export Excel / Copy TSV buttons work without each caller redeclaring them. Defaults will include: `document_no, revision, title, sub_module, discipline, document_type, team, subcontractor_name, hdec_pic_name, current_status, aconex_status, submitted_date, approved_date, remarks`.

## 3. Wire ABD page to the shared bar

In `src/pages/docs/DocsRawDataPage.tsx`:

- Replace the import and JSX of `DocsBulkEditBar` with `BulkActionBar` (or the back-compat `BulkEditBar` wrapper, whichever is cleaner — we'll use `BulkActionBar` directly for clarity).
- Pass:
  - `table="docs_drawings"`, `entity="drawing"`
  - `fields={bulkFields}` (already defined in the page)
  - `exportColumns` — the columns currently visible in the table, in user order (mirrors how T&C does it).
  - `reassignFields` — Subcontractor (id-based, with `subcontractor_name` companion), HDEC PIC, HDEC ENG, Team. Options reuse the same `subcontractorOptions / hdecPicOptions / hdecEngOptions / team enum` already loaded on the page.
  - `onApplied={handleBulkApplied}` — keep existing in-place row patching.
  - `onMutated={() => fetchData()}` — refetch after duplicate / delete / reassign.
  - `onClearSelection={() => setRowSelection({})}`.
- Delete `src/components/raw-data/DocsBulkEditBar.tsx` (no other importers — verified).

## 4. Permission notes (no migrations needed)

- The existing RLS on `docs_drawings` already lets admin / superuser / d_superuser (own team) UPDATE & DELETE rows, and INSERT for the same set. Duplicate (INSERT) and hard-delete (DELETE) will therefore succeed for those roles and be silently rejected by RLS for others — exactly the same model as T&C.
- The `is_admin_or_superuser` RPC is reused to gate the "Delete permanently…" menu item just like T&C.

# Out of scope

- No DB migrations.
- No changes to OMM / Spare Part / Warranty bulk bars.
- No changes to T&C / Defect bulk behavior (only additive `'drawing'` branch).
- No new RPCs (we keep client-side delete because there are no dependent FK tables on `docs_drawings`).

# UI parity check

After this change ABD's bar will show the same controls in the same order as T&C:

```text
[● N selected · Editable X · Skipped Y]  [Edit field… ▾] [value] [Apply]   [Duplicate] [Reassign] [Export ▾] [⋯ Delete] [✕]
```

Confirm dialogs (bulk-edit confirm with before/after preview, Duplicate options, Reassign keep/set/clear, Soft vs Hard delete with `DELETE` typing) are all the shared components — identical look-and-feel.
