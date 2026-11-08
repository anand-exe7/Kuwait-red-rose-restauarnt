import { redirect } from 'next/navigation';
import LoginForm from './LoginForm';
import { ROLES, type Role } from '../lib/session';
import { ROLE_PATHS } from '../lib/routes';

export const metadata = { title: 'Staff Login' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const params = await searchParams;
  // Admin has its own dedicated login page at /admin/login — redirect
  // there so there's only ever one way to sign in as admin.
  if (params.role === 'admin') redirect('/admin/login');

  const role = (ROLES.includes(params.role as Role) ? params.role : 'waiter') as Role;
  // Only allow same-origin relative redirects; default to the role's home.
  const next =
    params.next && params.next.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : ROLE_PATHS[role];

  // Nothing to guard if the role is unknown.
  if (!role) redirect('/');

  return <LoginForm role={role} next={next} />;
}
