-- Red Rose — lock the database down so the browser can only READ.
--
-- Run this ONCE in the Supabase SQL editor, AFTER you have:
--   1. put SUPABASE_SERVICE_ROLE_KEY (Settings -> API -> service_role) in your
--      server environment (.env.local / Vercel env vars), and
--   2. restarted the app and confirmed ordering/billing still work.
--
-- Why: every browser write now goes through /api/db, which checks the staff
-- cookie and re-prices orders on the server using the service-role key (which
-- bypasses RLS). So the public anon key no longer needs write access at all.
--
-- After this:
--   * anon / authenticated  -> SELECT only (needed for the menu and Realtime)
--   * anon / authenticated  -> NO insert/update/delete on any table
--   * login_attempts        -> not readable or writable by the browser at all
--
-- To undo (e.g. while debugging) re-run the "anon_all" block from schema.sql.

do $$
declare t text;
begin
  foreach t in array array[
    'tables','sessions','menu_items','coupons','waiter_calls','orders','bills','login_attempts'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_all on %I', t);
    execute format('drop policy if exists anon_read on %I', t);
  end loop;

  -- Read-only for the browser (Realtime also needs SELECT).
  foreach t in array array[
    'tables','sessions','menu_items','coupons','waiter_calls','orders','bills'
  ] loop
    execute format(
      'create policy anon_read on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Defence in depth: remove table-level write privileges too.
revoke insert, update, delete, truncate on
  tables, sessions, menu_items, coupons, waiter_calls, orders, bills, login_attempts
  from anon, authenticated;
revoke all on login_attempts from anon, authenticated;
