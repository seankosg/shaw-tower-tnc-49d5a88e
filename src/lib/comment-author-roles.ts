import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the subset of `userIds` that hold the `admin` role.
 * Used to render a "VP" badge + left accent border on admin-authored
 * comments and replies across all modules.
 */
export async function fetchAdminAuthorIds(userIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
    .in('user_id', ids);
  if (error || !data) return new Set();
  return new Set(data.map((r: { user_id: string }) => r.user_id));
}
