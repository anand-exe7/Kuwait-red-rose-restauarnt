import type { NextRequest } from 'next/server';
import { getServerSupabase } from '../../../lib/supabaseServer';
import { HttpError, bad, deny, isObj, num, optStr, readJson, respond, round3, str, throttle } from '../../../lib/server/http';
import { requireCustomer, type Customer } from '../../../lib/server/customerAuth';
import { checkCoupon, consumeCoupon, priceItems, TAX_RATE } from '../../../lib/server/pricing';
import { buildQuote, type QuoteTarget } from '../../../lib/delivery/server';
import { hydrate, newId, type Row } from '../../../lib/delivery/service';
import { deriveCode } from '../../../lib/delivery/otp';
import { onlinePaymentAvailable, refundPayment, startOnlinePayment } from '../../../lib/payments';

// Signed-in customers: place a delivery order, track it, manage saved addresses.
// The customer id always comes from the verified sign-in, never from the body.

const ADDRESS_FIELDS = ['label', 'name', 'phone', 'area', 'block', 'street', 'jadda', 'building', 'floor', 'apartment', 'landmark', 'note'] as const;

/** `areaName` (areas mode) is set by the server from the chosen area, never taken from the form. */
function cleanAddress(raw: unknown, areaName?: string): Record<string, string> {
  if (!isObj(raw)) throw bad('Address is required');
  const a: Record<string, string> = {};
  for (const k of ADDRESS_FIELDS) a[k] = optStr(raw[k], k === 'note' || k === 'landmark' ? 200 : 60);
  if (areaName) a.area = areaName;
  if (!a.name) throw bad('Please enter your name');
  if (!/^[0-9+ ]{8,16}$/.test(a.phone)) throw bad('Please enter a valid mobile number');
  if (!a.area) throw bad('Please enter your area');
  if (!a.block) throw bad('Please enter your block');
  if (!a.building) throw bad('Please enter the building or house number');
  return a;
}

async function checkout(sb: NonNullable<ReturnType<typeof getServerSupabase>>, customer: Customer, body: Row, origin: string) {
  throttle(`dc:${customer.id}`, 30);
  const target: QuoteTarget = {};
  if (typeof body.areaId === 'string') target.areaId = body.areaId.slice(0, 40);
  if (body.lat !== undefined && body.lng !== undefined) {
    target.lat = num(body.lat, -90, 90, 'latitude');
    target.lng = num(body.lng, -180, 180, 'longitude');
  }
  const method = body.paymentMethod === 'online' ? 'online' : 'cod';

  // Items and coupon are priced from the database, never from the browser.
  const { items, subtotal } = await priceItems(sb, body.items, { admin: false });
  const addrPhone = isObj(body.address) ? (body.address as Record<string, unknown>).phone : undefined;
  const coupon = await checkCoupon(sb, body.couponCode, subtotal, addrPhone);
  const discount = coupon?.discount ?? 0;

  // Area / distance, fee, hours, busy switch, minimum order: all decided here.
  const { quote, settings, area } = await buildQuote(sb, target, subtotal);
  if (!quote.ok) throw bad(quote.reason ?? 'Delivery is not available');
  const address = cleanAddress(body.address, area?.name);
  const lat = target.lat ?? null;
  const lng = target.lng ?? null;

  const fee = quote.fee;
  const tax = round3((subtotal - discount + (settings.taxOnFee ? fee : 0)) * TAX_RATE);
  const total = round3(subtotal - discount + fee + tax);

  if (method === 'cod') {
    if (!settings.codEnabled) throw bad('Cash on delivery is not available');
    if (settings.codMax > 0 && total > settings.codMax) {
      throw bad(`Cash on delivery is limited to KD ${settings.codMax.toFixed(3)}. Please pay online.`);
    }
  } else if (!settings.onlinePaymentEnabled || !onlinePaymentAvailable()) {
    // PAYMENT: this branch opens up once a gateway is wired and the setting is on.
    throw bad('Online payment is not available yet. Please choose cash on delivery.');
  }

  const orderId = newId('TK');
  const deliveryId = newId('DL');
  const now = Date.now();

  const { error: orderErr } = await sb.from('orders').insert({
    id: orderId, table_number: 0, items, status: 'pending', priority: 'normal',
    subtotal, tax, total, source: 'customer', mode: 'delivery',
    discount: discount > 0 ? discount : null, coupon_code: coupon?.code ?? null,
    delivery_fee: fee, payment_method: method, payment_status: method === 'cod' ? 'unpaid' : 'pending',
    billed: false, created_at: now,
  });
  if (orderErr) throw new HttpError(500, 'Could not place the order');

  const { error: delErr } = await sb.from('deliveries').insert({
    id: deliveryId, order_id: orderId, user_id: customer.id,
    customer_name: address.name, customer_phone: address.phone, address, lat, lng,
    area_id: area?.id ?? null, area_name: area?.name ?? '',
    distance_km: quote.distanceKm, distance_source: quote.distanceSource, fee,
    status: 'pending', payment_method: method, payment_status: method === 'cod' ? 'unpaid' : 'pending',
    cod_expected: method === 'cod' ? total : 0, note: optStr(body.note, 200), created_at: now,
  });
  if (delErr) {
    await sb.from('orders').delete().eq('id', orderId); // roll back so the kitchen never sees it
    throw new HttpError(500, 'Could not create the delivery');
  }
  if (coupon) await consumeCoupon(sb, coupon);

  if (body.saveAddress === true) {
    await sb.from('customer_addresses').insert({
      id: newId('AD'), user_id: customer.id, ...address, label: address.label || 'Home', lat, lng, area_id: area?.id ?? null, created_at: now,
    });
  }

  let redirectUrl: string | undefined;
  if (method === 'online') {
    // PAYMENT: create the charge at the gateway and send the customer to its hosted page.
    const pay = await startOnlinePayment({
      orderId, deliveryId, amount: total,
      customer: { name: address.name, phone: address.phone, email: customer.email },
      returnUrl: `${origin}/delivery/track/${deliveryId}`,
    });
    await sb.from('deliveries').update({ payment_ref: pay.paymentRef }).eq('id', deliveryId);
    await sb.from('orders').update({ payment_ref: pay.paymentRef }).eq('id', orderId);
    redirectUrl = pay.redirectUrl;
  }
  return { orderId, deliveryId, fee, total, redirectUrl };
}

