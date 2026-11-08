"use client";

// Admin data store — the Red Rose admin pages all read through useAdmin(), so this
// is the adapter layer: Red Rose's live Supabase stores on one side, the
// AdminState shape on the other.
//
// Writes: each `act("op", args)`
// routes to the matching Red Rose store mutation. Anything Red Rose doesn't
// have (ingredients, recipes, expenses) short-circuits to a "not available"
// error so the page still renders but no stale write is attempted.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AdminState,
  Bill,
  Coupon,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  Session,
  SessionStatus,
} from "./types";
import { emptyAdminState } from "./types";

import {
  subscribeToMenu,
  getMenuSnapshot,
  getMenuServerSnapshot,
  addMenuItem as rrAddMenuItem,
  updateMenuItem as rrUpdateMenuItem,
  deleteMenuItem as rrDeleteMenuItem,
  type MenuItem,
} from "../../lib/menuStore";
import {
  subscribeToOrders,
  getOrdersSnapshot,
  getOrdersServerSnapshot,
  updateOrderStatus as rrUpdateOrderStatus,
  type Order as RrOrder,
  type OrderStatus as RrOrderStatus,
} from "../../lib/orderStore";
import {
  subscribeToSessions,
  getSessionsSnapshot,
  getSessionsServerSnapshot,
  type Session as RrSession,
} from "../../lib/sessionStore";
import {
  subscribeToBills,
  getBillsSnapshot,
  getBillsServerSnapshot,
  type Bill as RrBill,
} from "../../lib/billStore";
import {
  subscribeToCoupons,
  getCouponsSnapshot,
  getCouponsServerSnapshot,
  addCoupon as rrAddCoupon,
  updateCoupon as rrUpdateCoupon,
  deleteCoupon as rrDeleteCoupon,
  type Coupon as RrCoupon,
} from "../../lib/couponStore";

export type Toast = {
  id: number;
  kind: "ok" | "err" | "order" | "bill" | "info";
  title: string;
  body?: string;
  href?: string;
};
type ConfirmReq = { title: string; body?: React.ReactNode; ok?: string; danger?: boolean };
export type ActResult<T = unknown> = { ok: true; result: T } | { ok: false; error: string };
export type ActOpts = { optimistic?: (s: AdminState) => AdminState };

export interface FloorTab {
  session: Session;
  orders: Order[];
  total: number;
  items: number;
  fresh: number;
  cooking: number;
  billRequested: boolean;
}

interface Ctx {
  s: AdminState;
  role: "admin" | "staff";
  act: <T = unknown>(op: string, args?: Record<string, unknown>, opts?: ActOpts) => Promise<ActResult<T>>;
  refresh: () => Promise<void>;
  toast: (t: Omit<Toast, "id">) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  confirm: (c: ConfirmReq) => Promise<boolean>;
  pending: ConfirmReq | null;
  answer: (v: boolean) => void;
  print: (node: React.ReactNode) => void;
  printNode: React.ReactNode;
  sound: boolean;
  setSound: (v: boolean) => void;
  base: string;
  now: number;
  floor: FloorTab[];
}

export const whoIs = (x: { customerName: string; customerPhone: string }) =>
  x.customerName || x.customerPhone || "Guest";

const C = createContext<Ctx | null>(null);
export function useAdmin() {
  const c = useContext(C);
  if (!c) throw new Error("useAdmin outside AdminProvider");
  return c;
}

// -----------------------------------------------------------------------------
// Red Rose → AdminState type mapping
// -----------------------------------------------------------------------------

function toProduct(m: MenuItem): Product {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    price: m.price,
    stock: m.stock ?? null,
    lowAt: m.lowStockThreshold ?? 5,
    description: m.description ?? "",
    image: m.image ?? "",
    eggless: false,
    tags: [
      ...(m.isPopular ? ["popular"] : []),
      ...(m.isChefSpecial ? ["chef"] : []),
      ...(m.isBestSeller ? ["bestseller"] : []),
    ],
    active: (m.status ?? "active") === "active",
    createdAt: m.createdAt ?? Date.now(),
  };
}

const ORDER_STATUS_MAP: Record<RrOrderStatus, OrderStatus> = {
  awaiting_admin: "new",
  pending: "new",
  cooking: "preparing",
  ready: "ready",
  served: "served",
};

function toOrderItem(it: RrOrder["items"][number]): OrderItem {
  return {
    productId: it.id ?? null,
    name: it.name,
    price: it.price,
    qty: it.qty,
  };
}

