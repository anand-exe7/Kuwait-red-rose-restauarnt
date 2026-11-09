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

-- Readable by the app (the admin pages read with the anon key); every write
-- goes through /api/db with the service role, which checks the admin cookie.
drop policy if exists expenses_anon_read on expenses;
create policy expenses_anon_read on expenses for select to anon using (true);

revoke insert, update, delete on expenses from anon;

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
