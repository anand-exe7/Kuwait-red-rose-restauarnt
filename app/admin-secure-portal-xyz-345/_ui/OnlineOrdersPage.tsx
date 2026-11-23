"use client";

// Online orders — the admin's approval queue, and nothing else.
//
// The flow:
//   1. Customer checks out on /menu  → the order arrives HERE, and nowhere else.
//   2. Admin accepts it              → it leaves this page for good: the chef
//                                      gets the ticket and it shows up in Open
//                                      tabs in its own colour, where it is
//                                      cooked, billed and sent.
//   3. Admin declines it             → it is dropped and never reaches the chef.
//
// There is deliberately no "in the kitchen" or "ready to bill" column here any
// more. An accepted order lives in exactly one place — Open tabs — so nobody
// has to look in two screens for the same order.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Order } from "./types";
import { rupee } from "./money";
import { useAdmin } from "./Store";
import { OnlineStatusBadge } from "./SettingsModal";
import { Btn, Empty, Icon, Page, PageHead, SearchBox, cx, fmtTime, ago } from "./kit";
import { resolveOrderNo } from "../../lib/invoice";

type Filter = "all" | "takeaway" | "delivery";

/** One online order waiting for the admin, grouped by session so several
 *  tickets on the same order show as a single card. */
interface HomeOrder {
  sessionId: string;
  orderNo: string;
  mode: "takeaway" | "delivery";
  orders: Order[];
  customerName: string;
  customerPhone: string;
  address?: string;
  landmark?: string;
  note?: string;
  discount: number;
  couponCode?: string;
  deliveryFee: number;
  total: number;
  placedAt: number;
}

const MODE_STYLE: Record<"takeaway" | "delivery", { label: string; icon: "bag" | "cart"; ring: string; chip: string }> = {
  takeaway: { label: "Takeaway", icon: "bag", ring: "border-sky-200", chip: "bg-sky-100 text-sky-800" },
  delivery: { label: "Delivery", icon: "cart", ring: "border-violet-200", chip: "bg-violet-100 text-violet-800" },
};

