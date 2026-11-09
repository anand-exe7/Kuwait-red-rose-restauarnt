"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminState, OrderItem, OrderMode, OrderSource, Product } from "./types";
import { rupee } from "./money";
import { useAdmin, whoIs } from "./Store";
import Catalog from "./Catalog";
import { Badge, Btn, Empty, Icon, Page, PageHead, cx, fmtTime } from "./kit";
import { resolveOrderNo } from "../../lib/invoice";

const minsSince = (t: number, now: number) => Math.max(0, Math.round((now - t) / 60000));

/** Each kind of tab gets its own colour, so a counter full of takeaway bags
 *  never gets confused with the tables. Violet = delivery, blue = takeaway,
 *  white = eat-in. */
const SKIN: Record<OrderMode, { label: string; icon: "bag" | "cart" | "tables" | "users"; chip: string; card: string; ring: string }> = {
  delivery: { label: "Delivery", icon: "cart", chip: "bg-violet-100 text-violet-800", card: "border-violet-300 bg-violet-50/70", ring: "ring-violet-400" },
  takeaway: { label: "Takeaway", icon: "bag", chip: "bg-sky-100 text-sky-800", card: "border-sky-300 bg-sky-50/70", ring: "ring-sky-400" },
  table: { label: "Dine-in", icon: "tables", chip: "bg-slate-100 text-slate-700", card: "border-slate-100 bg-white", ring: "ring-slate-900" },
  standing: { label: "Walk-in", icon: "users", chip: "bg-amber-100 text-amber-800", card: "border-amber-200 bg-amber-50/60", ring: "ring-amber-400" },
};

/** What to call this tab on screen: a home order is known by its order number,
 *  a table by its number, a walk-in by its name. */
function tabTitle(t: { mode: OrderMode; orderNo: string; guest: string; session: { tableNumber: number | null; standingLabel: string } }): string {
  if (t.mode === "takeaway" || t.mode === "delivery") return `${t.guest || "Guest"} · #${t.orderNo}`;
  if (t.mode === "standing") return t.session.standingLabel || t.guest || "Walk-in";
  return t.session.tableNumber != null ? `Table ${t.session.tableNumber}` : t.guest || "Guest";
}

/** The open tabs on the floor and the counter, newest need first. Lives
 *  outside the component so its return type can name the Tab shape the detail
 *  panel takes. */
function buildTabs(s: AdminState) {
  return s.sessions
    .filter((x) => x.status === "open" || x.status === "bill_requested")
    .map((sess) => {
      const sessOrders = s.orders.filter((o) => o.sessionId === sess.id && o.status !== "cancelled");
      const lines = mergeLinesBySource(sessOrders);
      const items = lines.reduce((a, i) => a + i.qty, 0);
      const total = lines.reduce((a, i) => a + i.price * i.qty, 0);
      const fresh = sessOrders.filter((o) => o.status === "new").length;
      const cooking = sessOrders.filter((o) => o.status === "preparing").length;
      const lastOrderAt = sessOrders.reduce((a, o) => Math.max(a, o.createdAt), 0);
      // The order's mode wins over the session's: sessions opened before
      // delivery had its own mode were all written as 'takeaway'.
      const mode: OrderMode = sessOrders[0]?.mode ?? sess.mode ?? "table";
      const home = mode === "takeaway" || mode === "delivery";
      const live = sessOrders.filter((o) => !o.billed);
      return {
        session: sess,
        mode,
        home,
        orders: sessOrders,
        lines,
        items,
        total,
        fresh,
        cooking,
        lastOrderAt,
        billRequested: sess.billRequestedAt !== null,
        billRequestedAt: sess.billRequestedAt,
        couponCode: sessOrders.map((o) => o.couponCode).find(Boolean) ?? null,
        discount: sessOrders.reduce((a, o) => a + (o.discount ?? 0), 0),
        deliveryFee: sessOrders.reduce((a, o) => a + (o.deliveryFee ?? 0), 0),
        // The remark the customer typed at checkout — the chef has it on the
        // ticket, and whoever bills it should see it too.
        note: sessOrders.map((o) => o.note).find(Boolean) ?? "",
        // Who this is. Older home sessions were opened before we stamped the
        // customer on them, so the order is the better source.
        guest: sess.customerName || sessOrders.map((o) => o.customerName).find(Boolean) || "",
        phone: sess.customerPhone || sessOrders.map((o) => o.customerPhone).find(Boolean) || "",
        awaitingApproval: live.some((o) => o.live === "awaiting_admin"),
        readyToBill: items > 0 && live.length > 0 && live.every((o) => o.live === "ready" || o.live === "served"),
        orderNo: resolveOrderNo({ sessionId: sess.id, createdAt: sess.openedAt }),
      };
    })
    // A takeaway/delivery order the admin has not accepted yet is not a tab
    // — it is still sitting in Online orders waiting to be let in.
    .filter((t) => !(t.home && t.awaitingApproval))
    // Cooked home orders stack on top: those are the ones where a customer is
    // standing at the counter (or a driver is idle) waiting on a bill. Then
    // tabs with new orders, then by most recent activity.
    .sort((a, b) => {
      // A session with nothing on it is a leftover (an order that never
      // landed, or a tab opened and abandoned). Keep it — it is the only
      // place staff can clear one — but always at the bottom.
      const aEmpty = a.items === 0 ? 1 : 0;
      const bEmpty = b.items === 0 ? 1 : 0;
      if (aEmpty !== bEmpty) return aEmpty - bEmpty;
      const aUrgent = a.home && a.readyToBill ? 1 : 0;
      const bUrgent = b.home && b.readyToBill ? 1 : 0;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      // Somebody is sitting there with their phone out waiting to pay.
      const aBill = a.billRequested ? 1 : 0;
      const bBill = b.billRequested ? 1 : 0;
      if (aBill !== bBill) return bBill - aBill;
      if (a.fresh !== b.fresh) return b.fresh - a.fresh;
      if (a.lastOrderAt !== b.lastOrderAt) return b.lastOrderAt - a.lastOrderAt;
      return a.session.openedAt - b.session.openedAt;
    });
}

