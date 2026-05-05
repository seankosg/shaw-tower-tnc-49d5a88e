## Goal
Restrict Schedule pages so Guest role can no longer access or see them in the sidebar. Super Guest and above retain access.

## Changes

### `src/lib/role-permissions.ts`
- Change `/schedule` route min rank from `0` (everyone) to `1` (super_guest+).
  - `[/^\/schedule/, 0]` → `[/^\/schedule/, 1]`
- Update header comment for `guest` from "Dashboard, Schedule only" to "Dashboard only".
- Update `super_guest` comment to mention Schedule access.

## Effect
- **Guest**: Sees Dashboard only. Direct navigation to `/schedule*` is blocked by `canAccessRoute` and the route guard redirects/denies as it already does for other restricted routes.
- **Super Guest and above**: Unchanged — Schedule remains visible and accessible.
- Sidebar `filterNavItems` will automatically hide Schedule entries for Guest since it uses `canAccessRoute`.

## Notes
This is a pure client-side navigation/visibility change. Schedule data tables (subtests, etc.) already have their own RLS — Guest viewing was previously read-only anyway. No DB migration needed.
