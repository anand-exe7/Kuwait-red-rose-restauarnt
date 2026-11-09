# Red Rose — what to run, and what to set

Everything you have to do **once** so the new order flow, the stock ledger and
the coupon links work, on your laptop and on the live site.

---

## 1. SQL — run these in the Supabase SQL editor

Open your project → **SQL editor** → paste the file's contents → **Run**.
Run them **in this order**. Every one is written to be safe to re-run: they only
add what is missing and never delete data, so if you are not sure whether you
ran one, just run it again.

| # | File | What it gives you |
|---|------|-------------------|
| 1 | `supabase/schema.sql` | The tables themselves. Only on a brand-new project. |
| 2 | `supabase/security.sql` | Locks the database so the browser can only read. Run it **after** `SUPABASE_SERVICE_ROLE_KEY` is set and ordering still works. |
| 3 | `supabase/add_customer_columns.sql` | Customer name, phone, email and the delivery address on each order. |
| 4 | `supabase/add_bill_payload.sql` | `invoice_no` + the full bill on each bill row — what the `/invoice/INV-…` page reads. |
| 5 | `supabase/coupon_targeting.sql` | **Coupons tied to a phone number.** Without it, "only for this customer" cannot be saved. |
| 6 | `supabase/app_settings.sql` | Shop settings the admin can change. |
| 7 | `supabase/best_seller.sql` | The "best seller" flag on a product. |
| 8 | `supabase/homepage_media.sql` | Homepage pictures and video. |
| 9 | `supabase/storage.sql` | The image upload bucket. |
| 10 | `supabase/delivery.sql` | Drivers, delivery codes, cash on delivery. |
| 11 | `supabase/delivery_areas.sql` | **Delivery areas and their fees** — the Delivery page and the checkout. |
| 12 | `supabase/order_notes_handover.sql` | **NEW.** The customer's remark on an order, and the hand-over stamp that takes a finished takeaway/delivery off the waiter's board. |
| 13 | `supabase/stock_movements.sql` | **NEW.** The stock ledger behind Admin → Stock movements. |
| 14 | `supabase/delivery_weight_tiers.sql` | Delivery priced by weight: weight brackets per area, and a weight in grams on each product. |
| 15 | `supabase/expenses.sql` | **NEW.** Admin → Expenses, and the "net earnings" figure on Analytics. |
| 16 | `supabase/product_variants.sql` | **NEW.** Product sizes (500 g / 1 kg…), each with its own price and stock. |
| — | `supabase/enable_product_fields.sql` | Shortcut: #7, #14 and #16 in one paste. Run it if saving a product says "best seller", the weight and the sizes could not be stored. |

`supabase/delivery.sql` (#10) is also what adds `orders.delivery_fee` — the
delivery charge stored on the order. Without it the charge still shows at
checkout but never reaches the tab, the bill or the invoice.

### How to tell one is missing

The app never crashes over a missing migration — it warns in the browser
console (right-click → Inspect → Console) and carries on without that feature:

- `could not find the 'sent_phones' column … in the schema cache` → run **#5**.
- `[orders] your Supabase orders table is missing the newer columns` → run **#3** and **#12**.
- `[stock] no stock_movements table yet` → run **#13**.
- Delivery areas page shows an amber banner → run **#11**.
- Weight brackets won't save, or a product's weight won't stick → run **#14**.
- Expenses page says the table is missing → run **#15**.
- A delivery is billed without its delivery charge → run **#10**.

---

## 2. Environment variables

`NEXT_PUBLIC_…` values are **baked in when the site is built**. After changing
one on Vercel you must **redeploy**, or the old value stays on the site.

### Must be set (the shop does not work without these)

| Name | Where to get it | Notes |
|------|-----------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (publishable / anon) | Public by design — read-only. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service_role) | **Secret.** Server only — never `NEXT_PUBLIC_`. Every write goes through it. |
| `AUTH_SECRET` | Any long random string | Signs the staff login cookie. Changing it signs everyone out. |
| `ADMIN_PASSWORD` | You choose | Admin console. |
| `WAITER_PASSWORD` | You choose | Waiter dashboard. |
| `CHEF_PASSWORD` | You choose | Chef station. |

> **`DRIVER_PASSWORD` does nothing.** Drivers do not share a password: each one
> signs in with their own phone number and PIN, which the admin sets on the
> Drivers screen and the database stores hashed. If it is in your `.env`, you
> can delete the line — do not add it to Vercel.


### The shop's identity (printed on every invoice, receipt and message)

| Name | Value for you |
|------|---------------|
| `NEXT_PUBLIC_SHOP_NAME` | `Red Rose` |
| `NEXT_PUBLIC_SHOP_FULL_NAME` | `Red Rose Sweets` |
| `NEXT_PUBLIC_SHOP_LOCATION` | `Al Qurain` |
| `NEXT_PUBLIC_SHOP_OWNER` | `Janakiraman Sampath` |
| `NEXT_PUBLIC_SHOP_PHONE` | `55568759` |
| `NEXT_PUBLIC_SHOP_ADDRESS` | `Al Qurain, Kuwait` |
| `NEXT_PUBLIC_SHOP_COUNTRY` | `Kuwait` |
| `NEXT_PUBLIC_SHOP_WHATSAPP` | `96555568759` — country code + number, digits only |

### Still missing — set this one

