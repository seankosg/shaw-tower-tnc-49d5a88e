## Goal

Make all 3 Submission cycles consistently expose **both Planned and Actual** dates for each of the 2 sub-events (Submission, Response), with clean labels and ordering.

## Current state

Schema already has all needed columns per cycle (`sub{N}_planned_date`, `sub{N}_submission_date`, `sub{N}_approval_date`, `sub{N}_actual_response_date`, `sub{N}_approval_status`). The problem is **labels are inconsistent** — Cycle 1 shows "Sub1 Planned / Sub1 Submitted / Cycle 1 Planned Response / Cycle 1 Actual Response", which obscures the Planned↔Actual pairing.

## Target labels (per cycle N = 1, 2, 3)

| field_name | display_name | sort |
|---|---|---|
| sub{N}_planned_date | Cycle N Planned Submission | base+0 |
| sub{N}_submission_date | Cycle N Actual Submission | base+1 |
| sub{N}_approval_date | Cycle N Planned Response | base+2 |
| sub{N}_actual_response_date | Cycle N Actual Response | base+3 |
| sub{N}_approval_status | Cycle N Status (A/B/C) | base+4 |

Bases: Cycle 1 → 200, Cycle 2 → 220, Cycle 3 → 240. The standalone `sub1_actual_response_date / sub2_/ sub3_` rows currently sitting at sort 110/120/130 are removed (folded into the per-cycle group above). `submitted_date` (legacy alias, sort 150) stays as-is for back-compat reads but kept disabled in new bulk-edit groups.

## Changes

### 1. Data migration (UPDATE via insert tool)
Update `docs_field_config` rows: rename `display_name` and reset `sort_order` per the table above. Disable the 3 duplicate "Cycle N Actual Response" rows at sort 110/120/130 (set `is_enabled = false`) since they now live inside each cycle's group.

### 2. `src/components/raw-data/DocsBulkEditBar.tsx`
Reorganize the per-cycle field groups so each cycle exposes the same 5 fields in the same order: Planned Submission → Actual Submission → Planned Response → Actual Response → Status.

### 3. `src/pages/admin/HeaderMappingsTab.tsx`
The `DOCS_AS_BUILT_FIELDS` list already includes all 15 per-cycle fields. Verify ordering matches the new convention; reorder if needed so admins see Planned/Actual pairs grouped per cycle.

### 4. `src/lib/docs-excel-export.ts`
Reorder export columns so each cycle exports its 5 fields in the new Planned/Actual order. No new columns added.

### 5. `src/pages/docs/DocsRawDataPage.tsx` (table column order)
If the raw-data table renders cycle columns explicitly, reorder them to match. Otherwise picks up automatically from `docs_field_config.sort_order`.

### 6. Parser (`src/lib/docs-import-parser.ts`)
No code change required — the parser already maps both `planned date` and `submission date` under each Submission group. Verify the SUB_ALIAS map covers both terms (it does).

## Out of scope

- No schema migration (all columns already exist).
- No status engine changes (`docs-status.ts` already consumes both planned and actual fields per cycle).
- Cycle-disable rules and Cycle-3 B/C alert remain as previously implemented.

## Risks

- Renaming display labels does not affect stored data; safe.
- Existing imports remain valid because field_name keys are unchanged.