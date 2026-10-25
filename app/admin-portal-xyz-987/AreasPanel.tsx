"use client";
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { staffCall } from './staffApi';
import type { DeliveryArea } from '../lib/delivery/shared';

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-brand-gold/40 text-sm focus:outline-none focus:border-brand-red bg-white';
const label = 'text-[11px] font-bold uppercase tracking-wide text-brand-wine/60 mb-1 block';

// A row being edited. `fee` / `minOrder` stay strings so typing "0." works.
interface Draft { id: string | null; name: string; fee: string; minOrder: string; active: boolean; sort: number }

const toDraft = (a: DeliveryArea): Draft => ({
  id: a.id, name: a.name, fee: String(a.fee), minOrder: a.minOrder === null ? '' : String(a.minOrder), active: a.active, sort: a.sort,
});

export default function AreasPanel() {
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const r = await staffCall<{ areas: DeliveryArea[] }>('areas.list');
    setRows(r.areas.map(toDraft));
    setDirty(new Set());
  };

  useEffect(() => {
    let alive = true;
    staffCall<{ areas: DeliveryArea[] }>('areas.list')
      .then((r) => { if (alive) setRows(r.areas.map(toDraft)); })
      .catch((e: Error) => { if (alive) { setRows([]); setMsg({ ok: false, text: e.message }); } });
    return () => { alive = false; };
  }, []);

  if (!rows) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-brand-red" /></div>;

  // New rows have no id yet, so they are tracked by their position ("new-<index>").
  const keyOf = (r: Draft, i: number) => r.id ?? `new-${i}`;
  const edit = (i: number, patch: Partial<Draft>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(new Set(dirty).add(keyOf(rows[i], i)));
  };

  const save = async (i: number) => {
    const r = rows[i];
    const k = keyOf(r, i);
    setBusy(k); setMsg(null);
    try {
      await staffCall('areas.save', {
        id: r.id ?? undefined, name: r.name, fee: Number(r.fee || 0),
        minOrder: r.minOrder.trim() === '' ? null : Number(r.minOrder), active: r.active, sort: r.sort,
      });
      await load();
      setMsg({ ok: true, text: `${r.name} saved.` });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(null);
  };

  const remove = async (i: number) => {
    const r = rows[i];
    if (!r.id) { setRows(rows.filter((_, j) => j !== i)); return; }
    if (!window.confirm(`Delete "${r.name}"? Past orders keep their area name.`)) return;
    setBusy(r.id); setMsg(null);
    try { await staffCall('areas.delete', { id: r.id }); await load(); setMsg({ ok: true, text: 'Area deleted.' }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(null);
  };

  const addRow = () => setRows([...rows, { id: null, name: '', fee: '1', minOrder: '', active: true, sort: rows.length + 1 }]);

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-sm text-brand-wine/70">No areas yet. Add one below. Customers can only order delivery to areas listed here.</p>}
      {rows.map((r, i) => {
        const k = keyOf(r, i);
        return (
          <div key={k} className={`rounded-2xl border p-3 grid grid-cols-2 sm:grid-cols-12 gap-3 items-end ${r.active ? 'border-brand-gold/40' : 'border-brand-gold/40 bg-brand-sand/40'}`}>
            <div className="col-span-2 sm:col-span-4"><span className={label}>Area name</span><input className={inputCls} value={r.name} onChange={(e) => edit(i, { name: e.target.value })} placeholder="For example Salmiya" /></div>
            <div className="sm:col-span-2"><span className={label}>Fee (KD)</span><input type="number" step="0.05" min="0" className={inputCls} value={r.fee} onChange={(e) => edit(i, { fee: e.target.value })} /></div>
            <div className="sm:col-span-2"><span className={label}>Min. order</span><input type="number" step="0.5" min="0" className={inputCls} value={r.minOrder} onChange={(e) => edit(i, { minOrder: e.target.value })} placeholder="general" /></div>
            <label className="sm:col-span-1 flex items-center gap-1.5 text-sm pb-2.5"><input type="checkbox" checked={r.active} onChange={(e) => edit(i, { active: e.target.checked })} /> On</label>
            <div className="col-span-2 sm:col-span-3 flex gap-2 justify-end">
              <button type="button" onClick={() => save(i)} disabled={busy === k || !r.name.trim()}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 ${dirty.has(k) || !r.id ? 'bg-brand-red text-white' : 'border border-brand-gold/40 text-brand-wine/75'}`}>
                {busy === k ? 'Saving…' : r.id ? 'Save' : 'Add'}
              </button>
              <button type="button" onClick={() => remove(i)} disabled={busy === k} className="p-2.5 text-red-500 disabled:opacity-40" aria-label="Delete area"><Trash2 size={16} /></button>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4">
        <button type="button" onClick={addRow} className="flex items-center gap-1 text-sm font-bold text-brand-red"><Plus size={14} /> Add area</button>
        {msg && <span className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-brand-red'}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-brand-wine/70">Fee 0 means free delivery to that area. Leave &quot;Min. order&quot; empty to use the general minimum order. Switch an area off to hide it from customers without deleting it.</p>
    </div>
  );
}
