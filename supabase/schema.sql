-- Red Rose — Supabase schema
-- Run this whole file in the Supabase SQL editor on a fresh project.
-- Safe to re-run: it drops and recreates everything, then re-seeds.
--
-- Conventions:
--   * Primary keys are TEXT and client-generated (e.g. 'TK-1234', 'm1', 'SN-...'),
--     matching the app's existing id scheme. This lets the client insert
--     optimistically without an id round-trip.
--   * Timestamps are BIGINT epoch-milliseconds (`Date.now()`), matching the
--     app's `createdAt: number` fields — no timezone conversion needed.
--   * Money is NUMERIC (KWD, 3 decimals / fils).
--   * RLS is ON with permissive anon policies: this is a single-shop app whose
--     staff PAGES are gated by the password cookie; the data layer trusts the
--     anon key. Do NOT expose the service_role key to the browser.

-- ---------------------------------------------------------------------------
-- Helper: default epoch-ms
-- ---------------------------------------------------------------------------
create or replace function now_ms() returns bigint
  language sql stable as $$ select (extract(epoch from now()) * 1000)::bigint $$;

-- ---------------------------------------------------------------------------
-- Drop (child tables first)
-- ---------------------------------------------------------------------------
drop table if exists bills          cascade;
drop table if exists orders         cascade;
drop table if exists waiter_calls   cascade;
drop table if exists coupons        cascade;
drop table if exists menu_items     cascade;
drop table if exists login_attempts cascade;
drop table if exists sessions       cascade;
drop table if exists tables         cascade;

-- ===========================================================================
-- TABLES (restaurant tables)
-- ===========================================================================
create table tables (
  id         text primary key,
  number     integer not null,
  label      text    not null default '',
  seats      integer not null default 4,
  zone       text    not null default 'Indoor',
  active     boolean not null default true,
  session_id text,                       -- current OPEN session, or null when free
  created_at bigint  not null default now_ms()
);
create unique index tables_number_key on tables (number);

-- ===========================================================================
-- SESSIONS (guest tabs) — one visit to a table/standing party
-- ===========================================================================
create table sessions (
  id                text primary key,
  table_number      integer,                       -- null for takeaway
  mode              text    not null default 'table',   -- 'table' | 'standing' | 'takeaway'
  status            text    not null default 'open',    -- 'open' | 'closed' | 'void'
  standing_label    text,
  customer_name     text,
  customer_phone    text,
  guests            integer,
  opened_at         bigint  not null default now_ms(),
  closed_at         bigint,
  bill_requested_at bigint,
  bill_id           text,
  created_at        bigint  not null default now_ms()
);
-- At most ONE open dine-in session per table (DB-enforced, even under a race).
create unique index sessions_one_open_per_table
  on sessions (table_number)
  where (status = 'open' and mode = 'table');
create index sessions_status_idx on sessions (status);

-- ===========================================================================
-- MENU ITEMS
-- ===========================================================================
create table menu_items (
  id                  text primary key,
  name                text    not null,
  category            text    not null,
  price               numeric not null default 0,
  description         text    not null default '',
  image               text    not null default '',
  prep_time           text    not null default '',
  status              text    not null default 'active',   -- 'active' | 'inactive'
  is_popular          boolean not null default false,
  is_chef_special     boolean not null default false,
  is_spicy            boolean not null default false,
  stock               integer,
  low_stock_threshold integer,
  sku                 text,
  cost                numeric,
  created_at          bigint  not null default now_ms()
);
create index menu_items_status_idx on menu_items (status);

-- ===========================================================================
-- COUPONS
-- ===========================================================================
create table coupons (
  id               text primary key,
  code             text    not null,
  discount_percent integer not null default 0,
  min_order        numeric not null default 0,
  expiry           text    not null default '',      -- 'YYYY-MM-DD' or ''
  usage_limit      integer not null default 0,        -- 0 = unlimited
  used_count       integer not null default 0,
  active           boolean not null default true,
  created_at       bigint  not null default now_ms()
);
create unique index coupons_code_key on coupons (upper(code));

-- ===========================================================================
-- WAITER CALLS
-- ===========================================================================
create table waiter_calls (
  id           text primary key,
  table_number integer not null,
  resolved     boolean not null default false,
  created_at   bigint  not null default now_ms()
);
create index waiter_calls_open_idx on waiter_calls (resolved) where (resolved = false);

