"use client";

// Menu items — now backed by Supabase + Realtime. The public API is unchanged
// from the old localStorage version, so UI components need no edits. Writes are
// optimistic (cache updates instantly) and the Realtime echo reconciles every
// device to the server's truth.
//
// When Supabase isn't configured (dev without .env.local), the store hydrates
// from DEMO_MENU below so the whole app can be tried end-to-end offline.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';
import { getSupabase, isSupabaseConfigured } from './supabase';

// Categories are free-form: admins can add their own from the product form.
// These are just the built-in starters that always appear in the pickers.
export type MenuCategory = string;

export const MENU_CATEGORIES: MenuCategory[] = ['Arabic Sweets', 'Cakes', 'Pastries', 'Drinks'];

/* ── Sub-products (sizes) ──────────────────────────────────────────────────
   A cake is not one thing for sale: it is a 500 g, a 1 kg and a 1.5 kg, each
   with its own price and its own count on the shelf. Those are sub-products.

   Units are deliberately a closed set. "1/2 kilo", "half", "500 grams" and
   "500g" typed by four different people are four different products as far as
   a computer is concerned, and the stock for each one drifts apart. The admin
   picks from this list and types a number; nothing else is accepted. */
export type MenuUnit = 'g' | 'kg' | 'ml' | 'l';

export const MENU_UNITS: { v: MenuUnit; label: string; kind: 'weight' | 'volume' }[] = [
  { v: 'g', label: 'g', kind: 'weight' },
  { v: 'kg', label: 'kg', kind: 'weight' },
  { v: 'ml', label: 'ml', kind: 'volume' },
  { v: 'l', label: 'L', kind: 'volume' },
];

export interface MenuVariant {
  id: string;
  /** How much of the unit, e.g. 500 with unit 'g', or 1.5 with 'kg'. */
  amount: number;
  unit: MenuUnit;
  price: number;
  /** Count on the shelf for THIS size. null = not tracked. */
  stock: number | null;
  /** Warn when this size's own count drops to this. null = use the product's
   *  threshold. A 500g that sells ten a day and a 2kg that sells one a week
   *  cannot share one number, which is why the alert lives per size.
   *  Older rows saved before per-size alerts existed have no key at all,
   *  hence the `?` — both readers normalise it to null. */
  lowAt?: number | null;
}

/** How a size is written everywhere a human reads it: 500g, 1kg, 1.5kg, 250ml, 1L.
 *  One function, so the kitchen ticket, the waiter's board, the bill and the
 *  customer's basket cannot disagree about what was ordered. */
export function variantLabel(v: Pick<MenuVariant, 'amount' | 'unit'>): string {
  const n = Number(v.amount);
  if (!Number.isFinite(n)) return '';
  // 1.5 keeps its half; 1.0 does not become "1.0".
  const amount = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
  return `${amount}${v.unit === 'l' ? 'L' : v.unit}`;
}

/** "Black Forest Cake (1kg)" — the name that goes on the ticket and the bill. */
export function variantName(productName: string, v: Pick<MenuVariant, 'amount' | 'unit'> | null | undefined): string {
  const label = v ? variantLabel(v) : '';
  return label ? `${productName} (${label})` : productName;
}

/** Normalise whatever came out of the database into real variants. */
function variantsFrom(raw: unknown): MenuVariant[] {
  if (!Array.isArray(raw)) return [];
  const units = new Set(MENU_UNITS.map((u) => u.v));
  return raw
    .map((x, i): MenuVariant | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      const unit = String(o.unit ?? '') as MenuUnit;
      const amount = Number(o.amount);
      if (!units.has(unit) || !Number.isFinite(amount) || amount <= 0) return null;
      const lowAt = o.lowAt == null ? null : Number(o.lowAt);
      return {
        id: String(o.id ?? `v${i}`),
        amount,
        unit,
        price: Number(o.price) || 0,
        stock: o.stock == null ? null : Number(o.stock),
        lowAt: lowAt == null || !Number.isFinite(lowAt) ? null : lowAt,
      } satisfies MenuVariant;
    })
    .filter((v): v is MenuVariant => v !== null);
}

