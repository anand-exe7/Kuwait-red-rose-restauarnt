"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pagination, usePagination } from '../components/Pagination';
import { Plus, X, Pencil, Trash2, Armchair, MapPin } from 'lucide-react';
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

// Table Management — just the floor plan. QR flows were removed because the
// waiter now opens the table from the Waiter Dashboard directly, and dine-in
// customers who want to self-order simply visit the public menu.

export default function TablesSection() {
  const tables = useSyncExternalStore(subscribeToTables, getTablesSnapshot, getTablesServerSnapshot);
  const sorted = useMemo(() => [...tables].sort((a, b) => a.number - b.number), [tables]);
  const pager = usePagination(sorted, 12);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: RestaurantTable) => { setEditing(t); setFormOpen(true); };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-brand-cream rounded-3xl border border-brand-gold/30 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-brand-wine">Table Management</h2>
            <p className="text-sm text-brand-wine/70">Add, edit and remove tables. Waiters pick a table from their dashboard to open its tab.</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold transition-colors shrink-0 shadow-[0_12px_24px_-10px_rgba(176,30,40,0.55)]"
          >
            <Plus size={16} /> Add Table
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-brand-cream rounded-3xl border border-brand-gold/30 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-16 text-center text-brand-wine/60 font-bold">
          No tables yet. Add your first table above.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pager.items.map(t => (
            <div
              key={t.id}
              className={`bg-brand-cream rounded-3xl border shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 flex flex-col ${t.active ? 'border-brand-gold/30' : 'border-brand-gold/20 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xl font-black flex items-center gap-2 text-brand-wine">
                    <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-brand-red/10 text-brand-red font-black text-sm border border-brand-red/30 shrink-0">
                      {t.number}
                    </span>
                    <span className="truncate">{t.label || `Table ${t.number}`}</span>
                  </p>
                  <p className="text-xs text-brand-wine/70 flex flex-wrap items-center gap-3 mt-2">
                    <span className="inline-flex items-center gap-1"><MapPin size={12} /> {t.zone}</span>
                    <span className="inline-flex items-center gap-1"><Armchair size={12} /> {t.seats} seats</span>
                    {!t.active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-wine/10 text-brand-wine/60 font-bold uppercase">Off</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(t)}
                    title="Edit"
                    className="p-2 rounded-lg text-brand-wine hover:bg-brand-sand transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  {confirmDeleteId === t.id ? (
                    <div className="flex items-center gap-1 text-xs font-bold">
                      <button
                        onClick={() => { deleteTable(t.id); setConfirmDeleteId(null); }}
                        className="px-2 py-1 rounded bg-brand-red text-white"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded bg-brand-sand text-brand-wine"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(t.id)}
                      title="Delete"
                      className="p-2 rounded-lg text-brand-red hover:bg-brand-red/10 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pager.pages > 1 && (
        <div className="bg-brand-cream rounded-3xl border border-brand-gold/30 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)]">
          <Pagination p={pager} label="tables" />
        </div>
      )}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2a0a0a]/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-brand-cream rounded-3xl w-full max-w-md p-6 md:p-8 border border-brand-gold/30 shadow-[0_30px_60px_-20px_rgba(30,0,4,0.55)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-brand-wine">{table ? 'Edit Table' : 'Add Table'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-brand-sand text-brand-wine"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-brand-wine/60 mb-1.5 block uppercase tracking-wide">Table Number</label>
              <input
                value={number}
                onChange={e => setNumber(e.target.value)}
                type="number"
                min="1"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-sm text-brand-ink focus:outline-none focus:border-brand-red"
                placeholder="e.g. 13"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-brand-wine/60 mb-1.5 block uppercase tracking-wide">Seats</label>
              <input
                value={seats}
                onChange={e => setSeats(e.target.value)}
                type="number"
                min="1"
                className="w-full px-4 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-sm text-brand-ink focus:outline-none focus:border-brand-red"
                placeholder="4"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-brand-wine/60 mb-1.5 block uppercase tracking-wide">Label (optional)</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-sm text-brand-ink focus:outline-none focus:border-brand-red"
              placeholder="e.g. Window 1"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-brand-wine/60 mb-1.5 block uppercase tracking-wide">Zone</label>
            <select
              value={zone}
              onChange={e => setZone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-sm text-brand-ink focus:outline-none focus:border-brand-red"
            >
              {['Indoor', 'Terrace', 'Outdoor', 'Family', 'VIP'].map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-brand-wine">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-brand-red" />
            Active (available for seating)
          </label>
          {error && (
            <p className="text-sm font-semibold text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            className="w-full py-3.5 bg-brand-red hover:bg-brand-red-dark text-white rounded-xl font-black text-sm transition-colors mt-2 shadow-[0_14px_28px_-10px_rgba(176,30,40,0.55)]"
          >
            {table ? 'Save Changes' : 'Add Table'}
          </button>
        </form>
      </div>
    </div>
  );
}
