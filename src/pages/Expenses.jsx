import React, { useMemo, useState } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { Card, PageHeader, Field, Combo, Select, NumInput, Btn, Modal, Empty, Th, inputCls } from '../components/ui.jsx';
import { LEDGER_KINDS, FARM_WIDE, entOf, todayStr, formatBDT, num, sum } from '../lib/calc.js';

const kindStyle = { Investment: 'bg-purple-100 text-purple-800', Operating: 'bg-amber-100 text-amber-800', Income: 'bg-emerald-100 text-emerald-800' };
const kindHelp = {
  Investment: 'One-time money put in: land lease, equipment purchase, sheep purchase, shed, seedlings.',
  Operating: 'Running costs: fertilizer, medicine, labor, feed, diesel, transport, ads.',
  Income: 'Money earned: sheep sale, kali dal sale, vegetable sale, Grade-B mango sale.'
};
// one-click categories per kind so nothing is hard to find
const QUICK = {
  Investment: ['Land Lease', 'Equipment Purchase', 'Livestock Purchase (Sheep)', 'Trees / Seedlings / Seeds', 'Shed / Fencing / Storage'],
  Operating: ['Fertilizer', 'Pesticide', 'Medicine / Vet Care', 'Labor / Wages', 'Feed & Fodder', 'Irrigation / Electricity / Diesel', 'Cartons & Packaging', 'Local Transport'],
  Income: ['Livestock Sales', 'Crop / Produce Sales', 'Grade-B / Local Market Sales']
};

function EntryForm({ settings, initial, defaultEnt, onSubmit, onCancel, submitLabel }) {
  const lines = [...settings.enterprises, FARM_WIDE];
  const [f, setF] = useState(initial || { date: todayStr(), kind: 'Operating', category: '', description: '', amount: '', block: '', paidTo: '', enterprise: defaultEnt || settings.enterprises[0] });
  const valid = num(f.amount) > 0 && f.category.trim();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(f); }} className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {LEDGER_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setF({ ...f, kind: k })}
            className={`py-2 rounded-xl text-sm font-semibold border ${f.kind === k ? `${kindStyle[k]} border-transparent ring-2 ring-offset-1 ring-stone-300` : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'}`}>{k === 'Operating' ? 'Expense' : k === 'Investment' ? 'Investment' : 'Income'}</button>
        ))}
      </div>
      <p className="text-[11px] text-stone-500 -mt-1">{kindHelp[f.kind]}</p>

      <Field label="Business line"><Select value={f.enterprise || FARM_WIDE} onChange={(v) => setF({ ...f, enterprise: v })} options={lines} /></Field>

      <div>
        <span className="block text-xs font-semibold text-stone-700 mb-1">Category * <span className="font-normal text-stone-500">(tap one or type your own)</span></span>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK[f.kind].map((c) => (
            <button key={c} type="button" onClick={() => setF({ ...f, category: c })}
              className={`text-xs px-2.5 py-1 rounded-full border ${f.category === c ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'}`}>{c}</button>
          ))}
        </div>
        <Combo value={f.category} onChange={(v) => setF({ ...f, category: v })} options={settings.categories} placeholder="Category" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date"><input type="date" required className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount (৳) *"><NumInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} className="font-bold" /></Field>
      </div>
      <Field label="Description"><input className={inputCls} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. 50 kg urea, 5 sheep from Rajshahi haat, 6 workers × 3 days" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Paid to / received from"><input className={inputCls} value={f.paidTo || ''} onChange={(e) => setF({ ...f, paidTo: e.target.value })} /></Field>
        {(f.enterprise === 'Mango') && <Field label="Mango block" hint="Blank = shared across blocks"><Select value={f.block || ''} onChange={(v) => setF({ ...f, block: v })} placeholder="Shared" options={settings.blocks.map((b) => b.name)} /></Field>}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>}
        <Btn type="submit" disabled={!valid}>{submitLabel}</Btn>
      </div>
    </form>
  );
}

