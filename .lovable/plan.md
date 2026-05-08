## Goal

Show on each Critical Issue Board row: **Registered At** (date+time when marked critical from Raw Data), **Team**, and **Registered By** (user name).

## Database changes

Add tracking columns to both `subtests` and `defect_items`:
- `critical_marked_at timestamptz` — set when `is_critical` flips false→true
- `critical_marked_by uuid` — user who registered
- `critical_marked_by_name text` — denormalized snapshot of profiles.full_name (avoids extra joins, survives user renames)

Implementation:
- Add columns via migration.
- Add a BEFORE UPDATE trigger on each table: when `NEW.is_critical = true AND OLD.is_critical IS DISTINCT FROM true`, set `critical_marked_at = now()`, `critical_marked_by = auth.uid()`, and look up the name from `profiles`. When flipped back to false, clear the three fields.
- Also handle INSERT (for the rare case a row is inserted with `is_critical = true`).
- Existing rows already marked critical: leave fields NULL — UI will show "—" for them. (User confirmed it's OK; tracking starts going forward.)

## Frontend changes

`src/components/dashboard/CriticalItemsPanel.tsx`:
- Extend `CriticalRowItem` with `team`, `registered_at`, `registered_by_name`.
- Add three columns to the table: **Team**, **Registered At** (formatted `YYYY-MM-DD HH:mm`), **Registered By**.
- Keep grouping (By Team / By Subcontractor) as-is per user preference (per-row Team always visible; no team summary row removal).

`src/pages/DashboardPage.tsx` (subtests):
- Extend the select to include `critical_marked_at, critical_marked_by_name` (team is already selected).
- Pass them through in the `criticalItems` mapping.

`src/pages/DefectDashboardPage.tsx` (defects):
- Same: include the new fields in the source query and map them into the panel items.

`src/components/raw-data/CriticalPendingBar.tsx`:
- No change needed — the trigger handles metadata server-side when `is_critical` is updated.

## Display format

- Registered At: `2026-05-08 14:32` (local time, 24h).
- Registered By: profile full_name, fallback to "—".
- Team: existing enum value, fallback "—".

## Out of scope

- Backfilling historical critical registrations (no source of truth).
- Editing/overriding the registration metadata from UI.
