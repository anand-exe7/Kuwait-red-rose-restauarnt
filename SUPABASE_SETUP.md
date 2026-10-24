# Supabase backend setup

Red Rose now stores all live data (menu, orders, tables, coupons, waiter calls,
guest sessions, bills) in **Supabase Postgres** and syncs every device in real
time via **Supabase Realtime**. Follow these steps once to wire it up.

## 1. Create a Supabase project

1. Go to <https://supabase.com> → **New project**. Pick a name and a strong DB password.
2. Wait for it to finish provisioning (~1–2 min).

## 2. Run the schema

1. In the project, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   - This creates all tables, indexes, row-level-security policies, enables
     Realtime, and seeds the starter menu / 12 tables / 2 coupons.
   - It's safe to re-run — it drops and recreates everything (wipes data).

## 3. Get your API keys

1. **Settings → API** (or **Data API**).
2. Copy the **Project URL** and the **anon / public** key.

## 4. Enable Google sign-in (for customer accounts)

Customers must sign in with Google before placing an order (dine-in, takeaway,
or delivery). Supabase handles the OAuth round-trip.

1. In the Supabase dashboard: **Authentication → Providers → Google** → toggle on.
2. Create a Google OAuth client (<https://console.cloud.google.com/apis/credentials>
   → **Create credentials → OAuth client ID → Web application**).
3. Add the **Authorized redirect URI** Supabase shows you — it looks like
   `https://<your-project>.supabase.co/auth/v1/callback`.
4. Paste the resulting **Client ID** and **Client secret** back into the Supabase
   Google provider panel and save.
5. Still in Supabase: **Authentication → URL Configuration → Site URL** → set to
   `http://localhost:3000` for dev (plus your production URL when you deploy).
   Also add `http://localhost:3000/auth/callback` under **Redirect URLs**.

## 5. Configure env vars

1. Copy the template: `cp .env.example .env.local`
2. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` — the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon key
   - `NEXT_PUBLIC_SHOP_WHATSAPP` — the shop's WhatsApp number (international
     format, digits only, no `+` — e.g. `96522000000`). This is the number
     delivery / takeaway orders are sent to via `https://wa.me/<number>`.
   - `ADMIN_PASSWORD` / `WAITER_PASSWORD` / `CHEF_PASSWORD` — staff passwords
   - `AUTH_SECRET` — a long random string

## 6. Run

```bash
npm install
npm run dev
```

Open two browsers (or a phone + laptop): place an order as a customer and watch
it appear on the chef/waiter screens instantly. That cross-device sync is the
whole point — it wasn't possible with the old localStorage version.

## How it works (short version)

- **Data**: one Supabase table per store (`menu_items`, `orders`, `tables`,
  `coupons`, `waiter_calls`, `sessions`, `bills`). Primary keys are
  client-generated text ids; timestamps are epoch-milliseconds.
- **Realtime**: each store opens a channel and, on any row change, re-fetches the
  table and re-renders. The Realtime message carries no data — it's just a
  "something changed" ping, so an offline device self-heals on reconnect.
- **Writes are optimistic**: the local cache updates instantly and the Realtime
  echo reconciles all devices (including the writer) to the server's truth.
- **Sessions**: a guest tab opens on the first order at a table, is reused by
  later orders, and is closed (with a `bills` row) when staff bill it. A partial
  unique index guarantees one open dine-in session per table.
- **Auth** is unchanged (per-role password → signed `rr_session` cookie), now
  with a `login_attempts`-based lockout after repeated failures.

## Security note

This uses the **anon key with permissive RLS** — appropriate for a single-shop
app where staff *pages* are gated by the password cookie. The anon key is public
by design. **Never** put the `service_role` key in `.env.local` / the client.
