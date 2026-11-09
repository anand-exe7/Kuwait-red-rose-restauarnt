"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Bill } from "../../admin/_ui/types";
import { Sheet } from "../../admin/_ui/receipt";
import { BRAND } from "../../lib/brand";
import {
  subscribeToBills,
  getBillsSnapshot,
  getBillsServerSnapshot,
  type Bill as RrBill,
} from "../../lib/billStore";
import {
  invoiceDigits,
  invoiceNumber,
  normaliseInvoiceNo,
  orderNumber,
  resolveInvoiceNo,
} from "../../lib/invoice";
import {
  subscribeToOrders,
  getOrdersSnapshot,
  getOrdersServerSnapshot,
  type Order,
} from "../../lib/orderStore";

/** What the bill was for, rebuilt from the session's own orders — used when
 *  the bill row carries no payload, so the customer still sees their items
 *  and their name instead of a blank invoice. */
function fromSessionOrders(sessionId: string | null | undefined, orders: Order[]) {
  if (!sessionId) return null;
  const own = orders.filter((o) => o.sessionId === sessionId && o.status !== "cancelled");
  if (own.length === 0) return null;
  const lines = new Map<string, Bill["items"][number]>();
  for (const o of own) {
    for (const it of o.items) {
      const key = `${it.id ?? it.name}@@${it.price}`;
      const cur = lines.get(key);
      if (cur) cur.qty += it.qty;
      else lines.set(key, { productId: it.id ?? null, name: it.name, price: it.price, qty: it.qty, notes: it.notes ?? "" });
    }
  }
  const items = [...lines.values()];
  return {
    items,
    itemCount: items.reduce((a, i) => a + i.qty, 0),
    customerName: own.map((o) => o.customer?.name).find(Boolean) || "",
    customerPhone: own.map((o) => o.customer?.phone).find(Boolean) || "",
    note: own.map((o) => o.note).find(Boolean) ?? "",
    couponCode: own.map((o) => o.couponCode).find(Boolean) ?? null,
    discount: own.reduce((a, o) => a + (o.discount ?? 0), 0),
    // The delivery charge is on the order, so the customer's own invoice can
    // show what they paid to have it brought round.
    deliveryFee: own.reduce((a, o) => a + (o.deliveryFee ?? 0), 0),
    mode: own[0]?.mode ?? "table",
  };
}

/** Rebuild the admin Bill from a persisted billStore row. Prefers the rich
 *  payload the admin POS wrote; otherwise rebuilds it from the orders. */
