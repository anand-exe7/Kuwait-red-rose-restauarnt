"use client";

import { useEffect, useRef, useState } from "react";
import type { Bill, DiscountType, OrderItem, PayMethod } from "./types";
import { checkCoupon, computeBill, couponStatus, mergeItems, rupee } from "./money";
import { useAdmin, whoIs, type FloorTab } from "./Store";
import Catalog from "./Catalog";
import PrintModal, { PrintFormats } from "./PrintModal";
import { Receipt, billText, waLink, type PrintFormat } from "./receipt";
import { publicLinkIsLocalOnly } from "../../lib/publicUrl";
import { Badge, Btn, Icon, Modal, WaIcon, cx, fmtTime, ago } from "./kit";

type Line = { key: number; productId: string | null; name: string; price: string; qty: number };

const box = "rounded-[18px] border border-slate-100 bg-white p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,.1)] sm:p-5";
const lbl = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700";
const big = "h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100";
/* Kuwait numbers are 8 digits; a pasted "+965…" has that prefix stripped so
   the stored number stays bare. The country code is reattached at the wa.me
   link in `toKuwaitWa`. Accept up to 15 digits (ITU E.164 max) so visitors
   with a non-Kuwait number still fit. */
const kuwaitDigits = (v: string) => {
  const d = v.replace(/\D/g, "");
  const bare = d.startsWith("965") && d.length > 8 ? d.slice(3) : d;
  return bare.slice(0, 15);
};
const okPhone = (p: string) => /^\d{8,15}$/.test(p);
const sigOf = (f: FloorTab) => f.orders.map((o) => o.id + o.status).join("|");

const DEFAULT_GST = "18";

let seq = 0;
const blank = (): Line => ({ key: ++seq, productId: null, name: "", price: "", qty: 1 });
const linesOf = (f: FloorTab): Line[] => {
  const items = mergeItems(f.orders.filter((o) => o.status !== "cancelled").flatMap((o) => o.items));
  return items.length ? items.map((i) => ({ key: ++seq, productId: i.productId, name: i.name, price: String(i.price), qty: i.qty })) : [blank()];
};

