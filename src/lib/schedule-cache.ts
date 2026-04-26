// Module-scope cache for schedule page data (TTL based).
// Allows instant render on revisit while a background refresh runs.

import type { SubtestForDashboard } from '@/lib/dashboard-utils';

export interface CachedSchedule {
  subtests: SubtestForDashboard[];
  systems: { id: string; system_code: string }[];
}

// Bump when the shape of cached subtests changes (e.g. new columns added to
// the Schedule page select). Stale caches with a different version are
// discarded on first read so the UI doesn't render with missing fields.
const SCHEMA_VERSION = 2;

let cache: CachedSchedule | null = null;
let cacheAt = 0;
let cacheVersion = 0;

const TTL_MS = 60_000; // 60s

export function getScheduleCache(): { data: CachedSchedule | null; ageMs: number; fresh: boolean } {
  if (cache && cacheVersion !== SCHEMA_VERSION) {
    cache = null;
    cacheAt = 0;
  }
  const ageMs = cache ? Date.now() - cacheAt : Infinity;
  return { data: cache, ageMs, fresh: ageMs < TTL_MS };
}

export function setScheduleCache(data: CachedSchedule) {
  cache = data;
  cacheAt = Date.now();
  cacheVersion = SCHEMA_VERSION;
}

export function invalidateScheduleCache() {
  cache = null;
  cacheAt = 0;
  cacheVersion = 0;
}
