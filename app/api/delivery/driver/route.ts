import type { NextRequest } from 'next/server';
import { getServerSupabase } from '../../../lib/supabaseServer';
import { HttpError, bad, deny, money, readJson, respond, str, throttle } from '../../../lib/server/http';
import { requireDriver } from '../../../lib/server/driverAuth';
import { loadSettings } from '../../../lib/delivery/server';
import { billDeliveredOrder, failedRefundAmount, getDeliveryRow, getOrderRow, hydrate, type Row } from '../../../lib/delivery/service';
import { codesMatch, deriveCode } from '../../../lib/delivery/otp';
import { refundPayment } from '../../../lib/payments';

// Driver actions. A driver can only touch deliveries assigned to them.

export async function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson(request);
    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');
    const driver = await requireDriver(request, sb);
    const action = String(body.action ?? '');
    const settings = await loadSettings(sb);

    if (action === 'mine') {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const { data: active } = await sb.from('deliveries').select('*').eq('driver_id', driver.id)
        .in('status', ['assigned', 'out_for_delivery']).order('assigned_at', { ascending: true });
      const { data: recent } = await sb.from('deliveries').select('*').eq('driver_id', driver.id)
        .in('status', ['delivered', 'failed']).gte('created_at', since).order('created_at', { ascending: false }).limit(30);
      return {
        driver,
        active: await hydrate(sb, (active ?? []) as Row[]),
        recent: await hydrate(sb, (recent ?? []) as Row[]),
        rules: { callAttempts: settings.failedCallAttempts, waitMinutes: settings.failedWaitMinutes, otpLength: settings.otpLength },
      };
    }

    // Every action below needs one of this driver's own deliveries.
    const d = await getDeliveryRow(sb, str(body.deliveryId, 40, 'delivery'));
    if (d.driver_id !== driver.id) throw deny('This delivery is not assigned to you');
    const order = await getOrderRow(sb, String(d.order_id));
    const id = String(d.id);

    if (action === 'pickup') {
      if (d.status !== 'assigned') throw bad('This delivery is not waiting for pickup');
      if (order.status !== 'ready') throw bad('The kitchen has not finished this order yet');
      await sb.from('deliveries').update({
        status: 'out_for_delivery', picked_up_at: Date.now(), otp_issued_at: Date.now(), otp_attempts: 0, otp_locked: false,
      }).eq('id', id);
      // Kitchen is done with it; it stays unbilled until the code is confirmed.
      await sb.from('orders').update({ status: 'served' }).eq('id', String(d.order_id));
      return {};
    }

    if (action === 'callAttempt') {
      if (d.status !== 'out_for_delivery') throw bad('Start the delivery first');
      const calls = Array.isArray(d.call_attempts) ? (d.call_attempts as number[]) : [];
      await sb.from('deliveries').update({ call_attempts: [...calls, Date.now()].slice(-10) }).eq('id', id);
      return {};
    }

    if (action === 'verifyOtp') {
      if (d.status !== 'out_for_delivery') throw bad('This delivery is not out for delivery');
      throttle(`otp:${id}`, 12);
      if (d.otp_locked) throw deny('Too many wrong codes. Ask the restaurant to unlock this delivery.');
      const issued = Number(d.otp_issued_at);
      if (!issued || Date.now() > issued + settings.otpExpiryMinutes * 60_000) {
        throw bad('This code has expired. Ask the restaurant to issue a new one.');
      }
      const code = String(body.code ?? '').replace(/\s/g, '');
      const expected = deriveCode(id, issued, settings.otpLength);
      if (!codesMatch(code, expected)) {
        const attempts = Number(d.otp_attempts ?? 0) + 1;
        const locked = attempts >= settings.otpMaxAttempts;
        await sb.from('deliveries').update({ otp_attempts: attempts, otp_locked: locked }).eq('id', id);
        throw bad(locked ? 'Wrong code. This delivery is now locked: ask the restaurant to unlock it.'
          : `Wrong code. ${settings.otpMaxAttempts - attempts} attempt(s) left.`);
      }

      // Correct code: the customer received the food. Record cash for COD orders.
      const cod = d.payment_method === 'cod';
      let collected: number | null = null;
      if (cod) {
        if (body.collected === undefined || body.collected === null || body.collected === '') throw bad('Enter the cash you collected');
        collected = money(body.collected, 'cash collected', 100000);
      }
      await sb.from('deliveries').update({
        status: 'delivered', delivered_at: Date.now(),
        ...(cod ? { cod_collected: collected, payment_status: 'paid' } : {}),
      }).eq('id', id);
      if (cod) await sb.from('orders').update({ payment_status: 'paid' }).eq('id', String(d.order_id));
      await billDeliveredOrder(sb, { ...order, payment_status: cod ? 'paid' : order.payment_status }, id);
      const short = cod && collected !== null && collected < Number(d.cod_expected) - 0.0005;
      return { delivered: true, cashMismatch: short ? Number(d.cod_expected) - (collected ?? 0) : 0 };
    }

    if (action === 'markFailed') {
      if (d.status !== 'out_for_delivery') throw bad('This delivery is not out for delivery');
      const calls = Array.isArray(d.call_attempts) ? (d.call_attempts as number[]) : [];
      if (calls.length < settings.failedCallAttempts) {
        throw bad(`Call the customer at least ${settings.failedCallAttempts} time(s) first (${calls.length} so far).`);
      }
      const readyAt = calls[calls.length - 1] + settings.failedWaitMinutes * 60_000;
      if (Date.now() < readyAt) {
        throw bad(`Wait ${Math.ceil((readyAt - Date.now()) / 60_000)} more minute(s) after the last call.`);
      }
      // PAYMENT: only already-paid online orders have anything to refund; cash orders never do.
      if (d.payment_status === 'paid' && d.payment_ref) {
        const refund = failedRefundAmount(settings.failedPolicy, Number(order.total), Number(d.fee));
        if (refund > 0) await refundPayment(String(d.payment_ref), refund);
      }
      await sb.from('deliveries').update({
        status: 'failed', failed_at: Date.now(), failed_reason: String(body.reason ?? '').slice(0, 200) || 'Customer did not answer',
      }).eq('id', id);
      await sb.from('orders').update({ status: 'served', billed: false }).eq('id', String(d.order_id));
      return { policy: settings.failedPolicy };
    }

    throw bad('Unknown action');
  });
}
