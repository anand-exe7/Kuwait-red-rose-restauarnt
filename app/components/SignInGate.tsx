"use client";

// Modal that appears when an action requires sign-in. Google OAuth only.
// Supabase handles the redirect to Google and back to /auth/callback.

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { signInWithGoogle, customerAuthAvailable } from '../lib/customerAuthStore';

interface SignInGateProps {
  open: boolean;
  onClose: () => void;
  /** Fires once the viewer is actually signed in — the parent then advances
   *  checkout without waiting on a useEffect to notice the auth change. */
  onSignedIn?: () => void;
  title?: string;
  message?: string;
}

export default function SignInGate({
  open,
  onClose,
  // onSignedIn is kept for API compatibility with callers — Google OAuth
  // returns via a full page redirect, so we never actually fire it in this
  // flow, but the prop stays to match the earlier contract.
  onSignedIn: _onSignedIn,
  title = 'Sign in to continue',
  message = 'Sign in with Google to place your order. We only use this to tie the order to you.',
}: SignInGateProps) {
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset per-open state so a stale error / spinner from a previous attempt
  // doesn't carry over.
  useEffect(() => {
    if (!open) { setGoogleBusy(false); setGoogleError(null); }
  }, [open]);

  if (!open) return null;

  const configured = customerAuthAvailable();

  const continueWithGoogle = async () => {
    setGoogleError(null);
    setGoogleBusy(true);
    const ok = await signInWithGoogle();
    if (!ok) {
      setGoogleBusy(false);
      setGoogleError(
        'Google sign-in is not available on this deploy. Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set on Vercel, that Google is enabled in Supabase → Authentication → Providers, and that this origin is in the Redirect URLs list.'
      );
      return;
    }
    // ok === true means the browser is being redirected to Google now.
    // Leave the spinner on until the page navigates away.
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

        {!configured ? (
          <p className="mt-6 rounded-xl border border-brand-red/30 bg-brand-red/5 px-3 py-3 font-body text-[12px] leading-relaxed text-brand-red">
            Sign-in is not configured on this deploy. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel, and enable Google in Supabase → Authentication → Providers.
          </p>
        ) : (
          <>
            <button
              onClick={() => void continueWithGoogle()}
              disabled={googleBusy}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-brand-wine/15 bg-white px-5 py-3.5 font-body text-sm font-semibold text-brand-wine shadow-sm transition-all hover:border-brand-wine/30 hover:bg-brand-cream disabled:cursor-not-allowed disabled:opacity-70"
            >
              {googleBusy ? <Loader2 size={16} className="animate-spin" /> : <GoogleG />}
              {googleBusy ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>
            {googleError && (
              <p className="mt-3 rounded-xl border border-brand-red/30 bg-brand-red/5 px-3 py-2 font-body text-[11px] leading-relaxed text-brand-red">
                {googleError}
              </p>
            )}
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
