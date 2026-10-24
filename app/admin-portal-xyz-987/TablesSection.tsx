"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pagination, usePagination } from '../components/Pagination';
import QRCode from 'qrcode';
import { Plus, X, Pencil, Trash2, QrCode as QrIcon, Copy, Check, Download, Printer, Armchair, MapPin, PersonStanding } from 'lucide-react';
import {
  RestaurantTable,
  getTablesSnapshot,
  getTablesServerSnapshot,
  subscribeToTables,
  addTable,
  updateTable,
  deleteTable,
  isNumberTaken,
} from '../lib/tableStore';
import QrCode from '../components/QrCode';
import { BRAND } from '../lib/brand';

const noopSub = () => () => {};
const getOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '');
const getOriginServer = () => '';

function tableUrl(origin: string, number: number) {
  return `${origin}/customer?table=${number}`;
}

function standingUrl(origin: string) {
  return `${origin}/customer?mode=standing`;
}

export default function TablesSection() {
  const tables = useSyncExternalStore(subscribeToTables, getTablesSnapshot, getTablesServerSnapshot);
  const origin = useSyncExternalStore(noopSub, getOrigin, getOriginServer);
  const sorted = useMemo(() => [...tables].sort((a, b) => a.number - b.number), [tables]);
  const pager = usePagination(sorted, 9);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedStanding, setCopiedStanding] = useState(false);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: RestaurantTable) => { setEditing(t); setFormOpen(true); };

  const copyLink = async (t: RestaurantTable) => {
    try {
      await navigator.clipboard.writeText(tableUrl(origin, t.number));
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard blocked */ }
  };

  const downloadPng = async (t: RestaurantTable) => {
    try {
      const dataUrl = await QRCode.toDataURL(tableUrl(origin, t.number), {
        margin: 2, width: 600, color: { dark: '#2a1a12', light: '#ffffff' },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `red-rose-table-${t.number}-qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch { /* ignore */ }
  };

  const printAll = async () => {
    const active = sorted;
    const cards = await Promise.all(
      active.map(async (t) => {
        const dataUrl = await QRCode.toDataURL(tableUrl(origin, t.number), {
          margin: 2, width: 500, color: { dark: '#2a1a12', light: '#ffffff' },
        });
        return `
          <div class="card">
            <div class="brand">${BRAND.fullName}</div>
            <div class="scan">Scan to order · امسح للطلب</div>
            <img src="${dataUrl}" alt="Table ${t.number} QR" />
            <div class="tbl">${t.label || 'Table ' + t.number}</div>
            <div class="seats">${t.zone} · ${t.seats} seats</div>
          </div>`;
      })
    );
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Red Rose · Table QR Codes</title>
      <style>
        * { box-sizing: border-box; font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
        body { margin: 0; padding: 16px; background: #fff; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .card { border: 3px solid #c9a961; border-radius: 18px; padding: 20px; text-align: center; page-break-inside: avoid; }
        .brand { color: #b01e28; font-weight: 800; font-size: 20px; }
        .scan { color: #8f1720; font-size: 12px; margin: 4px 0 10px; letter-spacing: .5px; }
        .card img { width: 78%; height: auto; }
        .tbl { font-weight: 800; font-size: 22px; margin-top: 8px; color: #2a1a12; }
        .seats { color: #6b5b4d; font-size: 12px; }
        @media print { .grid { grid-template-columns: repeat(2, 1fr); } }
      </style></head>
      <body><div class="grid">${cards.join('')}</div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Table Management</h2>
            <p className="text-sm text-black/50">Add, edit and remove tables. Each table has its own QR code for guests to scan.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={printAll} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-black/10 hover:border-brand-red text-sm font-bold transition-colors">
              <Printer size={16} /> Print all QR
            </button>
            <button onClick={openAdd} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold transition-colors">
              <Plus size={16} /> Add Table
            </button>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-16 text-center text-black/40 font-bold">
          No tables yet. Add your first table to generate its QR code.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {pager.items.map(t => (
            <div key={t.id} className={`bg-white rounded-3xl border shadow-sm p-5 flex flex-col ${t.active ? 'border-black/5' : 'border-black/5 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-lg font-black flex items-center gap-2">
                    {t.label || `Table ${t.number}`}
                    {!t.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/10 text-black/50 font-bold uppercase">Off</span>}
                  </p>
                  <p className="text-xs text-black/50 flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1"><MapPin size={12} /> {t.zone}</span>
                    <span className="inline-flex items-center gap-1"><Armchair size={12} /> {t.seats}</span>
                    <span className="font-mono">#{t.number}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(t)} title="Edit" className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><Pencil size={15} /></button>
                  {confirmDeleteId === t.id ? (
                    <div className="flex items-center gap-1 text-xs font-bold">
                      <button onClick={() => { deleteTable(t.id); setConfirmDeleteId(null); }} className="px-2 py-1 rounded bg-red-500 text-white">Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded bg-black/5">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(t.id)} title="Delete" className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={15} /></button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="rounded-xl border border-black/5 p-2 bg-white shrink-0">
                  <QrCode value={tableUrl(origin, t.number)} size={104} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <p className="text-[11px] text-black/40 break-all leading-snug flex items-center gap-1">
                    <QrIcon size={12} className="shrink-0" /> {tableUrl(origin, t.number).replace(/^https?:\/\//, '')}
                  </p>
                  <button onClick={() => copyLink(t)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-bold transition-colors">
                    {copiedId === t.id ? <><Check size={13} className="text-emerald-600" /> Copied</> : <><Copy size={13} /> Copy link</>}
                  </button>
                  <button onClick={() => downloadPng(t)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-red/10 hover:bg-brand-red/20 text-brand-red text-xs font-bold transition-colors">
                    <Download size={13} /> Download QR
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Standing Area QR */}
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="rounded-xl border border-black/5 p-2 bg-white shrink-0">
              <QrCode value={standingUrl(origin)} size={104} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-black flex items-center gap-2">
                <PersonStanding size={20} className="text-brand-red" /> Standing Area QR
              </p>
              <p className="text-xs text-black/50 mt-1">For walk-in customers who aren't seated at a table. Scanning this QR gives them a choice between "Dine In" and "Takeaway."</p>
              <p className="text-[11px] text-black/40 mt-1 break-all flex items-center gap-1">
                <QrIcon size={12} className="shrink-0" /> {standingUrl(origin).replace(/^https?:\/\//, '')}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(standingUrl(origin));
                  setCopiedStanding(true);
                  setTimeout(() => setCopiedStanding(false), 1500);
                } catch { /* ignore */ }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-bold transition-colors"
            >
              {copiedStanding ? <><Check size={13} className="text-emerald-600" /> Copied</> : <><Copy size={13} /> Copy link</>}
            </button>
            <button
              onClick={async () => {
                try {
                  const dataUrl = await QRCode.toDataURL(standingUrl(origin), { margin: 2, width: 600, color: { dark: '#2a1a12', light: '#ffffff' } });
                  const a = document.createElement('a');
                  a.href = dataUrl;
                  a.download = 'red-rose-standing-qr.png';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                } catch { /* ignore */ }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-red/10 hover:bg-brand-red/20 text-brand-red text-xs font-bold transition-colors"
            >
              <Download size={13} /> Download QR
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm empty:hidden">
        <Pagination p={pager} label="tables" />
      </div>

      {formOpen && <TableFormModal table={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}

function TableFormModal({ table, onClose }: { table: RestaurantTable | null; onClose: () => void }) {
  const [number, setNumber] = useState(table ? String(table.number) : '');
  const [label, setLabel] = useState(table?.label || '');
  const [seats, setSeats] = useState(table ? String(table.seats) : '4');
  const [zone, setZone] = useState(table?.zone || 'Indoor');
  const [active, setActive] = useState(table?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(number);
    if (!Number.isInteger(num) || num <= 0) { setError('Enter a valid table number.'); return; }
    if (isNumberTaken(num, table?.id)) { setError(`Table number ${num} is already used.`); return; }
    const seatsNum = Math.max(1, Number(seats) || 1);
    const payload = { number: num, label: label.trim() || `Table ${num}`, seats: seatsNum, zone: zone.trim() || 'Indoor', active };
    if (table) updateTable(table.id, payload);
    else addTable(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md p-6 md:p-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black">{table ? 'Edit Table' : 'Add Table'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-black/50 mb-1.5 block">Table Number</label>
              <input value={number} onChange={e => setNumber(e.target.value)} type="number" min="1" required className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="e.g. 13" />
            </div>
            <div>
              <label className="text-xs font-bold text-black/50 mb-1.5 block">Seats</label>
              <input value={seats} onChange={e => setSeats(e.target.value)} type="number" min="1" className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="4" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-black/50 mb-1.5 block">Label (optional)</label>
            <input value={label} onChange={e => setLabel(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="e.g. Window 1" />
          </div>
          <div>
            <label className="text-xs font-bold text-black/50 mb-1.5 block">Zone</label>
            <select value={zone} onChange={e => setZone(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red">
              {['Indoor', 'Terrace', 'Outdoor', 'Family', 'VIP'].map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-brand-red" /> Active (available for seating)
          </label>
          {error && <p className="text-sm font-semibold text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" className="w-full py-3.5 bg-brand-red hover:bg-brand-red-dark text-white rounded-xl font-black text-sm transition-colors mt-2">
            {table ? 'Save Changes' : 'Add Table'}
          </button>
        </form>
      </div>
    </div>
  );
}
