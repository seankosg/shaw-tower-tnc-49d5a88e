import type { AppRole } from '@/types/enums';

/**
 * Shared role-gate helpers for *_field_config tables.
 *
 * Rules (consistent across T&C / Defect / Docs field configs):
 *  - `visible_to_roles` null/empty → visible to anyone
 *  - `editable_to_roles` null/empty → editable by anyone with row write permission
 *  - `admin` always passes both gates regardless of config
 */

export function isAllowedByRoles(
  allowed: AppRole[] | null | undefined,
  userRoles: AppRole[],
): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (userRoles.includes('admin')) return true;
  return userRoles.some((r) => allowed.includes(r));
}
