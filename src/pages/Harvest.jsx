import React, { useState } from 'react';
import { Sprout, Edit3, Trash2, Filter } from 'lucide-react';
import { api } from '../api.js';
import { Card, PageHeader, Field, Combo, Select, NumInput, Btn, Modal, Empty, Th, inputCls } from '../components/ui.jsx';
import { todayStr, kgToMon, num, fmtKg } from '../lib/calc.js';

function HarvestForm({ settings, initial, onSubmit, onCancel, submitLabel }) {
  const [f, setF] = useState(
    initial || { date: todayStr(), block: settings.blocks[0]?.name || '', variety: '', totalKg: '', gradeAKg: '', gradeBKg: '', wastageKg: '', notes: '' }
  );
  const [wasteTouched, setWasteTouched] = useState(!!initial);
  const set = (patch) => {
    const next = { ...f, ...patch };
    // wastage follows the remainder until the user types their own number
    if (!wasteTouched && !('wastageKg' in patch)) {
      next.wastageKg = next.totalKg === '' ? '' : String(Math.max(0, num(next.totalKg) - num(next.gradeAKg) - num(next.gradeBKg)));
    }
    setF(next);
  };
  const over = num(f.gradeAKg) + num(f.gradeBKg) > num(f.totalKg) + 0.001;
  const valid = f.variety && num(f.totalKg) > 0 && !over;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(f); }} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Harvest date"><input type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} /></Field>
        <Field label="Orchard block"><Combo value={f.block} onChange={(v) => set({ block: v })} options={settings.blocks.map((b) => b.name)} /></Field>
        <Field label="Mango variety *"><Select value={f.variety} onChange={(v) => set({ variety: v })} placeholder="— Select —" options={settings.varieties.map((v) => v.name)} required /></Field>
        <Field label="Total plucked (KG) *" hint={num(f.totalKg) > 0 ? `= ${kgToMon(f.totalKg)} Mon (মণ)` : '1 Mon = 40 kg'}><NumInput value={f.totalKg} onChange={(v) => set({ totalKg: v })} className="font-semibold" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200"><Field label="Grade A — courier quality (KG)"><NumInput value={f.gradeAKg} onChange={(v) => set({ gradeAKg: v })} /></Field></div>
        <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200"><Field label="Grade B — local market (KG)"><NumInput value={f.gradeBKg} onChange={(v) => set({ gradeBKg: v })} /></Field></div>
        <div className="p-3 rounded-xl bg-stone-100 border border-stone-200"><Field label="Wastage / shrinkage (KG)" hint="Auto-fills with the remainder; type to override"><NumInput value={f.wastageKg} onChange={(v) => { setWasteTouched(true); set({ wastageKg: v }); }} /></Field></div>
      </div>
      {over && <p className="text-sm text-red-600">Grade A + Grade B is more than the total plucked weight.</p>}
      <div className="flex flex-col sm:flex-row gap-3">
        <input type="text" placeholder="Notes (sweetness, crate count, rain delay…)" value={f.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={`${inputCls} flex-1`} />
        {onCancel && <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>}
        <Btn type="submit" disabled={!valid}>{submitLabel}</Btn>
      </div>
    </form>
  );
}