type Tab = ReturnType<typeof buildTabs>[number];

/** Items on a tab, kept separate per `addedBy` role so the "Added by admin"
 *  / "Added by waiter" / customer badges stay accurate when the same item
 *  came in from different places. Same name+price+role are merged. */
type TabLine = OrderItem & { addedBy: OrderSource; firstAt: number };

function mergeLinesBySource(orders: { items: OrderItem[]; source: OrderSource; createdAt: number }[]): TabLine[] {
  const map = new Map<string, TabLine>();
  for (const o of orders) {
    for (const it of o.items) {
      const key = `${o.source}@@${it.name}@@${it.price}@@${it.notes ?? ""}`;
      const cur = map.get(key);
      if (cur) cur.qty += it.qty;
      else map.set(key, { ...it, addedBy: o.source, firstAt: o.createdAt });
    }
  }
  return [...map.values()].sort((a, b) => b.firstAt - a.firstAt);
}

/** Open tabs — the active guests, their items and the one place the admin can
 *  add more items to a tab, cancel it, or send it to Billing for finishing. */
export default function KitchenPage() {
  const { s, act, now, confirm, toast } = useAdmin();
  const [selId, setSelId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const tabs = useMemo(() => buildTabs(s), [s]);

  const selected = selId ? tabs.find((t) => t.session.id === selId) ?? null : tabs[0] ?? null;
  const activeId = selected?.session.id ?? null;

  const addItems = async (picks: { productId: string; qty: number }[]) => {
    if (!selected) return false;
    if (selected.home) {
      toast({ kind: "err", title: "A takeaway or delivery order can't have items added to it." });
      return false;
    }
    const items: OrderItem[] = [];
    for (const pick of picks) {
      const p = s.products.find((x) => x.id === pick.productId);
      if (!p) continue;
      items.push({ productId: p.id, name: p.name, price: p.price, qty: pick.qty });
    }
    if (!items.length) return false;
    setBusy(true);
    const r = await act("session.addItems", { sessionId: selected.session.id, items });
    setBusy(false);
    if (!r.ok) {
      toast({ kind: "err", title: r.error || "Couldn't add items." });
      return false;
    }
    toast({ kind: "ok", title: `Added ${items.length} item${items.length === 1 ? "" : "s"} to ${whoIs(selected.session)}'s tab.` });
    return true;
  };

  const cancelTab = async (t: (typeof tabs)[number]) => {
    if (!(await confirm({ title: `Cancel ${whoIs(t.session)}'s tab?`, body: "The tab closes with no bill. Any orders already prepared are still gone from the kitchen.", ok: "Cancel tab", danger: true }))) return;
    setBusy(true);
    const r = await act("session.cancel", { sessionId: t.session.id });
    setBusy(false);
    if (r.ok) {
      toast({ kind: "ok", title: `${whoIs(t.session)}'s tab cancelled.` });
      if (selId === t.session.id) setSelId(null);
    } else {
      toast({ kind: "err", title: r.error || "Couldn't cancel." });
    }
  };

  return (
    <Page>
      <PageHead
        title="Open tabs"
        sub="Everything the shop owes someone right now — tables, walk-ins and accepted online orders. Green means cooked and waiting to be billed."
      />

      {!tabs.length ? (
        <Empty icon="utensils" title="No open tabs right now">
          Open tabs appear here the moment a guest orders from their phone or you open one from Billing.
        </Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left: tab list */}
          <aside className="space-y-2">
            {tabs.map((t) => {
              const on = t.session.id === activeId;
              const skin = SKIN[t.mode];
              return (
                <button
                  key={t.session.id}
                  type="button"
                  onClick={() => setSelId(t.session.id)}
                  className={cx(
                    "w-full rounded-2xl border-2 p-3 text-left transition",
                    skin.card,
                    on ? cx("ring-2", skin.ring) : "hover:brightness-[.98]",
                    t.home && t.readyToBill && "border-emerald-400 bg-emerald-50",
                    // A guest who has asked to pay gets its own colour, so the
                    // admin can pick it out of a full board at a glance.
                    t.billRequested && "border-amber-400 bg-amber-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className={cx("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", skin.chip)}>
                        <Icon name={skin.icon} size={14} />
                      </span>
                      <div className="min-w-0">
                        <b className="block truncate text-[15px] font-extrabold text-slate-900">{tabTitle(t)}</b>
                        <p className="truncate text-[11.5px] text-slate-500">
                          {skin.label} · {t.session.customerPhone || "No number"} · {minsSince(t.session.openedAt, now)}m
                        </p>
                      </div>
                    </div>
                    <span className="adm-num shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-800">
                      {rupee(t.total)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
                    {t.home && t.readyToBill && (
                      <span className="adm-pulse rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                        Ready — bill now
                      </span>
                    )}
                    {t.fresh > 0 && !t.home && (
                      <span className="adm-pulse rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                        New · {t.fresh}
                      </span>
                    )}
                    {t.billRequested && (
                      <span className="adm-pulse rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                        Bill requested
                      </span>
                    )}
                    {t.cooking > 0 && <Badge tone="sky">{t.cooking} cooking</Badge>}
                    {t.items === 0 ? <Badge tone="slate">Empty — nothing ordered</Badge> : <Badge tone="slate">{t.items} items</Badge>}
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Right: selected tab detail */}
          <section className="min-w-0">
            {selected ? (
              <TabDetail
                tab={selected}
                products={s.products}
                busy={busy}
                onAddItems={() => setAdding(true)}
                onCancel={() => cancelTab(selected)}
              />
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-slate-500">
                Pick a tab on the left to see its items.
              </div>
            )}
          </section>
        </div>
      )}

      <Catalog
        open={adding}
        onClose={() => setAdding(false)}
        title={selected ? `Add to ${tabTitle(selected)}` : "Add items"}
        addLabel="Add to tab"
        onAdd={async (picks) => {
          const ok = await addItems(picks);
          if (ok) setAdding(false);
          return ok;
        }}
      />
    </Page>
  );
}

function AddedByTag({ by }: { by: OrderSource }) {
  if (by === "admin")
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-red-700">
        Added by admin
      </span>
    );
  if (by === "waiter")
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
        Added by waiter
      </span>
    );
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">
      From customer
    </span>
  );
}

function TabDetail({
  tab,
  products,
  busy,
  onAddItems,
  onCancel,
}: {
  tab: Tab;
  products: Product[];
  busy: boolean;
  onAddItems: () => void;
  onCancel: () => void;
}) {
  const { session, lines, total, fresh, home, mode, readyToBill, note, guest, phone, billRequested, couponCode, discount, deliveryFee } = tab;
  const skin = SKIN[mode];

  return (
    <div className={cx("rounded-2xl border-2 p-5 shadow-[0_2px_12px_-6px_rgba(15,23,42,.1)]", skin.card)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[20px] font-extrabold text-slate-900">
            <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg", skin.chip)}>
              <Icon name={skin.icon} size={16} />
            </span>
            {tabTitle(tab)}
            <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", skin.chip)}>{skin.label}</span>
            {fresh > 0 && !home && (
              <span className="adm-pulse inline-flex rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                New · {fresh}
              </span>
            )}
          </h2>
          <p className="truncate text-[12.5px] text-slate-500">
            {guest || "Guest"} · {phone || "No number"} · opened {fmtTime(session.openedAt)} · running total {rupee(total)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* A home order is exactly what the customer ordered and paid for —
              there is no table to walk back to with an extra plate, so nothing
              can be added to it here. */}
          {/* Once the guest has asked for the bill the tab is closed to new
              items — on their phone, on the waiter's board and here. What they
              are charged has to be what they agreed to pay. */}
          {!home && !billRequested && (
            <Btn kind="soft" icon="plus" disabled={busy} onClick={onAddItems}>
              Add items from inventory
            </Btn>
          )}
          <Btn kind="plain" icon="x" disabled={busy} onClick={onCancel}>
            Cancel {home ? "order" : "tab"}
          </Btn>
          <Link
            href={`/admin/billing?tab=${encodeURIComponent(session.id)}`}
            className={cx(
              "inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-extrabold uppercase tracking-wide text-white",
              home && readyToBill ? "bg-emerald-600 hover:bg-emerald-700"
              : billRequested ? "adm-pulse bg-amber-500 hover:bg-amber-600"
              : "bg-slate-900 hover:bg-slate-800",
            )}
          >
            <Icon name="billing" size={14} /> {home ? "Bill & send invoice" : "Complete in Billing"}
          </Link>
        </div>
      </header>

      {billRequested && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <span className="adm-pulse grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500 text-white">
            <Icon name="bell" size={15} />
          </span>
          <p className="min-w-0 flex-1 text-[12.5px] font-bold text-amber-900">
            {guest || "This guest"} asked for the bill. No more items can go on this tab — take the payment in Billing and send the invoice.
          </p>
        </div>
      )}

      {home && (
        <p
          className={cx(
            "mt-4 rounded-xl px-4 py-3 text-[12.5px] leading-snug",
            readyToBill ? "bg-emerald-100 text-emerald-900" : "bg-white/70 text-slate-600",
          )}
        >
          {readyToBill
            ? "Cooked and packed. Bill it now — closing the bill issues the invoice number and sends it to the customer."
            : "The kitchen is still working on this one. It can be billed once every item is marked ready."}{" "}
          Items can&apos;t be added to a {skin.label.toLowerCase()} order.
        </p>
      )}

      {note && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <b className="block text-[10.5px] font-black uppercase tracking-wide text-amber-700">Customer&rsquo;s remark</b>
          <p className="text-[13px] leading-snug text-amber-900">{note}</p>
        </div>
      )}

      <div className="mt-5">
        <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Items on this tab</h3>
        {lines.length ? (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            {lines.map((i, k) => {
              const p = products.find((x) => x.id === i.productId);
              return (
                <li key={k} className="flex items-center gap-3 bg-white px-4 py-3">
                  {p?.image ? (
                    <img src={p.image} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" loading="lazy" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-[15px] font-bold text-slate-400">
                      {i.name[0]}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="truncate text-[14px] text-slate-900">{i.name}</b>
                      <AddedByTag by={i.addedBy} />
                    </div>
                    <p className="truncate text-[11.5px] text-slate-500">{rupee(i.price)} each</p>
                    {i.notes && <p className="truncate text-[11.5px] font-semibold italic text-amber-700">{i.notes}</p>}
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-1 text-[13px] font-extrabold text-slate-800">×{i.qty}</span>
                  <b className="adm-num w-24 shrink-0 text-right text-[14px] text-slate-900">{rupee(i.price * i.qty)}</b>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">This tab is open with no items yet. Use &ldquo;Add items from inventory&rdquo; to put the first ones on.</p>
        )}
      </div>

      {/* What the guest will actually be charged, discount and delivery and
          all — the same numbers the Billing panel opens with. */}
      {lines.length > 0 && (
        <dl className="mt-4 space-y-1.5 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-[13px]">
          <div className="flex justify-between text-slate-600">
            <dt>Items</dt>
            <dd className="adm-num font-semibold text-slate-900">{rupee(total)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-red-600">
              <dt>Discount{couponCode ? ` (${couponCode})` : ""}</dt>
              <dd className="adm-num font-semibold">-{rupee(discount)}</dd>
            </div>
          )}
          {deliveryFee > 0 && (
            <div className="flex justify-between text-violet-700">
              <dt>Delivery charge</dt>
              <dd className="adm-num font-semibold">{rupee(deliveryFee)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2">
            <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">To pay</dt>
            <dd className="adm-num text-[17px] font-extrabold text-slate-900">{rupee(Math.max(0, total - discount) + deliveryFee)}</dd>
          </div>
        </dl>
      )}

      {!home && !billRequested && (
        <p className="mt-4 text-[11.5px] text-slate-400">
          Adding items saves to the tab — it doesn&apos;t close it. Hit &ldquo;Complete in Billing&rdquo; when the guest is ready to pay.
        </p>
      )}
    </div>
  );
}
