"use client";

// Settings — opened from the sidebar, nowhere else.
//
// One switch so far: does the website take orders from customers? It lives
// here rather than on the Online orders page because it is a decision about
// the shop, not about the queue of orders in front of you. The sidebar reaches
// it from any page, which is the point: the owner can close the website from
// wherever he happens to be standing.
//
// Off does not hide the menu. Customers still see every item, every photo and
// every price — they simply have no way to send an order, and the server
// refuses one even if somebody tries by hand (app/lib/server/ops.ts).

import { useState } from "react";
import { useAdmin } from "./Store";
import { Icon, Modal, Switch, cx } from "./kit";

export function OnlineStatusBadge({ className }: { className?: string }) {
  const { ops } = useAdmin();
  const on = ops.orderingEnabled;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide",
        on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
        className,
      )}
      title={
        on
          ? "Customers can order from the website."
          : "The website is browse-only. Change it in Settings."
      }
    >
      <span className={cx("h-2 w-2 rounded-full", on ? "adm-pulse bg-emerald-500" : "bg-slate-400")} />
      {on ? "Website live" : "Website inactive"}
    </span>
  );
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ops, setOps, toast } = useAdmin();
  const [busy, setBusy] = useState(false);
  const on = ops.orderingEnabled;

  const flip = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    const r = await setOps({ ...ops, orderingEnabled: next });
    setBusy(false);
    if (!r.ok) return toast({ kind: "err", title: "Could not change that", body: r.error });
    toast({
      kind: "ok",
      title: next ? "Website ordering is ON" : "Website ordering is OFF",
      body: next
        ? "Customers can order from the website again."
        : "Customers can still browse the menu — they just cannot send an order.",
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div
        className={cx(
          "flex flex-wrap items-center gap-4 rounded-2xl border-2 px-4 py-3.5",
          on ? "border-emerald-200 bg-emerald-50/70" : "border-amber-300 bg-amber-50",
        )}
      >
        <span
          className={cx(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white",
            on ? "bg-emerald-500" : "bg-amber-500",
          )}
        >
          <Icon name={on ? "globe" : "belloff"} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <b className={cx("block text-[14.5px]", on ? "text-emerald-950" : "text-amber-950")}>
            {on ? "The website is taking orders" : "The website is not taking orders"}
          </b>
          <span className={cx("block text-[12.5px]", on ? "text-emerald-800" : "text-amber-800")}>
            {on
              ? "Customers can order from the menu and their orders land on the Online orders page."
              : "Customers can browse the menu and see every price — they just cannot place an order."}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className={cx("text-[11px] font-bold uppercase tracking-[0.14em]", on ? "text-emerald-700" : "text-amber-700")}>
            {on ? "On" : "Off"}
          </span>
          <Switch on={on} onChange={flip} label="Website ordering" />
        </span>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
        Turning this off changes nothing at the counter — billing, open tabs, the chef station and
        the waiter station all carry on as normal, and you can still take an order for a customer
        yourself.
      </p>
    </Modal>
  );
}
