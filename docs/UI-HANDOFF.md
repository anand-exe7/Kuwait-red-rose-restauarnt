# Delivery feature: what changed, for the UI pass

The delivery feature is built and working. The screens are functional but plain, so
this is the list of everything that was added so the UI can be improved. **Please
change the look only. The logic and API calls must stay as they are** (see "Do not touch").

## Get running

```bash
git pull
npm install
npm run dev        # http://localhost:3000
```

You need `.env.local` from Mirudull (Supabase keys and passwords; it is not in git).
Staff passwords: admin `admin123`, chef `chef123`, waiter `waiter123`.

**Customer sign-in:** Google sign-in is not switched on yet. Put these two lines in
`.env.local` to get a "Test login" button on checkout (dev only, ignored in production):

```
ALLOW_DEV_CUSTOMER_LOGIN=1
NEXT_PUBLIC_ALLOW_DEV_CUSTOMER_LOGIN=1
```

**Database:** `supabase/delivery.sql` then `supabase/delivery_areas.sql` must already be run (they are, on the shared Supabase).

## Pages and screens (all new unless noted)

| Screen | URL | File | What it does |
|---|---|---|---|
| Delivery menu | `/delivery` | `app/customer/page.tsx` (existing page, delivery mode when the URL is `/delivery`) | Same menu as dine-in. Header chip "Delivery", no Call Waiter, no takeaway toggle, button "Continue to delivery". |
| Checkout | `/delivery/checkout` | `app/delivery/checkout/page.tsx` | Sign in, pick **area** (dropdown with fee), optional "Use my current location" button, address form, payment (cash on delivery, online is greyed out "Coming soon"), order summary, Place order. |
| Order tracking | `/delivery/track/<id>` | `app/delivery/track/[id]/page.tsx` | Progress steps, cancel button. |
| My orders | `/delivery/orders` | `app/delivery/orders/page.tsx` | List of the signed-in customer's delivery orders. |
| Admin: Delivery areas | panel tab "Delivery areas" | `app/admin-secure-portal-xyz-345/_ui/DeliveryPage.tsx` | The areas you deliver to and the weight brackets that price each one. |
| Kitchen | `/chef-station-abc-123` (existing) | `app/chef-station-abc-123/page.tsx` | Small "DELIV" tag on delivery tickets. |
| Waiter | (existing) | `app/waiter-dashboard-def-456/page.tsx` | Delivery orders are hidden here on purpose. |
| Top nav | existing | `app/components/HeroNav.tsx` | Added a "Delivery" link. |

Other new front-end files: `app/components/MapPinPicker.tsx` (Google map pin, only used
if the admin switches fee mode to "By distance"), `app/lib/customerClient.ts`
(sign-in hook + API helper), `app/admin-secure-portal-xyz-345/_ui/staffApi.ts`.

## The customer journey (good to design as one flow)

1. Menu `/delivery` -> add items -> "Continue to delivery"
2. Checkout -> sign in -> choose area (fee shows) -> optionally share exact location -> fill address -> pay on delivery -> Place order
3. Tracking page: waiting -> out for delivery -> delivered

## UI things that would help most

- **Checkout** is the busiest page; it should feel clear and short on a phone (most customers are on mobile).
- **Admin Delivery Settings** is long; grouping/tabs or collapsible cards would help.
- Error and "closed / too busy / below minimum" messages come from the server and show as plain red boxes.
- English only for now; Arabic / right-to-left is not built (nice to plan for).

## Look and feel already used

Tailwind 4 with the brand colours `brand-red`, `brand-cream`, `brand-gold`, `brand-ink`
(see `app/globals.css`), `lucide-react` icons, rounded cards (`rounded-3xl`, soft gold border).
Admin screens use plain `black/5` borders on white.

## Do not touch (this is where the logic lives)

- Anything in `app/api/**`, `app/lib/delivery/**`, `app/lib/server/**`, `app/lib/payments/**`, `supabase/*.sql`.
- In the pages, keep the `call(...)`, `publicDelivery(...)` and `staffCall(...)` calls and their field names (`areaId`, `lat`, `lng`, `address`, `paymentMethod`, ...). The server recalculates every price, so the screen never decides money.
- Payment spots are marked with the comment `PAYMENT:` (search for it). Online payment is not built yet; the "Pay online" option stays greyed out.

More detail: `docs/DELIVERY.md` (how it works) and `docs/PAYMENTS-TODO.md` (payment hooks).
