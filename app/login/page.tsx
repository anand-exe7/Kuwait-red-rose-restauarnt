import { redirect } from 'next/navigation';
import LoginForm from './LoginForm';
import { GATE_ROLES, type GateRole } from '../lib/session';
import { ROLE_PATHS } from '../lib/routes';

export const metadata = { title: 'Staff Login', robots: { index: false, follow: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const params = await searchParams;
  // Admin and staff both sign in on the panel's own page at
  // /admin-secure-portal-xyz-345/login — one door into the admin panel.
  // The admin panel has its own sign-in page under its secret slug.
  // 'staff' used to be a second panel login; anyone with an old bookmark is
  // sent to the same place.
  if (params.role === 'admin' || params.role === 'staff') redirect('/admin-secure-portal-xyz-345/login');

  const role = (GATE_ROLES.includes(params.role as GateRole) ? params.role : 'waiter') as GateRole;
  // Only allow same-origin relative redirects; default to the role's home.
  const next =
    params.next && params.next.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : ROLE_PATHS[role];

  // Nothing to guard if the role is unknown.
  if (!role) redirect('/');

  return <LoginForm role={role} next={next} />;
}
