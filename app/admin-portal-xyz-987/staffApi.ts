"use client";

// Calls the staff delivery API (/api/delivery/staff). Authorised by the staff
// cookie set at login; the server decides what each role may do.
export async function staffCall<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/api/delivery/staff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? 'Something went wrong');
  return json as T;
}
