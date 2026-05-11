// Session-level cache for admin user ids.
// All comment components share a single fetch instead of querying user_roles
// per-component. Realtime updates flow naturally; cache TTL is a safety net.

import { supabase } from '@/integrations/supabase/client';

const TTL_MS = 5 * 60_000;

let cache: { ids: Set<string>; at: number } | null = null;
let inflight: Promise<Set<string>> | null = null;

async function fetchAdminUserIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');
  if (error || !data) return new Set();
  return new Set(data.map((r: { user_id: string }) => r.user_id));
}

export async function getAdminUserIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ids;
  if (inflight) return inflight;
  inflight = fetchAdminUserIds()
    .then((ids) => {
      cache = { ids, at: Date.now() };
      return ids;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function isAdminAuthorMap(userIds: string[]): Promise<Set<string>> {
  const all = await getAdminUserIds();
  if (all.size === 0) return new Set();
  const out = new Set<string>();
  for (const id of userIds) if (id && all.has(id)) out.add(id);
  return out;
}

export function invalidateAdminRolesCache(): void {
  cache = null;
}