-- ===========================================================================
-- ORDERS  (line items kept as JSONB — mirrors the app's OrderItem[])
-- ===========================================================================
create table orders (
  id             text primary key,
  table_number   integer not null default 0,
  items          jsonb   not null default '[]'::jsonb,
  status         text    not null default 'pending',   -- pending|cooking|ready|served
  priority       text    not null default 'normal',    -- normal|high
  subtotal       numeric not null default 0,
  tax            numeric not null default 0,
  total          numeric not null default 0,
  source         text    not null default 'customer',  -- customer|waiter
  mode           text    not null default 'table',      -- table|standing|takeaway
  discount       numeric,
  coupon_code    text,
  standing_label text,
  session_id     text,
  billed         boolean not null default false,
  created_at     bigint  not null default now_ms()
);
create index orders_session_idx on orders (session_id);
create index orders_billed_idx  on orders (billed);
create index orders_status_idx  on orders (status);

-- ===========================================================================
-- BILLS  (settles a session)
-- ===========================================================================
create table bills (
  id          text primary key,
  session_id  text not null,
  subtotal    numeric not null default 0,
  tax         numeric not null default 0,
  discount    numeric not null default 0,
  total       numeric not null default 0,
  coupon_code text,
  paid_method text,
  created_at  bigint  not null default now_ms()
);
create index bills_session_idx on bills (session_id);

-- ===========================================================================
-- LOGIN ATTEMPTS  (for admin/staff lockout)
-- ===========================================================================
create table login_attempts (
  id         bigserial primary key,
  ip         text    not null default '',
  role       text    not null default '',
  success    boolean not null default false,
  created_at bigint  not null default now_ms()
);
create index login_attempts_lookup_idx on login_attempts (ip, role, created_at);

-- ===========================================================================
-- ROW LEVEL SECURITY — permissive anon policies (single-shop model)
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'tables','sessions','menu_items','coupons','waiter_calls',
    'orders','bills','login_attempts'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_all on %I', t);
    execute format(
      'create policy anon_all on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ===========================================================================
-- REALTIME — broadcast row changes to connected clients
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'tables','sessions','menu_items','coupons','waiter_calls','orders','bills'
  ] loop
    -- add to the realtime publication if not already a member
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ===========================================================================
-- SEED DATA
-- ===========================================================================

-- Tables 1..12 (Indoor, 4 seats)
insert into tables (id, number, label, seats, zone, active)
select 't' || g, g, 'Table ' || g, 4, 'Indoor', true
from generate_series(1, 12) as g;

-- Menu (ported from the app's SEED_MENU)
insert into menu_items
  (id, name, category, price, description, image, prep_time, status,
   is_popular, is_chef_special, sku, stock, low_stock_threshold, cost) values
('m1','Assorted Baklava Box','Arabic Sweets',3.5,'A dozen layered filo pieces with pistachio, walnut & cashew, soaked in rose syrup.','https://images.unsplash.com/photo-1519676867240-f03562e64548?auto=format&fit=crop&q=80&w=400','5 min','active',true,true,'AS-BKL',40,10,1.8),
('m2','Kunafa Nabulsia','Arabic Sweets',2.75,'Warm shredded pastry over molten Nabulsi cheese, topped with pistachio & syrup.','https://images.unsplash.com/photo-1610508500445-a4592435e27e?auto=format&fit=crop&q=80&w=400','8 min','active',true,false,'AS-KNF',25,8,1.3),
('m3','Maamoul (Dates)','Arabic Sweets',2.25,'Semolina shortbread filled with spiced date paste — six pieces per box.','https://images.unsplash.com/photo-1600617953089-e2f0d5b7f0b8?auto=format&fit=crop&q=80&w=400','3 min','active',false,false,'AS-MML',30,10,1.0),
('m4','Luqaimat','Arabic Sweets',1.75,'Golden crisp dough dumplings drizzled with date syrup and sesame.','https://images.unsplash.com/photo-1666181733257-6e2f0f2f0f5b?auto=format&fit=crop&q=80&w=400','6 min','active',false,false,'AS-LQM',50,12,0.6),
('m5','Red Rose Signature Cake','Cakes',6.5,'Rose-infused sponge, white chocolate cream and a hand-piped rose finish.','https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=400','5 min','active',true,true,'CK-RRS',12,4,3.2),
('m6','Chocolate Fudge Slice','Cakes',1.25,'Dense triple-chocolate fudge cake with a glossy ganache glaze.','https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&q=80&w=400','3 min','active',true,false,'CK-CHF',20,6,0.5),
('m7','New York Cheesecake','Cakes',1.5,'Creamy baked cheesecake on a buttery biscuit base with berry compote.','https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&q=80&w=400','3 min','active',false,false,'CK-NYC',18,6,0.6),
('m8','Butter Croissant','Pastries',0.75,'Flaky all-butter croissant baked fresh every morning.','https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=400','2 min','active',true,false,'PS-CRS',60,15,0.25),
('m9','Date Roll','Pastries',1.0,'Soft pastry spiral filled with premium Kuwaiti dates and cardamom.','https://images.unsplash.com/photo-1509365465985-25d11c17e812?auto=format&fit=crop&q=80&w=400','2 min','active',false,false,'PS-DTR',35,10,0.4),
('m10','Cream Puff','Pastries',0.85,'Light choux pastry filled with vanilla custard cream.','https://images.unsplash.com/photo-1587244141930-3d3bf0f0c1e5?auto=format&fit=crop&q=80&w=400','2 min','active',false,false,'PS-CRP',28,8,0.3),
('m11','Arabic Coffee (Gahwa)','Drinks',0.75,'Traditional cardamom-spiced Arabic coffee, served with dates.','https://images.unsplash.com/photo-1512568400610-62da28bc8a13?auto=format&fit=crop&q=80&w=400','3 min','active',false,false,'DR-GHW',100,20,0.2),
('m12','Karak Tea','Drinks',0.5,'Rich spiced milk tea brewed the Kuwaiti way.','https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&q=80&w=400','3 min','active',true,false,'DR-KRK',100,20,0.15),
('m13','Rose Lemonade','Drinks',1.5,'Fresh lemonade with a splash of rose water and mint.','https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400','4 min','active',false,false,'DR-RSL',40,10,0.5);

-- Coupons (ported from the app's SEED)
insert into coupons (id, code, discount_percent, min_order, expiry, usage_limit, used_count, active) values
('c1','SWEET10',10,5,'2027-12-31',100,0,true),
('c2','REDROSE15',15,10,'2027-12-31',50,0,true);
