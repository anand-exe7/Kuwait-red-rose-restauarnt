-- Red Rose — delivery charged by WEIGHT, per area.
--
-- Run ONCE in the Supabase SQL editor, after supabase/delivery_areas.sql.
-- Safe to re-run: it only adds what is missing and never deletes data.
--
-- Each area gets a list of weight brackets:
--   [{ "minG": 0, "maxG": 500, "fee": 1 }, { "minG": 500, "maxG": 1000, "fee": 1.5 }]
-- The checkout adds up the weight of what is in the basket, finds the bracket
-- it falls into for the chosen area, and charges that fee. An area with no
-- brackets keeps charging its flat `fee`, exactly as before.
--
-- Weight comes from the product: menu_items.weight_grams is what one of that
-- item weighs, set by the admin on the Inventory page.

alter table delivery_areas add column if not exists tiers jsonb not null default '[]'::jsonb;

alter table menu_items add column if not exists weight_grams numeric;