export default function Harvest({ data, metrics: m, act }) {
  const [filter, setFilter] = useState('All');
  const [editing, setEditing] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const rows = filter === 'All' ? data.harvests : data.harvests.filter((h) => h.variety === filter);

  return (
    <>
      <PageHeader title="Daily Harvest & Stock" subtitle="Log what is plucked, split Grade A (courier quality) from Grade B, and watch live stock per variety." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><span className="text-xs text-stone-500">Total harvested</span><p className="text-xl font-extrabold">{fmtKg(m.totalHarvestedKg)}</p><p className="text-xs text-stone-500">{kgToMon(m.totalHarvestedKg)} Mon</p></Card>
        <Card><span className="text-xs text-stone-500">Grade A</span><p className="text-xl font-extrabold text-emerald-700">{fmtKg(m.totalGradeAKg)}</p></Card>
        <Card><span className="text-xs text-stone-500">Grade B</span><p className="text-xl font-extrabold text-amber-700">{fmtKg(m.totalGradeBKg)}</p></Card>
        <Card><span className="text-xs text-stone-500">Wastage</span><p className="text-xl font-extrabold text-stone-500">{fmtKg(m.totalWastageKg)}</p><p className="text-xs text-stone-500">{m.totalHarvestedKg ? ((m.totalWastageKg / m.totalHarvestedKg) * 100).toFixed(1) : 0}% of harvest</p></Card>
      </div>

      <Card>
        <h3 className="text-base font-bold text-emerald-900 flex items-center gap-2 pb-3 mb-4 border-b border-stone-100"><Sprout className="w-5 h-5 text-emerald-600" />Record new harvest batch</h3>
        <HarvestForm key={formKey} settings={data.settings} submitLabel="Save harvest entry"
          onSubmit={async (f) => { const r = await act(() => api.post('/api/harvests', f), `Logged ${f.totalKg} kg of ${f.variety}`); if (r) setFormKey((k) => k + 1); }} />
      </Card>

      <Card>
        <h3 className="text-base font-bold text-stone-900 mb-3">Live stock by variety</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-stone-200"><Th>Variety</Th><Th right>Price/kg</Th><Th right>Grade A in</Th><Th right>Grade B in</Th><Th right>Ordered</Th><Th right>Available A</Th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {m.varietyStock.map((v) => (
                <tr key={v.variety}>
                  <td className="py-2 px-2 font-medium">{v.variety}</td>
                  <td className="py-2 px-2 text-right text-stone-600">{v.price ? `৳${v.price}` : <span className="text-amber-700 text-xs">not set</span>}</td>
                  <td className="py-2 px-2 text-right">{v.harvestedA} kg</td>
                  <td className="py-2 px-2 text-right text-amber-700">{v.harvestedB} kg</td>
                  <td className="py-2 px-2 text-right">{v.reservedKg} kg</td>
                  <td className={`py-2 px-2 text-right font-bold ${v.available < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{v.available} kg{v.available < 0 && ' (pre-order)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-stone-900">Harvest ledger ({rows.length} batches)</h3>
          <div className="flex items-center gap-2"><Filter className="w-4 h-4 text-stone-400" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs font-medium bg-white">
              <option value="All">All varieties</option>
              {data.settings.varieties.map((v) => <option key={v.name}>{v.name}</option>)}
            </select>
          </div>
        </div>
        {rows.length === 0 ? <Empty>No harvest entries yet. Add your first plucking batch above.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-stone-200"><Th>Date</Th><Th>Block</Th><Th>Variety</Th><Th right>Total</Th><Th right>Grade A</Th><Th right>Grade B</Th><Th right>Wastage</Th><Th right>Actions</Th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((h) => (
                  <tr key={h.id} className="hover:bg-stone-50">
                    <td className="py-2.5 px-2 whitespace-nowrap">{h.date}</td>
                    <td className="py-2.5 px-2 text-xs text-stone-600">{h.block}</td>
                    <td className="py-2.5 px-2 font-semibold">{h.variety}</td>
                    <td className="py-2.5 px-2 text-right font-bold whitespace-nowrap">{h.totalKg} kg <span className="text-xs font-normal text-stone-500">({kgToMon(h.totalKg)}m)</span></td>
                    <td className="py-2.5 px-2 text-right font-bold text-emerald-700">{h.gradeAKg}</td>
                    <td className="py-2.5 px-2 text-right text-amber-700">{h.gradeBKg}</td>
                    <td className="py-2.5 px-2 text-right text-stone-500">{h.wastageKg}</td>
                    <td className="py-2.5 px-2 text-right whitespace-nowrap">
                      <button title="Edit" onClick={() => setEditing(h)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700"><Edit3 className="w-4 h-4" /></button>
                      <button title="Delete" onClick={() => window.confirm('Delete this harvest entry?') && act(() => api.del(`/api/harvests/${h.id}`), 'Harvest entry deleted')} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Modal title={`Edit harvest ${editing.id}`} onClose={() => setEditing(null)} wide>
          <HarvestForm settings={data.settings} initial={{ ...editing }} submitLabel="Save changes" onCancel={() => setEditing(null)}
            onSubmit={async (f) => { const r = await act(() => api.put(`/api/harvests/${editing.id}`, f), 'Harvest updated'); if (r) setEditing(null); }} />
        </Modal>
      )}
    </>
  );
}