/** A product with sizes is sold out only when EVERY size is. */
export function variantsSoldOut(variants: MenuVariant[]): boolean {
  if (variants.length === 0) return false;
  return variants.every((v) => v.stock != null && v.stock <= 0);
}

/** The threshold that applies to one size: its own if set, otherwise the
 *  product's. One function so the table, the badge, the KPI tile and the
 *  pop-up cannot disagree about when a size counts as low. */
export function variantLowAt(v: MenuVariant, productLowAt: number): number {
  return v.lowAt == null || !Number.isFinite(v.lowAt) ? productLowAt : v.lowAt;
}

/** Running low — still has some, but at or under its threshold. */
export function variantIsLow(v: MenuVariant, productLowAt: number): boolean {
  return v.stock != null && v.stock > 0 && v.stock <= variantLowAt(v, productLowAt);
}

export function variantIsOut(v: MenuVariant): boolean {
  return v.stock != null && v.stock <= 0;
}

/* ── Product-level stock status ────────────────────────────────────────────
   For a product sold in sizes, the single count shown in the table is the
   sizes added up — which is exactly the wrong number to alert on. Four sizes
   with two left each total eight: above any sensible threshold, while every
   one of them is about to disappear from the menu. So a sized product is low
   when ANY of its sizes is low (or already out, while others are not), and
   sold out only when every size is. */
export function stockIsLow(p: { stock: number | null; lowAt: number; variants?: MenuVariant[] }): boolean {
  const variants = p.variants ?? [];
  if (variants.length) {
    const tracked = variants.filter((v) => v.stock != null);
    if (!tracked.length) return false;
    if (tracked.every(variantIsOut)) return false; // that is "sold out", not "low"
    return tracked.some((v) => variantIsLow(v, p.lowAt) || variantIsOut(v));
  }
  return p.stock !== null && p.stock > 0 && p.stock <= p.lowAt;
}

export function stockIsOut(p: { stock: number | null; variants?: MenuVariant[] }): boolean {
  const variants = p.variants ?? [];
  if (variants.length) {
    const tracked = variants.filter((v) => v.stock != null);
    return tracked.length > 0 && tracked.every(variantIsOut);
  }
  return p.stock !== null && p.stock <= 0;
}

/** The sizes of a product that need attention, for the alert pop-up. */
export function lowVariants(p: { lowAt: number; variants?: MenuVariant[] }): MenuVariant[] {
  return (p.variants ?? []).filter((v) => variantIsLow(v, p.lowAt) || variantIsOut(v));
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  description: string;
  image: string;
  prepTime: string;
  status: 'active' | 'inactive';
  isPopular?: boolean;
  isChefSpecial?: boolean;
  isBestSeller?: boolean;
  isSpicy?: boolean;
  // Inventory / stock tracking
  stock?: number;
  lowStockThreshold?: number;
  sku?: string;
  cost?: number;
  /** What ONE of these weighs, in grams. Delivery is priced by the weight of
   *  the basket, so this is what decides the fee (see delivery weight tiers). */
  weightGrams?: number;
  /** Sizes this product is sold in. Empty = sold as one thing, at `price`
   *  with `stock`. Non-empty = the customer must choose one, and the price
   *  and the stock both come from the size they chose. */
  variants?: MenuVariant[];
  createdAt: number;
}

