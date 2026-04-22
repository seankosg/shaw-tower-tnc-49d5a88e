import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const MEMORY_PREFIX = 'last-route:';

const ROUTE_KEYS = [
  '/dashboard',
  '/raw-data',
  '/schedule',
  '/import',
  '/import/logs',
  '/export',
  '/mobile',
  '/admin',
];

const routeKeyForPath = (pathname: string) =>
  ROUTE_KEYS
    .filter((key) => pathname === key || pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];

export function getRememberedRoute(defaultPath: string) {
  if (typeof window === 'undefined') return defaultPath;
  return localStorage.getItem(`${MEMORY_PREFIX}${defaultPath}`) || defaultPath;
}

export function useRouteMemory() {
  const location = useLocation();

  useEffect(() => {
    const key = routeKeyForPath(location.pathname);
    if (!key) return;
    localStorage.setItem(`${MEMORY_PREFIX}${key}`, `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
}