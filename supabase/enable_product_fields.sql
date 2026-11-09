-- Red Rose — the three product fields the Add/Edit product form needs.
--
-- WHY YOU ARE HERE
-- Saving a product shows: "Saved — but 'best seller', the product weight and
-- the sizes could not be stored." That message is not a bug in the form. The
-- product itself was saved; those three columns simply do not exist yet in
-- this Supabase project, so the app dropped them rather than failing the save.
--
-- HOW TO FIX IT
-- Supabase dashboard → SQL editor → New query → paste this whole file → Run.
-- Then reload the admin tab. Safe to re-run: it only adds what is missing and
-- never deletes data.
--
-- It is exactly these three files in one paste, nothing new:
--   supabase/best_seller.sql            (is_best_seller)
--   supabase/delivery_weight_tiers.sql  (weight_grams, delivery_areas.tiers)
--   supabase/product_variants.sql       (variants — the 500 g / 1 kg sizes)

-- "Best seller" — the four products shown on the landing page.
alter table menu_items add column if not exists is_best_seller boolean not null default false;

-- What one of the item weighs, in grams. Delivery priced by weight reads this.
alter table menu_items add column if not exists weight_grams numeric;

-- Weight brackets per delivery area: [{ "minG": 0, "maxG": 500, "fee": 1 }, …]
alter table delivery_areas add column if not exists tiers jsonb not null default '[]'::jsonb;

-- Sizes. Each one carries its own price and its own stock:
--   [{ "id": "v1", "amount": 500, "unit": "g", "price": 4.5, "stock": 12 }, …]
alter table menu_items add column if not exists variants jsonb not null default '[]'::jsonb;