function fromRow(r: Record<string, unknown>): MenuItem {
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as MenuCategory,
    price: Number(r.price),
    description: (r.description as string) ?? '',
    image: (r.image as string) ?? '',
    prepTime: (r.prep_time as string) ?? '',
    status: (r.status as MenuItem['status']) ?? 'active',
    isPopular: (r.is_popular as boolean) ?? false,
    isChefSpecial: (r.is_chef_special as boolean) ?? false,
    isBestSeller: (r.is_best_seller as boolean) ?? false,
    isSpicy: (r.is_spicy as boolean) ?? false,
    stock: r.stock == null ? undefined : Number(r.stock),
    lowStockThreshold: r.low_stock_threshold == null ? undefined : Number(r.low_stock_threshold),
    sku: (r.sku as string) ?? undefined,
    cost: r.cost == null ? undefined : Number(r.cost),
    weightGrams: r.weight_grams == null ? undefined : Number(r.weight_grams),
    variants: variantsFrom(r.variants),
    createdAt: Number(r.created_at),
  };
}

function toRow(m: Partial<MenuItem>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (m.id !== undefined) row.id = m.id;
  if (m.name !== undefined) row.name = m.name;
  if (m.category !== undefined) row.category = m.category;
  if (m.price !== undefined) row.price = m.price;
  if (m.description !== undefined) row.description = m.description;
  if (m.image !== undefined) row.image = m.image;
  if (m.prepTime !== undefined) row.prep_time = m.prepTime;
  if (m.status !== undefined) row.status = m.status;
  if (m.isPopular !== undefined) row.is_popular = m.isPopular;
  if (m.isChefSpecial !== undefined) row.is_chef_special = m.isChefSpecial;
  if (m.isBestSeller !== undefined) row.is_best_seller = m.isBestSeller;
  if (m.isSpicy !== undefined) row.is_spicy = m.isSpicy;
  if (m.stock !== undefined) row.stock = m.stock;
  if (m.lowStockThreshold !== undefined) row.low_stock_threshold = m.lowStockThreshold;
  if (m.sku !== undefined) row.sku = m.sku;
  if (m.cost !== undefined) row.cost = m.cost;
  if (m.weightGrams !== undefined) row.weight_grams = m.weightGrams;
  if (m.variants !== undefined) row.variants = m.variants;
  if (m.createdAt !== undefined) row.created_at = m.createdAt;
  return row;
}

const store = createRealtimeStore<MenuItem>({ table: 'menu_items', fromRow });

// `is_best_seller` is a newer column. If the live DB hasn't had the migration
// applied yet, a write including it is rejected — so we retry once without it,
// exactly like the coupon targeting columns, so saving a product never breaks.
let menuSchemaIsLegacy = false;
function isMissingColumnError(msg: string): boolean {
  return /could not find the .* column|column .* does not exist|schema cache|is_best_seller/i.test(msg);
}
function stripNewMenuColumns(row: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...row };
  delete clean.is_best_seller;
  delete clean.weight_grams;
  delete clean.variants;
  return clean;
}
/** True once the database has told us a newer column is missing. The admin
 *  needs to know: a "best seller" that is silently dropped looks like a bug in
 *  the button, not a migration nobody has run. */
export function menuSchemaIsOutdated(): boolean {
  return menuSchemaIsLegacy;
}

export const MENU_MIGRATION_HINT =
  'Saved — but "best seller", the product weight and the sizes could not be stored. Everything else ' +
  'was saved; ask your administrator to enable those fields.';

async function writeMenu(op: 'insert' | 'update' | 'delete', values: Record<string, unknown>, match?: Record<string, string>) {
  const payload = menuSchemaIsLegacy ? stripNewMenuColumns(values) : values;
  const res = await write({ table: 'menu_items', op, values: payload, match });
  if (res.error && isMissingColumnError(res.error.message || '')) {
    menuSchemaIsLegacy = true;
    console.warn(
      '[menu] a newer column is missing — apply supabase/best_seller.sql (best sellers), ' +
      'supabase/delivery_weight_tiers.sql (product weight) and supabase/product_variants.sql ' +
      '(sizes). Saving without them for now.',
    );
    return write({ table: 'menu_items', op, values: stripNewMenuColumns(values), match });
  }
  return res;
}

