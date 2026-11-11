"use client";

// Stock movements — where every box went.
//
// One row per change to a stock count, newest first: an accepted order takes
// stock off the shelf, the Inventory +/- and stock counts put it back or
// correct it. Filter it, read the totals, download it as Excel.
//
// Needs supabase/stock_movements.sql; without it the page says so instead of
// showing an empty table with no explanation.

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  MOVEMENT_LABEL,
  getStockMovements,
  getStockMovementsServerSnapshot,
  getStockMovementsSnapshot,
  subscribeToStockMovements,
  type MovementKind,
  type StockMovement,
} from "../../lib/stockStore";
import { downloadXlsx } from "../../lib/xlsx";
import { useAdmin } from "./Store";
import { rupee } from "./money";
import {
  Badge,
  Btn,
  Card,
  DateRange,
  Empty,
  Icon,
  Kpi,
  Page,
  PageHead,
  Pills,
  SearchBox,
  cx,
  fmtDateTime,
  type BadgeTone,
} from "./kit";

type KindFilter = "all" | MovementKind;

const KIND_TONE: Record<MovementKind, BadgeTone> = {
  sale: "sky",
  restock: "green",
  adjust: "slate",
  waste: "red",
  return: "amber",
};

const startOfDay = (d: string) => new Date(`${d}T00:00:00`).getTime();
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999`).getTime();
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function StockPage() {
  const { s } = useAdmin();
  const all = useSyncExternalStore(subscribeToStockMovements, getStockMovementsSnapshot, getStockMovementsServerSnapshot);
  // Kick the first fetch off (the snapshot above is read-only).
  useMemo(() => getStockMovements(), []);

  const [kind, setKind] = useState<KindFilter>("all");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const a = startOfDay(from);
    const b = endOfDay(to);
    const needle = q.trim().toLowerCase();
    return all
      .filter((m) => m.createdAt >= a && m.createdAt <= b)
      .filter((m) => kind === "all" || m.kind === kind)
      .filter((m) => !needle || `${m.productName} ${m.orderId ?? ""} ${m.reason} ${m.actor}`.toLowerCase().includes(needle))
      .sort((x, y) => y.createdAt - x.createdAt);
  }, [all, from, to, kind, q]);

  const stats = useMemo(() => {
    const sum = (f: (m: StockMovement) => boolean) => rows.filter(f).reduce((n, m) => n + Math.abs(m.qty), 0);
    const sold = sum((m) => m.kind === "sale");
    return {
      sold,
      added: sum((m) => m.kind === "restock"),
      wasted: sum((m) => m.kind === "waste"),
      net: rows.reduce((n, m) => n + m.qty, 0),
      revenue: rows.filter((m) => m.kind === "sale").reduce((n, m) => n + (m.value ?? 0), 0),
    };
  }, [rows]);

  /** Per-product summary — the "what is actually moving" view. */
  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; sold: number; added: number; wasted: number; net: number; value: number }>();
    for (const m of rows) {
      const cur = map.get(m.productId) ?? { name: m.productName, sold: 0, added: 0, wasted: 0, net: 0, value: 0 };
      if (m.kind === "sale") cur.sold += Math.abs(m.qty);
      else if (m.kind === "restock") cur.added += Math.abs(m.qty);
      else if (m.kind === "waste") cur.wasted += Math.abs(m.qty);
      cur.net += m.qty;
      cur.value += m.kind === "sale" ? m.value ?? 0 : 0;
      map.set(m.productId, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v, stock: s.products.find((p) => p.id === id)?.stock ?? null }))
      .sort((a, b) => b.sold - a.sold);
  }, [rows, s.products]);

  const exportXlsx = () => {
    const movements = [
      ["Date & time", "Product", "Movement", "Qty", "Stock before", "Stock after", "Value (KD)", "Order", "Who", "Reason"],
      ...rows.map((m) => [
        fmtDateTime(m.createdAt),
        m.productName,
        MOVEMENT_LABEL[m.kind],
        m.qty,
        m.beforeQty,
        m.afterQty,
        m.kind === "sale" ? m.value ?? 0 : null,
        m.orderId ?? "",
        m.actor,
        m.reason,
      ]),
    ];
    const summary = [
      ["Product", "Sold", "Added", "Wasted", "Net change", "Sales value (KD)", "In stock now"],
      ...byProduct.map((p) => [p.name, p.sold, p.added, p.wasted, p.net, Math.round(p.value * 1000) / 1000, p.stock]),
    ];
    downloadXlsx(`stock-movements-${from}-to-${to}`, [
      { name: "Movements", rows: movements },
      { name: "By product", rows: summary },
    ]);
  };

  const ledgerMissing = all.length === 0;

  return (
    <Page>
      <PageHead
        title="Stock movements"
        sub="Every box in and out, with the order that took it. Stock comes off the moment you accept an order."
        right={
          <Btn kind="soft" icon="download" onClick={exportXlsx} disabled={!rows.length}>
            Download Excel
          </Btn>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Sold" value={stats.sold} hint="units off the shelf" icon="bag" tone="sky" small />
        <Kpi label="Added" value={stats.added} hint="restocked" icon="plus" tone="emerald" small />
        <Kpi label="Wasted" value={stats.wasted} hint="thrown / broken" icon="trash" tone="red" small />
        <Kpi label="Net change" value={stats.net > 0 ? `+${stats.net}` : stats.net} hint="in this period" icon="chart" tone="violet" small />
        <Kpi label="Sales value" value={rupee(stats.revenue)} hint="at menu price" icon="rupee" tone="amber" small />
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Pills
          label="Movement"
          value={kind}
          onChange={setKind}
          options={[
            { v: "all", t: "All" },
            { v: "sale", t: "Sold" },
            { v: "return", t: "Returned" },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search product, ticket, who…" className="w-full sm:w-64" />
      </div>

      {!rows.length ? (
        <Empty icon="list" title={ledgerMissing ? "No stock ledger yet" : "Nothing moved in this period"}>
          {ledgerMissing ? (
            <>Stock movements aren&rsquo;t being recorded yet. Once they are, every sale, restock and correction shows up here.</>
          ) : (
            <>Widen the dates, or clear the filters.</>
          )}
        </Empty>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <Card title={`Movements · ${rows.length}`}>
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Movement</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2 pr-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{fmtDateTime(m.createdAt)}</td>
                      <td className="py-2 pr-3 font-semibold text-slate-800">{m.productName || m.productId}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={KIND_TONE[m.kind]}>{MOVEMENT_LABEL[m.kind]}</Badge>
                      </td>
                      <td className={cx("adm-num py-2 pr-3 text-right font-extrabold", m.qty < 0 ? "text-red-600" : "text-emerald-600")}>
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </td>
                      <td className="adm-num whitespace-nowrap py-2 pr-3 text-right text-slate-500">
                        {m.beforeQty === null ? "—" : `${m.beforeQty} → ${m.afterQty}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 300 && (
                <p className="pt-3 text-[12px] text-slate-400">
                  Showing the latest 300 of {rows.length}. The Excel download has every row.
                </p>
              )}
            </div>
          </Card>

          <Card title="By product">
            <ul className="flex flex-col gap-2">
              {byProduct.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] text-slate-800">{p.name}</b>
                    <span className="text-[11.5px] text-slate-500">
                      {p.sold} sold
                      {p.added ? ` · ${p.added} added` : ""}
                      {p.wasted ? ` · ${p.wasted} wasted` : ""}
                    </span>
                  </div>
                  <span className="shrink-0 text-right">
                    <b className={cx("adm-num block text-[13px]", p.net < 0 ? "text-red-600" : "text-emerald-600")}>
                      {p.net > 0 ? `+${p.net}` : p.net}
                    </b>
                    <span className="adm-num block text-[11px] text-slate-400">
                      {p.stock === null ? "untracked" : `${p.stock} left`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-500">
              <Icon name="box" size={14} className="mt-0.5 shrink-0" />
              <span>
                Change a count in{" "}
                <Link href="/admin-secure-portal-xyz-345/inventory" className="font-bold text-red-600 hover:underline">
                  Inventory
                </Link>{" "}
                and it shows up here as &ldquo;Corrected&rdquo; or &ldquo;Added&rdquo;, with your name on it.
              </span>
            </p>
          </Card>
        </div>
      )}
    </Page>
  );
}
