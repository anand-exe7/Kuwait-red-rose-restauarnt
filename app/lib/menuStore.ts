"use client";

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
  stock?: number;              // units in stock
  lowStockThreshold?: number;  // warn at/below this
  sku?: string;                // stock keeping unit / code
  cost?: number;               // cost price (KD) for margin/value reporting
  createdAt: number;
}

const STORAGE_KEY = 'cenexa_menu_v3';
const EVENT_NAME = 'cenexa-menu-updated';

const SEED_MENU: MenuItem[] = [
  {
    id: 'm1', name: 'Assorted Baklava Box', price: 3.5, category: 'Arabic Sweets', prepTime: '5 min', status: 'active',
    description: 'A dozen layered filo pieces with pistachio, walnut & cashew, soaked in rose syrup.',
    image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?auto=format&fit=crop&q=80&w=400',
    isChefSpecial: true, isPopular: true, sku: 'AS-BKL', stock: 40, lowStockThreshold: 10, cost: 1.8, createdAt: Date.now(),
  },
  {
    id: 'm2', name: 'Kunafa Nabulsia', price: 2.75, category: 'Arabic Sweets', prepTime: '8 min', status: 'active',
    description: 'Warm shredded pastry over molten Nabulsi cheese, topped with pistachio & syrup.',
    image: 'https://images.unsplash.com/photo-1610508500445-a4592435e27e?auto=format&fit=crop&q=80&w=400',
    isPopular: true, sku: 'AS-KNF', stock: 25, lowStockThreshold: 8, cost: 1.3, createdAt: Date.now(),
  },
  {
    id: 'm3', name: 'Maamoul (Dates)', price: 2.25, category: 'Arabic Sweets', prepTime: '3 min', status: 'active',
    description: 'Semolina shortbread filled with spiced date paste — six pieces per box.',
    image: 'https://images.unsplash.com/photo-1600617953089-e2f0d5b7f0b8?auto=format&fit=crop&q=80&w=400',
    sku: 'AS-MML', stock: 30, lowStockThreshold: 10, cost: 1.0, createdAt: Date.now(),
  },
  {
    id: 'm4', name: 'Luqaimat', price: 1.75, category: 'Arabic Sweets', prepTime: '6 min', status: 'active',
    description: 'Golden crisp dough dumplings drizzled with date syrup and sesame.',
    image: 'https://images.unsplash.com/photo-1666181733257-6e2f0f2f0f5b?auto=format&fit=crop&q=80&w=400',
    sku: 'AS-LQM', stock: 50, lowStockThreshold: 12, cost: 0.6, createdAt: Date.now(),
  },
  {
    id: 'm5', name: 'Red Rose Signature Cake', price: 6.5, category: 'Cakes', prepTime: '5 min', status: 'active',
    description: 'Rose-infused sponge, white chocolate cream and a hand-piped rose finish.',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=400',
    isChefSpecial: true, isPopular: true, sku: 'CK-RRS', stock: 12, lowStockThreshold: 4, cost: 3.2, createdAt: Date.now(),
  },
  {
    id: 'm6', name: 'Chocolate Fudge Slice', price: 1.25, category: 'Cakes', prepTime: '3 min', status: 'active',
    description: 'Dense triple-chocolate fudge cake with a glossy ganache glaze.',
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&q=80&w=400',
    isPopular: true, sku: 'CK-CHF', stock: 20, lowStockThreshold: 6, cost: 0.5, createdAt: Date.now(),
  },
  {
    id: 'm7', name: 'New York Cheesecake', price: 1.5, category: 'Cakes', prepTime: '3 min', status: 'active',
    description: 'Creamy baked cheesecake on a buttery biscuit base with berry compote.',
    image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&q=80&w=400',
    sku: 'CK-NYC', stock: 18, lowStockThreshold: 6, cost: 0.6, createdAt: Date.now(),
  },
  {
    id: 'm8', name: 'Butter Croissant', price: 0.75, category: 'Pastries', prepTime: '2 min', status: 'active',
    description: 'Flaky all-butter croissant baked fresh every morning.',
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=400',
    isPopular: true, sku: 'PS-CRS', stock: 60, lowStockThreshold: 15, cost: 0.25, createdAt: Date.now(),
  },
  {
    id: 'm9', name: 'Date Roll', price: 1.0, category: 'Pastries', prepTime: '2 min', status: 'active',
    description: 'Soft pastry spiral filled with premium Kuwaiti dates and cardamom.',
    image: 'https://images.unsplash.com/photo-1509365465985-25d11c17e812?auto=format&fit=crop&q=80&w=400',
    sku: 'PS-DTR', stock: 35, lowStockThreshold: 10, cost: 0.4, createdAt: Date.now(),
  },
  {
    id: 'm10', name: 'Cream Puff', price: 0.85, category: 'Pastries', prepTime: '2 min', status: 'active',
    description: 'Light choux pastry filled with vanilla custard cream.',
    image: 'https://images.unsplash.com/photo-1587244141930-3d3bf0f0c1e5?auto=format&fit=crop&q=80&w=400',
    sku: 'PS-CRP', stock: 28, lowStockThreshold: 8, cost: 0.3, createdAt: Date.now(),
  },
  {
    id: 'm11', name: 'Arabic Coffee (Gahwa)', price: 0.75, category: 'Drinks', prepTime: '3 min', status: 'active',
    description: 'Traditional cardamom-spiced Arabic coffee, served with dates.',
    image: 'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?auto=format&fit=crop&q=80&w=400',
    sku: 'DR-GHW', stock: 100, lowStockThreshold: 20, cost: 0.2, createdAt: Date.now(),
  },
  {
    id: 'm12', name: 'Karak Tea', price: 0.5, category: 'Drinks', prepTime: '3 min', status: 'active',
    description: 'Rich spiced milk tea brewed the Kuwaiti way.',
    image: 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&q=80&w=400',
    isPopular: true, sku: 'DR-KRK', stock: 100, lowStockThreshold: 20, cost: 0.15, createdAt: Date.now(),
  },
  {
    id: 'm13', name: 'Rose Lemonade', price: 1.5, category: 'Drinks', prepTime: '4 min', status: 'active',
    description: 'Fresh lemonade with a splash of rose water and mint.',
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400',
    sku: 'DR-RSL', stock: 40, lowStockThreshold: 10, cost: 0.5, createdAt: Date.now(),
  },
];

