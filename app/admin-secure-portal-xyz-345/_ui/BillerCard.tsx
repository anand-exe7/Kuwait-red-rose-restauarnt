"use client";

// "Who is billing" — the strip at the top of the right-hand column on both
// billing panels (the shop's and wholesale's), right under the Counter/Tab
// toggle, which is where the shop asked for it.
//
// The problem it solves: two people work the counter, the owner and one other,
// and they share one panel login. Without this every bill would read as the
// owner's, and there would be nothing stopping the second man putting his
// takings under the owner's name — or the other way round.
//
// How it works:
//   * Nobody is signed on until somebody picks their name AND types their own
//     password (BILLERS on the server). One of them cannot switch the till into
//     the other's name, because he does not have the other's password.
//   * Once on, it stays on — bill after bill, no password again.
//   * "Sign off" needs no password: handing the counter over is not a
//     privilege. It then STAYS off until the next person signs on, so the till
//     is never quietly left in the last person's name.
//   * No name signed on → nothing can be billed. The panel says so, and the
//     server refuses the bill as well (app/api/db/route.ts), so this is a rule
//     and not a reminder.
//
// It is kept deliberately small. It sits above the bill summary on a screen
// the counter works all day, and once somebody is signed on it has one job:
// say the name. So the signed-on state is a single line, and the sign-on state
// is a title, the name chips, and a password box that only appears once a name
// is picked.

import { useState } from "react";
import { useAdmin } from "./Store";
import { Icon, cx } from "./kit";

export default function BillerCard() {
  const { biller, signInBiller, signOutBiller } = useAdmin();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = (n: string) => {
    setName((cur) => (cur === n ? "" : n));
    setPw("");
    setErr("");
  };

  const submit = async () => {
    if (busy || !name || !pw) return;
    setBusy(true);
    setErr("");
    const r = await signInBiller(name, pw);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not sign you in.");
      setPw("");
      return;
    }
    setName("");
    setPw("");
  };

  const signOff = async () => {
    setBusy(true);
    await signOutBiller();
    setBusy(false);
    setName("");
    setPw("");
    setErr("");
  };

  if (biller.loading) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[12px] text-slate-400">
        Checking who is on the till…
      </div>
    );
  }

  /* ---------- signed on: one line, all day ---------- */
  if (biller.current) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-emerald-900">
          Billing as <b className="font-bold">{biller.current}</b>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={signOff}
          className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-bold text-emerald-800 underline-offset-2 hover:bg-emerald-100 hover:underline disabled:opacity-50"
        >
          {busy ? "…" : "Sign off"}
        </button>
      </div>
    );
  }

  /* ---------- nobody on: no name, no bill ---------- */
  if (!biller.names.length) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
        <b>No billers are set up.</b> Nothing can be billed until
        <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">BILLERS</code>
        is set in the environment.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-amber-950">
        <Icon name="key" size={13} className="shrink-0" />
        Who is billing?
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {biller.names.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            className={cx(
              "h-8 max-w-full truncate rounded-full px-3 text-[12px] font-bold transition",
              name === n ? "bg-slate-900 text-white shadow" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {n}
          </button>
        ))}
      </div>

      {name ? (
        <div className="adm-in mt-2 flex gap-1.5">
          <span className="relative min-w-0 flex-1">
            <input
              type={show ? "text" : "password"}
              className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-[13px] text-slate-900 outline-none focus:border-slate-400"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Your password"
              autoComplete="off"
              autoFocus
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-9 place-items-center text-slate-400 hover:text-slate-700"
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
              tabIndex={-1}
            >
              <Icon name={show ? "eyeoff" : "eye"} size={15} />
            </button>
          </span>
          <button
            type="button"
            disabled={busy || !pw}
            onClick={submit}
            className="h-9 shrink-0 rounded-lg bg-red-600 px-3.5 text-[12.5px] font-bold text-white transition hover:bg-red-700 disabled:opacity-45"
          >
            {busy ? "…" : "Start"}
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-[11.5px] text-amber-800">
          Pick your name — nothing can be billed until you do.
        </p>
      )}

      {err && (
        <p className="mt-1.5 text-[11.5px] font-bold text-red-700" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
