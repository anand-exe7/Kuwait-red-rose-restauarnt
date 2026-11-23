"use client";

// The screen in front of the analytics.
//
// The panel login is shared by whoever is behind the counter, so the figures
// cannot be guarded by signing in — they are guarded by a second password. Until
// it is typed, this is all the page renders; its children are never mounted, so
// no revenue number reaches the browser's DOM at all.
//
// The card sits dead centre — on a phone and on the till screen alike — because
// that is where the shop asked for it.

import { useState } from "react";
import { useAdmin } from "./Store";
import LockField from "./LockField";
import { Btn, Icon } from "./kit";

export default function LockGate({
  title,
  children,
}: {
  /** What is behind the lock, named in the card ("Analytics"). */
  title: string;
  children: React.ReactNode;
}) {
  const { lock, unlock, relock } = useAdmin();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !pw) return;
    setBusy(true);
    setErr("");
    const r = await unlock(pw);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Wrong password.");
      setPw("");
      return;
    }
    setPw("");
  };

  if (lock.unlocked) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
          <p className="flex items-center gap-2 text-[12.5px] font-bold text-emerald-900">
            <Icon name="key" size={15} /> {title} is unlocked. Leave this page and it locks itself again.
          </p>
          <Btn size="sm" kind="plain" className="text-emerald-900" onClick={() => void relock()}>
            Lock now
          </Btn>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="grid min-h-[60dvh] place-items-center p-2">
      <div className="adm-in w-full max-w-[420px] rounded-[26px] border border-slate-100 bg-white p-6 text-center shadow-[0_1px_3px_rgba(15,23,42,.06),0_20px_50px_-24px_rgba(15,23,42,.3)] sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600">
          <Icon name="key" size={26} />
        </span>
        <h1 className="adm-title mt-4 text-[24px] leading-none text-slate-900">{title} is locked</h1>
        <p className="mt-2 text-[13.5px] text-slate-500">
          Enter the manager password to see the figures.
        </p>
        <div className="mt-6 text-left">
          <LockField
            value={pw}
            onChange={setPw}
            onEnter={submit}
            error={err}
            busy={busy}
            configured={lock.configured}
          />
        </div>
        {lock.configured !== false && (
          <Btn
            kind="red"
            size="lg"
            className="mt-5 w-full uppercase tracking-wide"
            disabled={busy || !pw}
            onClick={submit}
          >
            {busy ? "Checking…" : "Unlock"}
          </Btn>
        )}
      </div>
    </div>
  );
}