export default function BillingPage({ sessionId }: { sessionId?: string }) {
  const { s, floor, act, print, now } = useAdmin();
  const shop = s.settings.shopName;
  /* "Walk-ins only" and the ordering toggle both reduce POS to counter walk-ins.
     Either one on → the "Customer tab" mode and its tab picker drop out. */
  const counterOnly = s.settings.walkInsOnly || !s.settings.orderingEnabled;

  /* Cooked takeaway/delivery orders first — somebody is standing at the
     counter or a driver is waiting on the invoice. Then tabs that asked for
     the bill, then the rest, oldest first. */
  const openTabs = counterOnly
    ? []
    : [...floor].sort((a, b) => {
        const rank = (x: FloorTab) => (x.home && x.readyToBill ? 0 : x.billRequested ? 1 : 2);
        return rank(a) - rank(b) || a.session.openedAt - b.session.openedAt;
      });
  const start = !counterOnly && sessionId ? floor.find((f) => f.session.id === sessionId) : undefined;

  /* Default to Counter (walk-in). A direct link that names a tab still opens
     it in tab mode; open tabs on their own don't flip the default any more. */
  const [mode, setMode] = useState<"tab" | "counter">(counterOnly ? "counter" : start ? "tab" : "counter");
  const [sel, setSel] = useState<string | null>(start?.session.id ?? null);
  const [lines, setLines] = useState<Line[]>(() => (start ? linesOf(start) : [blank()]));
  // Opened straight from a tab ("Bill & send invoice"): fill in everything we
  // already know, falling back to whoever placed the first order — a home
  // order's session often predates us stamping the customer on it.
  const [name, setName] = useState(start?.session.customerName || start?.orders[0]?.customerName || "");
  const [phone, setPhone] = useState(start?.session.customerPhone || start?.orders[0]?.customerPhone || "");
  const [sig, setSig] = useState(start ? sigOf(start) : "");
  const [coupon, setCoupon] = useState(start?.session.couponCode ?? "");
  const [delivery, setDelivery] = useState(start?.deliveryFee ? String(start.deliveryFee) : "");
  const [mType, setMType] = useState<DiscountType>("amount");
  const [mVal, setMVal] = useState("");
  const [extra, setExtra] = useState("");
  const [isGst, setIsGst] = useState(false);
  const [gstPct, setGstPct] = useState(DEFAULT_GST);
  const [pay, setPay] = useState<PayMethod>("cash");
  const [received, setReceived] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printFor, setPrintFor] = useState<Bill | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [picking, setPicking] = useState(false); // "Pick from catalog" (multi-add) modal
  const [done, setDone] = useState<Bill | null>(null);
  const [busy, setBusy] = useState(false);

  const f = mode === "tab" && sel ? floor.find((x) => x.session.id === sel) ?? null : null;
  const stale = f && sig && sigOf(f) !== sig;
  const lost = mode === "tab" && sel && !f;

  const reset = (keepMode = true) => {
    setSel(null);
    setLines([blank()]);
    setName("");
    setPhone("");
    setSig("");
    setCoupon("");
    setDelivery("");
    setMType("amount");
    setMVal("");
    setExtra("");
    setIsGst(false);
    setGstPct(DEFAULT_GST);
    setPay("cash");
    setReceived("");
    setSplitCash("");
    setSplitCard("");
    if (!keepMode) setMode("counter");
  };

  const pickTab = (x: FloorTab) => {
    setMode("tab");
    setSel(x.session.id);
    setLines(linesOf(x));
    // Older home orders opened their session before we stamped the customer on
    // it, so fall back to whoever placed the first order on the tab.
    setName(x.session.customerName || x.orders[0]?.customerName || "");
    setPhone(x.session.customerPhone || x.orders[0]?.customerPhone || "");
    // The coupon the guest already used, and the delivery they were quoted.
    // Both live on their orders — the admin bills exactly what the customer
    // was shown, instead of the full price with no discount.
    setCoupon(x.couponCode ?? x.session.couponCode ?? "");
    setDelivery(x.deliveryFee > 0 ? String(x.deliveryFee) : "");
    setSig(sigOf(x));
  };

  /* Arriving from "Complete in Billing" / "Bill & send invoice".
     The tab can't be picked in the initial state: the realtime stores are
     still empty on the first render, so `floor` is empty and `start` is
     undefined. We wait for the tab to appear and then open it — which is why
     this page used to come up as a blank counter sale. */
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (counterOnly || !sessionId || openedFor.current === sessionId) return;
    const tab = floor.find((x) => x.session.id === sessionId);
    if (!tab) return;
    openedFor.current = sessionId;
    // Syncing from an external store (the realtime floor) once it has the tab
    // this URL names. The ref guard means it happens exactly once per tab.
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    pickTab(tab);
  }, [floor, sessionId, counterOnly]);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /* ---------- totals ---------- */
  const items: OrderItem[] = lines
    .filter((l) => l.name.trim() || Number(l.price) > 0)
    .map((l) => ({ productId: l.productId, name: l.name.trim(), price: Math.max(0, Number(l.price) || 0), qty: l.qty }));
  const cp = s.coupons.find((c) => c.code === coupon) ?? null;
  /** The coupon the guest applied themselves, if any. */
  const guestCoupon = f?.couponCode ?? f?.session.couponCode ?? null;
  const deliveryFee = Math.max(0, Number(delivery) || 0);
  const calc = computeBill({ items, coupon: cp, manualType: mType, manualValue: Number(mVal) || 0, deliveryFee, extra: Number(extra) || 0, gst: isGst, gstPercent: Number(gstPct) || 0 });
  const recv = Number(received) || 0;
  const change = pay === "cash" && recv > 0 ? recv - calc.total : 0;

  /* typing one half of a split fills the other with whatever is left of the total */
  const rest = (v: string) => (v === "" ? "" : String(Math.max(0, Math.round((calc.total - (Number(v) || 0)) * 100) / 100)));
  const sCash = Number(splitCash) || 0;
  const sCard = Number(splitCard) || 0;
  const splitOff = Math.round((calc.total - sCash - sCard) * 100) / 100;

  const problems: string[] = [];
  if (mode === "tab" && !f) problems.push("Pick a customer with an open tab.");
  if (!items.length) problems.push("Add at least one item.");
  if (items.some((i) => !i.name)) problems.push("Every item needs a name.");
  if (cp && calc.couponOk && !calc.couponOk.ok) problems.push(`Coupon ${cp.code}: ${calc.couponOk.reason}.`);
  if (isGst && !(gstPct !== "" && Number(gstPct) >= 0 && Number(gstPct) <= 100)) problems.push("GST should be a percentage between 0 and 100.");
  if (pay === "cash" && recv > 0 && recv < calc.total) problems.push("Amount received is less than the total.");
  if (pay === "split" && (!(sCash > 0) || !(sCard > 0))) problems.push("Split payment: enter both the cash and the card amount.");
  else if (pay === "split" && splitOff !== 0) problems.push(`Split payment: cash + card should equal ${rupee(calc.total)}.`);
  if (phone && !okPhone(phone)) problems.push("Enter the mobile number (8 digits for Kuwait, or with country code).");
  const ready = !problems.length && !busy;

  const complete = async (via: "wa" | "print" | "none", fmt?: PrintFormat) => {
    if (!ready) return;
    const w = via === "wa" ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    const r = await act<Bill>("bill.create", {
      source: mode,
      sessionId: f?.session.id,
      mode: f?.mode ?? "standing",
      deliveryFee,
      note: f?.note ?? "",
      customerName: name,
      customerPhone: phone,
      items,
      couponCode: coupon || null,
      manualType: mType,
      manualValue: mVal,
      extra,
      isGst,
      gstPercent: gstPct,
      payment: pay,
      received,
      cashAmount: splitCash,
      cardAmount: splitCard,
    });
    setBusy(false);
    if (!r.ok) {
      w?.close();
      return;
    }
    const b = r.result;
    if (w) w.location.href = waLink(b.customerPhone, billText(b, shop, s.settings.publicUrl));
    if (via === "print") print(<Receipt b={b} shop={shop} fmt={fmt} />);
    setSaveOpen(false);
    setPrinting(false);
    setDone(b);
    reset();
  };

  const couponOptions = s.coupons.filter((c) => couponStatus(c) === "active" || c.code === coupon);

  return (
    <div className="adm-in rounded-[22px] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,.06),0_8px_24px_-12px_rgba(15,23,42,.1)] sm:p-5">
      {/* ---------- header ---------- */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-6 w-[4px] rounded-full bg-red-600" />
          <h1 className="adm-title text-[22px] leading-none text-slate-900">POS Billing Panel</h1>
          <span className="hidden h-5 w-px bg-slate-300 sm:block" />
          <span className="text-[13px] text-slate-500">Quick invoice generator &amp; database synced checkout</span>
        </div>
        {counterOnly ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-wide text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Counter · walk-ins only
          </span>
        ) : (
          <div className="flex rounded-2xl bg-slate-100 p-1">
            {(
              [
                ["counter", "Counter (walk-in)", "bg-emerald-500"],
                ["tab", "Customer tab", "bg-red-500"],
              ] as const
            ).map(([m, t, dot]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (m === mode) return;
                  setMode(m);
                  reset();
                }}
                className={cx("flex h-9 items-center gap-2 rounded-xl px-3.5 text-[12px] font-extrabold uppercase tracking-wide transition", mode === m ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800")}
              >
                <span className={cx("h-2 w-2 rounded-full", dot)} />
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* ================= left ================= */}
        <div className="min-w-0 space-y-4">
          {mode === "tab" && (
            <section className={box}>
              <h2 className="mb-3 flex items-center gap-2.5 text-[16px] font-bold text-slate-900">
                <Icon name="tables" size={18} className="text-red-600" /> Select Open Tab
              </h2>
              {f?.billRequested && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
                  <span className="adm-pulse grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
                    <Icon name="bell" size={16} />
                  </span>
                  <p className="text-[13px] font-bold text-amber-900">
                    {whoIs(f.session)} asked for the bill{f.billRequestedAt ? ` ${ago(f.billRequestedAt, now)} ago` : ""}. Nothing can be added to this tab any more — take the payment and send the invoice.
                  </p>
                </div>
              )}
              {openTabs.length ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
                  {openTabs.map((x) => (
                    <button
                      key={x.session.id}
                      type="button"
                      onClick={() => pickTab(x)}
                      className={cx(
                        "relative rounded-2xl border-2 p-3 text-left transition",
                        sel === x.session.id
                          ? "border-slate-700 bg-slate-50 ring-4 ring-slate-100"
                          : x.billRequested
                            ? "border-amber-400 bg-amber-50/70 hover:border-amber-500"
                            : x.home && x.readyToBill
                              ? "border-emerald-400 bg-emerald-50/60 hover:border-emerald-500"
                              : "border-slate-200 hover:border-slate-400",
                      )}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <b className="block truncate text-[16px] font-extrabold text-slate-900">
                          {x.mode === "table" && x.session.tableNumber != null
                            ? `Table ${x.session.tableNumber}`
                            : x.session.customerName || x.orders[0]?.customerName || "Guest"}
                        </b>
                        {x.billRequested && <span className="adm-pulse h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 text-amber-500" title="Asked for the bill" />}
                      </span>
                      {x.billRequested && (
                        <span className="mt-0.5 mr-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-amber-800">
                          Bill requested
                        </span>
                      )}
                      {x.home && (
                        <span
                          className={cx(
                            "mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide",
                            x.readyToBill ? "bg-emerald-100 text-emerald-800" : x.mode === "delivery" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800",
                          )}
                        >
                          {x.mode === "delivery" ? "Delivery" : "Takeaway"}
                          {x.readyToBill ? " · ready" : ""}
                        </span>
                      )}
                      <span className="adm-num block text-[15px] font-bold text-red-600">{rupee(x.total)}</span>
                      <span className="adm-num block truncate text-[11.5px] text-slate-500">
                        {x.session.customerPhone || x.orders[0]?.customerPhone || "No number"} · {ago(x.session.openedAt, now)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">No open tabs right now. Tabs open automatically when a guest orders — or switch to Counter for a walk-in.</p>
              )}
              {stale && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                  <span>
                    <b>{whoIs(f!.session)}</b> has new activity since you opened it.
                  </span>
                  <Btn size="sm" kind="dark" icon="refresh" onClick={() => pickTab(f!)}>
                    Reload items
                  </Btn>
                </div>
              )}
              {lost && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                  <span>That tab was just closed from another screen.</span>
                  <Btn size="sm" onClick={() => reset()}>
                    Start over
                  </Btn>
                </div>
              )}
            </section>
          )}

          <section className={box}>
            <h2 className="mb-4 flex items-center gap-2.5 text-[16px] font-bold text-slate-900">
              <Icon name="users" size={18} className="text-red-600" /> Customer Details
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={lbl}>Customer name</span>
                <input className={big} value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter name" maxLength={60} />
              </label>
              <label>
                <span className={lbl}>Mobile number (WhatsApp)</span>
                <input className={cx(big, phone && !okPhone(phone) && "border-amber-500")} value={phone} onChange={(e) => setPhone(kuwaitDigits(e.target.value))} placeholder="Enter mobile number (Kuwait: 8 digits)" inputMode="numeric" autoComplete="tel-national" />
              </label>
            </div>
            {f?.note && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <b className="block text-[10.5px] font-black uppercase tracking-wide text-amber-700">Customer&rsquo;s remark</b>
                <p className="text-[13px] leading-snug text-amber-900">{f.note}</p>
              </div>
            )}
          </section>

          <section className={box}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2.5 text-[16px] font-bold text-slate-900">
                <Icon name="orders" size={18} className="text-red-600" /> Order Items
              </h2>
              <div className="flex flex-wrap gap-2">
                <Btn size="md" className="border-0 bg-slate-100 hover:bg-slate-200" onClick={() => setLines([blank()])}>
                  Clear Order
                </Btn>
                <Btn size="md" kind="dark" icon="list" onClick={() => setPicking(true)}>
                  Pick from catalog
                </Btn>
                <Btn size="md" kind="soft" className="text-[14px] font-bold" onClick={() => setLines((ls) => [...ls, blank()])}>
                  + Add Item
                </Btn>
              </div>
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              {lines.map((l) => (
                <div key={l.key} className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 pb-2 last:border-0 last:pb-0">
                  <input
                    className="h-10 min-w-[180px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-[14px] outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="Item name / description…"
                    value={l.name}
                    onChange={(e) => setLine(l.key, { name: e.target.value })}
                  />
                  <button type="button" onClick={() => setPicker(l.key)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-700 transition hover:bg-slate-100">
                    <Icon name="list" size={15} /> Catalog
                  </button>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    inputMode="decimal"
                    className="h-10 w-24 rounded-xl border border-slate-300 bg-white px-3 text-[14px] outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    placeholder="₹ Price"
                    value={l.price}
                    onChange={(e) => setLine(l.key, { price: e.target.value })}
                    aria-label="Price"
                  />
                  <div className="flex h-10 w-[112px] items-center overflow-hidden rounded-xl border border-slate-300 bg-white">
                    <button type="button" className="h-full w-8 text-[16px] font-bold text-slate-700 hover:bg-slate-50" onClick={() => setLine(l.key, { qty: Math.max(1, l.qty - 1) })} aria-label="Less">
                      −
                    </button>
                    <input
                      className="h-full w-full min-w-0 border-x border-slate-200 text-center text-[14px] font-bold outline-none"
                      value={l.qty}
                      inputMode="numeric"
                      onChange={(e) => setLine(l.key, { qty: Math.max(1, Math.min(999, parseInt(e.target.value.replace(/\D/g, "")) || 1)) })}
                      aria-label="Quantity"
                    />
                    <button type="button" className="h-full w-8 text-[16px] font-bold text-slate-700 hover:bg-slate-50" onClick={() => setLine(l.key, { qty: Math.min(999, l.qty + 1) })} aria-label="More">
                      +
                    </button>
                  </div>
                  <span className="adm-num w-[96px] shrink-0 text-right leading-tight" aria-label="Line total">
                    <b className="block text-[14px] text-slate-900">{rupee((Number(l.price) || 0) * l.qty)}</b>
                    {l.qty > 1 && Number(l.price) > 0 && <small className="block text-[11px] font-semibold text-slate-500">{rupee(Number(l.price) || 0)} / pc</small>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Remove item"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ================= right: summary ================= */}
        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <div className={cx(box, "space-y-4")}>
            <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 text-[12px]">
              <div className="flex items-center justify-between py-3">
                <dt className="font-bold uppercase tracking-[0.12em] text-slate-400">Source</dt>
                <dd>{mode === "tab" ? <Badge tone="red">Customer tab</Badge> : <Badge tone="green">Counter</Badge>}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="font-bold uppercase tracking-[0.12em] text-slate-400">Customer</dt>
                <dd className="truncate font-semibold text-slate-800">{name || "-"}</dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="font-bold uppercase tracking-[0.12em] text-slate-400">Phone</dt>
                <dd className="font-semibold text-slate-800">{phone || "-"}</dd>
              </div>
              {f && (
                <div className="flex items-center justify-between py-3">
                  <dt className="font-bold uppercase tracking-[0.12em] text-slate-400">Opened</dt>
                  <dd className="font-semibold text-slate-800">{fmtTime(f.session.openedAt)}</dd>
                </div>
              )}
            </dl>

            {items.length ? (
              <ul className="adm-scroll max-h-56 space-y-2 overflow-y-auto pr-1 text-[13px]">
                {items.map((i, k) => (
                  <li key={k} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      <b>{i.qty}×</b> {i.name || <em className="text-slate-400">unnamed</em>}
                    </span>
                    <span className="shrink-0 text-right leading-tight">
                      <b className="block">{rupee(i.price * i.qty)}</b>
                      {i.qty > 1 && <small className="block text-[11px] font-semibold text-slate-500">{rupee(i.price)} / pc</small>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-center text-[12.5px] text-slate-400">No items added yet</p>
            )}

            <div className="border-t border-dashed border-slate-200 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700">Apply coupon</span>
              </div>
              {guestCoupon && guestCoupon === coupon && (
                <p className="mb-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[12px] font-semibold text-sky-700">
                  The guest already used this coupon on their phone — it is on this bill.
                </p>
              )}
              {guestCoupon && guestCoupon !== coupon && (
                <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-semibold text-amber-800">
                  The guest used <b>{guestCoupon}</b> when they ordered. Taking it off here means charging them more than they were shown.
                </p>
              )}
              <select className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-800 outline-none focus:border-slate-400" value={coupon} onChange={(e) => setCoupon(e.target.value)}>
                <option value="">No Coupon</option>
                {couponOptions.map((c) => {
                  const ok = checkCoupon(c, calc.subtotal);
                  return (
                    <option key={c.id} value={c.code} disabled={!ok.ok && c.code !== coupon}>
                      {c.code} — {c.percent}% off{c.minOrder ? ` (min ${rupee(c.minOrder)})` : ""}
                      {!ok.ok ? ` · ${ok.reason}` : ""}
                    </option>
                  );
                })}
              </select>
              {cp && calc.couponOk?.ok && <p className="mt-2 text-[12px] font-semibold text-emerald-600">{cp.code} applied — saves {rupee(calc.couponDiscount)}</p>}
              {cp && calc.couponOk && !calc.couponOk.ok && <p className="mt-2 text-[12px] font-semibold text-red-600">{calc.couponOk.reason}</p>}
            </div>

            <div className="border-t border-dashed border-slate-200 pt-4">
              <span className={lbl}>Manual discount</span>
              <div className="flex gap-2">
                <select className="h-11 w-[84px] rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-bold outline-none focus:border-slate-400" value={mType} onChange={(e) => setMType(e.target.value as DiscountType)} aria-label="Discount type">
                  <option value="amount">₹</option>
                  <option value="percent">%</option>
                </select>
                <input type="number" min={0} inputMode="decimal" placeholder="0" className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-right text-[14px] outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" value={mVal} onChange={(e) => setMVal(e.target.value)} aria-label="Discount value" />
              </div>
            </div>

            <dl className="space-y-3 border-t border-dashed border-slate-200 pt-4 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-slate-600">
                  Subtotal ({calc.itemCount} items){isGst && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800/70">excl. GST</span>}
                </dt>
                <dd className="font-semibold">{rupee(calc.subtotal)}</dd>
              </div>
              {calc.couponDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>Coupon {cp?.code}</dt>
                  <dd className="font-semibold">-{rupee(calc.couponDiscount)}</dd>
                </div>
              )}
              {calc.manualDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>Discount</dt>
                  <dd className="font-semibold">-{rupee(calc.manualDiscount)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">
                  Delivery charge
                  {f?.mode === "delivery" && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">quoted to the guest</span>}
                </dt>
                <dd>
                  <input
                    type="number"
                    min={0}
                    step="0.25"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-10 w-24 rounded-lg border border-slate-300 px-3 text-right text-[14px] outline-none focus:border-slate-400"
                    value={delivery}
                    onChange={(e) => setDelivery(e.target.value)}
                    aria-label="Delivery charge"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">Extra charges</dt>
                <dd>
                  <input type="number" min={0} inputMode="decimal" placeholder="0" className="h-10 w-24 rounded-lg border border-slate-300 px-3 text-right text-[14px] outline-none focus:border-slate-400" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Extra charges" />
                </dd>
              </div>
            </dl>

            <div className="space-y-3 border-t border-dashed border-slate-200 pt-4">
              <div className="grid grid-cols-2 rounded-full border border-slate-200 bg-white p-1" role="group" aria-label="Bill type">
                {(
                  [
                    [false, "Non-GST bill"],
                    [true, "GST invoice"],
                  ] as const
                ).map(([g, t]) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={isGst === g}
                    onClick={() => setIsGst(g)}
                    className={cx("h-10 rounded-full text-[12.5px] font-extrabold uppercase tracking-wide transition", isGst === g ? "bg-slate-800 text-white shadow" : "text-slate-600 hover:text-slate-900")}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {isGst && (
                <div className="flex items-center justify-between gap-3 text-[14px]">
                  <span className="font-bold text-slate-800">
                    GST <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800/70">(added)</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <input type="number" min={0} max={100} step="0.1" inputMode="decimal" className="h-10 w-20 rounded-lg border border-slate-300 px-3 text-right text-[14px] font-bold outline-none focus:border-slate-400" value={gstPct} onChange={(e) => setGstPct(e.target.value)} aria-label="GST percent" />
                    <span className="text-slate-600">%</span>
                    <b className="adm-num w-24 text-right font-semibold text-slate-700">{rupee(calc.gstAmount)}</b>
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="text-[15px] font-extrabold uppercase tracking-[0.04em] text-slate-900">Grand total</span>
              <b className="adm-num text-[22px] font-extrabold text-slate-900">{rupee(calc.total)}</b>
            </div>
            {isGst && calc.gstAmount > 0 && <p className="-mt-3 text-right text-[11.5px] text-slate-400">includes {rupee(calc.gstAmount)} GST on {rupee(calc.taxable)}</p>}

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Payment</span>
                <div className="adm-scroll -mx-1 flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
                  {(["cash", "upi", "card", "split"] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setPay(p)} className={cx("h-8 shrink-0 rounded-lg px-2.5 text-[12px] font-bold uppercase transition", pay === p ? "bg-white text-slate-900 shadow" : "text-slate-500")}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {pay === "cash" ? (
                <>
                  <span className="mb-2 block text-[12px] font-bold text-slate-700">Amount Received (₹)</span>
                  <input type="number" min={0} inputMode="decimal" placeholder={calc.total ? calc.total.toFixed(2) : "0.00"} className="h-12 w-full rounded-xl border border-slate-300 px-4 text-[18px] font-bold outline-none placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100" value={received} onChange={(e) => setReceived(e.target.value)} />
                  {recv > 0 && (
                    <p className={cx("mt-2 flex justify-between text-[13px] font-semibold", change < 0 ? "text-red-600" : "text-emerald-600")}>
                      <span>{change < 0 ? "Still due" : "Change to return"}</span>
                      <span>{rupee(Math.abs(change))}</span>
                    </p>
                  )}
                </>
              ) : pay === "split" ? (
                <div className="space-y-2">
                  <p className="text-[12.5px] text-slate-500">Customer pays part in cash and part by card — enter how much of each.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-[12px] font-bold text-slate-700">Cash (₹)</span>
                      <input type="number" min={0} inputMode="decimal" placeholder="0.00" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[16px] font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" value={splitCash} onChange={(e) => (setSplitCash(e.target.value), setSplitCard(rest(e.target.value)))} />
                    </label>
                    <label>
                      <span className="mb-1 block text-[12px] font-bold text-slate-700">Card (₹)</span>
                      <input type="number" min={0} inputMode="decimal" placeholder="0.00" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[16px] font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" value={splitCard} onChange={(e) => (setSplitCard(e.target.value), setSplitCash(rest(e.target.value)))} />
                    </label>
                  </div>
                  {(sCash > 0 || sCard > 0) && (
                    <p className={cx("flex justify-between text-[13px] font-semibold", splitOff === 0 ? "text-emerald-600" : "text-red-600")}>
                      <span>{splitOff === 0 ? "Adds up to the total" : splitOff > 0 ? "Still to collect" : "Over by"}</span>
                      <span>{splitOff === 0 ? rupee(calc.total) : rupee(Math.abs(splitOff))}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[12.5px] text-slate-500">Collect {rupee(calc.total)} by {pay === "upi" ? "UPI" : "card"}, then complete the bill.</p>
              )}
            </div>

            {problems.length > 0 && (items.length > 0 || mode === "tab") && <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">{problems[0]}</p>}

            <div className="space-y-2">
              <button
                type="button"
                disabled={!ready || !okPhone(phone)}
                onClick={() => complete("wa")}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#22c55e] px-4 text-[14px] font-extrabold uppercase tracking-wide text-white transition hover:bg-[#16a34a] disabled:opacity-45"
              >
                <WaIcon size={20} /> Save &amp; Send on WhatsApp
              </button>
              <Btn size="lg" kind="dark" icon="print" disabled={!ready} onClick={() => (setPrinting(true), setSaveOpen(true))} className="w-full uppercase">
                Public Print
              </Btn>
              <Btn size="lg" kind="red" disabled={!ready} onClick={() => complete("none")} className="w-full uppercase">
                Save order
              </Btn>
              {!okPhone(phone) && phone && <p className="text-center text-[11.5px] text-slate-400">WhatsApp needs a valid mobile number.</p>}
              {publicLinkIsLocalOnly(s.settings.publicUrl) && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700">
                  Heads up: no public site address is set, so the invoice link in the WhatsApp message will point at this
                  computer and won&apos;t open on the customer&apos;s phone. Set <code className="font-mono">NEXT_PUBLIC_SITE_URL</code> to your live site.
                </p>
              )}
              {mode === "tab" && f && <p className="pt-1 text-center text-[11.5px] text-slate-400">Completing closes {whoIs(f.session)}&apos;s tab — their next order starts a fresh one.</p>}
            </div>
          </div>
        </aside>
      </div>

      <Catalog
        open={picker !== null}
        onClose={() => setPicker(null)}
        title="Swap this line"
        onPick={(p) => picker !== null && setLine(picker, { productId: p.id, name: p.name, price: String(p.price) })}
      />
      <Catalog
        open={picking}
        onClose={() => setPicking(false)}
        title="Pick items for this bill"
        addLabel="Add to bill"
        onAdd={(picks) => {
          /* Each pick is a {productId, qty} from the catalog cart. For items
             the bill already has, bump the qty; otherwise add a fresh line.
             A blank starter line (name + price empty) is replaced instead of
             pushed down, so the first pick fills the row the user just saw. */
          setLines((ls) => {
            let next = [...ls];
            for (const { productId, qty } of picks) {
              const prod = s.products.find((x) => x.id === productId);
              if (!prod) continue;
              const existing = next.findIndex((l) => l.productId === prod.id);
              if (existing >= 0) {
                next[existing] = { ...next[existing], qty: Math.min(999, next[existing].qty + qty) };
                continue;
              }
              const line: Line = { key: ++seq, productId: prod.id, name: prod.name, price: String(prod.price), qty };
              if (next.length === 1 && !next[0].name.trim() && !next[0].price) next = [line];
              else next.push(line);
            }
            return next;
          });
          return true;
        }}
      />

      <Modal open={saveOpen} onClose={() => (setSaveOpen(false), setPrinting(false))} title="Public Print — choose printer &amp; paper">
        <div className="space-y-4">
          <p className="text-[13px] text-slate-500">{rupee(calc.total)} · pick the printer, the bill is saved and sent to that printer at the same resolution.</p>
          <PrintFormats onPick={(fmt) => complete("print", fmt)} />
          <Btn kind="plain" size="sm" onClick={() => (setSaveOpen(false), setPrinting(false))}>
            Cancel
          </Btn>
        </div>
      </Modal>
      <PrintModal bill={printFor} onClose={() => setPrintFor(null)} />
      <Modal
        open={!!done}
        onClose={() => setDone(null)}
        title="Bill saved"
        footer={
          done && (
            <div className={cx("grid w-full gap-2", done.customerPhone ? "grid-cols-3" : "grid-cols-2")}>
              {done.customerPhone && (
                <a href={waLink(done.customerPhone, billText(done, shop, s.settings.publicUrl))} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-3 text-[13px] font-semibold text-white hover:bg-[#16a34a]">
                  <WaIcon size={16} /> WhatsApp
                </a>
              )}
              <Btn icon="print" className="w-full" onClick={() => setPrintFor(done)}>
                Print receipt
              </Btn>
              <Btn kind="red" className="w-full" onClick={() => setDone(null)}>
                New bill
              </Btn>
            </div>
          )
        }
      >
        {done && (
          <div className="grid place-items-center gap-2 py-2 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon name="check" size={28} stroke={2.6} />
            </span>
            <p className="font-bold text-slate-900">{done.invoiceNo}</p>
            <p className="adm-num text-[32px] font-extrabold">{rupee(done.total)}</p>
            <p className="text-[13px] text-slate-500">
              {done.source === "tab" ? `${whoIs(done)}'s tab is closed.` : "Counter sale recorded."}
              {done.change > 0 && ` Give back ${rupee(done.change)} change.`}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
