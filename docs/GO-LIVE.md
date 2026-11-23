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
| 10 | `supabase/delivery.sql` | Delivery rows, addresses, cash on delivery. |
| 11 | `supabase/delivery_areas.sql` | **Delivery areas and their fees** — the Delivery page and the checkout. |
| 12 | `supabase/order_notes_handover.sql` | **NEW.** The customer's remark on an order, and the hand-over stamp that takes a finished takeaway/delivery off the waiter's board. |
| 13 | `supabase/stock_movements.sql` | **NEW.** The stock ledger behind Admin → Stock movements. |
| 14 | `supabase/delivery_weight_tiers.sql` | Delivery priced by weight: weight brackets per area, and a weight in grams on each product. |
| 15 | `supabase/expenses.sql` | **NEW.** Admin → Expenses, and the "net earnings" figure on Analytics. |
| 16 | `supabase/product_variants.sql` | **NEW.** Product sizes (500 g / 1 kg…), each with its own price and stock. |
| 17 | `supabase/wholesale.sql` | The whole wholesale (B2B) side: trade products, trade customers, their own prices, and wholesale bills. Without it the five Wholesale pages render but have nothing in them. |
| 18 | `supabase/wholesale_biller.sql` | **NEW.** Who was on the till for a wholesale bill — the "Billed by" column in Wholesale orders. Until it is run, wholesale bills still save and show a dash instead of a name. |
| — | `supabase/enable_product_fields.sql` | Shortcut: #7, #14 and #16 in one paste. Run it if saving a product says "best seller", the weight and the sizes could not be stored. |

Two more are **one-off fixes, not part of the setup** — run them only if the
line describes you:

| File | Run it only if |
|------|----------------|
| `supabase/wholesale_rename_invoice_ids.sql` | You have wholesale bills from before the `WB-2026-48213` numbering and they still show an id like `WB-MWGPU8AOLCV64`. Renumbers them once; re-running changes nothing. |
| `supabase/remove_drivers.sql` | You ran an older build that had the in-house driver module. It **drops** the `drivers` table and the driver columns on deliveries. Nothing in the app reads them any more. Take a backup first if you want that old history. |

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
- A wholesale bill's **"Billed by"** is always a dash → run **#18**. (The shop's
  own bills need nothing: the name goes inside the bill payload from **#4**.)
- Any Wholesale page says the tables are missing → run **#17**.
- The website-ordering switch on **Online orders** won't save → run **#6**.
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
| `ADMIN_PASSWORD` | You choose | Admin console. One password — whoever is behind the counter signs in with it. |
| `WAITER_PASSWORD` | You choose | Waiter dashboard. |
| `CHEF_PASSWORD` | You choose | Chef station. |
| `ADMIN_LOCK_PASSWORD` | You choose | **The manager lock.** The owner's own password, asked for inside the panel to open Analytics or to delete anything. See below. |
| `BILLERS` | You choose | **Who may bill**, as `Name:password,Name:password`. See below. |

#### Three passwords, three jobs

| | What it opens | Who knows it |
|---|---|---|
| `ADMIN_PASSWORD` | The admin panel itself | Everyone who works the till |
| `ADMIN_LOCK_PASSWORD` | Analytics, and every delete | The owner alone |
| `BILLERS` | Signing on as the person billing | One password each |

**`ADMIN_LOCK_PASSWORD` must not be the same as `ADMIN_PASSWORD`.** Whoever bills
has to know `ADMIN_PASSWORD` to open the panel at all, so if the two matched,
the counter would hold the key to the figures and the deletions too.

#### The manager lock — `ADMIN_LOCK_PASSWORD`

The panel has one login, shared by everyone who works the counter, so it cannot
be what guards the money. A second password does that. Inside the panel it is
asked for before:

* opening **Analytics** or **Wholesale analytics** — until it is typed, the page
  is not even loaded, so no revenue figure reaches the browser;
* **deleting** a bill, and deleting anything else — a product, a category, a
  coupon, an expense, a table, a delivery area, a wholesale product or
  customer, or cancelling an open tab.

It is typed into a box in the middle of the screen, on a phone and on the till
alike.

**An unlock lasts one page visit.** Open the analytics, go to any other page and
come back, and it asks again — the panel throws the unlock away on every change
of page, and starts every load locked. Deletions are stricter still: the
confirm dialog asks for the password **every single time**, so a bill can never
go on one click. The server checks it too, so nothing can be clicked past:
`/api/db` refuses a delete without it.

Declining an incoming website order is the one destructive-looking action that
does **not** ask. It is an everyday counter decision, not a record being wiped.

Leave `ADMIN_LOCK_PASSWORD` empty and nothing can be unlocked or deleted at
all — the panel says so instead of rejecting every try.

#### Deleting a bill

There is one way a bill leaves the records and it is final. **Delete** asks for
the manager password, then removes the row for good: it disappears from Orders
and from Analytics, its items go back into stock and any coupon use is given
back. It cannot be undone, and it cannot be deleted twice, because it is no
longer there.

The old **Void** button — which kept a dead row in the list — is gone. Two
final-looking buttons side by side was one too many at a counter. Bills voided
before this change still read as *Void* in the list; delete them if you want
them out.

#### Who is billing — `BILLERS`

Two people work the counter, the owner and one other, and a bill has to say
which of them took the money.

```
BILLERS=Anand:4821,Ravi:7390
```

* Both billing panels (shop and wholesale) show a **"Who is billing?"** card at
  the top of the right-hand column. Nothing can be billed until one of these
  names is signed on — the panel says so and the server refuses the bill.
* Signing a name on needs **that person's own password**, so one of them can
  never put a bill in the other's name.
* Once on, it stays on — bill after bill, no password again.
* **"I'm leaving"** signs off and needs no password: handing the counter over is
  not a privilege. It then stays off until the next person signs on, so the till
  is never quietly left in the last person's name.
* The name is saved on the bill and shown as **"Billed by"** in Orders and
  Wholesale orders (and in the Excel export). It is **never** on the printed
  receipt, the public `/invoice/…` page or the WhatsApp message.

Changing this list signs out anybody whose name is no longer in it.


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

**Do not add** `ALLOW_DEV_CUSTOMER_LOGIN`,
`NEXT_PUBLIC_ALLOW_DEV_CUSTOMER_LOGIN`, or `NEXT_PUBLIC_VERCEL_URL`. The first
two are a test-only sign-in bypass, and the last is only a fallback for when
`NEXT_PUBLIC_SITE_URL` is missing.

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
> it to the customer by **name and mobile number** → done.

Declining an order, or cancelling a tab, marks it **cancelled** — the customer
sees that in their order history, and any stock it took comes back.

### Switching website ordering off

**Settings** in the sidebar — just above the biller strip, on every page —
opens a dialog with one switch: *the website is taking orders* / *not taking
orders*. Turn it off and the website becomes a menu to look at: every item,
every price and every photo still there, but **no buttons on the cards at
all**, no basket and no checkout, and a line saying to come to the shop or
call. The server refuses a customer order as well, so there is no way round it.

**Online orders** and **Open tabs** both carry a *Website live* / *Website
inactive* badge, so an empty queue never has to be guessed at.

Nothing at the counter changes: billing, open tabs, the chef station and the
waiter station all work exactly as before, and staff can still take an order on
a customer's behalf. Turning it back on takes one tap — it saves to
`app_settings` and every device follows within a second, with no redeploy.

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
