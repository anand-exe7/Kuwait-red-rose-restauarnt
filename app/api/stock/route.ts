import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../lib/session';
import { getServerSupabase } from '../../lib/supabaseServer';
import { HttpError, bad, deny, isObj, str } from '../../lib/server/http';
import { logMovements, type MovementKind } from '../../lib/server/stock';

// Manual stock changes — the admin's +/-, a stock count, waste, a return.
//
// Stock is only ever changed on the server, and every change writes a ledger
// row, so the Stock movements page can always answer where a box went. Sales
// are handled in /api/db when an order reaches the kitchen.

const KINDS: MovementKind[] = ['restock', 'adjust', 'waste', 'return'];

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get('content-type')?.includes('application/json')) throw bad('JSON required');
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.nextUrl.host) throw deny('Cross-origin request blocked');

    const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (role !== 'admin' && role !== 'waiter') throw deny('Staff only');

    let body: unknown;
    try { body = await request.json(); } catch { throw bad('Invalid JSON'); }
    if (!isObj(body)) throw bad('Invalid body');

    const productId = str(body.productId, 60, 'product');
    const kind = String(body.kind ?? 'adjust') as MovementKind;
    if (!KINDS.includes(kind)) throw bad('Unknown stock change');
    const hasSet = body.set !== undefined && body.set !== null;
    const delta = Number(body.delta ?? 0);
    const set = Number(body.set ?? 0);
    if (!hasSet && (!Number.isFinite(delta) || delta === 0)) throw bad('Nothing to change');
    if (hasSet && (!Number.isFinite(set) || set < 0 || set > 1000000)) throw bad('Invalid stock count');
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : null;

    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');

    const { data: p, error } = await sb.from('menu_items').select('id,name,price,stock').eq('id', productId).maybeSingle();
    if (error) throw new HttpError(500, 'Product lookup failed');
    if (!p) throw bad('Unknown product');
    if (p.stock === null || p.stock === undefined) throw bad(`"${p.name}" isn't stock-tracked. Switch on "Track stock" first.`);

    const before = Number(p.stock);
    const after = hasSet ? Math.round(set) : Math.max(0, before + Math.round(delta));
    if (after !== before) {
      const { error: upErr } = await sb.from('menu_items').update({ stock: after }).eq('id', productId);
      if (upErr) throw new HttpError(409, upErr.message);
    }

    await logMovements(sb, [{
      productId,
      productName: String(p.name ?? ''),
      kind,
      qty: after - before,
      beforeQty: before,
      afterQty: after,
      unitPrice: Number(p.price ?? 0),
      reason: reason ?? (hasSet ? 'Stock count' : null),
      actor: role,
    }]);

    return NextResponse.json({ ok: true, stock: after });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ ok: false, error: { message: e.message, code: e.code } }, { status: e.status });
    }
    console.error('[api/stock]', e);
    return NextResponse.json({ ok: false, error: { message: 'Server error' } }, { status: 500 });
  }
}
