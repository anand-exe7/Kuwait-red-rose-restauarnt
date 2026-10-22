import { NextResponse } from 'next/server';

// =============================================================================
// PAYMENT: gateway webhook (placeholder - returns 501 until a gateway is wired).
//
// When a gateway is chosen, this route is the ONLY thing allowed to mark an
// order as paid. The customer's browser returning from the gateway proves nothing.
//
// To implement (see docs/PAYMENTS-TODO.md for the full list):
//   1. Verify the gateway's signature on the raw request body.
//   2. Re-read the payment status from the gateway (e.g. UPayments getpaymentstatus
//      with track_id, MyFatoorah GetPaymentStatus).
//   3. Find the delivery by deliveries.payment_ref. Check the amount equals the
//      order total (KWD, 3 decimals). Mismatch -> do not mark paid, flag for review.
//   4. Idempotently set deliveries.payment_status = 'paid' and orders.payment_status
//      = 'paid' (only if currently 'pending'), so repeated notifications do nothing.
//   5. Reply HTTP 200 quickly (gateways retry on anything else).
// =============================================================================
export async function POST() {
  return NextResponse.json({ ok: false, error: { message: 'Online payment is not configured' } }, { status: 501 });
}
