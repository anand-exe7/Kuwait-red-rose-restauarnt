-- Best Sellers: mark menu items as a best seller in Admin; the customer menu
-- shows them as square boxes at the top. Apply in the Supabase SQL editor.
-- Safe to re-run.

alter table menu_items
  add column if not exists is_best_seller boolean not null default false;
