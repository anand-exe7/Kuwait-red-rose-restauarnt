"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleCustomers, getWholesaleCustomersSnapshot, getWholesaleCustomersServerSnapshot,
  subscribeToWholesaleProducts, getWholesaleProductsSnapshot, getWholesaleProductsServerSnapshot,
  subscribeToWholesalePrices, getWholesalePricesSnapshot, getWholesalePricesServerSnapshot,
  subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot,
  saveWholesaleCustomer, deleteWholesaleCustomer, setWholesalePrice,
  unitPriceLabel, priceId,
  type WholesaleCustomer,
} from "../../lib/wholesaleStore";
import { useAdmin } from "./Store";
import { rupee } from "./money";
import {
  Page, PageHead, Card, Btn, Field, Modal, Drawer, Badge, Empty, SearchBox, Icon, Kpi, fmtDate,
  inputCls, cx,
} from "./kit";

type Draft = { id?: string; name: string; phone: string; note: string };
const blank: Draft = { name: "", phone: "", note: "" };

export default function WholesaleCustomersPage() {
  const { toast, confirm } = useAdmin();
  const customers = useSyncExternalStore(subscribeToWholesaleCustomers, getWholesaleCustomersSnapshot, getWholesaleCustomersServerSnapshot);
  const products = useSyncExternalStore(subscribeToWholesaleProducts, getWholesaleProductsSnapshot, getWholesaleProductsServerSnapshot);
  const prices = useSyncExternalStore(subscribeToWholesalePrices, getWholesalePricesSnapshot, getWholesalePricesServerSnapshot);

  const bills = useSyncExternalStore(subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot);

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [pricing, setPricing] = useState<WholesaleCustomer | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, q]);

  const countFor = (id: string) => prices.filter((p) => p.customerId === id).length;

  /* What each saved customer has bought, matched by customer id. */
  const spend = useMemo(() => {
    const m = new Map<string, { total: number; bills: number; last: number }>();
    for (const b of bills) {
      if (!b.customerId) continue;
      const cur = m.get(b.customerId) ?? { total: 0, bills: 0, last: 0 };
      cur.total += b.total; cur.bills += 1; cur.last = Math.max(cur.last, b.createdAt);
      m.set(b.customerId, cur);
    }
    return m;
  }, [bills]);
  const withPrices = useMemo(() => new Set(prices.map((p) => p.customerId)).size, [prices]);
  const totalSpent = useMemo(() => [...spend.values()].reduce((a, v) => a + v.total, 0), [spend]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const res = await saveWholesaleCustomer(draft);
    setBusy(false);
    if (res.ok) { toast({ kind: "ok", title: draft.id ? "Customer updated" : "Customer added" }); setDraft(null); }
    else toast({ kind: "err", title: "Couldn't save", body: res.error });
  };

  const remove = async (c: WholesaleCustomer) => {
    if (!(await confirm({ title: "Delete customer?", body: `"${c.name}" and their special prices will be removed.`, ok: "Delete", danger: true }))) return;
    const res = await deleteWholesaleCustomer(c.id);
    if (res.ok) toast({ kind: "ok", title: "Customer deleted" });
    else toast({ kind: "err", title: "Couldn't delete", body: res.error });
  };

  return (
    <Page>
      <PageHead
        bar
        title="Wholesale customers"
        sub="Trade customers and the special prices you give them. No special price = they pay the wholesale price."
        right={<Btn kind="red" icon="plus" onClick={() => setDraft({ ...blank })}>Add customer</Btn>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi label="Customers" value={customers.length} icon="users" tone="violet" hint="In the customer book" />
        <Kpi label="With special prices" value={withPrices} icon="rupee" tone="amber" hint="Everyone else pays wholesale" />
        <Kpi label="Billed to them" value={rupee(totalSpent)} icon="billing" tone="emerald" hint="All time, saved customers" />
      </div>

      <div className="mb-4 max-w-sm">
        <SearchBox value={q} onChange={setQ} placeholder="Search name or phone…" />
      </div>

      {shown.length === 0 ? (
        <Empty icon="users" title={customers.length === 0 ? "No customers yet" : "Nothing matches"}>
          {customers.length === 0 ? "Add a trade customer to give them their own prices." : "Try a different search."}
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => {
            const n = countFor(c.id);
            const sp = spend.get(c.id);
            return (
              <Card key={c.id} className="transition hover:shadow-[0_6px_18px_-8px_rgba(15,23,42,.2)]">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-[16px] font-extrabold text-white shadow-[0_6px_14px_-6px_rgba(220,38,38,.8)]">
                    {(c.name.trim()[0] || "?").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <b className="block truncate text-[15px] text-slate-900">{c.name}</b>
                      <Badge tone={n ? "violet" : "slate"}>{n ? `${n} price${n === 1 ? "" : "s"}` : "Wholesale"}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12.5px] font-medium text-slate-600">{c.phone || <span className="text-slate-400">No phone</span>}</p>
                    {c.note && <p className="mt-1 truncate text-[12px] text-slate-400">{c.note}</p>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center">
                  <div>
                    <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400">Bills</span>
                    <b className="adm-num text-[14px] text-slate-900">{sp?.bills ?? 0}</b>
                  </div>
                  <div>
                    <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400">Billed</span>
                    <b className="adm-num text-[14px] text-slate-900">{rupee(sp?.total ?? 0)}</b>
                  </div>
                  <div>
                    <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400">Last order</span>
                    <b className="text-[12.5px] text-slate-900">{sp?.last ? fmtDate(sp.last) : "—"}</b>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
                  <Btn kind="soft" size="sm" icon="rupee" onClick={() => setPricing(c)}>Prices</Btn>
                  <Btn kind="ghost" size="sm" icon="edit" onClick={() => setDraft({ id: c.id, name: c.name, phone: c.phone, note: c.note })}>Edit</Btn>
                  <Btn kind="ghost" size="sm" icon="trash" onClick={() => remove(c)} aria-label="Delete" className="!px-2" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / edit customer */}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit customer" : "Add customer"}
        footer={
          <>
            <Btn onClick={() => setDraft(null)}>Cancel</Btn>
            <Btn kind="red" onClick={save} disabled={busy || !draft?.name.trim()}>{busy ? "Saving…" : "Save"}</Btn>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Name" required>
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Al Salam Café" autoFocus />
            </Field>
            <Field label="Phone" hint="Used to look the customer up on the billing screen.">
              <input className={inputCls} value={draft.phone} inputMode="tel" onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="e.g. 55512345" />
            </Field>
            <Field label="Note" hint="Optional.">
              <input className={inputCls} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. pays weekly" />
            </Field>
          </div>
        )}
      </Modal>

      {/* Per-customer special prices */}
      <PriceDrawer customer={pricing} onClose={() => setPricing(null)} products={products} prices={prices} onToast={toast} />
    </Page>
  );
}

function PriceDrawer({
  customer, onClose, products, prices, onToast,
}: {
  customer: WholesaleCustomer | null;
  onClose: () => void;
  products: ReturnType<typeof getWholesaleProductsSnapshot>;
  prices: ReturnType<typeof getWholesalePricesSnapshot>;
  onToast: ReturnType<typeof useAdmin>["toast"];
}) {
  const [q, setQ] = useState("");
  const [onlySet, setOnlySet] = useState(false);
  // Local text per product so typing feels smooth; "" means no override.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  if (!customer) return null;

  const savedPrice = (productId: string) => prices.find((pr) => pr.id === priceId(customer.id, productId));
  const setCount = products.filter((p) => savedPrice(p.id)).length;

  const list = products
    .filter((p) => p.active)
    .filter((p) => !onlySet || savedPrice(p.id))
    .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const commit = async (productId: string, raw: string) => {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : parseFloat(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    const cur = savedPrice(productId);
    // Nothing actually changed — don't flash "saved".
    if ((cur?.price ?? null) === value) return;
    const res = await setWholesalePrice(customer.id, productId, value);
    if (!res.ok) { onToast({ kind: "err", title: "Couldn't save price", body: res.error }); return; }
    setSaved(productId);
    setTimeout(() => setSaved((s) => (s === productId ? null : s)), 1400);
  };

  const clear = (productId: string) => {
    setEdits((s) => ({ ...s, [productId]: "" }));
    void commit(productId, "");
  };

  return (
    <Drawer open={!!customer} onClose={onClose}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-bold text-slate-900">{customer.name}</h2>
          <p className="text-[12px] text-slate-500">{setCount} special price{setCount === 1 ? "" : "s"} set · leave blank to use wholesale</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder="Search products…" /></div>
          <button
            type="button"
            onClick={() => setOnlySet((v) => !v)}
            className={cx("h-10 shrink-0 rounded-full border px-3 text-[12px] font-bold transition", onlySet ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50")}
          >
            {onlySet ? "Showing set" : "Only set"}
          </button>
        </div>

        {list.length === 0 ? (
          <Empty icon="box" title={products.length === 0 ? "No products" : "Nothing here"}>
            {products.length === 0 ? "Add products in Wholesale inventory first." : onlySet ? "No special prices set yet." : "Try a different search."}
          </Empty>
        ) : (
          <div className="space-y-2">
            {list.map((p) => {
              const sp = savedPrice(p.id);
              const overridden = !!sp;
              const value = edits[p.id] ?? (sp ? String(sp.price) : "");
              const justSaved = saved === p.id;
              return (
                <div key={p.id} className={cx("rounded-xl border p-3 transition", overridden ? "border-violet-200 bg-violet-50/40" : "border-slate-100")}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] text-slate-800">{p.name}</b>
                      <span className="text-[11px] text-slate-400">Wholesale {rupee(p.wholesalePrice)} · {unitPriceLabel(p.unit)}</span>
                    </div>
                    <div className="relative shrink-0">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">KD</span>
                      <input
                        className={cx(
                          "h-10 w-32 rounded-xl border bg-white pl-7 pr-7 text-[13.5px] font-semibold text-slate-900 outline-none transition focus:border-slate-400",
                          overridden ? "border-violet-300" : "border-slate-200",
                        )}
                        type="number" min={0} step="0.001" inputMode="decimal"
                        value={value}
                        placeholder={p.wholesalePrice.toFixed(3)}
                        onChange={(e) => setEdits((s) => ({ ...s, [p.id]: e.target.value }))}
                        onBlur={(e) => commit(p.id, e.target.value)}
                      />
                      {overridden && (
                        <button type="button" onClick={() => clear(p.id)} className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Clear special price">
                          <Icon name="x" size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between pl-0.5">
                    <span className={cx("text-[11px] font-semibold", overridden ? "text-violet-600" : "text-slate-400")}>
                      {overridden ? "Special price" : "Uses wholesale price"}
                    </span>
                    {justSaved && <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><Icon name="check" size={12} /> Saved</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
}
