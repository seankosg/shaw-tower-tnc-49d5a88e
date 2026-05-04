# Add Team Support to Docs Module + New "Design" Team

## Overview

1. Add a new `Design` value to the existing `team_type` enum (currently: Mech, Elec, Arch, Supp).
2. Add a `team` column to `docs_drawings` so the Docs module can track team like the Defects module already does.
3. Surface team in Docs UI: Raw Data table + filter, Drawing Detail editor, Bulk Edit, Field Config, and Excel Import mapping.

## 1. Database Migration

```sql
-- Add Design to team_type enum
ALTER TYPE public.team_type ADD VALUE IF NOT EXISTS 'Design';

-- Add team column to docs_drawings
ALTER TABLE public.docs_drawings
  ADD COLUMN IF NOT EXISTS team public.team_type;

-- Register team in docs_field_config so it shows up in tables/forms
INSERT INTO public.docs_field_config
  (field_name, display_name, is_enabled, is_required, sort_order, source_origin, visible_to_roles, editable_to_roles)
VALUES
  ('team', 'Team', true, false, 65, 'system',
   ARRAY['guest','super_guest','user','senior_user','superuser','admin']::app_role[],
   ARRAY['user','senior_user','superuser','admin']::app_role[])
ON CONFLICT DO NOTHING;
```

Sort order 65 places Team between Subcontractor (60) and Discipline (70).

## 2. Shared Enum Constants (`src/types/enums.ts`)

- Extend `TeamType` to include `'Design'`.
- Append `'Design'` to `ALL_TEAMS`.
- Add `Design: 'Design'` to `TEAM_LABELS` (label same as enum value).
- Extend `normalizeTeamValue()` to map tokens like `design`, `designer`, `designteam` → `'Design'`.

This automatically updates Defects module dropdowns, Profiles team selector, and any other consumer.

## 3. Docs Module Code Changes

**`src/pages/docs/DocsRawDataPage.tsx`**
- Add `team` to the `DocsDrawing` row type, `select(...)` query, derived row mapping, default field-width config (`team: 110`), default-visible columns list, and bulk-edit/filter `optionFields` (using `ALL_TEAMS`).
- Add a `team` entry to the bulk-edit field definitions with `inputType: 'select'`, group `Classification`.

**`src/pages/docs/DocsDrawingDetailPage.tsx`**
- Add `team` to the `DocsDrawing` type, fetch select list, form state, change-log diffing, and `EDITABLE_FIELDS`.
- Render a `SelectField` for team (options from `ALL_TEAMS` with `TEAM_LABELS`) next to Trade/Discipline, gated by `isFieldVisible('team')`.

**`src/lib/bulk-edit.ts`**
- Add `team` to the editable field whitelist for the docs module so bulk updates can write it.

**`src/lib/docs-import-parser.ts`**
- Add `'team'` to the `TargetField` union and to `HEADER_MAP` aliases (`team`, `team name`, `discipline team`, etc.).
- During row normalization, run the raw value through `normalizeTeamValue()` and assign to `team` (drop unrecognized values with a row log warning, consistent with existing pattern).
- Optional auto-derive: if `team` is missing but `discipline` matches a known token (e.g. discipline `Mechanical` → team `Mech`), backfill via `normalizeTeamValue(discipline)`. Keep this behind the same fallback already used elsewhere.

**`src/integrations/supabase/types.ts`** — auto-regenerated; not edited manually.

## 4. UI Behavior

- Team column in Raw Data table is sortable and filterable using `TEAM_LABELS` for display.
- Drawing Detail shows full label (e.g. "Mechanical") via `formatTeamLabel`.
- "Closed" (Overall Status A) styling already implemented continues to apply; no interaction with team logic.

## 5. Out of Scope

- No changes to `defect_items` data; the new `Design` value is simply available to all team consumers.
- No backfill of `team` for existing docs rows. Users can populate via Detail page edit, Bulk Edit, or next Excel import.

## Files Touched

- New migration (enum + column + field_config seed)
- `src/types/enums.ts`
- `src/pages/docs/DocsRawDataPage.tsx`
- `src/pages/docs/DocsDrawingDetailPage.tsx`
- `src/lib/bulk-edit.ts`
- `src/lib/docs-import-parser.ts`
