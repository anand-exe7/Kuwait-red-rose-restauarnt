-- Shop expenses — rent, wages, gas, packaging, repairs.
--
-- Analytics subtracts these from revenue to show what the shop actually
-- earned, so they live in the database like everything else rather than in
-- one browser's localStorage.
--
-- Run this in the Supabase SQL editor.

create table if not exists expenses (
  id            text primary key,
  title         text not null,
  category      text not null default 'Other',
  amount        numeric not null default 0,
  -- Shop-local calendar day the money went out, "YYYY-MM-DD".
  expense_date  text not null,
  notes         text,
  created_at    bigint not null
);

create index if not exists expenses_date_idx on expenses (expense_date desc);
create index if not exists expenses_created_idx on expenses (created_at desc);

alter table expenses enable row level security;

-- Readable by the app; every write goes through /api/db with the service role,
-- which checks the admin cookie.
--
-- BOTH roles, like every other table in this project (see security.sql). The
-- browser holds ONE Supabase client, so the moment anybody signs in with
-- Google on the customer side, every read from that browser goes out as
-- `authenticated` — including the admin panel's. With `to anon` alone, RLS
-- answered those reads with zero rows, so a just-saved expense sat in the
-- database but never appeared on the Expenses page.
drop policy if exists expenses_anon_read on expenses;
create policy expenses_anon_read on expenses for select to anon, authenticated using (true);

revoke insert, update, delete on expenses from anon, authenticated;

-- Live updates in the admin panel.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table expenses;
  end if;
end $$;
