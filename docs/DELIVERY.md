# Delivery: how it works and how to set it up

Customers order for delivery, a driver delivers, and the handover is confirmed with a
code shown in the customer's app. Free delivery within a distance you set, a fee
beyond it, up to a maximum distance. Payment is **cash on delivery** for now; online
payment hooks are marked and documented in `docs/PAYMENTS-TODO.md`.

## One-time setup

1. **Run the SQL.** In Supabase -> SQL Editor, run `supabase/delivery.sql`, then
   `supabase/delivery_areas.sql` (both safe to re-run; they never delete data). They
   add the delivery tables, the payment columns on `orders` and the delivery areas.
2. **Environment variables** (`.env.local` and your hosting):

   | Variable | Needed for |
   |---|---|
   | `GOOGLE_MAPS_SERVER_KEY` | road distance (Routes API). Without it the server **estimates** distance (straight line x 1.3). |
   | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | the map and pin on the checkout page. Without it checkout shows "use my location" / manual coordinates. |
   | `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET` | already required (writes, staff login, handover codes). |

   Restrict both Google keys (browser key to your domain, server key to Routes API) and
   set a daily spending limit in Google Cloud.
3. **Google sign-in for customers.** Create an OAuth client in Google Cloud, then in
   Supabase -> Authentication -> Providers enable **Google** with that client id and
   secret, and add your site URL(s) to Authentication -> URL Configuration.
4. **Set the rules.** Admin -> **Delivery Settings**: shop location (latitude/longitude),
   free km, max km, fee, minimum order, hours, busy switch, code rules, failed-delivery
   rule, cash limit.
5. **Add drivers.** Admin -> **Drivers** -> name, mobile number, PIN. Drivers sign in at
   `/driver-station-ghi-789`.

## Delivery by area (the default, no maps)

Run `supabase/delivery_areas.sql` once (after `delivery.sql`). Then in Admin ->
**Delivery Settings** you create **areas**, each with its own fee (0 = free) and an
optional minimum order. At checkout the customer picks an area from a list and that
fee is charged. The server looks the fee up itself; the browser only sends the area id.

- Switch "How is the delivery fee decided?" to **By distance** to use the map pin,
  free km and max km instead (needs the Google keys). Both modes stay in the code.
- Orders keep a copy of the area name, so renaming, re-pricing or deleting an area
  never changes old orders.
- Drivers see the written address; the Navigate button opens Google Maps with that
  address as a search (no API key needed).

## The flow

```
Customer  /delivery (menu) -> /delivery/checkout (Google sign-in, pin, address, pay)
              -> server prices items, fee, tax and checks hours / busy / min order / distance
              -> order (mode 'delivery') + delivery row created
Kitchen   chef sees the order like any other: cooking -> ready
Admin     Admin -> Deliveries: assign a driver once it is ready
Driver    /driver-station-ghi-789: Pick up -> (customer code) -> Confirm delivery (+ cash if COD)
Customer  /delivery/track/<id>: live progress, driver name + call, the code
Billing   confirmed delivery marks the order billed, so it counts in Orders and Analytics
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
- **Handover code**: 4-6 digits, derived from the delivery id, pickup time and
  `AUTH_SECRET` (never stored). It expires, and locks after N wrong attempts; staff can
  unlock and re-issue it from Deliveries.
- **Failed delivery**: the driver must log the required number of calls and wait the
  set minutes before "Mark failed" works. The policy (customer pays all / fee only /
  restaurant absorbs) decides refunds for already-paid online orders.
- **Cash on delivery**: the driver enters the cash collected when confirming; the admin
  Drivers page shows what each driver still owes and a "Cash handed in" button.

## Privacy and security model

- Addresses, phones and PIN hashes live in tables the public key **cannot read or
  write** (`drivers`, `deliveries`, `customer_addresses`). Only the server (service-role
  key) touches them, through `/api/delivery/*`.
- Customers are verified with their Supabase sign-in token on every request; the
  customer id is never taken from the request body. A customer can only see their own orders.
- Drivers sign in with phone + PIN (scrypt hash, lockout after 5 failures) and can only
  act on deliveries assigned to them.
- Prices, fees, tax, hours and distance are always computed on the server.
- `ALLOW_DEV_CUSTOMER_LOGIN=1` (plus `NEXT_PUBLIC_ALLOW_DEV_CUSTOMER_LOGIN=1`) lets a
  developer act as a fake customer **in development only**. It is ignored in production
  builds. Do not set it on a live site.

## Where the code is

| Area | Files |
|---|---|
| Rules, fee, hours (shared) | `app/lib/delivery/shared.ts` |
| Settings load, distance, quote | `app/lib/delivery/server.ts` |
| Handover code | `app/lib/delivery/otp.ts` |
| Response mapping, billing on delivery | `app/lib/delivery/service.ts` |
| Public / customer / staff / driver APIs | `app/api/delivery/{public,customer,staff,driver}/route.ts`, `app/api/driver/{login,logout}/route.ts` |
| Customer pages | `app/delivery/` (menu, `checkout`, `track/[id]`, `orders`) |
| Map picker, sign-in hook | `app/components/MapPinPicker.tsx`, `app/lib/customerClient.ts` |
| Admin | `app/admin-portal-xyz-987/{DeliverySettingsSection,DeliveriesSection,DriversSection}.tsx` |
| Driver app | `app/driver-station-ghi-789/page.tsx` |
| Payment hooks | `app/lib/payments/index.ts`, `app/api/payments/webhook/route.ts` |

## Known limits

- Customer-facing pages are English only (Arabic / right-to-left is not built yet).
- A cancelled or failed delivery's order is marked "served" (and not billed) so the
  kitchen stops showing it; it appears in the chef's History.
- Staff screens refresh deliveries by polling every few seconds (not live push).
- Driver live location sharing and customer SMS/WhatsApp alerts are not included.
