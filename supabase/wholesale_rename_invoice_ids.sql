-- One-off: give wholesale bills saved BEFORE the new numbering the new
-- WB-<year>-<5 digits> invoice number (e.g. WB-MWGPU8AOLCV64 -> WB-2026-48213).
--
-- The year is the year the bill was created. The 5 digits are scrambled but
-- unique (row number x 7919 mod 100000). Bills that already look like
-- WB-2026-12345 are left alone. Safe to run once; re-running changes nothing.
-- Run it in the Supabase SQL editor.

with old as (
  select id,
         extract(year from to_timestamp(created_at / 1000.0))::int as yr,
         row_number() over (order by created_at, id) as rn
  from wholesale_bills
  where id !~ '^WB-[0-9]{4}-[0-9]{5}$'
)
update wholesale_bills b
set id = 'WB-' || old.yr || '-' || lpad(((old.rn * 7919) % 100000)::text, 5, '0')
from old
where b.id = old.id;