export default function Expenses({ data, metrics: m, act }) {
  const lines = [...data.settings.enterprises, FARM_WIDE];
  const [tab, setTab] = useState('All');
  const [kindFilter, setKindFilter] = useState('All');
  const [catFilter, setCatFilter] = useState('All');
  const [editing, setEditing] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const scoped = useMemo(() => data.expenses.filter((e) => tab === 'All' || entOf(e) === tab), [data.expenses, tab]);
  const rows = scoped.filter((e) => (kindFilter === 'All' || e.kind === kindFilter) && (catFilter === 'All' || e.category === catFilter));
  const cats = [...new Set(scoped.map((e) => e.category))];

  const inc = sum(scoped.filter((e) => e.kind === 'Income'), (e) => e.amount) + (tab === 'All' || tab === 'Mango' ? m.revenueBooked : 0);
  const inv = sum(scoped.filter((e) => e.kind === 'Investment'), (e) => e.amount);
  const op = sum(scoped.filter((e) => e.kind === 'Operating'), (e) => e.amount) + (tab === 'All' || tab === 'Mango' ? m.courierCosts : 0);
  const profit = inc - inv - op;

  return (
    <>
      <PageHeader title="Expenses, Investment & Income" subtitle="Record every taka in or out for each business line — mango, sheep, kali dal, vegetables — and for farm-wide costs like land lease. Everything stays editable." />

      <div className="flex flex-wrap gap-2">
        {['All', ...lines].map((t) => (
          <button key={t} onClick={() => { setTab(t); setCatFilter('All'); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === t ? 'bg-emerald-800 text-white' : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-100'}`}>{t}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><span className="text-xs text-stone-500">Investment ({tab})</span><p className="text-xl font-extrabold text-purple-700">{formatBDT(inv)}</p></Card>
        <Card><span className="text-xs text-stone-500">Expenses ({tab})</span><p className="text-xl font-extrabold text-amber-700">{formatBDT(op)}</p>{(tab === 'All' || tab === 'Mango') && <p className="text-[11px] text-stone-500">incl. courier {formatBDT(m.courierCosts)}</p>}</Card>
        <Card><span className="text-xs text-stone-500">Income ({tab})</span><p className="text-xl font-extrabold text-emerald-700">{formatBDT(inc)}</p>{(tab === 'All' || tab === 'Mango') && <p className="text-[11px] text-stone-500">incl. mango orders {formatBDT(m.revenueBooked)}</p>}</Card>
        <Card><span className="text-xs text-stone-500">Profit / loss ({tab})</span><p className={`text-xl font-extrabold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatBDT(profit)}</p></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-fit">
          <h3 className="text-base font-bold text-stone-900 mb-3">Add entry</h3>
          <EntryForm key={formKey + tab} settings={data.settings} defaultEnt={tab === 'All' ? undefined : tab} submitLabel="Add to ledger"
            onSubmit={async (f) => { const r = await act(() => api.post('/api/expenses', f), `${f.category}: ${formatBDT(f.amount)} recorded`); if (r) setFormKey((k) => k + 1); }} />
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-base font-bold text-stone-900">Ledger — {tab} ({rows.length})</h3>
            <div className="flex gap-2">
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-white"><option value="All">All types</option>{LEDGER_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-white"><option value="All">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          </div>
          {rows.length === 0 ? <Empty>Nothing here yet. Use the form to add a fertilizer, medicine, labor or equipment cost, or a sale.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-stone-200"><Th>Date</Th><Th>Line</Th><Th>Type</Th><Th>Category</Th><Th right>Amount</Th><Th right>Actions</Th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((e) => (
                    <tr key={e.id} className="hover:bg-stone-50">
                      <td className="py-2.5 px-2 text-xs whitespace-nowrap">{e.date}</td>
                      <td className="py-2.5 px-2 text-xs font-semibold">{entOf(e)}</td>
                      <td className="py-2.5 px-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded ${kindStyle[e.kind]}`}>{e.kind === 'Operating' ? 'Expense' : e.kind}</span></td>
                      <td className="py-2.5 px-2 text-xs"><span className="font-semibold">{e.category}</span>{e.description && <span className="block text-stone-500">{e.description}</span>}</td>
                      <td className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${e.kind === 'Income' ? 'text-emerald-700' : ''}`}>{e.kind === 'Income' ? '+' : ''}{formatBDT(e.amount)}</td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button title="Edit" onClick={() => setEditing(e)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700"><Edit3 className="w-4 h-4" /></button>
                        <button title="Delete" onClick={() => window.confirm('Delete this ledger entry?') && act(() => api.del(`/api/expenses/${e.id}`), 'Entry deleted')} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.expenses.some((e) => !e.enterprise) && <p className="text-[11px] text-stone-500 mt-3">Entries from before business lines existed are shown under <strong>Farm-wide</strong>. Edit them to move them to Mango or another line.</p>}
        </Card>
      </div>

      {editing && (
        <Modal title={`Edit ${editing.id}`} onClose={() => setEditing(null)}>
          <EntryForm settings={data.settings} initial={{ ...editing, enterprise: entOf(editing) }} submitLabel="Save changes" onCancel={() => setEditing(null)}
            onSubmit={async (f) => { const r = await act(() => api.put(`/api/expenses/${editing.id}`, f), 'Entry updated'); if (r) setEditing(null); }} />
        </Modal>
      )}
    </>
  );
}
