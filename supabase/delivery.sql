-- Red Rose — delivery feature schema.
--
-- Run ONCE in the Supabase SQL editor (safe to re-run: it only adds what is
-- missing and never drops data). Requires schema.sql + security.sql already run.
--
-- Privacy model:
--   * delivery_settings  -> readable by the public key (hours, min order, free km...)
--   * deliveries, customer_addresses -> NOT readable or writable by the public
--     key at all (addresses, phones). The server reaches them with the
--     service-role key through /api/delivery/*.

-- ---------------------------------------------------------------------------
-- orders: delivery fee + payment columns
-- ---------------------------------------------------------------------------
alter table orders add column if not exists delivery_fee     numeric not null default 0;
alter table orders add column if not exists payment_method   text    not null default 'cash';  -- cash | cod | online
alter table orders add column if not exists payment_status   text    not null default 'n/a';   -- n/a | unpaid | pending | paid | refunded
alter table orders add column if not exists payment_ref      text;                             -- PAYMENT: gateway payment id goes here

-- ---------------------------------------------------------------------------
-- delivery_settings (single row, id = 1) — edited from Admin -> Delivery
-- ---------------------------------------------------------------------------
create table if not exists delivery_settings (
  id                    integer primary key default 1 check (id = 1),
  enabled               boolean not null default true,
  busy                  boolean not null default false,          -- "no deliveries right now"
  shop_lat              double precision not null default 29.3759,
  shop_lng              double precision not null default 47.9774,
  shop_label            text    not null default 'Red Rose Sweets',
  free_km               numeric not null default 5,
  max_km                numeric not null default 15,
  fee_mode              text    not null default 'per_km' check (fee_mode in ('per_km','fixed','tiers')),
  fee_per_km            numeric not null default 0.250,          -- KD per km beyond free_km
  fee_fixed             numeric not null default 1.000,          -- KD flat fee beyond free_km
  fee_tiers             jsonb   not null default '[]'::jsonb,    -- [{"upToKm":8,"fee":0.5},{"upToKm":12,"fee":1}]
  min_order             numeric not null default 3,
  tax_on_fee            boolean not null default false,
  hours                 jsonb   not null default '{}'::jsonb,    -- {"0":{"closed":false,"open":"10:00","close":"23:00"},...} 0 = Sunday
  cod_enabled           boolean not null default true,
  cod_max               numeric not null default 0,              -- 0 = no limit
  online_payment_enabled boolean not null default false,         -- PAYMENT: flip on once a gateway is wired
  updated_at            bigint  not null default (extract(epoch from now()) * 1000)::bigint
);
insert into delivery_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- customer_addresses (owner = Supabase Auth user)
-- ---------------------------------------------------------------------------
create table if not exists customer_addresses (
  id         text primary key,
  user_id    text    not null,
  label      text    not null default 'Home',
  name       text    not null default '',
  phone      text    not null default '',
  area       text    not null default '',
  block      text    not null default '',
  street     text    not null default '',
  jadda      text    not null default '',
  building   text    not null default '',
  floor      text    not null default '',
  apartment  text    not null default '',
  landmark   text    not null default '',
  note       text    not null default '',
  lat        double precision not null,
  lng        double precision not null,
  created_at bigint  not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists customer_addresses_user_idx on customer_addresses (user_id);

-- ---------------------------------------------------------------------------
-- deliveries (one per delivery order)
-- ---------------------------------------------------------------------------
create table if not exists deliveries (
  id              text primary key,
  order_id        text    not null unique,
  user_id         text    not null,
  customer_name   text    not null default '',
  customer_phone  text    not null default '',
  address         jsonb   not null default '{}'::jsonb,          -- snapshot of the address at order time
  lat             double precision not null,
  lng             double precision not null,
  distance_km     numeric not null default 0,
  distance_source text    not null default 'estimated',          -- google | estimated
  fee             numeric not null default 0,
  status          text    not null default 'pending'
                  check (status in ('pending','assigned','out_for_delivery','delivered','failed','cancelled')),
  picked_up_at    bigint,
  delivered_at    bigint,
  failed_at       bigint,
  failed_reason   text,
  payment_method  text    not null default 'cod',                -- cod | online
  payment_status  text    not null default 'unpaid',             -- unpaid | pending | paid | refunded
  payment_ref     text,                                          -- PAYMENT: gateway payment id
  cod_expected    numeric not null default 0,
  cod_collected   numeric,
  cod_settled     boolean not null default false,                -- the cash is in the till
  cod_settled_at  bigint,
  note            text    not null default '',
  created_at      bigint  not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists deliveries_user_idx   on deliveries (user_id);
create index if not exists deliveries_status_idx on deliveries (status);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table delivery_settings  enable row level security;
alter table customer_addresses enable row level security;
alter table deliveries         enable row level security;

drop policy if exists anon_read on delivery_settings;
create policy anon_read on delivery_settings for select to anon, authenticated using (true);

-- No policies on the private tables = the public key can do nothing with them.
revoke all on customer_addresses, deliveries from anon, authenticated;
revoke insert, update, delete, truncate on delivery_settings from anon, authenticated;
