import type { AppRole } from '@/types/enums';

/**
 * Role hierarchy (lowest → highest):
 *   guest < super_guest < user < senior_user < superuser < admin
 *
 * Page access rules:
 *   guest        → Dashboard, Schedule only
 *   super_guest  → + Raw Data (SubtestList, SubtestDetail)
 *   user+        → all pages except Admin
 *   admin/superuser → all pages including Admin
 */

type RoutePath = string;

const ROLE_RANK: Record<AppRole, number> = {
  guest: 0,
  super_guest: 1,
  user: 2,
  senior_user: 3,
  superuser: 4,
  admin: 5,
};

/** Minimum role rank required for each route */
const ROUTE_MIN_RANK: [RegExp, number][] = [
  [/^\/admin/, 4],           // superuser / admin
  [/^\/tc\/import/, 2],      // user+
  [/^\/tc\/export/, 2],      // user+
  [/^\/tc\/quick-update/, 2], // user+
  [/^\/tc\/raw-data/, 1],    // super_guest+
  [/^\/tc\/dashboard/, 0],   // everyone
  [/^\/tc\/progress/, 0],    // everyone
  [/^\/tc\/schedule-revision/, 2], // user+
  [/^\/defects\/import/, 2], // user+
  [/^\/defects\/export/, 2], // user+
  [/^\/defects\/quick-update/, 2], // user+
  [/^\/defects\/raw-data/, 1], // super_guest+
  [/^\/defects\/[^/]+$/, 1], // defect detail
  [/^\/defects\/dashboard/, 0], // everyone
  [/^\/defects\/progress/, 0], // everyone
  [/^\/defects\/schedule-revision/, 2], // user+
  [/^\/docs\/import/, 2],    // user+
  [/^\/docs\/export/, 2],    // user+
  [/^\/docs\/org-mapping/, 4], // superuser/admin
  [/^\/docs\/raw-data/, 1],  // super_guest+
  [/^\/docs\/[^/]+$/, 1],    // docs detail
  [/^\/docs\/dashboard/, 0], // everyone
  [/^\/import/, 2],          // user+
  [/^\/export/, 2],          // user+
  [/^\/mobile/, 2],          // user+
  [/^\/$/, 0],               // redirects to Dashboard
  [/^\/raw-data/, 1],        // super_guest+ (Raw Data)
  [/^\/subtests\//, 1],      // super_guest+ (SubtestDetail)
  [/^\/dashboard/, 0],       // everyone
  [/^\/schedule/, 0],        // everyone
];

function highestRank(roles: AppRole[]): number {
  if (roles.length === 0) return -1;
  return Math.max(...roles.map(r => ROLE_RANK[r] ?? -1));
}

export function canAccessRoute(roles: AppRole[], path: string): boolean {
  const rank = highestRank(roles);
  for (const [pattern, minRank] of ROUTE_MIN_RANK) {
    if (pattern.test(path)) return rank >= minRank;
  }
  // default: allow authenticated users
  return rank >= 0;
}

/** Filter sidebar nav items based on roles */
export function filterNavItems<T extends { path: string }>(items: T[], roles: AppRole[]): T[] {
  return items.filter(item => canAccessRoute(roles, item.path));
}