export default function OnlineOrdersPage() {
  const { s, act, confirm, toast, now } = useAdmin();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo<HomeOrder[]>(() => {
    const sessions = new Map<string, Order[]>();
    for (const o of s.orders) {
      if (o.mode !== "takeaway" && o.mode !== "delivery") continue;
      if (o.billed) continue;
      if (o.live !== "awaiting_admin") continue; // accepted → it lives in Open tabs
      const key = o.sessionId || o.id;
      const cur = sessions.get(key);
      if (cur) cur.push(o);
      else sessions.set(key, [o]);
    }
    const out: HomeOrder[] = [];
    for (const [sessionId, orders] of sessions) {
      const first = [...orders].sort((a, b) => a.createdAt - b.createdAt)[0];
      const sess = s.sessions.find((x) => x.id === sessionId);
      const a = first.deliveryAddress;
      out.push({
        sessionId,
        orderNo: resolveOrderNo({ sessionId, id: first.id, createdAt: first.createdAt }),
        mode: first.mode === "delivery" ? "delivery" : "takeaway",
        orders,
        customerName: first.customerName || sess?.customerName || "Guest",
        customerPhone: first.customerPhone || sess?.customerPhone || "",
        address: a
          ? [a.area, a.street && `St ${a.street}`, a.avenue && `Av ${a.avenue}`, a.building && `Bldg ${a.building}`, a.floor && `Floor ${a.floor}`, a.apartment && `Apt ${a.apartment}`, a.governorate]
              .filter(Boolean)
              .join(", ")
          : undefined,
        landmark: a?.landmark,
        note: orders.map((o) => o.note).find(Boolean) || undefined,
        discount: orders.reduce((sum, o) => sum + o.discount, 0),
        couponCode: orders.map((o) => o.couponCode).find(Boolean) || undefined,
        deliveryFee: orders.reduce((sum, o) => sum + o.deliveryFee, 0),
        total: orders.reduce((sum, o) => sum + o.total, 0),
        placedAt: first.createdAt,
      });
    }
    const needle = q.trim().toLowerCase();
    return out
      .filter((g) => filter === "all" || g.mode === filter)
      .filter(
        (g) =>
          !needle ||
          `${g.orderNo} ${g.customerName} ${g.customerPhone} ${g.orders.flatMap((o) => o.items.map((i) => i.name)).join(" ")}`
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => a.placedAt - b.placedAt); // oldest first — longest wait on top
  }, [s.orders, s.sessions, filter, q]);

  const accept = async (g: HomeOrder) => {
    setBusy(g.sessionId);
    for (const o of g.orders) {
      const r = await act("order.approve", { id: o.id });
      if (!r.ok) {
        setBusy(null);
        toast({ kind: "err", title: r.error || "Couldn't accept this order." });
        return;
      }
    }
    setBusy(null);
    toast({
      kind: "ok",
      title: `Order #${g.orderNo} accepted`,
      body: "The chef has the ticket. You'll find it in Open tabs until you bill it.",
    });
  };

  const decline = async (g: HomeOrder) => {
    const ok = await confirm({
      title: `Decline order #${g.orderNo}?`,
      body: `${g.customerName}'s ${MODE_STYLE[g.mode].label.toLowerCase()} order will not be made. Call them on ${g.customerPhone || "their number"} to let them know — we don't send an automatic message.`,
      ok: "Decline order",
      danger: true,
      /* The one destructive confirm that does NOT ask for the manager
         password. Turning an order away is an everyday counter decision —
         the kitchen is busy, the item is off — not a record being wiped, and
         it happens several times a day. */
      lock: false,
    });
    if (!ok) return;
    setBusy(g.sessionId);
    for (const o of g.orders) await act("order.reject", { id: o.id });
    setBusy(null);
    toast({ kind: "ok", title: `Order #${g.orderNo} declined.` });
  };

  const waiting = groups.length;

  return (
    <Page>
      <PageHead
        title="Online orders"
        sub="Takeaway and delivery orders from the website, waiting for you. Accept one and it goes straight to the chef — you then cook, bill and send it from Open tabs."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {/* Is the website even taking orders? An empty queue means two very
                different things depending on the answer, so it is said here
                rather than left to be guessed. Changed in Settings. */}
            <OnlineStatusBadge className="mr-1" />
            {(["all", "takeaway", "delivery"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={cx(
                  "h-9 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold capitalize transition",
                  filter === v ? "bg-red-600 text-white shadow-[0_4px_10px_-4px_rgba(220,38,38,.9)]" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                {v === "all" ? "All" : v}
              </button>
            ))}
          </div>
        }
      />

      {/* Fixed-height strip so accepting the last order doesn't make the page jump. */}
      <div className="mb-5 min-h-[60px]">
        {waiting > 0 ? (
          <div className="flex h-[60px] flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4">
            <span className="adm-pulse grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-600 text-white">
              <Icon name="bell" size={17} />
            </span>
            <p className="text-[13.5px] font-bold text-red-700">
              {waiting} order{waiting === 1 ? "" : "s"} waiting for you to accept.
            </p>
            <span className="hidden text-[12.5px] text-red-600/80 sm:inline">The customer is watching their order page.</span>
          </div>
        ) : (
          <div className="flex h-[60px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <Icon name="check" size={17} />
            </span>
            <p className="text-[13.5px] font-semibold text-slate-600">
              Nothing waiting. Everything you&rsquo;ve accepted is in{" "}
              <Link href="/admin-secure-portal-xyz-345/kitchen" className="font-bold text-red-600 hover:underline">
                Open tabs
              </Link>
              .
            </p>
          </div>
        )}
      </div>

      <SearchBox value={q} onChange={setQ} placeholder="Search order no., name, mobile, item…" className="mb-5 w-full sm:max-w-sm" />

      {!groups.length ? (
        <Empty icon="bag" title="No online orders waiting">
          Takeaway and delivery orders placed on the website land here. Once you accept one it moves to Open tabs, where you cook, bill and send it.
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.sessionId} g={g} now={now} busy={busy === g.sessionId} onAccept={() => accept(g)} onDecline={() => decline(g)} />
          ))}
        </div>
      )}
    </Page>
  );
}

