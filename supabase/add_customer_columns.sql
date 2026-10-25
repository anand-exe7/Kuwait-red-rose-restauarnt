-- Adds the customer-identity and delivery-address columns that the new
-- customer-ordering flow needs. Safe to run multiple times: every ADD
-- COLUMN uses IF NOT EXISTS so re-running it is a no-op.
--
-- To apply: open your Supabase project → SQL Editor → paste this whole
-- file → Run.

alter table orders add column if not exists user_id          uuid;
alter table orders add column if not exists customer_name    text;
alter table orders add column if not exists customer_phone   text;
alter table orders add column if not exists customer_email   text;
alter table orders add column if not exists delivery_address jsonb;
