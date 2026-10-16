"use client";

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Client-side paging for lists that are already loaded in memory.
 * `resetKey` (e.g. the active filters) sends you back to page 1 when it changes.
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey: string = '') {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const requested = state.key === resetKey ? state.page : 1;
  const page = Math.min(Math.max(1, requested), pages);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pages,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
    setPage: (p: number) => setState({ key: resetKey, page: Math.min(Math.max(1, p), pages) }),
  };
}

type PageState = ReturnType<typeof usePagination>;

/** Compact "1–12 of 48 · ‹ 1 2 3 ›" footer. Renders nothing for a single page. */
export function Pagination({ p, label = 'items', dark = false }: { p: Pick<PageState, 'page' | 'pages' | 'total' | 'from' | 'to' | 'setPage'>; label?: string; dark?: boolean }) {
  if (p.pages <= 1) return null;

  // Show first, last, and a window around the current page.
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= p.pages; i++) {
    if (i === 1 || i === p.pages || Math.abs(i - p.page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }

  const btn = `min-w-9 h-9 px-2 rounded-lg text-xs font-bold border flex items-center justify-center transition-colors ${dark ? 'border-white/10 text-white' : 'border-black/10'}`;
  const hover = dark ? 'hover:bg-white/10' : 'hover:bg-black/5';
  return (
    <nav aria-label="Pagination" className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t ${dark ? 'border-white/5' : 'border-black/5'}`}>
      <p className={`text-xs font-bold ${dark ? 'text-gray-400' : 'text-black/50'}`}>
        {p.from}–{p.to} of {p.total} {label}
      </p>
      <div className="flex items-center gap-1">
        <button aria-label="Previous page" disabled={p.page === 1} onClick={() => p.setPage(p.page - 1)} className={`${btn} disabled:opacity-30 ${hover}`}>
          <ChevronLeft size={16} />
        </button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-black/30">…</span>
          ) : (
            <button
              key={n}
              aria-current={n === p.page ? 'page' : undefined}
              onClick={() => p.setPage(n)}
              className={`${btn} ${n === p.page ? 'bg-brand-red text-white border-brand-red' : hover}`}
            >
              {n}
            </button>
          )
        )}
        <button aria-label="Next page" disabled={p.page === p.pages} onClick={() => p.setPage(p.page + 1)} className={`${btn} disabled:opacity-30 ${hover}`}>
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
