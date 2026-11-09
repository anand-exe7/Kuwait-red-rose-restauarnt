-- Red Rose — stock movements (the stock ledger).
--
-- Run ONCE in the Supabase SQL editor, after schema.sql and security.sql.
-- Safe to re-run: it only adds what is missing and never deletes data.
--
-- Every change to a product's stock count writes one row here:
--   sale     an accepted order took stock off the shelf (qty is negative)
--   restock  someone added stock (qty is positive)
--   adjust   a manual correction / stock count
--   waste    thrown away, broken, expired (qty is negative)
--   return   a customer returned it and it went back on the shelf (positive)
--
-- The admin reads this on Admin -> Stock movements and can download it as Excel.

create table if not exists stock_movements (
  id           text primary key,
  product_id   text    not null,
  product_name text    not null default '',
  kind         text    not null default 'adjust'
                 check (kind in ('sale', 'restock', 'adjust', 'waste', 'return')),
  qty          numeric not null default 0,   -- signed: negative takes stock off
  before_qty   numeric,                      -- stock before this movement (null = untracked)
  after_qty    numeric,                      -- stock after this movement
  unit_price   numeric,                      -- selling price at the time (sales)
  value        numeric,                      -- qty x unit_price, for the money column
  order_id     text,                         -- the ticket that caused a sale
  session_id   text,
  reason       text,
  actor        text,                          -- 'customer' | 'waiter' | 'admin' | 'chef' | 'system'
  created_at   bigint  not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists stock_movements_created_idx on stock_movements (created_at desc);
create index if not exists stock_movements_product_idx on stock_movements (product_id);
create index if not exists stock_movements_order_idx   on stock_movements (order_id);

-- The browser may READ the ledger (the admin page renders it and listens on
-- Realtime); only the server writes, exactly like every other table.
alter table stock_movements enable row level security;
drop policy if exists anon_read on stock_movements;
drop policy if exists anon_all  on stock_movements;
create policy anon_read on stock_movements for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on stock_movements from anon, authenticated;

-- Realtime so the ledger and the stock counts update live on every device.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table stock_movements;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
