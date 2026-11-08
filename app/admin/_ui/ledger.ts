"use client";

// Red Rose doesn't keep a per-movement stock ledger. The Analytics page
// still asks for one, so this returns an empty shape so the page renders
// zeroes instead of crashing.

export type LedgerQuery = {
  from?: number | null;
  to?: number | null;
  type?: string;
  pid?: string;
  q?: string;
  page?: number;
  size?: number;
};

export interface LedgerStats {
  added: number;
  sold: number;
  removed: number;
  returned: number;
  adjusted: number;
  net: number;
}

export interface LedgerData {
  stats: LedgerStats;
  rows: never[];
  total: number;
}

const EMPTY: LedgerData = {
  stats: { added: 0, sold: 0, removed: 0, returned: 0, adjusted: 0, net: 0 },
  rows: [],
  total: 0,
};

export function useLedger(_query: LedgerQuery): { data: LedgerData; loading: boolean } {
  return { data: EMPTY, loading: false };
}