function rehydrate(b: RrBill, orders: Order[] = []): Bill {
  const p = (b.payload ?? null) as Partial<Bill> | null;
  const rebuilt = fromSessionOrders(b.sessionId, orders);
  const payment: Bill["payment"] =
    b.paidMethod === "cash" || b.paidMethod === "upi" || b.paidMethod === "card" || b.paidMethod === "split"
      ? b.paidMethod
      : (p?.payment ?? "cash");
  const invoiceNo = resolveInvoiceNo({ invoiceNo: b.invoiceNo || p?.invoiceNo, sessionId: b.sessionId, id: b.id, createdAt: b.createdAt });
  if (p) {
    return {
      id: b.id,
      invoiceNo,
      source: p.source ?? (b.sessionId ? "tab" : "counter"),
      mode: p.mode ?? rebuilt?.mode ?? (b.sessionId ? "table" : "standing"),
      sessionId: b.sessionId ?? null,
      customerName: p.customerName ?? "",
      customerPhone: p.customerPhone ?? "",
      items: p.items ?? [],
      itemCount: p.itemCount ?? 0,
      subtotal: p.subtotal ?? b.subtotal ?? 0,
      couponCode: p.couponCode ?? b.couponCode ?? null,
      couponPercent: p.couponPercent ?? 0,
      couponDiscount: p.couponDiscount ?? 0,
      couponSource: p.couponSource ?? null,
      manualType: p.manualType ?? "none",
      manualValue: p.manualValue ?? 0,
      manualDiscount: p.manualDiscount ?? 0,
      discount: p.discount ?? b.discount ?? 0,
      deliveryFee: p.deliveryFee ?? rebuilt?.deliveryFee ?? 0,
      total: p.total ?? b.total ?? 0,
      createdAt: b.createdAt,
      tax: p.tax ?? b.tax ?? 0,
      taxRate: p.taxRate ?? 0,
      status: p.status ?? "completed",
      isGst: p.isGst ?? false,
      gstAmount: p.gstAmount ?? 0,
      gstPercent: p.gstPercent ?? 0,
      taxableAmount: p.taxableAmount ?? 0,
      cashAmount: p.cashAmount ?? 0,
      upiAmount: p.upiAmount ?? 0,
      cardAmount: p.cardAmount ?? 0,
      payment,
      received: p.received ?? (b.total ?? 0),
      change: p.change ?? 0,
      extra: p.extra ?? 0,
      note: p.note ?? "",
    };
  }
  return {
    id: b.id,
    invoiceNo,
    source: b.sessionId ? "tab" : "counter",
    mode: rebuilt?.mode ?? (b.sessionId ? "table" : "standing"),
    sessionId: b.sessionId ?? null,
    customerName: rebuilt?.customerName ?? "",
    customerPhone: rebuilt?.customerPhone ?? "",
    items: rebuilt?.items ?? [],
    itemCount: rebuilt?.itemCount ?? 0,
    subtotal: b.subtotal ?? 0,
    couponCode: b.couponCode ?? rebuilt?.couponCode ?? null,
    couponPercent: 0,
    couponDiscount: (b.couponCode ?? rebuilt?.couponCode) ? (b.discount ?? rebuilt?.discount ?? 0) : 0,
    couponSource: (b.couponCode ?? rebuilt?.couponCode) ? "guest" : null,
    manualType: "none",
    manualValue: 0,
    manualDiscount: (b.couponCode ?? rebuilt?.couponCode) ? 0 : (b.discount ?? rebuilt?.discount ?? 0),
    discount: b.discount ?? rebuilt?.discount ?? 0,
    deliveryFee: rebuilt?.deliveryFee ?? 0,
    total: b.total ?? 0,
    createdAt: b.createdAt,
    tax: b.tax ?? 0,
    taxRate: 0,
    status: "completed",
    isGst: false,
    gstAmount: 0,
    gstPercent: 0,
    taxableAmount: 0,
    cashAmount: payment === "cash" ? (b.total ?? 0) : 0,
    upiAmount: payment === "upi" ? (b.total ?? 0) : 0,
    cardAmount: payment === "card" ? (b.total ?? 0) : 0,
    payment,
    received: b.total ?? 0,
    change: 0,
    extra: 0,
    note: rebuilt?.note ?? "",
  };
}

