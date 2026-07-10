import type { UserRole } from '@/types';
import { ADMIN_NAV_TYPE_MAP } from '@/lib/adminActivityIndicators';

/** Canonical nav paths that trigger bulk notification clearance on visit. */
export const NAV_CLEARANCE_PATHS = [
  ...Object.keys(ADMIN_NAV_TYPE_MAP),
  '/user/jobs',
  '/user/material-orders',
  '/provider/jobs',
  '/provider/requests',
  '/provider/earnings',
  '/provider/profile',
  '/supplier/orders',
  '/supplier/earnings',
] as const;

export type NavClearancePath = (typeof NAV_CLEARANCE_PATHS)[number];

const ROLE_ALLOWED_PATHS: Record<string, NavClearancePath[]> = {
  admin: Object.keys(ADMIN_NAV_TYPE_MAP) as NavClearancePath[],
  user: ['/user/jobs', '/user/material-orders'],
  provider: ['/provider/jobs', '/provider/requests', '/provider/earnings', '/provider/profile'],
  supplier: ['/supplier/orders', '/supplier/earnings'],
  branch_staff: ['/supplier/orders', '/supplier/earnings'],
};

function matchesPrefix(pathname: string, prefix: NavClearancePath): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Resolve the canonical nav clearance path for the current route, or null if none applies.
 */
export function resolveNavClearancePath(
  pathname: string,
  role: UserRole | undefined
): NavClearancePath | null {
  if (!role) return null;
  const allowed = ROLE_ALLOWED_PATHS[role];
  if (!allowed?.length) return null;

  for (const path of allowed) {
    if (matchesPrefix(pathname, path)) {
      return path;
    }
  }
  return null;
}
