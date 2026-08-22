// Single source of truth for the secret role URLs. These slugs are deliberately
// unguessable so guests/staff never stumble onto another role (especially admin).
// Change a slug here and the gate + links follow automatically.
import type { Role } from './session';

export const ROLE_SLUGS: Record<Role, string> = {
  admin: 'admin-portal-xyz-987',
  waiter: 'waiter-dashboard-def-456',
  chef: 'chef-station-abc-123',
};

export const ROLE_PATHS: Record<Role, string> = {
  admin: `/${ROLE_SLUGS.admin}`,
  waiter: `/${ROLE_SLUGS.waiter}`,
  chef: `/${ROLE_SLUGS.chef}`,
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin Portal',
  waiter: 'Waiter Station',
  chef: 'Chef Station',
};

/** Given a pathname, which role (if any) guards it. */
export function roleForPath(pathname: string): Role | null {
  for (const role of Object.keys(ROLE_SLUGS) as Role[]) {
    if (pathname === ROLE_PATHS[role] || pathname.startsWith(ROLE_PATHS[role] + '/')) {
      return role;
    }
  }
  return null;
}