export default function InvoiceView({ id }: { id: string }) {
  const bills = useSyncExternalStore(subscribeToBills, getBillsSnapshot, getBillsServerSnapshot);
  const orders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);

  // The URL carries one of two things:
  //   INV-2026-48213 — a settled bill, i.e. a real invoice
  //   48213          — an order that has not been billed yet
  // Both are accepted, as are older links that used the raw bill or session id.
  const needle = normaliseInvoiceNo(id.trim());
  const digits = invoiceDigits(needle) || (/^\d{1,5}$/.test(needle) ? needle.padStart(5, "0") : "");

  const match = useMemo(() => {
    const needleUp = needle.toUpperCase();
    return (
      bills.find((b) => normaliseInvoiceNo(b.invoiceNo || "") === needleUp) ??
      bills.find((b) => b.id.toUpperCase() === needleUp) ??
      // A bare order number: the customer was given 48213 before the bill
      // existed, and the invoice it became ends in the same five digits.
      (digits ? bills.find((b) => invoiceDigits(b.invoiceNo || "") === digits) : undefined) ??
      // Legacy links: the number used to be derived from the bill id, and
      // before that from the session id. Accept both so old WhatsApp
      // messages keep resolving.
      bills.find((b) => invoiceNumber(b.id, b.createdAt) === needleUp) ??
      bills.find((b) => !!b.sessionId && invoiceNumber(b.sessionId, b.createdAt) === needleUp) ??
      bills.find((b) => b.sessionId?.toUpperCase() === needleUp) ??
      (digits
        ? bills.find((b) => !!b.sessionId && orderNumber(b.sessionId) === digits)
        : undefined) ??
      null
    );
  }, [bills, needle, digits]);

  /* No bill yet — this is a live order the shop has not settled. Show the
     customer where it has got to instead of "invoice not found", which is what
     they used to see for the whole time their food was being made. */
  const pending: Order[] = useMemo(() => {
    if (match || !digits) return [];
    const needleUp = needle.toUpperCase();
    const mine = orders.filter((o) => {
      if (o.billed) return false;
      const key = o.sessionId || o.id;
      return orderNumber(key) === digits || o.id.toUpperCase() === needleUp || o.sessionId?.toUpperCase() === needleUp;
    });
    if (!mine.length) return [];
    // One session can hold several tickets (the guest added more) — show them
    // all, oldest first, as one order.
    const sessionId = mine[0].sessionId;
    const group = sessionId ? mine.filter((o) => o.sessionId === sessionId) : mine;
    return [...group].sort((a, b) => a.createdAt - b.createdAt);
  }, [match, orders, digits, needle]);

  // Realtime stores hydrate a tick after mount — give them a grace window
  // before flashing "not found".
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), 1800);
    return () => clearTimeout(t);
  }, []);

  // An order that exists but hasn't been billed yet has no invoice to show.
  // We say so plainly rather than inventing a status page for it.
  if (!match && pending.length > 0) {
    return (
      <div className="rounded-3xl border border-[#c9a961]/30 bg-white px-6 py-10 text-center shadow-[0_18px_42px_-18px_rgba(74,21,21,0.3)]">
        <p className="font-serif text-[22px] text-[#1a0f0a]">Order #{digits}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6b5340]">
          {BRAND.name} has your order. Your invoice appears here the moment the shop closes the bill.
        </p>
        <a
          href="/menu"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#b01e28] px-5 text-[12px] font-bold uppercase tracking-wide text-white"
        >
          Back to the menu
        </a>
      </div>
    );
  }

  if (!match) {
    if (!graceOver) {
      return (
        <div className="rounded-3xl border border-[#c9a961]/30 bg-white px-6 py-10 text-center shadow-[0_18px_42px_-18px_rgba(74,21,21,0.3)]">
          <p className="font-serif text-[18px] text-[#6b5340]">Loading invoice {needle}…</p>
        </div>
      );
    }
    return (
      <div className="rounded-3xl border border-[#c9a961]/30 bg-white px-6 py-10 text-center shadow-[0_18px_42px_-18px_rgba(74,21,21,0.3)]">
        <p className="font-serif text-[22px] text-[#1a0f0a]">Invoice {needle}</p>
        <p className="mt-2 text-[13px] text-[#6b5340]">
          We couldn&apos;t find this order. Ask {BRAND.name} to resend the link.
        </p>
      </div>
    );
  }

  const bill = rehydrate(match, orders);

  return (
    <div className="adm">
      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_18px_42px_-18px_rgba(74,21,21,0.3)]">
        <Sheet b={bill} shop={BRAND.fullName} size="A4" hideSize />
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#1a0f0a] px-5 text-[12px] font-bold uppercase tracking-wide text-white"
        >
          Print / Save PDF
        </button>
        <a
          href="/menu"
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#b01e28] px-5 text-[12px] font-bold uppercase tracking-wide text-white"
        >
          Order again
        </a>
      </div>
    </div>
  );
}

