-- Red Rose — customer remarks + hand-over tracking on orders.
--
-- Run ONCE in the Supabase SQL editor, after schema.sql. Safe to re-run.
--
-- note            the customer's remark typed at checkout ("no sugar", "ring
--                 the bell twice"). Shown to the admin, the chef and the
--                 waiter, and printed on the invoice.
-- handed_over_at  when the waiter physically handed a takeaway to the customer
--                 or a delivery to the driver. A billed home order stays on the
--                 waiter's board until this is set, then drops off.

alter table orders add column if not exists note           text;
alter table orders add column if not exists handed_over_at bigint;

create index if not exists orders_handover_idx on orders (mode, billed, handed_over_at);
