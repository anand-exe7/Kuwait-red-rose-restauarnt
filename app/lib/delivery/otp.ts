import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAuthSecret } from '../session';

// The handover code is NEVER stored. It is derived from the delivery id, the
// moment the driver picked the order up, and the server secret, so the database
// holds nothing that could be read to learn a code. The signed-in customer is
// shown it by the server; the driver types it in at the door.

export function deriveCode(deliveryId: string, issuedAt: number, length: number): string {
  const secret = getAuthSecret();
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  const digest = createHmac('sha256', secret).update(`otp:${deliveryId}:${issuedAt}`).digest();
  const value = digest.readUInt32BE(0) % 10 ** length;
  return String(value).padStart(length, '0');
}

export function codesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
