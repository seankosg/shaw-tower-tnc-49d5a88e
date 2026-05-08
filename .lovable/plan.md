# OMM Dashboard & Training Column Rework

## 1. OMM Stage Cards (4 stages)

Replace current 5-stage `OMM_STAGE_DEFS` in `src/lib/docs-executive-dashboard-data.ts` with exactly these 4 stages:

| Key | Card Title | Done condition | Planned date source |
|---|---|---|---|
| `omm.draft_submission` | Draft Submission | `draft_actual_date` exists | `draft_planned_date` |
| `omm.draft_approval` | Draft Approval | `draft_response_status` upper === `'A'` | `draft_planned_date` |
| `omm.final_submission` | Final Submission | `final_actual_date` exists | `final_planned_date` |
| `omm.final_approval` | Final Approval | `final_response_status` upper === `'A'` | `final_response_planned_date ?? final_planned_date` |

Remove `draft_review`, `final_review`, `completed` keys. Update `buildOmmStageRecords()` accordingly.

## 2. OD chip on every stage card

In `StageCard` (DocsExecutiveDashboardPage.tsx), add a top-right chip showing `OD {overdue}/{remaining}` where:
- `overdue` = planned date ≤ today AND not done
- `remaining` = not done (regardless of planned)

Apply to ABD, OMM, Warranty, Spare Part stage cards (all that use `StageCard`). Card click navigates to Raw Data with `?stage=<key>&overdue=1` to filter to overdue items only.

## 3. Training column

- `useDocsFieldConfig.ts` default label: `training_required: 'Training Required'` → `'Training'`.
- `DocsOMMRawDataPage.tsx` header label override → `'Training'`.
- `DocsOMMDetailPage.tsx` `TRAINING_OPTIONS`: `['Yes','No','N/A']` → `['Done','Not Yet','N/S']`. Editable per RSC permissions (existing gate).
- Data migration on `docs_omm.training_required`:
  - `'Yes'` → `'Done'`
  - `'No'` → `'Not Yet'`
  - `'N/A'` → `'N/S'`
  - other / null untouched
- Update `docs_field_config` row for `training_required` display_name to `'Training'` (only if currently the default).

## 4. Out of scope

- Critical Board redesign (separate plan, still pending approval).
- ABD/Warranty stage card semantics (only OD chip + click filter added).
- Training auto-normalization at import time.

## Files to touch

- `src/lib/docs-executive-dashboard-data.ts` — stage defs + record builder
- `src/pages/docs/DocsExecutiveDashboardPage.tsx` — StageCard OD chip + click handler
- `src/hooks/useDocsFieldConfig.ts` — label default
- `src/pages/docs/DocsOMMRawDataPage.tsx` — header label, query param filter (`overdue=1`)
- `src/pages/docs/DocsOMMDetailPage.tsx` — TRAINING_OPTIONS
- migration: update `docs_omm.training_required` values + `docs_field_config` row
