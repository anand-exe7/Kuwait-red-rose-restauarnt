import type { NextRequest } from 'next/server';
import { LOCK_COOKIE, SESSION_COOKIE, verifyLockToken, verifySessionToken, type Role } from '../../../lib/session';
import { getServerSupabase } from '../../../lib/supabaseServer';
import { HttpError, bad, deny, int, isObj, num, optStr, readJson, respond, str, unauthorized } from '../../../lib/server/http';
import { clearSettingsCache, loadAreas, loadSettings } from '../../../lib/delivery/server';
import { getDeliveryRow, getOrderRow, hydrate, newId, type Row } from '../../../lib/delivery/service';
import { DEFAULT_SETTINGS, parseTiers, rowToSettings, settingsToRow, type DeliverySettings } from '../../../lib/delivery/shared';
import { refundPayment } from '../../../lib/payments';

// Staff side of delivery: see the deliveries, edit the delivery rules and the
// areas they are priced by. Authorised by the signed staff cookie; the browser
// can never reach these tables directly.
//
// Deliveries are handed to a third-party partner (see lib/deliveryPartners),
// so there is nothing here to assign them to and no cash to reconcile.

function mustBe(role: Role | null, ...allowed: Role[]): Role {
  if (!role) throw unauthorized('Staff sign-in required');
  if (!allowed.includes(role)) throw deny('Not allowed for your role');
  return role;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates the settings form from the admin page into a clean DeliverySettings. */
function cleanSettings(raw: unknown): DeliverySettings {
  if (!isObj(raw)) throw bad('Invalid settings');
  const D = DEFAULT_SETTINGS;
  const hours: DeliverySettings['hours'] = {};
  const h = isObj(raw.hours) ? raw.hours : {};
  for (let d = 0; d < 7; d++) {
    const day = isObj(h[String(d)]) ? (h[String(d)] as Row) : {};
    const open = String(day.open ?? D.hours['0'].open);
    const close = String(day.close ?? D.hours['0'].close);
    if (!HHMM.test(open) || !HHMM.test(close)) throw bad('Hours must look like 10:00');
    hours[String(d)] = { closed: day.closed === true, open, close };
  }
  const tiers = (Array.isArray(raw.feeTiers) ? raw.feeTiers : []).map((t) => {
    const x = isObj(t) ? t : {};
    return { upToKm: num(x.upToKm, 0, 500, 'tier distance'), fee: num(x.fee, 0, 1000, 'tier fee') };
  }).sort((a, b) => a.upToKm - b.upToKm);
  const feeMode = raw.feeMode === 'fixed' || raw.feeMode === 'tiers' ? raw.feeMode : 'per_km';
  if (feeMode === 'tiers' && tiers.length === 0) throw bad('Add at least one fee tier');
  const freeKm = num(raw.freeKm, 0, 500, 'free distance');
  const maxKm = num(raw.maxKm, 0, 500, 'maximum distance');
  if (maxKm < freeKm) throw bad('Maximum distance must be at least the free distance');
  return {
    enabled: raw.enabled !== false,
    busy: raw.busy === true,
    pricingMode: raw.pricingMode === 'distance' ? 'distance' : 'areas',
    shopLat: num(raw.shopLat, -90, 90, 'shop latitude'),
    shopLng: num(raw.shopLng, -180, 180, 'shop longitude'),
    shopLabel: optStr(raw.shopLabel, 80) || D.shopLabel,
    freeKm, maxKm, feeMode,
    feePerKm: num(raw.feePerKm, 0, 1000, 'fee per km'),
    feeFixed: num(raw.feeFixed, 0, 1000, 'fixed fee'),
    feeTiers: tiers,
    minOrder: num(raw.minOrder, 0, 10000, 'minimum order'),
    taxOnFee: raw.taxOnFee === true,
    hours,
    codEnabled: raw.codEnabled !== false,
    codMax: num(raw.codMax, 0, 100000, 'cash limit'),
    onlinePaymentEnabled: raw.onlinePaymentEnabled === true, // PAYMENT: only meaningful once a gateway is wired
  };
}

export async function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson(request);
    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');
    const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    const action = String(body.action ?? '');

    // ---------------- deliveries (admin + waiter) ----------------
    if (action === 'list') {
      mustBe(role, 'admin', 'waiter');
      const { data, error } = await sb.from('deliveries').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw new HttpError(500, 'Could not load deliveries');
      return { deliveries: await hydrate(sb, (data ?? []) as Row[]) };
    }

    if (action === 'cancel') {
      mustBe(role, 'admin', 'waiter');
      const d = await getDeliveryRow(sb, str(body.deliveryId, 40, 'delivery'));
      if (!['pending', 'assigned', 'out_for_delivery'].includes(String(d.status))) throw bad('This delivery is already finished');
      const order = await getOrderRow(sb, String(d.order_id));
      if (d.payment_status === 'paid' && d.payment_ref) {
        await refundPayment(String(d.payment_ref), Number(order.total)); // PAYMENT: refund before cancelling
        await sb.from('deliveries').update({ payment_status: 'refunded' }).eq('id', String(d.id));
        await sb.from('orders').update({ payment_status: 'refunded' }).eq('id', String(d.order_id));
      }
      await sb.from('deliveries').update({ status: 'cancelled', failed_reason: optStr(body.reason, 200) || 'Cancelled by staff' }).eq('id', String(d.id));
      await sb.from('orders').update({ status: 'served', billed: false }).eq('id', String(d.order_id));
      return {};
    }

    // ---------------- settings (admin) ----------------
    if (action === 'settings.get') {
      mustBe(role, 'admin');
      return { settings: await loadSettings(sb) };
    }

    if (action === 'settings.save') {
      mustBe(role, 'admin');
      const s = cleanSettings(body.settings);
      const { error } = await sb.from('delivery_settings').upsert({ id: 1, ...settingsToRow(s) });
      if (error) throw new HttpError(500, 'Could not save settings. Have supabase/delivery.sql and supabase/delivery_areas.sql been run?');
      clearSettingsCache();
      const { data } = await sb.from('delivery_settings').select('*').eq('id', 1).maybeSingle();
      return { settings: rowToSettings(data) };
    }

    // ---------------- delivery areas (admin) ----------------
    if (action === 'areas.list') {
      mustBe(role, 'admin');
      return { areas: await loadAreas(sb, false) };
    }

    if (action === 'areas.save') {
      mustBe(role, 'admin');
      const name = str(body.name, 60, 'area name').trim();
      if (!name) throw bad('Area name is required');
      const fee = num(body.fee, 0, 1000, 'fee');
      const minOrder = body.minOrder === null || body.minOrder === undefined || body.minOrder === ''
        ? null : num(body.minOrder, 0, 10000, 'minimum order');
      // Weight brackets are normalised here, not trusted: each one is
      // {minG, maxG|null, fee}, sorted, with at most 20 per area.
      const tiers = parseTiers(body.tiers).slice(0, 20);
      const row: Record<string, unknown> = {
        name,
        fee,
        min_order: minOrder,
        active: body.active !== false,
        sort: int(body.sort ?? 0, 0, 100000, 'order'),
        tiers,
      };
      // `tiers` needs supabase/delivery_weight_tiers.sql. Until it is applied
      // the area still saves — minus the brackets.
      const withoutTiers = () => {
        const { tiers: _drop, ...rest } = row;
        return rest;
      };
      const missingTiers = (m: string) => /tiers|schema cache|could not find the .* column/i.test(m || '');
      // The brackets ARE the price now, so an area saved without them is an
      // area nobody can order to. The caller is told, rather than being shown
      // a cheerful "saved" for a half-saved area.
      let tiersDropped = false;
      if (typeof body.id === 'string' && body.id) {
        let res = await sb.from('delivery_areas').update(row).eq('id', body.id);
        if (res.error && missingTiers(res.error.message)) {
          tiersDropped = true;
          res = await sb.from('delivery_areas').update(withoutTiers()).eq('id', body.id);
        }
        if (res.error) throw new HttpError(500, 'Could not save the area. Has supabase/delivery_areas.sql been run?');
        return { id: body.id, tiersDropped };
      }
      const id = newId('AR');
      let res = await sb.from('delivery_areas').insert({ id, ...row, created_at: Date.now() });
      if (res.error && missingTiers(res.error.message)) {
        tiersDropped = true;
        res = await sb.from('delivery_areas').insert({ id, ...withoutTiers(), created_at: Date.now() });
      }
      if (res.error) throw new HttpError(500, 'Could not save the area. Has supabase/delivery_areas.sql been run?');
      return { id, tiersDropped };
    }

    if (action === 'areas.delete') {
      mustBe(role, 'admin');
      /* A deletion, so it needs the manager password — the same rule every
         other delete follows in /api/db. The panel asks for it in the confirm
         dialog; this is what makes refusing it mean something. */
      if (!(await verifyLockToken(request.cookies.get(LOCK_COOKIE)?.value))) {
        throw deny('Deleting a delivery area needs the manager password.');
      }
      // Old deliveries keep their own copy of the area name, so deleting is safe.
      await sb.from('delivery_areas').delete().eq('id', str(body.id, 40, 'area'));
      return {};
    }

    throw bad('Unknown action');
  });
}
