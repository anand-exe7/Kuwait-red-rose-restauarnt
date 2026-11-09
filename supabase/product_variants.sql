-- Red Rose — sub-products (sizes).
--
-- Run ONCE in the Supabase SQL editor, after schema.sql. Safe to re-run: it
-- only adds what is missing and never deletes data.
--
-- A cake is not one product. It is a 500 g, a 1 kg and a 1.5 kg, each with its
-- own price and its own count on the shelf. Those live here, as a list on the
-- product:
--
--   [{ "id": "v1", "amount": 500, "unit": "g",  "price": 4.5,  "stock": 12 },
--    { "id": "v2", "amount": 1,   "unit": "kg", "price": 8,    "stock": 6  }]
--
-- unit is one of 'g' | 'kg' | 'ml' | 'l' and nothing else — the admin picks it
-- from a list. Free text ("half kilo", "500 grams", "500g") would be four
-- different products as far as the stock count is concerned.
--
-- A product with an empty list is sold as one thing, at menu_items.price and
-- against menu_items.stock, exactly as before. Nothing has to be migrated.

alter table menu_items add column if not exists variants jsonb not null default '[]'::jsonb;