// ---------- Offline demo seed ----------
// Twelve items across the four categories so the whole app (customer, chef,
// waiter, admin) can be clicked through without a Supabase project. The
// images point at Unsplash photos used elsewhere in the landing page, scaled
// for card layouts.
const img = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
const now = () => Date.now();

const DEMO_MENU: MenuItem[] = [
  {
    id: 'demo-baklava', name: 'Pistachio Baklava',
    category: 'Arabic Sweets', price: 2.5,
    description: 'Flaky filo layers, Aleppo pistachios, orange-blossom syrup.',
    image: img('photo-1619221882266-6f2f93f6dc9b'), prepTime: '8 min',
    status: 'active', stock: 40, createdAt: now(),
  },
  {
    id: 'demo-maamoul', name: 'Date Maamoul',
    category: 'Arabic Sweets', price: 1.75,
    description: 'Semolina shortbread, Medjool-date filling, dusted with sugar.',
    image: img('photo-1558326567-98ae2405596b'), prepTime: '6 min',
    status: 'active', stock: 60, createdAt: now(),
  },
  {
    id: 'demo-kunafa', name: 'Rose Kunafa',
    category: 'Arabic Sweets', price: 3.25,
    description: 'Spun kataifi, molten cheese, finished with rose syrup and crushed pistachio.',
    image: img('photo-1587314168485-3236d6710814'), prepTime: '12 min',
    status: 'active', stock: 25, createdAt: now(),
  },
  {
    id: 'demo-red-rose', name: 'Red Rose Signature',
    category: 'Cakes', price: 18.0,
    description: 'Our hallmark — rose cream, raspberry coulis, candied petals.',
    image: img('photo-1565958011703-44f9829ba187'), prepTime: '20 min',
    status: 'active', stock: 6, createdAt: now(),
  },
  {
    id: 'demo-saffron', name: 'Saffron & Pistachio Cake',
    category: 'Cakes', price: 14.5,
    description: 'Persian saffron sponge layered with pistachio buttercream.',
    image: img('photo-1578985545062-69928b1d9587'), prepTime: '20 min',
    status: 'active', stock: 5, createdAt: now(),
  },
  {
    id: 'demo-chocolate', name: 'Dark Chocolate Dome',
    category: 'Cakes', price: 16.75,
    description: 'Flourless 72% chocolate, salted caramel heart.',
    image: img('photo-1551024601-bec78aea704b'), prepTime: '18 min',
    status: 'active', stock: 8, createdAt: now(),
  },
  {
    id: 'demo-croissant', name: 'Butter Croissant',
    category: 'Pastries', price: 1.25,
    description: 'Laminated with Normandy butter, 36-hour cold proof.',
    image: img('photo-1555507036-ab1f4038808a'), prepTime: '3 min',
    status: 'active', stock: 48, createdAt: now(),
  },
  {
    id: 'demo-almond-tart', name: 'Almond Berry Tart',
    category: 'Pastries', price: 2.95,
    description: 'Sablé crust, frangipane, seasonal berries, apricot glaze.',
    image: img('photo-1488477181946-6428a0291777'), prepTime: '5 min',
    status: 'active', stock: 20, createdAt: now(),
  },
  {
    id: 'demo-eclair', name: 'Vanilla Éclair',
    category: 'Pastries', price: 2.25,
    description: 'Choux pastry, Madagascar vanilla crème, dark-chocolate glaze.',
    image: img('photo-1464195244916-405fa0a82545'), prepTime: '4 min',
    status: 'active', stock: 30, createdAt: now(),
  },
  {
    id: 'demo-karak', name: 'Karak Chai',
    category: 'Drinks', price: 0.9,
    description: 'Spiced black tea simmered with evaporated milk and cardamom.',
    image: img('photo-1546069901-ba9599a7e63c'), prepTime: '4 min',
    status: 'active', stock: 100, createdAt: now(),
  },
  {
    id: 'demo-arabic-coffee', name: 'Arabic Coffee',
    category: 'Drinks', price: 1.1,
    description: 'Lightly roasted beans, cardamom and saffron, served in a dallah.',
    image: img('photo-1511920170033-f8396924c348'), prepTime: '5 min',
    status: 'active', stock: 80, createdAt: now(),
  },
  {
    id: 'demo-rose-latte', name: 'Rose Latte',
    category: 'Drinks', price: 1.6,
    description: 'Steamed milk, rose syrup, pistachio dust on top.',
    image: img('photo-1572442388796-11668a67e53d'), prepTime: '5 min',
    status: 'active', stock: 60, createdAt: now(),
  },
];

