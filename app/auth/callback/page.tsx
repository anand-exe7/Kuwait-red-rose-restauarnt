"use client";

// OAuth callback — Supabase sends the browser back here after Google sign-in.
// Supports both flows:
//   PKCE   → "?code=…" in the query string, exchanged for a session.
//   Implicit → "#access_token=…" in the hash, picked up by getSession().
// Then forwards the user to the page they were on when they tapped Sign in
// (?next=…). The next-URL is sanity-checked so a bad redirect can't land
// them on another origin.

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  // Reject absolute URLs and protocol-relative paths — only in-app paths.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Signing you in…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const next = safeNext(url.searchParams.get('next'));

      // Supabase can report the error in the query string (PKCE) or in the
      // hash fragment (implicit). Pull it out of either one.
      const qsErr = url.searchParams.get('error_description') ?? url.searchParams.get('error');
      const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
      const hashParams = new URLSearchParams(hash);
      const hashErr = hashParams.get('error_description') ?? hashParams.get('error');
      const providerErr = qsErr || hashErr;
      if (providerErr) {
        console.error('[auth] provider returned error', providerErr);
        setError(decodeURIComponent(providerErr.replace(/\+/g, ' ')));
        setMessage('Sign-in was cancelled or refused.');
        setTimeout(() => (window.location.href = next), 2200);
        return;
      }

      const sb = getSupabase();
      if (!sb) {
        setError('Supabase env vars are missing on this deploy.');
        setMessage('Sign-in is not configured. Redirecting…');
        setTimeout(() => (window.location.href = next), 1600);
        return;
      }

      // Implicit flow — Google puts the access token in the URL hash and
      // `detectSessionInUrl: true` on the client already picks it up and
      // persists the session. We just need to wait for that to happen,
      // then verify the session exists before redirecting the user.
      // Give supabase-js up to ~5s to finish parsing the hash.
      let session = (await sb.auth.getSession()).data.session;
      const deadline = Date.now() + 5000;
      while (!session && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 150));
        session = (await sb.auth.getSession()).data.session;
      }
      if (!session) {
        setError('No session was established. Check Supabase redirect URL config.');
        setMessage('Sign-in failed — redirecting back.');
        setTimeout(() => (window.location.href = next), 2200);
        return;
      }

      window.location.replace(next);
    };
    void run();
  }, []);

  return (
    <main className="min-h-screen bg-brand-cream flex items-center justify-center px-6 text-center">
      <div>
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand-red/30 border-t-brand-red" />
        <p className="mt-6 font-body text-brand-wine">{message}</p>
        {error && (
          <p className="mx-auto mt-3 max-w-sm rounded-xl border border-brand-red/30 bg-brand-red/5 px-4 py-2 font-body text-xs text-brand-red">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
