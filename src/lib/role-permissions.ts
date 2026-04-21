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
  [/^\/import/, 2],          // user+
  [/^\/export/, 2],          // user+
  [/^\/mobile/, 2],          // user+
  [/^\/$/, 1],               // super_guest+ (Raw Data)
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
