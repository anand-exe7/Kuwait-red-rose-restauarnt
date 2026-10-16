"use client";

// Menu items — now backed by Supabase + Realtime. The public API is unchanged
// from the old localStorage version, so UI components need no edits. Writes are
// optimistic (cache updates instantly) and the Realtime echo reconciles every
// device to the server's truth.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

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

export function getMenuItems(): MenuItem[] {
  store.ensureHydrated();
  return store.get();
}

export function getActiveMenuItems(): MenuItem[] {
  store.ensureHydrated();
  return store.get().filter((i) => i.status === 'active');
}

export function getMenuSnapshot(): MenuItem[] {
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
  return store.subscribe(callback);
}
