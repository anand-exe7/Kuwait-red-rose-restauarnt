-- Adds the fields the admin POS needs to persist a full bill so the
-- public invoice link can stay short (/invoice/INV-YYYY-XXXXX) instead
-- of carrying the whole bill in a base64 URL payload. Safe to run
-- multiple times.
--
-- To apply: open your Supabase project → SQL Editor → paste this whole
-- file → Run.

-- The counter walk-in flow never had a session, so make session_id optional.
alter table bills alter column session_id drop not null;

-- Stable, human-readable invoice number shown everywhere (INV-2026-48213).
alter table bills add column if not exists invoice_no text;
create index if not exists bills_invoice_no_idx on bills (invoice_no);

-- Full bill payload — items, customer, GST breakdown, payment split, etc.
-- Lets the customer invoice page render the same bill the admin printed
-- without a chunky URL blob.
alter table bills add column if not exists payload jsonb;
