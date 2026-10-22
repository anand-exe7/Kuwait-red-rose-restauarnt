import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '../../../lib/supabaseServer';
import { HttpError, clientIp, readJson } from '../../../lib/server/http';
import { DRIVER_COOKIE, DRIVER_TTL_MS, createDriverToken, verifyPin } from '../../../lib/server/driverAuth';

// Driver sign-in: phone number + PIN. Same lockout rule as staff login
// (5 failures from one IP in 15 minutes), logged in login_attempts.
const MAX_FAILED = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');
    const ip = clientIp(request);
    const phone = String(body.phone ?? '').replace(/\s/g, '');
    const pin = String(body.pin ?? '');

    const { count } = await sb.from('login_attempts').select('id', { count: 'exact', head: true })
      .eq('ip', ip).eq('role', 'driver').eq('success', false).gte('created_at', Date.now() - WINDOW_MS);
    if ((count ?? 0) >= MAX_FAILED) {
      return NextResponse.json({ ok: false, error: 'Too many failed attempts. Try again in a few minutes.' }, { status: 429 });
    }

    const { data: driver } = await sb.from('drivers').select('id,name,pin_hash,active').eq('phone', phone).maybeSingle();
    // Same work whether or not the phone exists, so timing does not reveal it.
    const valid = verifyPin(pin, driver?.pin_hash ?? 'scrypt:00:00') && !!driver && driver.active === true;
    await sb.from('login_attempts').insert({ ip, role: 'driver', success: valid, created_at: Date.now() });
    if (!valid || !driver) return NextResponse.json({ ok: false, error: 'Incorrect phone number or PIN' }, { status: 401 });

    const token = await createDriverToken(driver.id as string);
    if (!token) return NextResponse.json({ ok: false, error: 'Login is not configured on the server. Set AUTH_SECRET.' }, { status: 500 });
    const res = NextResponse.json({ ok: true, name: driver.name });
    res.cookies.set(DRIVER_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DRIVER_TTL_MS / 1000,
    });
    return res;
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error('[driver login]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
