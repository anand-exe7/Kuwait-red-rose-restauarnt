import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken, roleCanAccess } from './app/lib/session';
import { roleForPath } from './app/lib/routes';

// Runs before the protected pages render. If the visitor doesn't hold a valid
// session cookie for the role that guards the path, they're bounced to /login.
// (In Next.js 16 the old `middleware.ts` convention is renamed to `proxy.ts`.)
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Admin has its own sign-in page at /admin/login — never gate it, or the
  // user gets bounced in a loop before they can submit the form.
  if (pathname === '/admin/login') return NextResponse.next();

  const requiredRole = roleForPath(pathname);
  if (!requiredRole) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionRole = await verifySessionToken(token);

  if (sessionRole && roleCanAccess(sessionRole, requiredRole)) {
    return NextResponse.next();
  }

  // Admin → the dedicated /admin/login page; chef and waiter still share
  // the generic /login page.
  const loginUrl =
    requiredRole === 'admin'
      ? new URL('/admin/login', request.url)
      : new URL('/login', request.url);
  if (requiredRole !== 'admin') {
    loginUrl.searchParams.set('role', requiredRole);
    loginUrl.searchParams.set('next', pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Only guard the secret role slugs; everything else (customer, takeaway, home,
  // login, api, static assets) is public.
  matcher: [
    '/admin/:path*',
    '/waiter-dashboard-def-456/:path*',
    '/chef-station-abc-123/:path*',
  ],
};
