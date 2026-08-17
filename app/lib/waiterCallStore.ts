"use client";

export interface WaiterCall {
  id: string;
  table: number;
  createdAt: number;
  resolved: boolean;
}

const STORAGE_KEY = 'cenexa_waiter_calls_v1';
const EVENT_NAME = 'cenexa-waiter-calls-updated';
const EMPTY_CALLS: WaiterCall[] = [];

let cachedRaw: string | null | undefined;
let cachedCalls: WaiterCall[] = EMPTY_CALLS;

function readCalls(): WaiterCall[] {
  if (typeof window === 'undefined') return EMPTY_CALLS;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_CALLS;
  }
  if (raw === cachedRaw) return cachedCalls;
  cachedRaw = raw;
  try {
    cachedCalls = raw ? JSON.parse(raw) : EMPTY_CALLS;
  } catch {
    cachedCalls = EMPTY_CALLS;
  }
  return cachedCalls;
}

function writeCalls(calls: WaiterCall[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(calls));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getWaiterCallsSnapshot(): WaiterCall[] {
  return readCalls();
}

export function getWaiterCallsServerSnapshot(): WaiterCall[] {
  return EMPTY_CALLS;
}

/** Call for a table — reuses any existing unresolved call for that table instead of stacking duplicates. */
export function callWaiter(table: number): WaiterCall {
  const calls = readCalls();
  const existing = calls.find(c => c.table === table && !c.resolved);
  if (existing) return existing;
  const newCall: WaiterCall = { id: `WC-${Date.now().toString(36)}`, table, createdAt: Date.now(), resolved: false };
  writeCalls([newCall, ...calls]);
  return newCall;
}

export function resolveWaiterCall(id: string) {
  writeCalls(readCalls().map(c => (c.id === id ? { ...c, resolved: true } : c)));
}

export function subscribeToWaiterCalls(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener('storage', handler);
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(EVENT_NAME, handler);
  };
}
