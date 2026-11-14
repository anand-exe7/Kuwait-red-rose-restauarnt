-- Wholesale (B2B) module — products, customers, per-customer prices and bills.
--
-- A self-contained billing world that sits beside the restaurant POS: the
-- owner keeps a small catalogue of goods sold to trade customers, each trade
-- customer can have their own price for a given product, and a bill charges
-- that customer's price (or the plain wholesale price when none is set).
--
-- Conventions match the rest of the schema:
--   * TEXT, client-generated ids (WP-…, WHC-…, WPR_…, WB-…).
--   * BIGINT epoch-ms timestamps (Date.now()).
--   * Money is NUMERIC (KWD, 3 decimals / fils).
--   * RLS on with a permissive anon policy; every WRITE still goes through
--     /api/db, which only lets an admin touch these tables.
--
-- Safe to re-run: creates with IF NOT EXISTS, never drops.

-- ===========================================================================
-- PRODUCTS — the wholesale catalogue. Deliberately minimal: a name, a loose
-- category, a unit (sold by the piece, or by weight) and two prices. No image,
-- no stock, no description. `retail_price` is a reference figure only — a bill
-- never charges it (it charges the per-customer price, else `wholesale_price`).
-- ===========================================================================
create table if not exists wholesale_products (
  id              text primary key,
  name            text    not null,
  category        text    not null default '',
  unit            text    not null default 'piece',   -- 'piece' | 'gram'
  wholesale_price numeric not null default 0,          -- per piece, or per 100 g
  retail_price    numeric not null default 0,          -- reference only
  cost_price      numeric not null default 0,          -- what it costs you (for profit) — optional
  active          boolean not null default true,
  created_at      bigint  not null default now_ms()
);
create index if not exists wholesale_products_active_idx on wholesale_products (active);

-- ===========================================================================
-- CUSTOMERS — trade customers. Just a name and a phone (the phone is how the
-- biller looks them up), plus an optional note.
-- ===========================================================================
create table if not exists wholesale_customers (
  id         text primary key,
  name       text   not null,
  phone      text   not null default '',
  note       text   not null default '',
  created_at bigint not null default now_ms()
);
create index if not exists wholesale_customers_phone_idx on wholesale_customers (phone);

-- ===========================================================================
-- PRICES — one special price for a (customer, product) pair. Id is derived
-- from the two ids, so setting a price again just updates the same row.
-- ===========================================================================
create table if not exists wholesale_prices (
  id          text primary key,            -- WPR_<customer_id>_<product_id>
  customer_id text    not null,
  product_id  text    not null,
  price       numeric not null default 0,  -- same basis as the product (per piece / per 100 g)
  created_at  bigint  not null default now_ms()
);
create index if not exists wholesale_prices_customer_idx on wholesale_prices (customer_id);
create index if not exists wholesale_prices_product_idx  on wholesale_prices (product_id);

-- ===========================================================================
-- BILLS — a saved wholesale sale. Paid in full at creation (no credit, no tax,
-- no discount for now). `customer_id` is null for a walk-in / off-book buyer;
-- the name and phone are still kept on the bill so the receipt and Orders list
-- can show who it was for. Line items are JSONB, mirroring WholesaleBillItem.
-- ===========================================================================
create table if not exists wholesale_bills (
  id             text primary key,         -- WB-…
  customer_id    text,                      -- null for a walk-in
  customer_name  text    not null default '',
  customer_phone text    not null default '',
  items          jsonb   not null default '[]'::jsonb,
  subtotal       numeric not null default 0,
  discount       numeric not null default 0,   -- manual discount amount
  delivery_fee   numeric not null default 0,
  extra          numeric not null default 0,   -- "other" charge
  gst_percent    numeric not null default 0,   -- 0 = no VAT invoice
  gst_amount     numeric not null default 0,
  total          numeric not null default 0,
  payment        text    not null default 'cash',  -- 'cash' | 'upi' | 'card'
  created_at     bigint  not null default now_ms()
);
create index if not exists wholesale_bills_customer_idx on wholesale_bills (customer_id);
create index if not exists wholesale_bills_created_idx  on wholesale_bills (created_at);

-- ===========================================================================
-- MIGRATIONS — columns added after the first release. Safe to re-run: every
-- ADD COLUMN uses IF NOT EXISTS, so an already-created table just gains the
-- new columns and a fresh one is a no-op.
-- ===========================================================================
alter table wholesale_products add column if not exists cost_price numeric not null default 0;

alter table wholesale_bills add column if not exists discount     numeric not null default 0;
alter table wholesale_bills add column if not exists delivery_fee numeric not null default 0;
alter table wholesale_bills add column if not exists extra        numeric not null default 0;
alter table wholesale_bills add column if not exists gst_percent  numeric not null default 0;
alter table wholesale_bills add column if not exists gst_amount   numeric not null default 0;
alter table wholesale_bills add column if not exists payment      text    not null default 'cash';

-- ===========================================================================
-- ROW LEVEL SECURITY — permissive anon policy (reads via anon key; writes are
-- gated to admins by /api/db, exactly like menu_items / expenses).
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'wholesale_products','wholesale_customers','wholesale_prices','wholesale_bills'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_all on %I', t);
    execute format(
      'create policy anon_all on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ===========================================================================
-- REALTIME — broadcast row changes so every open admin tab stays in sync.
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'wholesale_products','wholesale_customers','wholesale_prices','wholesale_bills'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
