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
  const role = (ROLES.includes(params.role as Role) ? params.role : 'admin') as Role;
  // Only allow same-origin relative redirects; default to the role's home.
  const next =
    params.next && params.next.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : ROLE_PATHS[role];

  // Nothing to guard if the role is unknown.
  if (!role) redirect('/');

  return <LoginForm role={role} next={next} />;
}
