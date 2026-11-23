# Delivery: how it works and how to set it up

Customers order for delivery and the shop hands the order to one of its delivery
partners (Talabat, Keeta...; see `app/lib/deliveryPartners.ts`). Free delivery within
a distance you set, a fee beyond it, up to a maximum distance. Payment is **cash on
delivery** for now; online payment hooks are marked and documented in
`docs/PAYMENTS-TODO.md`.

There is no in-house driver module: no driver accounts, no driver app and no handover
code. If you are coming from an older copy of this project, run
`supabase/remove_drivers.sql` once to drop what it left in the database.

## One-time setup

1. **Run the SQL.** In Supabase -> SQL Editor, run `supabase/delivery.sql`, then
   `supabase/delivery_areas.sql` (both safe to re-run; they never delete data). They
   add the delivery tables, the payment columns on `orders` and the delivery areas.
2. **Environment variables** (`.env.local` and your hosting):

   | Variable | Needed for |
   |---|---|
   | `GOOGLE_MAPS_SERVER_KEY` | road distance (Routes API). Without it the server **estimates** distance (straight line x 1.3). |
   | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | the map and pin on the checkout page. Without it checkout shows "use my location" / manual coordinates. |
   | `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET` | already required (writes, staff login). |

   Restrict both Google keys (browser key to your domain, server key to Routes API) and
   set a daily spending limit in Google Cloud.
3. **Google sign-in for customers.** Create an OAuth client in Google Cloud, then in
   Supabase -> Authentication -> Providers enable **Google** with that client id and
   secret, and add your site URL(s) to Authentication -> URL Configuration.
4. **Set the rules.** Admin -> **Delivery areas**: the areas you deliver to and the
   weight brackets that price each one.

## Delivery by area (the default, no maps)

Run `supabase/delivery_areas.sql` once (after `delivery.sql`). Then in Admin ->
**Delivery Settings** you create **areas**, each with its own fee (0 = free) and an
optional minimum order. At checkout the customer picks an area from a list and that
fee is charged. The server looks the fee up itself; the browser only sends the area id.

- Switch "How is the delivery fee decided?" to **By distance** to use the map pin,
  free km and max km instead (needs the Google keys). Both modes stay in the code.
- Orders keep a copy of the area name, so renaming, re-pricing or deleting an area
  never changes old orders.
- The written address is what goes to the delivery partner; it is kept as typed.

## The flow

```
Customer  /delivery (menu) -> /delivery/checkout (Google sign-in, pin, address, pay)
              -> server prices items, fee, tax and checks hours / busy / min order / distance
              -> order (mode 'delivery') + delivery row created
Kitchen   chef sees the order like any other: cooking -> ready
Admin     Online orders -> accept, then bill it from Billing when it is ready
Handover  the order goes out with the delivery partner
Customer  /delivery/track/<id>: live progress
Billing   the closed bill is what makes it count in Orders and Analytics
```

Waiters do **not** handle delivery orders; they are hidden from the waiter screen.

## Rules (all editable in Admin -> Delivery Settings)

- **Distance** is the road distance from the shop pin to the customer's pin (Google
  Routes API, cached 10 minutes per route, falls back to an estimate if Google fails).
- **Fee**: free up to `free_km`; beyond that per extra km, one fixed fee, or tiers.
  Refused beyond `max_km`. Tax (10%) applies to items after discount; optionally also to the fee.
- **Hours** are Kuwait time (UTC+3), per weekday; a close earlier than the open means
  after midnight. **Busy** and **Accept deliveries** switches stop new orders at once.
- **Minimum order** is checked on the item subtotal before discount.
- **Cash on delivery**: the cash comes back to the till with the partner's settlement;
  the shop records it as the bill's payment.

## Privacy and security model

- Addresses and phones live in tables the public key **cannot read or write**
  (`deliveries`, `customer_addresses`). Only the server (service-role key) touches
  them, through `/api/delivery/*`.
- Customers are verified with their Supabase sign-in token on every request; the
  customer id is never taken from the request body. A customer can only see their own orders.
- Prices, fees, tax, hours and distance are always computed on the server.
- `ALLOW_DEV_CUSTOMER_LOGIN=1` (plus `NEXT_PUBLIC_ALLOW_DEV_CUSTOMER_LOGIN=1`) lets a
  developer act as a fake customer **in development only**. It is ignored in production
  builds. Do not set it on a live site.

## Where the code is

| Area | Files |
|---|---|
| Rules, fee, hours (shared) | `app/lib/delivery/shared.ts` |
| Settings load, distance, quote | `app/lib/delivery/server.ts` |
| Response mapping | `app/lib/delivery/service.ts` |
| Public / customer / staff APIs | `app/api/delivery/{public,customer,staff}/route.ts` |
| Customer pages | `app/delivery/` (menu, `checkout`, `track/[id]`, `orders`) |
| Map picker, sign-in hook | `app/components/MapPinPicker.tsx`, `app/lib/customerClient.ts` |
| Admin | `app/admin-secure-portal-xyz-345/_ui/DeliveryPage.tsx` |
| Payment hooks | `app/lib/payments/index.ts`, `app/api/payments/webhook/route.ts` |

## Known limits

- Customer-facing pages are English only (Arabic / right-to-left is not built yet).
- A cancelled or failed delivery's order is marked "served" (and not billed) so the
  kitchen stops showing it; it appears in the chef's History.
- Staff screens refresh deliveries by polling every few seconds (not live push).
- Live location sharing and customer SMS/WhatsApp alerts are not included.
