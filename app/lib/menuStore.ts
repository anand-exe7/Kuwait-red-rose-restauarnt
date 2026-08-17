"use client";

export type MenuCategory = 'Starters' | 'Mains' | 'Desserts' | 'Drinks';

export const MENU_CATEGORIES: MenuCategory[] = ['Starters', 'Mains', 'Desserts', 'Drinks'];

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
  createdAt: number;
}

const STORAGE_KEY = 'cenexa_menu_v1';
const EVENT_NAME = 'cenexa-menu-updated';

const SEED_MENU: MenuItem[] = [
  {
    id: 'm1', name: 'Wagyu Steak A5', price: 85, category: 'Mains', prepTime: '20 min', status: 'active',
    description: 'Japanese A5 Wagyu served with truffle potato mash & seasonal asparagus.',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=400',
    isChefSpecial: true, isPopular: true, createdAt: Date.now(),
  },
  {
    id: 'm2', name: 'Truffle Tagliatelle', price: 42, category: 'Mains', prepTime: '15 min', status: 'active',
    description: 'Handmade pasta shaved with black Norcia truffle and aged parmigiano cream.',
    image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&q=80&w=400',
    isPopular: true, createdAt: Date.now(),
  },
  {
    id: 'm3', name: 'Maine Lobster Bisque', price: 28, category: 'Starters', prepTime: '10 min', status: 'active',
    description: 'Rich velvety lobster reduction garnished with tarragon oil & cognac drizzle.',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&q=80&w=400',
    isChefSpecial: true, createdAt: Date.now(),
  },
  {
    id: 'm4', name: 'Classic Caesar Salad', price: 18, category: 'Starters', prepTime: '8 min', status: 'active',
    description: 'Crisp romaine hearts, smoked pancetta croutons & shaved Parmigiano.',
    image: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&q=80&w=400',
    createdAt: Date.now(),
  },
  {
    id: 'm5', name: 'Artisanal Tiramisu', price: 14, category: 'Desserts', prepTime: '5 min', status: 'active',
    description: 'Espresso-soaked ladyfingers layering creamed mascarpone and dark cocoa.',
    image: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&q=80&w=400',
    isPopular: true, createdAt: Date.now(),
  },
  {
    id: 'm6', name: 'Barolo Red Wine 2018', price: 120, category: 'Drinks', prepTime: '3 min', status: 'active',
    description: 'Full-bodied Nebbiolo from Piedmont, Italy with notes of cherry & spice.',
    image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&q=80&w=400',
    createdAt: Date.now(),
  },
  {
    id: 'm7', name: 'Pan-Seared Salmon', price: 36, category: 'Mains', prepTime: '16 min', status: 'active',
    description: 'Wild Norwegian salmon with saffron risotto & lemon herb emulsion.',
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400',
    createdAt: Date.now(),
  },
  {
    id: 'm8', name: 'Spicy Arrabbiata', price: 24, category: 'Mains', prepTime: '12 min', status: 'active',
    description: 'Penne in fiery San Marzano tomato sauce, garlic, and fresh basil.',
    image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281270?auto=format&fit=crop&q=80&w=400',
    isSpicy: true, createdAt: Date.now(),
  },
  {
    id: 'm9', name: 'Smoked Berry Mocktail', price: 12, category: 'Drinks', prepTime: '4 min', status: 'active',
    description: 'Fresh blackberry, rosemary syrup, lime juice & sparkling soda.',
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400',
    createdAt: Date.now(),
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