const EMPTY_MENU: MenuItem[] = [];
let cachedRaw: string | null | undefined;
let cachedMenu: MenuItem[] = EMPTY_MENU;

function readMenu(): MenuItem[] {
  if (typeof window === 'undefined') return EMPTY_MENU;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_MENU;
  }
  if (raw === null) {
    // First visit — seed with the starter menu so the app isn't empty out of the box
    writeMenu(SEED_MENU);
    return cachedMenu;
  }
  if (raw === cachedRaw) return cachedMenu;
  cachedRaw = raw;
  try {
    cachedMenu = JSON.parse(raw);
  } catch {
    cachedMenu = EMPTY_MENU;
  }
  return cachedMenu;
}

function writeMenu(items: MenuItem[]) {
  cachedRaw = JSON.stringify(items);
  cachedMenu = items;
  window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getMenuItems(): MenuItem[] {
  return readMenu();
}

export function getActiveMenuItems(): MenuItem[] {
  return readMenu().filter(i => i.status === 'active');
}

/** Stable snapshot for useSyncExternalStore. */
export function getMenuSnapshot(): MenuItem[] {
  return readMenu();
}

export function getMenuServerSnapshot(): MenuItem[] {
  return EMPTY_MENU;
}

export function addMenuItem(input: Omit<MenuItem, 'id' | 'createdAt'>): MenuItem {
  const items = readMenu();
  const newItem: MenuItem = {
    ...input,
    id: `p${Date.now().toString(36)}`,
    createdAt: Date.now(),
  };
  writeMenu([newItem, ...items]);
  return newItem;
}

export function updateMenuItem(id: string, patch: Partial<Omit<MenuItem, 'id' | 'createdAt'>>) {
  writeMenu(readMenu().map(i => (i.id === id ? { ...i, ...patch } : i)));
}

export function deleteMenuItem(id: string) {
  writeMenu(readMenu().filter(i => i.id !== id));
}

export function subscribeToMenu(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener('storage', handler);
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(EVENT_NAME, handler);
  };
}
