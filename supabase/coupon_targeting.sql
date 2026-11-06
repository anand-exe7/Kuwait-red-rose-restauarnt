-- Targeted coupons: a coupon can be restricted to only the phone numbers it was
-- sent to from the Coupons page. `sent_phones` holds the (normalised, last-8)
-- numbers the coupon was shared with; `targeted_only` turns on the restriction.
--
-- Apply in the Supabase SQL editor. Safe to re-run.

alter table coupons
  add column if not exists targeted_only boolean not null default false,
  add column if not exists sent_phones   jsonb   not null default '[]'::jsonb;
