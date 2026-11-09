"use client";

// Delivery — where we deliver, and what it costs by WEIGHT.
//
// Each area has a list of weight brackets: 0–500 g costs this, 500 g–1 kg costs
// that. The checkout adds up the weight of the basket (each product's weight
// comes from Inventory), finds the bracket and charges that fee. An area with
// no brackets charges its flat fee, exactly as before.
//
// Nothing else lives here on purpose. A delivery's kitchen life (accept → cook
// → ready → bill → hand to the driver) is Online orders, Open tabs and the
// waiter board; a second board for the same orders only splits attention.

import { useCallback, useEffect, useState } from "react";
import type { DeliveryArea, WeightTier } from "../../lib/delivery/shared";
import { useAdmin } from "./Store";
import { staffCall } from "./staffApi";
import { Badge, Btn, Card, Icon, Page, PageHead, cx, inputCls, labelCls } from "./kit";

/** A bracket being edited. Values stay strings so typing "0." works. */
interface TierDraft {
  minG: string;
  maxG: string;
  fee: string;
}

/** An area being edited. */
interface Draft {
  id: string | null;
  name: string;
  fee: string;
  minOrder: string;
  active: boolean;
  sort: number;
  tiers: TierDraft[];
}

const toDraft = (a: DeliveryArea): Draft => ({
  id: a.id,
  name: a.name,
  fee: String(a.fee),
  minOrder: a.minOrder === null ? "" : String(a.minOrder),
  active: a.active,
  sort: a.sort,
  tiers: (a.tiers ?? []).map((t) => ({
    minG: String(t.minG),
    maxG: t.maxG === null ? "" : String(t.maxG),
    fee: String(t.fee),
  })),
});

const toTiers = (rows: TierDraft[]): WeightTier[] =>
  rows
    .filter((t) => t.minG.trim() !== "" || t.maxG.trim() !== "" || t.fee.trim() !== "")
    .map((t) => ({
      minG: Number(t.minG || 0),
      maxG: t.maxG.trim() === "" ? null : Number(t.maxG),
      fee: Number(t.fee || 0),
    }))
    .sort((a, b) => a.minG - b.minG);

/** The gaps and overlaps a human will otherwise find out about at checkout. */
function tierProblems(rows: TierDraft[]): string | null {
  const tiers = toTiers(rows);
  if (tiers.length === 0) return null;
  for (const t of tiers) {
    if (t.maxG !== null && t.maxG <= t.minG) return "Each bracket's max weight must be more than its min.";
    if (!Number.isFinite(t.fee) || t.fee < 0) return "A delivery fee can't be negative.";
  }
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1];
    if (prev.maxG === null) return "Only the last bracket can be left open-ended.";
    if (tiers[i].minG < prev.maxG) return "Two brackets overlap — fix the weights.";
  }
  return null;
}