function Card({
  g,
  now,
  busy,
  onAccept,
  onDecline,
}: {
  g: HomeOrder;
  now: number;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const m = MODE_STYLE[g.mode];
  const items = g.orders.flatMap((o) => o.items);
  return (
    <article className={cx("adm-in flex flex-col rounded-2xl border-2 bg-white p-4 shadow-[0_2px_10px_-2px_rgba(15,23,42,.08)]", m.ring)}>
      <header className="flex items-start gap-3">
        <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", m.chip)}>
          <Icon name={m.icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="adm-num text-[16px] font-black text-slate-900">#{g.orderNo}</b>
            <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", m.chip)}>{m.label}</span>
          </div>
          <p className="truncate text-[13px] font-semibold text-slate-700">{g.customerName}</p>
          {g.customerPhone && (
            <a href={`tel:${g.customerPhone}`} className="adm-num inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-red-600">
              <Icon name="users" size={12} /> {g.customerPhone}
            </a>
          )}
        </div>
        <span className="shrink-0 text-right">
          <b className="adm-num block text-[15px] text-slate-900">{rupee(g.total)}</b>
          <span className="block text-[11px] text-slate-400" title={`Placed ${fmtTime(g.placedAt)}`}>
            {ago(g.placedAt, now)}
          </span>
        </span>
      </header>

      <ul className="my-3 space-y-1 border-y border-dashed border-slate-200 py-3 text-[13px]">
        {items.map((i, k) => (
          <li key={k}>
            <div className="flex gap-2">
              <b className="adm-num w-7 shrink-0 text-slate-900">{i.qty}×</b>
              <span className="min-w-0 flex-1 text-slate-700">{i.name}</span>
            </div>
            {i.notes && <p className="pl-7 text-[11.5px] italic text-amber-700">{i.notes}</p>}
          </li>
        ))}
      </ul>

      {/* What the customer was quoted, line by line, so accepting is not a
          guess about what they owe. */}
      {(g.discount > 0 || g.deliveryFee > 0) && (
        <dl className="mb-3 space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[12.5px]">
          {g.discount > 0 && (
            <div className="flex justify-between text-red-600">
              <dt>Discount{g.couponCode ? ` (${g.couponCode})` : ""}</dt>
              <dd className="font-semibold">-{rupee(g.discount)}</dd>
            </div>
          )}
          {g.deliveryFee > 0 && (
            <div className="flex justify-between text-violet-700">
              <dt>Delivery charge</dt>
              <dd className="font-semibold">{rupee(g.deliveryFee)}</dd>
            </div>
          )}
        </dl>
      )}

      {g.note && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
          <b className="block text-[10.5px] font-black uppercase tracking-wide text-amber-700">Customer&rsquo;s remark</b>
          {g.note}
        </div>
      )}

      {g.mode === "delivery" && g.address && (
        <div className="mb-3 rounded-xl bg-violet-50 px-3 py-2 text-[12.5px] leading-snug text-violet-900">
          <b className="block text-[10.5px] font-black uppercase tracking-wide text-violet-700">Deliver to</b>
          {g.address}
          {g.landmark && <span className="block italic opacity-80">Landmark: {g.landmark}</span>}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${g.address}, Kuwait`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-bold text-violet-700 hover:underline"
          >
            <Icon name="external" size={12} /> Open in Maps
          </a>
        </div>
      )}

      <div className="mt-auto flex gap-2">
        <Btn kind="red" size="lg" className="flex-1" disabled={busy} onClick={onAccept}>
          {busy ? "Accepting…" : "Accept → Kitchen"}
        </Btn>
        <Btn kind="plain" size="lg" className="text-red-600" disabled={busy} onClick={onDecline}>
          Decline
        </Btn>
      </div>
    </article>
  );
}
