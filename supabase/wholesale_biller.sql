-- Who was on the till when a wholesale bill was raised.
--
-- Two people work the counter and share one admin login, so a bill has to
-- record which of them took the money. The shop's own bills keep this inside
-- the `payload` jsonb they already have; wholesale bills have no payload, so
-- they get a column.
--
-- The value is written by the server from the signed biller cookie
-- (app/api/db/route.ts), never from the browser — the whole point is that one
-- biller cannot file a bill under the other's name.
--
-- Apply in the Supabase SQL editor. Safe to re-run. Until it is applied the
-- app still saves wholesale bills: /api/db drops the column it is told does
-- not exist yet, and the order history shows a dash instead of a name.

alter table wholesale_bills add column if not exists biller text not null default '';

-- The order history and the analytics both filter by date, not by biller, so
-- no index is needed; this is a column you read, not one you search on.

comment on column wholesale_bills.biller is
  'Counter staff who raised this bill (from BILLERS). Admin panel only - never printed or sent to the customer.';
