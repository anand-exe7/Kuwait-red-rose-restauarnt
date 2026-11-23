"use client";

// The manager-password box.
//
// One component for both places that ask for it — the confirmation dialog in
// front of every delete (Shell.tsx) and the screen in front of the analytics
// (LockGate.tsx) — so the counter sees the same box, with the same wording,
// wherever the panel stops them.
//
// It holds no state and talks to nothing: whoever renders it owns the value and
// decides what submitting means. The password itself only ever travels to
// /api/lock, which compares it against ADMIN_LOCK_PASSWORD on the server.

import { useState } from "react";
import { Icon, cx, inputCls, labelCls } from "./kit";

export default function LockField({
  value,
  onChange,
  onEnter,
  error,
  busy,
  configured,
  label = "Manager password",
  note,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Enter in the box — the dialogs wire this to their confirm button. */
  onEnter?: () => void;
  error?: string;
  busy?: boolean;
  /** False when ADMIN_LOCK_PASSWORD is missing on the server. */
  configured?: boolean;
  label?: string;
  note?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);

  if (configured === false) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-900" role="alert">
        No manager password is set on this server, so nothing can be unlocked. Add
        <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[12px]">ADMIN_LOCK_PASSWORD</code>
        to the environment and restart.
      </p>
    );
  }

  return (
    <div>
      <label className="block">
        <span className={labelCls}>{label}</span>
        <span className="relative block">
          <input
            type={show ? "text" : "password"}
            className={cx(inputCls, "pr-11")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onEnter) {
                e.preventDefault();
                onEnter();
              }
            }}
            autoComplete="off"
            autoFocus={autoFocus}
            disabled={busy}
            // A till is a touch screen more often than not; a numeric pad is
            // what the counter actually wants to see.
            inputMode="text"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-700"
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            tabIndex={-1}
          >
            <Icon name={show ? "eyeoff" : "eye"} size={17} />
          </button>
        </span>
      </label>
      {note && <p className="mt-2 text-[12px] text-slate-500">{note}</p>}
      {error && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
