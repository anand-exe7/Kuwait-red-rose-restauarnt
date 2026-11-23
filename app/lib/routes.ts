// Single source of truth for the secret role URLs. These slugs are deliberately
// unguessable so guests/staff never stumble onto another role (especially admin).
// Change a slug here and the gate + links follow automatically.
import { GATE_ROLES, type GateRole } from './session';

/* Each slug is also the NAME OF THE FOLDER under app/ that serves it, so the
   two have to be changed together — `app/admin-secure-portal-xyz-345` here is
   the same string as the directory on disk. Next builds the route from the
   folder; this map is what the gate in proxy.ts reads. */
export const ROLE_SLUGS: Record<GateRole, string> = {
  admin: 'admin-secure-portal-xyz-345',
  waiter: 'waiter-dashboard-def-456',
  chef: 'chef-station-abc-123',
};

export const ROLE_PATHS: Record<GateRole, string> = {
  admin: `/${ROLE_SLUGS.admin}`,
  waiter: `/${ROLE_SLUGS.waiter}`,
  chef: `/${ROLE_SLUGS.chef}`,
};

export const ROLE_LABELS: Record<GateRole, string> = {
  admin: 'Admin Portal',
  waiter: 'Waiter Station',
  chef: 'Chef Station',
};

/* There is one panel login, so no panel page is barred by role any more, and
   there is nothing here for the gate to special-case. Inside the panel the
   analytics and every destructive action are guarded by the manager password
   instead — see app/api/lock/route.ts and app/admin-…/_ui/LockGate.tsx. */

/** Given a pathname, which role (if any) guards it. */
export function roleForPath(pathname: string): GateRole | null {
  for (const role of GATE_ROLES) {
    if (pathname === ROLE_PATHS[role] || pathname.startsWith(ROLE_PATHS[role] + '/')) {
      return role;
    }
  }
  return null;
}