function toOrder(o: RrOrder, index: number): Order {
  return {
    id: o.id,
    no: index + 1,
    sessionId: o.sessionId ?? "",
    items: o.items.map(toOrderItem),
    note: "",
    customerName: o.customer?.name ?? "",
    customerPhone: o.customer?.phone ?? "",
    status: ORDER_STATUS_MAP[o.status] ?? "new",
    source: o.source === "customer" ? "customer" : o.source === "waiter" ? "waiter" : "counter",
    subtotal: o.subtotal,
    createdAt: o.createdAt,
    updatedAt: o.createdAt,
  };
}

function toSession(sess: RrSession): Session {
  const status: SessionStatus =
    sess.status === "open"
      ? (sess.billRequestedAt ? "bill_requested" : "open")
      : "closed";
  return {
    id: sess.id,
    status,
    openedAt: sess.openedAt,
    closedAt: sess.closedAt ?? null,
    customerName: sess.customerName ?? "",
    customerPhone: sess.customerPhone ?? "",
    billRequestedAt: sess.billRequestedAt ?? null,
    billId: sess.billId ?? null,
    couponCode: null,
  };
}

function toBill(b: RrBill): Bill {
  const payment: Bill["payment"] =
    b.paidMethod === "cash" || b.paidMethod === "upi" || b.paidMethod === "card" || b.paidMethod === "split"
      ? b.paidMethod
      : "cash";
  return {
    id: b.id,
    invoiceNo: b.id,
    source: b.sessionId ? "tab" : "counter",
    sessionId: b.sessionId ?? null,
    customerName: "",
    customerPhone: "",
    items: [],
    itemCount: 0,
    subtotal: b.subtotal ?? 0,
    couponCode: b.couponCode ?? null,
    couponPercent: 0,
    couponDiscount: b.discount ?? 0,
    couponSource: null,
    manualType: "none",
    manualValue: 0,
    manualDiscount: 0,
    discount: b.discount ?? 0,
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
    note: "",
  };
}

function toCoupon(c: RrCoupon): Coupon {
  return {
    id: c.id,
    code: c.code,
    percent: c.discountPercent ?? 0,
    minOrder: c.minOrder ?? 0,
    expiresAt: c.expiry || null,
    limit: c.usageLimit > 0 ? c.usageLimit : null,
    used: c.usedCount ?? 0,
    active: c.active ?? true,
    createdAt: c.createdAt ?? Date.now(),
  };
}

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

const soundSubs = new Set<() => void>();
const soundPref = {
  subscribe: (cb: () => void) => {
    soundSubs.add(cb);
    return () => void soundSubs.delete(cb);
  },
  get: () => {
    try {
      return localStorage.getItem("rr-admin-sound") !== "0";
    } catch {
      return true;
    }
  },
  set: (v: boolean) => {
    try {
      localStorage.setItem("rr-admin-sound", v ? "1" : "0");
    } catch {}
    soundSubs.forEach((f) => f());
  },
};

