import 'server-only';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { safeEqual, signMessage } from '../session';
import { HttpError, unauthorized } from './http';

// Drivers are individuals (name + phone + PIN), unlike the shared staff
// passwords, so every delivery can be tied to the driver who handled it.

export const DRIVER_COOKIE = 'rr_driver';
export const DRIVER_TTL_MS = 12 * 60 * 60 * 1000;

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pin, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createDriverToken(driverId: string): Promise<string | null> {
  const exp = Date.now() + DRIVER_TTL_MS;
  const sig = await signMessage(`driver:${driverId}:${exp}`);
  return sig ? `${driverId}.${exp}.${sig}` : null;
}

async function verifyDriverToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [id, expRaw, sig, ...rest] = token.split('.');
  if (rest.length || !id || !expRaw || !sig) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await signMessage(`driver:${id}:${exp}`);
  return expected && safeEqual(sig, expected) ? id : null;
}

export interface Driver { id: string; name: string; phone: string }

/** Returns the signed-in, still-active driver or throws 401. */
export async function requireDriver(request: NextRequest, sb: SupabaseClient): Promise<Driver> {
  const id = await verifyDriverToken(request.cookies.get(DRIVER_COOKIE)?.value);
  if (!id) throw unauthorized('Driver sign-in required');
  const { data, error } = await sb.from('drivers').select('id,name,phone,active').eq('id', id).maybeSingle();
  if (error) throw new HttpError(500, 'Driver lookup failed');
  if (!data || !data.active) throw unauthorized('Driver account is not active');
  return { id: data.id as string, name: data.name as string, phone: data.phone as string };
}
