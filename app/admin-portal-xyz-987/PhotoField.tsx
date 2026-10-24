"use client";
import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { compressToWebp } from '../lib/compressImage';

// Menu photo picker: choose a picture, it is shrunk to WebP in the browser, uploaded to
// the Supabase Storage bucket through /api/upload, and the resulting link is stored
// on the menu item. Pasting a link still works as a fallback.

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function PhotoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const { blob, originalBytes } = await compressToWebp(file);
      const form = new FormData();
      form.append('file', blob, 'photo.webp');
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? 'Upload failed. Please try again.');
      onChange(json.url as string);
      setMsg({ ok: true, text: `Uploaded as WebP: ${kb(originalBytes)} → ${kb(blob.size)}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = ''; // lets the same file be picked again
  };

  return (
    <div>
      <label className="text-xs font-bold text-black/50 mb-1.5 block">Photo</label>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-2xl border border-black/10 bg-black/[0.03] overflow-hidden shrink-0 flex items-center justify-center">
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="" className="w-full h-full object-cover" />
            : <ImagePlus size={26} className="text-black/25" />}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="px-4 py-2.5 rounded-xl bg-brand-red text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Uploading…</> : <><ImagePlus size={16} /> {value ? 'Change photo' : 'Choose photo'}</>}
            </button>
            {value && !busy && (
              <button type="button" onClick={() => { onChange(''); setMsg(null); }} className="p-2.5 rounded-xl border border-black/10 text-red-500" aria-label="Remove photo">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <p className="text-xs text-black/50">Any photo works. It is resized and saved as WebP automatically.</p>
          {msg && <p className={`text-xs font-bold ${msg.ok ? 'text-emerald-600' : 'text-brand-red'}`}>{msg.text}</p>}
        </div>
      </div>
      <details className="mt-2">
        <summary className="text-xs text-black/40 cursor-pointer">Or paste an image link</summary>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://..."
          className="mt-2 w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" />
      </details>
    </div>
  );
}
