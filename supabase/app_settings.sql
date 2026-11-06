-- Shop-wide settings (key/value). Currently holds the country tax config
-- (id = 'tax'): { enabled, rate, label, inclusive }. Apply in the Supabase SQL
-- editor. Safe to re-run.

create table if not exists app_settings (
  id    text primary key,
  value jsonb not null default '{}'::jsonb
);

-- Public key may READ settings (bills/checkout need the tax rate); only the
-- server (service role, via /api/db) writes them.
alter table app_settings enable row level security;
drop policy if exists anon_read on app_settings;
create policy anon_read on app_settings for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on app_settings from anon, authenticated;

-- Seed a default tax row (off) so the Settings page has something to edit.
insert into app_settings (id, value)
values ('tax', '{"enabled":false,"rate":0,"label":"GST","inclusive":false}'::jsonb)
on conflict (id) do nothing;
