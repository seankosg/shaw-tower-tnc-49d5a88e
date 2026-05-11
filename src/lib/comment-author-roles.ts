import { isAdminAuthorMap } from '@/lib/admin-roles-cache';

/**
 * Returns the subset of `userIds` that hold the `admin` role.
 * Backed by a session-level cache (see `admin-roles-cache.ts`) so all
 * comment components share a single `user_roles` fetch.
 */
export async function fetchAdminAuthorIds(userIds: string[]): Promise<Set<string>> {
  return isAdminAuthorMap(userIds);
}
