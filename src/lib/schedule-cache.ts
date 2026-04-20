// Module-scope cache for schedule page data (TTL based).
// Allows instant render on revisit while a background refresh runs.

import type { SubtestForDashboard } from '@/lib/dashboard-utils';

export interface CachedSchedule {
  subtests: SubtestForDashboard[];
  systems: { id: string; system_code: string }[];
}

let cache: CachedSchedule | null = null;
let cacheAt = 0;

const TTL_MS = 60_000; // 60s

export function getScheduleCache(): { data: CachedSchedule | null; ageMs: number; fresh: boolean } {
  const ageMs = cache ? Date.now() - cacheAt : Infinity;
  return { data: cache, ageMs, fresh: ageMs < TTL_MS };
}

export function setScheduleCache(data: CachedSchedule) {
  cache = data;
  cacheAt = Date.now();
}

export function invalidateScheduleCache() {
  cache = null;
  cacheAt = 0;
}
