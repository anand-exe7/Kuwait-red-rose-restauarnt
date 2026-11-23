"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import type { GateRole } from '../lib/session';

const ROLE_TITLES: Record<GateRole, string> = {
  admin: 'Admin Portal',
  waiter: 'Waiter Station',
  chef: 'Chef Station',
};

export default function LoginForm({ role, next }: { role: GateRole; next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }
      // Full navigation so the new cookie is picked up by the proxy gate.
      window.location.assign(next || '/');
    } catch {
      setError('Network error — please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] w-full bg-brand-cream text-brand-ink flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/finallogo.jpeg" alt="Red Rose Sweets" className="w-40 h-auto rounded-2xl shadow-lg mb-5" />
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-gold-dark">
            <ShieldCheck size={14} /> Staff Access
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border border-brand-gold/30 shadow-xl shadow-brand-red/5 p-7"
        >
          <h1 className="text-2xl font-black text-center mb-1">{ROLE_TITLES[role]}</h1>
          <p className="text-sm text-center text-brand-ink/50 mb-6">Enter the password to continue</p>

          <label className="text-xs font-bold uppercase tracking-wide text-brand-ink/50 mb-1.5 block">
            Password
          </label>
          <div className="relative mb-4">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-ink/30" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full pl-10 pr-11 py-3 rounded-xl border border-brand-ink/10 bg-brand-cream/40 text-sm focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-lg text-brand-ink/40 hover:text-brand-ink/70 hover:bg-brand-ink/5 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p className="text-sm font-semibold text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3.5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white font-black text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-red/20 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-brand-ink/40 mt-6">Red Rose Sweets · Kuwait</p>
      </div>
    </div>
  );
}