| Name | Value | Why it matters |
|------|-------|----------------|
| `NEXT_PUBLIC_SITE_URL` | `https://your-live-domain` | Every link the shop sends — the invoice, the coupon page — is built from this. While it is unset the link points at the machine that sent it (`http://localhost:3000`), which is why a customer tapping it gets **"This site can't provide a secure connection — ERR_SSL_PROTOCOL_ERROR"**: their phone cannot reach your laptop, and a browser that forces HTTPS turns the failure into that message. No code change can fix it — the site has to have an address the customer's phone can reach. Set it locally *and* on Vercel (Production **and** Preview), then redeploy. The admin console shows an amber banner while it is unset. |

### Optional

| Name | Notes |
|------|-------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_SERVER_KEY` | Only for map-based delivery pricing. Area pricing does not need them. |
| `ALLOW_DEV_CUSTOMER_LOGIN`, `NEXT_PUBLIC_ALLOW_DEV_CUSTOMER_LOGIN` | A fake customer sign-in for testing. **Leave them out on Vercel.** The server already ignores them in production. |

### Setting them on Vercel

Project → **Settings** → **Environment Variables**. Tick **Production**,
**Preview** and **Development** for each one unless a row says otherwise, then
**Deployments → ⋯ → Redeploy** — `NEXT_PUBLIC_*` values are baked into the
build, so an existing deployment keeps the old value for ever.

The 13 that have to be there:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AUTH_SECRET
ADMIN_PASSWORD
WAITER_PASSWORD
CHEF_PASSWORD
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SHOP_NAME
NEXT_PUBLIC_SHOP_FULL_NAME
NEXT_PUBLIC_SHOP_PHONE
NEXT_PUBLIC_SHOP_WHATSAPP
NEXT_PUBLIC_SHOP_LOCATION
```

`NEXT_PUBLIC_SHOP_OWNER`, `NEXT_PUBLIC_SHOP_ADDRESS` and
`NEXT_PUBLIC_SHOP_COUNTRY` only change what is printed on a receipt; without
them the address line falls back to the location plus "Kuwait".

**Do not add** `DRIVER_PASSWORD`, `ALLOW_DEV_CUSTOMER_LOGIN`,
`NEXT_PUBLIC_ALLOW_DEV_CUSTOMER_LOGIN`, or `NEXT_PUBLIC_VERCEL_URL`. The first
is unused, the next two are a test-only sign-in bypass, and the last is only a
fallback for when `NEXT_PUBLIC_SITE_URL` is missing.

---

## 3. The error that keeps coming back in the terminal

```
./app/admin-portal-xyz-987/page.tsx
Error: Module not found: Can't resolve './page.tsx'
```

That folder was deleted and nothing in the code refers to it any more — it is
the dev server's own cache, left over from when it was still there. It is
harmless, but it never goes away on its own. Stop the dev server and:

```bash
rm -rf .next && npm run dev
```

---

## 4. How the shop runs now

**Dine-in / walk-in** — the guest is in the shop, so nobody approves anything:

> customer (or waiter) orders → **straight to the chef** → cooked → the waiter
> gets the alert and serves it → the waiter tells the admin *ready to pay* →
> **the admin bills it and sends the invoice** → done, and it lands in Orders.

The waiter can add items, the admin can add items, and the guest can add more
from their own phone — it all goes on the same tab. The waiter **cannot** take
money or close a bill; they can only tell the admin the table is ready.

**Asking for the bill.** The guest taps *Request bill* on their own phone (or
the waiter taps *Close bill*). The tab does **not** disappear — it turns amber
and says *Bill requested* on the admin's Open tabs, on the waiter's alerts and
in the Billing panel, and the **Add items** button goes away everywhere: what
they pay has to be what they agreed to. The admin opens it from Open tabs →
*Complete in Billing*, takes the payment and sends the invoice. Only that closes
the tab.

**Takeaway / delivery** — nobody is in the shop, so the admin lets it in first:

> customer orders → **Admin → Online orders** → admin accepts → chef → cooked →
> the waiter sees it as *cooked, waiting for the bill* (no hand-over yet) →
> **the admin bills it and sends the invoice** → the waiter goes green and hands
> it to the customer (or the driver) by **name and mobile number** → done.

Declining an order, or cancelling a tab, marks it **cancelled** — the customer
sees that in their order history, and any stock it took comes back.

## 5. A 5-minute check once the SQL is in

1. **Dine-in:** order from `/menu` at a table. It should appear on the chef
   station **immediately** — no approval step.
2. Chef: Start cooking → Mark ready. The waiter's bell rings.
3. Waiter: serve it, then **Ready to pay** → the admin's Billing badge lights up.
4. Admin → Billing: the tab is there, name and number filled in. Bill it.
5. **Takeaway:** order one with a remark. It waits in **Online orders** only.
   Accept it → chef (remark in red at the top) → cook → waiter shows *cooked,
   waiting for the bill* → admin bills → waiter turns green with the customer's
   **name and number** → Handed over → it disappears everywhere.
6. **Admin → Stock movements:** the sale is there and the stock came down.
   **Download Excel** gives a real `.xlsx`.
7. **Decline** an order and check your own profile on `/menu` — it says
   **Cancelled**.
8. **Request bill** from `/menu` on an open tab. The tab turns amber on Open
   tabs, the waiter's bell rings with *Asking for the bill*, and *Complete in
   Billing* opens that tab with its items, name, number, coupon and delivery
   charge already filled in.
9. **Analytics → Revenue** now splits income into **dine-in, takeaway and
   delivery**, and **Today's sales** names the channel on every row.
10. **Admin → Expenses:** add one, then check *Net earnings* on Analytics has
    come down by that much.