export function AdminProvider({
  initial,
  role,
  children,
}: {
  initial: AdminState;
  role: "admin" | "staff";
  children: React.ReactNode;
}) {
  const router = useRouter();

  // Live Red Rose stores
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const rrOrders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const rrSessions = useSyncExternalStore(subscribeToSessions, getSessionsSnapshot, getSessionsServerSnapshot);
  const rrBills = useSyncExternalStore(subscribeToBills, getBillsSnapshot, getBillsServerSnapshot);
  const rrCoupons = useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);

  // Build the AdminState snapshot from Red Rose data
  const s: AdminState = useMemo(
    () => ({
      ...initial,
      products: menu.map(toProduct),
      orders: rrOrders.map(toOrder),
      sessions: rrSessions.map(toSession),
      bills: rrBills.map(toBill),
      coupons: rrCoupons.map(toCoupon),
    }),
    [initial, menu, rrOrders, rrSessions, rrBills, rrCoupons]
  );

  // Floor tabs — the open sessions, with their orders aggregated
  const floor: FloorTab[] = useMemo(() => {
    return s.sessions
      .filter((sess) => sess.status === "open")
      .map((sess) => {
        const sessOrders = s.orders.filter((o) => o.sessionId === sess.id);
        const items = sessOrders.reduce(
          (sum, o) => sum + o.items.reduce((is, it) => is + it.qty, 0),
          0
        );
        const total = sessOrders.reduce((sum, o) => sum + o.subtotal, 0);
        const fresh = sessOrders.filter((o) => o.status === "new").length;
        const cooking = sessOrders.filter((o) => o.status === "preparing").length;
        return {
          session: sess,
          orders: sessOrders,
          total,
          items,
          fresh,
          cooking,
          billRequested: sess.billRequestedAt !== null,
        };
      });
  }, [s.sessions, s.orders]);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++tid.current;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(
        () => dismiss(id),
        t.kind === "order" || t.kind === "bill" ? 12000 : t.kind === "err" ? 7000 : 4000
      );
    },
    [dismiss]
  );

  // Confirm modal
  const [pending, setPending] = useState<ConfirmReq | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback(
    (c: ConfirmReq) =>
      new Promise<boolean>((resolve) => {
        setPending(c);
        resolver.current = resolve;
      }),
    []
  );
  const answer = useCallback((v: boolean) => {
    const r = resolver.current;
    resolver.current = null;
    setPending(null);
    if (r) r(v);
  }, []);

  // Print target
  const [printNode, setPrintNode] = useState<React.ReactNode>(null);
  const print = useCallback((node: React.ReactNode) => {
    setPrintNode(node);
    requestAnimationFrame(() => window.print());
    setTimeout(() => setPrintNode(null), 1500);
  }, []);

  // Sound
  const sound = useSyncExternalStore(soundPref.subscribe, soundPref.get, () => true);
  const setSound = useCallback((v: boolean) => soundPref.set(v), []);

  // Live clock for "ago" renders
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const base = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );

  // ---------------------------------------------------------------------------
  // act() — route admin ops to Red Rose store mutations
  // ---------------------------------------------------------------------------
  const act = useCallback(
    async <T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<ActResult<T>> => {
      try {
        switch (op) {
          case "order.status": {
            const id = args.id as string;
            const status = args.status as OrderStatus;
            const inverse: Record<OrderStatus, RrOrderStatus> = {
              new: "pending",
              preparing: "cooking",
              ready: "ready",
              served: "served",
              cancelled: "served",
            };
            rrUpdateOrderStatus(id, inverse[status] ?? "pending");
            return { ok: true, result: undefined as T };
          }
          case "product.toggle": {
            const id = args.id as string;
            const item = menu.find((m) => m.id === id);
            if (!item) return { ok: false, error: "Product not found." };
            rrUpdateMenuItem(id, { status: item.status === "active" ? "inactive" : "active" });
            return { ok: true, result: undefined as T };
          }
          case "product.stock": {
            const id = args.id as string;
            const stock = args.stock as number | null;
            rrUpdateMenuItem(id, { stock: stock ?? undefined });
            return { ok: true, result: undefined as T };
          }
          case "product.delete": {
            const id = args.id as string;
            rrDeleteMenuItem(id);
            return { ok: true, result: undefined as T };
          }
          case "product.save": {
            const p = args as Partial<Product> & { id?: string };
            const payload: Partial<MenuItem> = {
              name: p.name,
              category: p.category ?? "Other",
              price: p.price ?? 0,
              description: p.description ?? "",
              image: p.image ?? "",
              stock: p.stock ?? undefined,
              lowStockThreshold: p.lowAt ?? undefined,
              status: p.active === false ? "inactive" : "active",
            };
            if (p.id) rrUpdateMenuItem(p.id, payload);
            else rrAddMenuItem(payload as MenuItem);
            return { ok: true, result: undefined as T };
          }
          case "coupon.save": {
            const c = args as Partial<Coupon> & { id?: string };
            const payload = {
              code: (c.code ?? "").toUpperCase(),
              discountPercent: c.percent ?? 0,
              minOrder: c.minOrder ?? 0,
              expiry: c.expiresAt ?? "",
              usageLimit: c.limit ?? 0,
              active: c.active ?? true,
            };
            if (c.id) rrUpdateCoupon(c.id, payload as Partial<RrCoupon>);
            else rrAddCoupon(payload as unknown as RrCoupon);
            return { ok: true, result: undefined as T };
          }
          case "coupon.delete": {
            const id = args.id as string;
            rrDeleteCoupon(id);
            return { ok: true, result: undefined as T };
          }
          default:
            return { ok: false, error: `This panel is read-only on Red Rose — "${op}" isn't wired up.` };
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
      }
    },
    [menu]
  );

  const refresh = useCallback(async () => {
    // Red Rose realtime keeps us in sync; nothing explicit to do.
    router.refresh();
  }, [router]);

  return (
    <C.Provider
      value={{
        s,
        role,
        act,
        refresh,
        toast,
        toasts,
        dismiss,
        confirm,
        pending,
        answer,
        print,
        printNode,
        sound,
        setSound,
        base,
        now,
        floor,
      }}
    >
      {children}
    </C.Provider>
  );
}