export async function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson(request);
    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');
    const customer = await requireCustomer(request);
    const action = String(body.action ?? '');

    if (action === 'checkout') return checkout(sb, customer, body, request.nextUrl.origin);

    if (action === 'mine') {
      const { data, error } = await sb.from('deliveries').select('*').eq('user_id', customer.id)
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw new HttpError(500, 'Could not load your orders');
      return { deliveries: await hydrate(sb, (data ?? []) as Row[]) };
    }

    if (action === 'detail') {
      const id = str(body.id, 40, 'id');
      const { data } = await sb.from('deliveries').select('*').eq('id', id).eq('user_id', customer.id).maybeSingle();
      if (!data) throw new HttpError(404, 'Order not found');
      const [dto] = await hydrate(sb, [data as Row]);
      // The handover code is only shown to the owner, while the driver is on the way.
      let code: string | null = null;
      let codeExpiresAt: number | null = null;
      if (data.status === 'out_for_delivery' && data.otp_issued_at && !data.otp_locked) {
        const { data: st } = await sb.from('delivery_settings').select('otp_length,otp_expiry_minutes').eq('id', 1).maybeSingle();
        const length = Math.min(6, Math.max(4, Number(st?.otp_length ?? 6)));
        const expiry = Number(st?.otp_expiry_minutes ?? 120) * 60_000;
        const issued = Number(data.otp_issued_at);
        if (Date.now() < issued + expiry) {
          code = deriveCode(id, issued, length);
          codeExpiresAt = issued + expiry;
        }
      }
      return { delivery: dto, code, codeExpiresAt };
    }

    if (action === 'cancel') {
      const id = str(body.id, 40, 'id');
      const { data: d } = await sb.from('deliveries').select('*').eq('id', id).eq('user_id', customer.id).maybeSingle();
      if (!d) throw new HttpError(404, 'Order not found');
      const { data: o } = await sb.from('orders').select('*').eq('id', d.order_id).maybeSingle();
      if (d.status !== 'pending' || !o || o.status !== 'pending') {
        throw deny('The kitchen has already started this order, so it can no longer be cancelled.');
      }
      if (d.payment_status === 'paid' && d.payment_ref) {
        await refundPayment(String(d.payment_ref), Number(o.total)); // PAYMENT: refund before cancelling
      }
      await sb.from('deliveries').update({ status: 'cancelled', failed_reason: 'Cancelled by customer' }).eq('id', id);
      await sb.from('orders').update({ status: 'served', billed: false }).eq('id', d.order_id);
      return {};
    }

    if (action === 'addresses.list') {
      const { data } = await sb.from('customer_addresses').select('*').eq('user_id', customer.id)
        .order('created_at', { ascending: false }).limit(20);
      return { addresses: data ?? [] };
    }

    if (action === 'addresses.save') {
      const a = cleanAddress(body.address);
      const hasPin = body.lat !== undefined && body.lng !== undefined;
      const lat = hasPin ? num(body.lat, -90, 90, 'latitude') : null;
      const lng = hasPin ? num(body.lng, -180, 180, 'longitude') : null;
      const areaId = typeof body.areaId === 'string' ? body.areaId.slice(0, 40) : null;
      const { count } = await sb.from('customer_addresses').select('id', { count: 'exact', head: true }).eq('user_id', customer.id);
      if ((count ?? 0) >= 20) throw bad('You can save up to 20 addresses');
      const id = newId('AD');
      const { error } = await sb.from('customer_addresses').insert({ id, user_id: customer.id, ...a, label: a.label || 'Home', lat, lng, area_id: areaId, created_at: Date.now() });
      if (error) throw new HttpError(500, 'Could not save the address');
      return { id };
    }

    if (action === 'addresses.delete') {
      const id = str(body.id, 40, 'id');
      await sb.from('customer_addresses').delete().eq('id', id).eq('user_id', customer.id);
      return {};
    }

    throw bad('Unknown action');
  });
}
