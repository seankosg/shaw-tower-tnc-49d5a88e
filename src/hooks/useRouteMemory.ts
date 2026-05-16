import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const MEMORY_PREFIX = 'last-route:';

const ROUTE_KEYS = [
  // Legacy paths (kept for backwards-compat)
  '/dashboard',
  '/raw-data',
  '/schedule/revision',
  '/schedule',
  '/import/logs',
  '/import',
  '/export',
  '/mobile',
  '/admin/report',
  '/admin/classification',
  '/admin',
  // T&C system paths
  '/tc/dashboard',
  '/tc/progress',
  '/tc/schedule-revision',
  '/tc/raw-data',
  '/tc/import/logs',
  '/tc/import',
  '/tc/export',
  '/tc/quick-update',
  // Defect system paths
  '/defects/dashboard',
  '/defects/progress',
  '/defects/schedule-revision',
  '/defects/raw-data',
  '/defects/import/logs',
  '/defects/import',
  '/defects/export',
  '/defects/quick-update',
];

const routeKeyForPath = (pathname: string) =>
  ROUTE_KEYS
    .filter((key) => pathname === key || pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];

export function getRememberedRoute(defaultPath: string) {
  if (typeof window === 'undefined') return defaultPath;
  return localStorage.getItem(`${MEMORY_PREFIX}${defaultPath}`) || defaultPath;
}

// One-time cleanup: remove stale '/admin' memory that pointed to a child admin page.
if (typeof window !== 'undefined') {
  const stale = localStorage.getItem(`${MEMORY_PREFIX}/admin`);
  if (
    stale && (
      stale === '/admin/classification' ||
      stale.startsWith('/admin/classification') ||
      stale === '/admin/report' ||
      stale.startsWith('/admin/report')
    )
  ) {
    localStorage.removeItem(`${MEMORY_PREFIX}/admin`);
  }
}

export function useRouteMemory() {
  const location = useLocation();

  useEffect(() => {
    const key = routeKeyForPath(location.pathname);
    if (!key) return;
    localStorage.setItem(`${MEMORY_PREFIX}${key}`, `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
}
