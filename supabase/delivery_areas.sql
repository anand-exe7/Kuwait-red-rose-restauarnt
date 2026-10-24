-- Red Rose — delivery by AREA (no maps needed).
--
-- Run ONCE in the Supabase SQL editor, after schema.sql, security.sql and
-- delivery.sql. Safe to re-run: it only adds what is missing and never deletes data.
--
-- The admin creates areas (Admin -> Delivery Settings -> Delivery areas), each with
-- its own fee. The customer picks an area at checkout and that fee is charged.
-- The old distance pricing is kept: set pricing_mode = 'distance' to switch back.

-- ---------------------------------------------------------------------------
-- delivery_areas: name + fee (+ optional minimum order for that area)
-- ---------------------------------------------------------------------------
create table if not exists delivery_areas (
  id         text primary key,
  name       text    not null,
  fee        numeric not null default 0 check (fee >= 0),      -- KD charged for this area (0 = free)
  min_order  numeric check (min_order is null or min_order >= 0), -- null = use the general minimum order
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at bigint  not null default (extract(epoch from now()) * 1000)::bigint
);

-- Public key may READ the list (the checkout shows it); only the server writes.
alter table delivery_areas enable row level security;
drop policy if exists anon_read on delivery_areas;
create policy anon_read on delivery_areas for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on delivery_areas from anon, authenticated;

-- A few example areas so the checkout works straight away. Only inserted when the
-- table is empty. Rename, re-price or delete them from the admin page.
insert into delivery_areas (id, name, fee, sort)
select v.id, v.name, v.fee, v.sort
from (values
  ('AR-SALMIYA',  'Salmiya',     0.500, 1),
  ('AR-HAWALLY',  'Hawally',     1.000, 2),
  ('AR-KUWAIT',   'Kuwait City', 1.500, 3),
  ('AR-FARWANIYA','Farwaniya',   2.000, 4)
) as v(id, name, fee, sort)
where not exists (select 1 from delivery_areas);

-- ---------------------------------------------------------------------------
-- delivery_settings: how the fee is decided
-- ---------------------------------------------------------------------------
alter table delivery_settings
  add column if not exists pricing_mode text not null default 'areas';
alter table delivery_settings drop constraint if exists delivery_settings_pricing_mode_check;
alter table delivery_settings
  add constraint delivery_settings_pricing_mode_check check (pricing_mode in ('areas','distance'));

-- ---------------------------------------------------------------------------
-- deliveries / saved addresses: the area replaces the map pin
-- ---------------------------------------------------------------------------
alter table deliveries          alter column lat drop not null;
alter table deliveries          alter column lng drop not null;
alter table customer_addresses  alter column lat drop not null;
alter table customer_addresses  alter column lng drop not null;

alter table deliveries          add column if not exists area_id   text;
alter table deliveries          add column if not exists area_name text not null default '';  -- snapshot: later fee/name edits never change old orders
alter table customer_addresses  add column if not exists area_id   text;
