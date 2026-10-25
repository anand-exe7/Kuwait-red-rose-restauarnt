"use client";

// Modal that appears when an action requires sign-in. Offers two paths:
//  1. "Continue with your name" — a quick local sign-in that works everywhere
//     and never leaves the page, so the user never gets stuck on an OAuth
//     redirect that failed to come back.
//  2. Google — optional, shown only when Supabase is configured. It is a
//     collapsed secondary option so the primary quick-sign-in is what the
//     user acts on first.

import { useEffect, useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { signInWithGoogle, signInAsDemo, customerAuthAvailable } from '../lib/customerAuthStore';

interface SignInGateProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

export default function SignInGate({
  open,
  onClose,
  title = 'Sign in to continue',
  message = 'Enter your name to place your order. We only use this to tie the order to you.',
}: SignInGateProps) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const configured = customerAuthAvailable();

  const continueWithName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    signInAsDemo(trimmed);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-2 text-brand-wine/60 transition-colors hover:bg-brand-cream hover:text-brand-wine"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-wordmark text-2xl text-brand-wine">{title}</h2>
        <p className="mt-3 font-body text-sm leading-relaxed text-brand-wine/75">{message}</p>

        <label className="mt-6 block">
          <span className="mb-1.5 block font-body text-[11px] font-medium uppercase tracking-[0.22em] text-brand-wine/70">Your name</span>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') continueWithName(); }}
            placeholder="e.g. Anand"
            className="w-full rounded-2xl border border-brand-gold/40 bg-white px-4 py-3 font-body text-sm text-brand-ink focus:border-brand-red focus:outline-none"
          />
        </label>

        <button
          onClick={continueWithName}
          disabled={!name.trim()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-red px-5 py-3.5 font-body text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-red-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue <ArrowRight size={16} />
        </button>

        {configured && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-brand-wine/10" />
              <span className="font-body text-[10px] font-medium uppercase tracking-[0.22em] text-brand-wine/40">or</span>
              <span className="h-px flex-1 bg-brand-wine/10" />
            </div>
            <button
              onClick={() => void signInWithGoogle()}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-brand-wine/15 bg-white px-5 py-3.5 font-body text-sm font-semibold text-brand-wine shadow-sm transition-all hover:border-brand-wine/30 hover:bg-brand-cream"
            >
              <GoogleG />
              Continue with Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 31.9 29.4 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.3 2.8l5.7-5.7C33.5 7 28.9 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.3 19 13 24 13c2.8 0 5.4 1.1 7.3 2.8l5.7-5.7C33.5 7 28.9 5 24 5 16.5 5 10 9.4 6.3 14.1z" />
      <path fill="#4CAF50" d="M24 43c4.8 0 9.3-1.9 12.6-5l-5.8-4.9c-2 1.4-4.5 2.3-6.8 2.3-5.3 0-9.8-3.1-11.3-7.5l-6.5 5C9.9 38.6 16.4 43 24 43z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.6 4.9l5.8 4.9C41 35 44 29.9 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}
