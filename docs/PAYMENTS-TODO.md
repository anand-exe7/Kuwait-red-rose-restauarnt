# Payments: what is left to wire (online payment)

Delivery works today with **cash on delivery only**. Online payment (KNET, cards,
Apple Pay) is intentionally **not** implemented, because the client has not chosen a
gateway yet. Everything that needs a gateway is marked in the code with the comment
tag **`PAYMENT:`**. To list every place:

```bash
grep -rn "PAYMENT:" app supabase docs
```

Gateway comparison and fee estimates: `docs/kuwait-payment-gateways.pdf`.

## What already exists (do not rebuild)

| Piece | Where | State |
|---|---|---|
| Payment columns on orders and deliveries | `supabase/delivery.sql` (`payment_method`, `payment_status`, `payment_ref`) | done |
| Choice of payment method at checkout | `app/delivery/checkout/page.tsx` (online option is greyed out, "Coming soon") | UI ready |
| Server refuses online orders until enabled | `app/api/delivery/customer/route.ts`, `checkout()` | guard in place |
| Admin switch "Allow online payment" | Admin -> Delivery Settings -> Payment (`online_payment_enabled`) | stored, keep OFF |
| Server-side price, fee and tax | `app/api/delivery/customer/route.ts` | done, the amount to charge is already trustworthy |
| Cash on delivery collection and cash report | driver page, Admin -> Drivers | done |

## What you must implement (in this order)

1. **Choose the gateway and open the merchant account** (UPayments, Tap or MyFatoorah).
   Get sandbox keys, the API docs, the webhook signature method and test cards.
2. **Add environment variables** (server only, never `NEXT_PUBLIC_`), for example
   `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`. Add them to
   `.env.example` and to the hosting environment.
3. **`app/lib/payments/index.ts`** (the single file that talks to the gateway):
   - `onlinePaymentAvailable()` -> return `true` when the keys are present.
   - `startOnlinePayment()` -> create the charge or invoice at the gateway for the
     exact `amount` (KWD, **3 decimals**) and return `{ redirectUrl, paymentRef }`.
   - `refundPayment()` -> call the gateway refund (full or partial).
   Keep the gateway behind this file so it can be swapped without touching delivery.
4. **`app/api/payments/webhook/route.ts`** (currently returns 501): this is the **only**
   place allowed to mark an order paid. It must verify the signature, re-check the
   status with the gateway, compare the amount to the order total, then set
   `deliveries.payment_status = 'paid'` and `orders.payment_status = 'paid'` only when
   the current value is `'pending'` (so repeated notifications do nothing). Reply 200.
   Register this URL in the gateway dashboard.
5. **Turn it on**: Admin -> Delivery Settings -> Payment -> "Allow online payment".
   The customer checkout then enables the online option automatically.

## Every place that touches payment

| File | Marker | What it does or needs |
|---|---|---|
| `app/lib/payments/index.ts` | `PAYMENT:` x3 | the three functions above |
| `app/api/payments/webhook/route.ts` | `PAYMENT:` | confirmation endpoint (steps are in the comment) |
| `app/api/delivery/customer/route.ts` | `PAYMENT:` x3 | `checkout`: calls `startOnlinePayment`, stores `payment_ref`; `cancel`: refunds a paid order first |
| `app/api/delivery/staff/route.ts` | `PAYMENT:` x2 | staff `cancel`: refunds a paid order first; settings switch |
| `app/api/delivery/driver/route.ts` | `PAYMENT:` | `markFailed`: refunds per the failed-delivery policy when the order was paid online |
| `app/api/delivery/public/route.ts` | `PAYMENT:` | exposes whether online payment is on |
| `app/delivery/checkout/page.tsx` | `PAYMENT:` x2 | online radio button; redirect to the gateway page |
| `app/admin-portal-xyz-987/DeliverySettingsSection.tsx` | `PAYMENT:` | the on/off switch |
| `supabase/delivery.sql` | `PAYMENT:` x3 | `payment_ref` columns and the setting |

## Rules to keep when you wire it

- **Never** trust the browser's return from the gateway; only the signed webhook counts.
- **Never** accept an amount from the browser: always use the order total from the database.
- Amounts are KWD with 3 decimals; some gateways expect fils (integer) or a string, so check.
- Refund rules for a failed delivery come from `failed_policy` (see
  `failedRefundAmount` in `app/lib/delivery/service.ts`). Cash orders never refund.
- Dine-in, takeaway and POS orders are **not** part of online payment: they are paid
  at the counter. Only delivery uses a gateway.
- Optional later: also take online payment for takeaway. That would reuse the same
  `startOnlinePayment` and webhook; add a `payment_*` flow to `/api/db` order insert.

## Testing checklist once wired

- Sandbox success -> order becomes `paid`, kitchen sees it.
- Sandbox failure / cancel -> order stays `pending`, never reaches `paid`.
- Webhook sent twice -> still one paid order.
- Webhook with a bad signature or wrong amount -> rejected, not marked paid.
- Customer cancels a paid order before cooking -> refund is issued.
- Failed delivery on a paid order -> refund matches the policy.
