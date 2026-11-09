"use client";

// Delivery — the areas we deliver to and what each one costs.
//
// The customer menu reads the very same table, so a price changed here is the
// price charged at checkout, and an area switched off disappears from the
// checkout immediately.
//
// Nothing else lives here on purpose. A delivery's kitchen life (accept → cook
// → ready → bill → hand to the driver) is Online orders, Open tabs and the
// waiter board; having a second board for the same orders only split people's
// attention.

import { useCallback, useEffect, useState } from "react";
import type { DeliveryArea } from "../../lib/delivery/shared";
import { useAdmin } from "./Store";
import { staffCall } from "./staffApi";
import { Btn, Card, Icon, Page, PageHead, cx, inputCls, labelCls } from "./kit";

/* --------------------------------- zones -------------------------------- */

/** A row being edited. `fee` / `minOrder` stay strings so typing "0." works. */
interface Draft {
  id: string | null;
  name: string;
  fee: string;
  minOrder: string;
  active: boolean;
  sort: number;
}

const toDraft = (a: DeliveryArea): Draft => ({
  id: a.id,
  name: a.name,
  fee: String(a.fee),
  minOrder: a.minOrder === null ? "" : String(a.minOrder),
  active: a.active,
  sort: a.sort,
});

export default function DeliveryPage() {
  const { toast, confirm } = useAdmin();
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await staffCall<{ areas: DeliveryArea[] }>("areas.list");
    setRows(r.areas.map(toDraft));
    setDirty(new Set());
  }, []);

  useEffect(() => {
    let alive = true;
    // Deferred to a task so the state lands after this effect has run, not
    // synchronously inside it (which would cascade an extra render).
    const t = setTimeout(() => {
      load().catch((e: Error) => {
        if (alive) {
          setRows([]);
          setError(e.message);
        }
      });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [load]);

  if (!rows)
    return (
      <Page>
        <PageHead title="Delivery areas & prices" sub="Where we deliver and what each area costs." />
        <p className="py-10 text-center text-[13px] text-slate-400">Loading areas…</p>
      </Page>
    );

  // New rows have no id yet, so they are tracked by their position.
  const keyOf = (r: Draft, i: number) => r.id ?? `new-${i}`;
  const edit = (i: number, patch: Partial<Draft>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(new Set(dirty).add(keyOf(rows[i], i)));
  };

  const save = async (i: number) => {
    const r = rows[i];
    const k = keyOf(r, i);
    setBusy(k);
    try {
      await staffCall("areas.save", {
        id: r.id ?? undefined,
        name: r.name,
        fee: Number(r.fee || 0),
        minOrder: r.minOrder.trim() === "" ? null : Number(r.minOrder),
        active: r.active,
        sort: r.sort,
      });
      await load();
      toast({ kind: "ok", title: `${r.name} saved.` });
    } catch (e) {
      toast({ kind: "err", title: (e as Error).message });
    }
    setBusy(null);
  };

  const remove = async (i: number) => {
    const r = rows[i];
    if (!r.id) {
      setRows(rows.filter((_, j) => j !== i));
      return;
    }
    const ok = await confirm({
      title: `Delete “${r.name}”?`,
      body: "Customers can no longer pick this area at checkout. Past orders keep the area name they were placed with.",
      ok: "Delete area",
      danger: true,
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await staffCall("areas.delete", { id: r.id });
      await load();
      toast({ kind: "ok", title: "Area deleted." });
    } catch (e) {
      toast({ kind: "err", title: (e as Error).message });
    }
    setBusy(null);
  };

  const addRow = () => setRows([...rows, { id: null, name: "", fee: "1", minOrder: "", active: true, sort: rows.length + 1 }]);

  return (
    <Page>
      <PageHead
        title="Delivery areas & prices"
        sub="Where we deliver and what each area costs. The checkout charges exactly what you set here."
      />
      {error && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {error} — apply <code>supabase/delivery_areas.sql</code> in the Supabase SQL editor to use per-area pricing.
        </div>
      )}
      <Card title="Where we deliver, and what it costs">
        <p className="mb-4 text-[13px] text-slate-500">
          A customer can only choose delivery to an area listed here, and the fee below is the fee they are charged at
          checkout. Fee <b>0</b> means free delivery to that area; leave “Min. order” empty to use the general minimum.
          Switch an area off to hide it from customers without losing it.
        </p>

        {!rows.length && <p className="mb-4 text-[13px] text-slate-500">No areas yet — add your first one below.</p>}

        <div className="flex flex-col gap-3">
          {rows.map((r, i) => {
            const k = keyOf(r, i);
            return (
              <div
                key={k}
                className={cx(
                  "grid grid-cols-2 items-end gap-3 rounded-2xl border p-3 sm:grid-cols-12",
                  r.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50",
                )}
              >
                <div className="col-span-2 sm:col-span-4">
                  <span className={labelCls}>Area name</span>
                  <input className={inputCls} value={r.name} onChange={(e) => edit(i, { name: e.target.value })} placeholder="For example Al Qurain" />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelCls}>Fee (KD)</span>
                  <input type="number" step="0.05" min="0" className={inputCls} value={r.fee} onChange={(e) => edit(i, { fee: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelCls}>Min. order</span>
                  <input type="number" step="0.5" min="0" className={inputCls} value={r.minOrder} onChange={(e) => edit(i, { minOrder: e.target.value })} placeholder="general" />
                </div>
                <label className="flex items-center gap-2 pb-3 text-[13px] font-semibold text-slate-700 sm:col-span-1">
                  <input type="checkbox" checked={r.active} onChange={(e) => edit(i, { active: e.target.checked })} /> On
                </label>
                <div className="col-span-2 flex justify-end gap-2 sm:col-span-3">
                  <Btn kind={dirty.has(k) || !r.id ? "red" : "ghost"} disabled={busy === k || !r.name.trim()} onClick={() => save(i)}>
                    {busy === k ? "Saving…" : r.id ? "Save" : "Add area"}
                  </Btn>
                  <Btn kind="plain" className="text-red-600" disabled={busy === k} onClick={() => remove(i)} aria-label={`Delete ${r.name || "area"}`}>
                    <Icon name="trash" size={16} />
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>

        <Btn kind="soft" icon="plus" className="mt-4" onClick={addRow}>
          Add area
        </Btn>
      </Card>
    </Page>
  );
}