export default function DeliveryPage() {
  const { toast, confirm } = useAdmin();
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);

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

  const head = (
    <PageHead
      title="Delivery areas & prices"
      sub="Where we deliver, and what it costs by weight. The checkout charges exactly what you set here."
    />
  );

  if (!rows)
    return (
      <Page>
        {head}
        <p className="py-10 text-center text-[13px] text-slate-400">Loading areas…</p>
      </Page>
    );

  // New rows have no id yet, so they are tracked by their position.
  const keyOf = (r: Draft, i: number) => r.id ?? `new-${i}`;
  const edit = (i: number, patch: Partial<Draft>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(new Set(dirty).add(keyOf(rows[i], i)));
  };
  const editTier = (i: number, k: number, patch: Partial<TierDraft>) =>
    edit(i, { tiers: rows[i].tiers.map((t, j) => (j === k ? { ...t, ...patch } : t)) });
  const addTier = (i: number) => {
    const cur = rows[i].tiers;
    const last = cur[cur.length - 1];
    // Start the new bracket where the last one ended — the common case.
    const from = last && last.maxG.trim() !== "" ? last.maxG : "";
    edit(i, { tiers: [...cur, { minG: from, maxG: "", fee: rows[i].fee || "1" }] });
  };
  const removeTier = (i: number, k: number) => edit(i, { tiers: rows[i].tiers.filter((_, j) => j !== k) });

  const save = async (i: number) => {
    const r = rows[i];
    const k = keyOf(r, i);
    const problem = tierProblems(r.tiers);
    if (problem) {
      toast({ kind: "err", title: problem });
      return;
    }
    setBusy(k);
    try {
      await staffCall("areas.save", {
        id: r.id ?? undefined,
        name: r.name,
        fee: Number(r.fee || 0),
        minOrder: r.minOrder.trim() === "" ? null : Number(r.minOrder),
        active: r.active,
        sort: r.sort,
        tiers: toTiers(r.tiers),
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

  const addRow = () => {
    setRows([...rows, { id: null, name: "", fee: "1", minOrder: "", active: true, sort: rows.length + 1, tiers: [] }]);
    setOpenArea(`new-${rows.length}`);
  };

  return (
    <Page>
      {head}

      {error && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {error} — apply <code>supabase/delivery_areas.sql</code> and{" "}
          <code>supabase/delivery_weight_tiers.sql</code> in the Supabase SQL editor to use per-area, per-weight pricing.
        </div>
      )}

      <Card title="Where we deliver, and what it costs">
        <p className="mb-4 text-[13px] leading-relaxed text-slate-500">
          A customer can only choose an area listed here. Add <b>weight brackets</b> to charge by how heavy the order is
          — the checkout adds up the weight of the basket (set each product&rsquo;s weight in Inventory) and charges the
          bracket it lands in. An area with no brackets charges its flat fee. Leave &ldquo;Min. order&rdquo; empty to use
          the general minimum, and switch an area off to hide it from customers without losing it.
        </p>

        {!rows.length && <p className="mb-4 text-[13px] text-slate-500">No areas yet — add your first one below.</p>}

        <div className="flex flex-col gap-3">
          {rows.map((r, i) => {
            const k = keyOf(r, i);
            const open = openArea === k;
            return (
              <div key={k} className={cx("rounded-2xl border", r.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50")}>
                <div className="grid grid-cols-2 items-end gap-3 p-3 sm:grid-cols-12">
                  <div className="col-span-2 sm:col-span-4">
                    <span className={labelCls}>Area name</span>
                    <input className={inputCls} value={r.name} onChange={(e) => edit(i, { name: e.target.value })} placeholder="For example Al Qurain" />
                  </div>
                  <div className="sm:col-span-2">
                    <span className={labelCls}>Flat fee (KD)</span>
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

                <button
                  type="button"
                  onClick={() => setOpenArea(open ? null : k)}
                  className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <Icon name="chevron" size={14} className={cx("transition-transform", open && "rotate-90")} />
                  Weight brackets
                  {r.tiers.length ? (
                    <Badge tone="green">{r.tiers.length} bracket{r.tiers.length === 1 ? "" : "s"}</Badge>
                  ) : (
                    <Badge tone="slate">flat fee</Badge>
                  )}
                </button>

                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                    <p className="mb-3 text-[12px] text-slate-500">
                      Weights are in grams. Leave the last bracket&rsquo;s <b>max</b> empty for &ldquo;and anything
                      heavier&rdquo;.
                    </p>

                    {r.tiers.length > 0 && (
                      <div className="mb-2 hidden grid-cols-12 gap-2 px-1 sm:grid">
                        <span className={cx(labelCls, "col-span-4 mb-0")}>Min weight (g)</span>
                        <span className={cx(labelCls, "col-span-4 mb-0")}>Max weight (g)</span>
                        <span className={cx(labelCls, "col-span-3 mb-0")}>Delivery fee (KD)</span>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      {r.tiers.map((t, tIdx) => (
                        <div key={tIdx} className="grid grid-cols-12 items-center gap-2">
                          <input
                            type="number" min="0" step="50"
                            className={cx(inputCls, "col-span-4")}
                            value={t.minG}
                            onChange={(e) => editTier(i, tIdx, { minG: e.target.value })}
                            placeholder="0"
                            aria-label={`Bracket ${tIdx + 1} minimum weight in grams`}
                          />
                          <input
                            type="number" min="0" step="50"
                            className={cx(inputCls, "col-span-4")}
                            value={t.maxG}
                            onChange={(e) => editTier(i, tIdx, { maxG: e.target.value })}
                            placeholder="and above"
                            aria-label={`Bracket ${tIdx + 1} maximum weight in grams`}
                          />
                          <input
                            type="number" min="0" step="0.05"
                            className={cx(inputCls, "col-span-3")}
                            value={t.fee}
                            onChange={(e) => editTier(i, tIdx, { fee: e.target.value })}
                            placeholder="1.000"
                            aria-label={`Bracket ${tIdx + 1} delivery fee`}
                          />
                          <button
                            type="button"
                            onClick={() => removeTier(i, tIdx)}
                            className="col-span-1 grid h-10 place-items-center rounded-xl text-red-600 hover:bg-red-50"
                            aria-label={`Remove bracket ${tIdx + 1}`}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {!r.tiers.length && (
                      <p className="text-[12.5px] text-slate-500">
                        No brackets — every delivery to {r.name || "this area"} costs the flat fee above.
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn kind="soft" icon="plus" size="sm" onClick={() => addTier(i)}>
                        Add weight bracket
                      </Btn>
                      <Btn kind="red" size="sm" disabled={busy === k || !r.name.trim()} onClick={() => save(i)}>
                        {busy === k ? "Saving…" : "Save brackets"}
                      </Btn>
                    </div>
                  </div>
                )}
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
