"use client";

// OAuth callback — Supabase sends the browser back here with ?code=... after
// Google sign-in. We exchange the code for a session, then forward to the
// page the user was on when they tapped Sign in (?next=...).

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export const dynamic = 'force-dynamic';

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const next = url.searchParams.get('next') || '/';
      const sb = getSupabase();
      if (!sb) {
        setMessage('Sign-in is not configured. Redirecting…');
        setTimeout(() => (window.location.href = next), 800);
        return;
      }
      const code = url.searchParams.get('code');
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[auth] code exchange failed', error.message);
          setMessage('Sign-in failed — redirecting back.');
          setTimeout(() => (window.location.href = next), 1200);
          return;
        }
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
      </div>
    </main>
  );
}
