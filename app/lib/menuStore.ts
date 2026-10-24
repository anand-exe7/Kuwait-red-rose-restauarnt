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

export type MenuCategory = 'Arabic Sweets' | 'Cakes' | 'Pastries' | 'Drinks';

export const MENU_CATEGORIES: MenuCategory[] = ['Arabic Sweets', 'Cakes', 'Pastries', 'Drinks'];

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
  isSpicy?: boolean;
  // Inventory / stock tracking
  stock?: number;
  lowStockThreshold?: number;
  sku?: string;
  cost?: number;
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
    isSpicy: (r.is_spicy as boolean) ?? false,
    stock: r.stock == null ? undefined : Number(r.stock),
    lowStockThreshold: r.low_stock_threshold == null ? undefined : Number(r.low_stock_threshold),
    sku: (r.sku as string) ?? undefined,
    cost: r.cost == null ? undefined : Number(r.cost),
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
  if (m.isSpicy !== undefined) row.is_spicy = m.isSpicy;
  if (m.stock !== undefined) row.stock = m.stock;
  if (m.lowStockThreshold !== undefined) row.low_stock_threshold = m.lowStockThreshold;
  if (m.sku !== undefined) row.sku = m.sku;
  if (m.cost !== undefined) row.cost = m.cost;
  if (m.createdAt !== undefined) row.created_at = m.createdAt;
  return row;
}

const store = createRealtimeStore<MenuItem>({ table: 'menu_items', fromRow });

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
    status: 'active', isPopular: true, stock: 40, createdAt: now(),
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
    status: 'active', isChefSpecial: true, stock: 25, createdAt: now(),
  },
  {
    id: 'demo-red-rose', name: 'Red Rose Signature',
    category: 'Cakes', price: 18.0,
    description: 'Our hallmark — rose cream, raspberry coulis, candied petals.',
    image: img('photo-1565958011703-44f9829ba187'), prepTime: '20 min',
    status: 'active', isPopular: true, isChefSpecial: true, stock: 6, createdAt: now(),
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
    status: 'active', isPopular: true, stock: 8, createdAt: now(),
  },
  {
    id: 'demo-croissant', name: 'Butter Croissant',
    category: 'Pastries', price: 1.25,
    description: 'Laminated with Normandy butter, 36-hour cold proof.',
    image: img('photo-1555507036-ab1f4038808a'), prepTime: '3 min',
    status: 'active', isPopular: true, stock: 48, createdAt: now(),
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
    status: 'active', isPopular: true, stock: 100, createdAt: now(),
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

export function addMenuItem(input: Omit<MenuItem, 'id' | 'createdAt'>): MenuItem {
  const item: MenuItem = { ...input, id: `p${Date.now().toString(36)}`, createdAt: Date.now() };
  store.patchLocal((cur) => [item, ...cur]);
  void write({ table: 'menu_items', op: 'insert', values: toRow(item) }).then(({ error }) => {
    if (error) console.error('[menu] add failed', error.message);
  });
  return item;
}

export function updateMenuItem(id: string, patch: Partial<Omit<MenuItem, 'id' | 'createdAt'>>) {
  store.patchLocal((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  void write({ table: 'menu_items', op: 'update', values: toRow(patch), match: { id: id } }).then(({ error }) => {
    if (error) console.error('[menu] update failed', error.message);
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
