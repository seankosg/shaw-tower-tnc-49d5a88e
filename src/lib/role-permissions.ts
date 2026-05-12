import type { AppRole } from '@/types/enums';

/**
 * Role hierarchy (lowest → highest):
 *   guest < super_guest < user < senior_user < d_superuser < superuser < admin
 *
 * Page access rules:
 *   guest        → T&C Dashboard/Progress, Defects Dashboard/Progress only
 *   super_guest  → + Schedule, Raw Data (SubtestList, SubtestDetail), Docs Dashboard
 *   user+        → all module pages
 *   d_superuser  → all module pages (no Admin tab); writes restricted to own team via RLS
 *   superuser/admin → all pages including Admin
 */

type RoutePath = string;

const ROLE_RANK: Record<AppRole, number> = {
  guest: 0,
  super_guest: 1,
  user: 2,
  senior_user: 3,
  d_superuser: 4,
  superuser: 5,
  admin: 6,
};

/** Minimum role rank required for each route */
const ROUTE_MIN_RANK: [RegExp, number][] = [
  [/^\/admin/, 5],           // superuser / admin only (d_superuser blocked)
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
  [/^\/defects\/dashboard/, 0], // everyone (must come before generic detail pattern)
  [/^\/defects\/progress/, 0], // everyone (must come before generic detail pattern)
  [/^\/defects\/schedule-revision/, 2], // user+
  [/^\/defects\/simulation/, 0], // everyone (must come before generic detail pattern)
  [/^\/defects\/[^/]+$/, 1], // defect detail (generic — keep last)
  [/^\/docs\/import/, 2],    // user+
  [/^\/docs\/export/, 2],    // user+
  [/^\/docs\/org-mapping/, 5], // superuser/admin only
  [/^\/docs\/raw-data/, 1],  // legacy → super_guest+
  [/^\/docs\/abd(\/|$)/, 1], // super_guest+ (ABD raw data + detail)
  [/^\/docs\/omm(\/|$)/, 1], // super_guest+
  [/^\/docs\/warranty(\/|$)/, 1], // super_guest+
  [/^\/docs\/spare-part(\/|$)/, 1], // super_guest+
  [/^\/docs\/dashboard/, 1], // super_guest+
  [/^\/docs\/[^/]+$/, 1],    // legacy docs detail (/docs/:id)
  [/^\/import/, 2],          // user+
  [/^\/export/, 2],          // user+
  [/^\/mobile/, 2],          // user+
  [/^\/$/, 0],               // redirects to Dashboard
  [/^\/raw-data/, 1],        // super_guest+ (Raw Data)
  [/^\/subtests\//, 1],      // super_guest+ (SubtestDetail)
  [/^\/dashboard/, 1],       // super_guest+ (legacy generic dashboard)
  [/^\/schedule/, 1],        // super_guest+
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
