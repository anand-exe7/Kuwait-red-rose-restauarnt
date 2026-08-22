"use client";

// Restaurant tables, managed by the admin. Same localStorage + custom-event
// pattern as the menu/order stores so every role stays in sync. Each table's
// number is what a QR code encodes ( /customer?table=<number> ).

export interface RestaurantTable {
  id: string;
  number: number;
  label: string;   // friendly name, e.g. "Window 1"
  seats: number;
  zone: string;    // e.g. "Indoor", "Terrace"
  active: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'cenexa_tables_v1';
const EVENT_NAME = 'cenexa-tables-updated';
const EMPTY: RestaurantTable[] = [];

const SEED: RestaurantTable[] = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i + 1}`,
  number: i + 1,
  label: `Table ${i + 1}`,
  seats: 4,
  zone: 'Indoor',
  active: true,
  createdAt: Date.now() + i,
}));

let cachedRaw: string | null | undefined;
let cached: RestaurantTable[] = EMPTY;

function read(): RestaurantTable[] {
  if (typeof window === 'undefined') return EMPTY;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === null) {
    write(SEED);
    return cached;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = JSON.parse(raw);
  } catch {
    cached = EMPTY;
  }
  return cached;
}

function write(tables: RestaurantTable[]) {
  cachedRaw = JSON.stringify(tables);
  cached = tables;
  window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getTablesSnapshot(): RestaurantTable[] {
  return read();
}
export function getTablesServerSnapshot(): RestaurantTable[] {
  return EMPTY;
}

/** Sorted by table number for stable display. */
export function getTables(): RestaurantTable[] {
  return [...read()].sort((a, b) => a.number - b.number);
}

export function addTable(input: Omit<RestaurantTable, 'id' | 'createdAt'>): RestaurantTable {
  const tables = read();
  const table: RestaurantTable = {
    ...input,
    id: `t${Date.now().toString(36)}`,
    createdAt: Date.now(),
  };
  write([...tables, table]);
  return table;
}

export function updateTable(id: string, patch: Partial<Omit<RestaurantTable, 'id' | 'createdAt'>>) {
  write(read().map(t => (t.id === id ? { ...t, ...patch } : t)));
}

export function deleteTable(id: string) {
  write(read().filter(t => t.id !== id));
}

/** True if a table number is already taken by another table. */
export function isNumberTaken(num: number, exceptId?: string): boolean {
  return read().some(t => t.number === num && t.id !== exceptId);
}

export function subscribeToTables(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener('storage', handler);
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(EVENT_NAME, handler);
  };
}
