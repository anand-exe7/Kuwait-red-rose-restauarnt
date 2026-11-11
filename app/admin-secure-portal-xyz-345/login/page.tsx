import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken, roleCanAccess } from "../../lib/session";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

/** Hop straight to /admin-secure-portal-xyz-345 when the viewer already holds a valid admin session
 *  (same `rr_session` cookie the chef + waiter dashboards use). */
export default async function LoginPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const role = await verifySessionToken(token);
  if (role && roleCanAccess(role, "admin")) redirect("/admin-secure-portal-xyz-345");
  return <LoginForm />;
}