let demoHydrated = false;
function ensureDemoHydrated() {
  if (demoHydrated || isSupabaseConfigured()) return;
  demoHydrated = true;
  if (store.get().length === 0) store.patchLocal(() => DEMO_MENU);
}

export function getMenuItems(): MenuItem[] {
  store.ensureHydrated();
  ensureDemoHydrated();
  return store.get();
}

export function getActiveMenuItems(): MenuItem[] {
  store.ensureHydrated();
  ensureDemoHydrated();
  return store.get().filter((i) => i.status === 'active');
}

export function getMenuSnapshot(): MenuItem[] {
  ensureDemoHydrated();
  return store.getSnapshot();
}

export function getMenuServerSnapshot(): MenuItem[] {
  return store.getServerSnapshot();
}

/**
 * Add a product.
 *
 * Returns the item AND the promise that settles when the database has actually
 * taken it. Callers that show a "saved" toast must await `saved` — otherwise
 * they congratulate the user on a write that then fails, the optimistic copy is
 * dropped by the next refetch, and the product silently disappears from the
 * list a second later. That is exactly what was happening.
 */
export function addMenuItem(
  input: Omit<MenuItem, 'id' | 'createdAt'>,
): { item: MenuItem; saved: Promise<{ error: { message: string } | null }> } {
  const item: MenuItem = { ...input, id: `p${Date.now().toString(36)}`, createdAt: Date.now() };
  store.patchLocal((cur) => [item, ...cur]);
  const saved = writeMenu('insert', toRow(item)).then((res) => {
    if (res.error) {
      console.error('[menu] add failed', res.error.message);
      // Take the optimistic row back out: leaving it there is what made a
      // product look added and then vanish on the next sync.
      store.patchLocal((cur) => cur.filter((i) => i.id !== item.id));
    }
    return res;
  });
  return { item, saved };
}

export function updateMenuItem(
  id: string,
  patch: Partial<Omit<MenuItem, 'id' | 'createdAt'>>,
  opts?: { localOnly?: boolean },
): Promise<{ error: { message: string } | null }> {
  const before = store.get().find((i) => i.id === id);
  store.patchLocal((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  // localOnly: the server already made this change (e.g. /api/stock wrote the
  // new stock count), so we only refresh what this device shows.
  if (opts?.localOnly) return Promise.resolve({ error: null });
  return writeMenu('update', toRow(patch), { id: id }).then((res) => {
    if (res.error) {
      console.error('[menu] update failed', res.error.message);
      // Put the old values back so the screen never shows a change the
      // database refused.
      if (before) store.patchLocal((cur) => cur.map((i) => (i.id === id ? before : i)));
    }
    return res;
  });
}

export function deleteMenuItem(id: string) {
  store.patchLocal((cur) => cur.filter((i) => i.id !== id));
  void write({ table: 'menu_items', op: 'delete', match: { id: id } }).then(({ error }) => {
    if (error) console.error('[menu] delete failed', error.message);
  });
}

export function subscribeToMenu(callback: () => void): () => void {
  ensureDemoHydrated();
  return store.subscribe(callback);
}
