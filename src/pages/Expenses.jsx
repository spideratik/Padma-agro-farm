import React, { useState } from 'react';
import { Edit3, Trash2, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';
import { Card, PageHeader, Field, Combo, Select, NumInput, Btn, Modal, Empty, Th, KpiCard, inputCls } from '../components/ui.jsx';
import { LEDGER_KINDS, todayStr, formatBDT, num } from '../lib/calc.js';

const kindStyle = { Investment: 'bg-purple-100 text-purple-800', Operating: 'bg-amber-100 text-amber-800', Income: 'bg-emerald-100 text-emerald-800' };
const kindHelp = {
  Investment: 'Money put in once for the season: land lease, trees, equipment, set-up.',
  Operating: 'Running costs: labour, fertilizer, cartons, transport, ads.',
  Income: 'Money in that is NOT a customer order: Grade-B / local market sales, leftovers, subsidies.'
};

function EntryForm({ settings, initial, onSubmit, onCancel, submitLabel }) {
  const [f, setF] = useState(initial || { date: todayStr(), kind: 'Operating', category: '', description: '', amount: '', block: '', paidTo: '' });
  const valid = num(f.amount) > 0 && f.category.trim();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(f); }} className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {LEDGER_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setF({ ...f, kind: k })}
            className={`py-2 rounded-xl text-sm font-semibold border ${f.kind === k ? `${kindStyle[k]} border-transparent ring-2 ring-offset-1 ring-stone-300` : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'}`}>{k}</button>
        ))}
      </div>
      <p className="text-[11px] text-stone-500 -mt-1">{kindHelp[f.kind]}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date"><input type="date" required className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount (৳) *"><NumInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} className="font-bold" /></Field>
        <Field label="Category *"><Combo value={f.category} onChange={(v) => setF({ ...f, category: v })} options={settings.categories} placeholder="Pick or type" /></Field>
        <Field label="Charge to block" hint="Leave on 'Shared' to split by bigha"><Select value={f.block || ''} onChange={(v) => setF({ ...f, block: v })} placeholder="Shared (all blocks)" options={settings.blocks.map((b) => b.name)} /></Field>
      </div>
      <Field label="Description"><input className={inputCls} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. 200 cartons + tape, 6 pluckers × 3 days" /></Field>
      <Field label="Paid to / received from"><input className={inputCls} value={f.paidTo || ''} onChange={(e) => setF({ ...f, paidTo: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>}
        <Btn type="submit" disabled={!valid}>{submitLabel}</Btn>
      </div>
    </form>
  );
}

export default function Expenses({ data, metrics: m, act }) {
  const [kindFilter, setKindFilter] = useState('All');
  const [catFilter, setCatFilter] = useState('All');
  const [editing, setEditing] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const cats = [...new Set(data.expenses.map((e) => e.category))];
  const rows = data.expenses.filter((e) => (kindFilter === 'All' || e.kind === kindFilter) && (catFilter === 'All' || e.category === catFilter));
  const shown = rows.reduce((s, e) => s + (e.kind === 'Income' ? -num(e.amount) : num(e.amount)), 0);

  return (
    <>
      <PageHeader title="Expenses & Investment" subtitle="One editable ledger for everything you put in and take out of the orchard. Every entry can be changed later, and all analysis updates instantly." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Investment" value={formatBDT(m.investment)} accent="bg-purple-100" icon={<Wallet className="w-6 h-6 text-purple-700" />} />
        <KpiCard title="Operating costs" value={formatBDT(m.operating)} accent="bg-amber-100" valueColor="text-amber-700" icon={<Wallet className="w-6 h-6 text-amber-600" />} />
        <KpiCard title="Courier & COD charges" value={formatBDT(m.courierCosts)} sub="From orders & settlements" accent="bg-blue-100" icon={<Wallet className="w-6 h-6 text-blue-600" />} />
        <KpiCard title="Other income" value={formatBDT(m.otherIncome)} accent="bg-emerald-100" valueColor="text-emerald-700" icon={<Wallet className="w-6 h-6 text-emerald-700" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-fit">
          <h3 className="text-base font-bold text-stone-900 mb-3">Add entry</h3>
          <EntryForm key={formKey} settings={data.settings} submitLabel="Add to ledger"
            onSubmit={async (f) => { const r = await act(() => api.post('/api/expenses', f), `${f.kind} of ${formatBDT(f.amount)} recorded`); if (r) setFormKey((k) => k + 1); }} />
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="text-base font-bold text-stone-900 mb-2">Where the money goes</h3>
            {m.costByCategory.length === 0 ? <p className="text-xs text-stone-400 py-6 text-center">Add expenses to see the breakdown.</p> : (
              <div style={{ height: Math.max(160, m.costByCategory.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={m.costByCategory} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatBDT(v)} />
                    <Bar dataKey="value" fill="#059669" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-bold text-stone-900">Ledger ({rows.length})</h3>
              <div className="flex gap-2">
                <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-white"><option value="All">All types</option>{LEDGER_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
                <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-white"><option value="All">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
            </div>
            {rows.length === 0 ? <Empty>Nothing here yet. Start with your land lease as an <strong>Investment</strong>.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-stone-200"><Th>Date</Th><Th>Type</Th><Th>Category</Th><Th>Description</Th><Th right>Amount</Th><Th right>Actions</Th></tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {rows.map((e) => (
                      <tr key={e.id} className="hover:bg-stone-50">
                        <td className="py-2.5 px-2 text-xs whitespace-nowrap">{e.date}</td>
                        <td className="py-2.5 px-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded ${kindStyle[e.kind]}`}>{e.kind}</span></td>
                        <td className="py-2.5 px-2 text-xs font-semibold">{e.category}{e.block && <span className="block font-normal text-stone-500">{e.block}</span>}</td>
                        <td className="py-2.5 px-2 text-stone-700">{e.description}{e.paidTo && <span className="block text-xs text-stone-400">{e.paidTo}</span>}</td>
                        <td className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${e.kind === 'Income' ? 'text-emerald-700' : ''}`}>{e.kind === 'Income' ? '+' : ''}{formatBDT(e.amount)}</td>
                        <td className="py-2.5 px-2 text-right whitespace-nowrap">
                          <button title="Edit" onClick={() => setEditing(e)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700"><Edit3 className="w-4 h-4" /></button>
                          <button title="Delete" onClick={() => window.confirm('Delete this ledger entry?') && act(() => api.del(`/api/expenses/${e.id}`), 'Entry deleted')} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-stone-200"><td colSpan={4} className="py-2.5 px-2 text-xs font-semibold text-stone-500">Net of shown rows (costs − income)</td><td className="py-2.5 px-2 text-right font-extrabold">{formatBDT(shown)}</td><td /></tr></tfoot>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {editing && (
        <Modal title={`Edit ${editing.id}`} onClose={() => setEditing(null)}>
          <EntryForm settings={data.settings} initial={{ ...editing }} submitLabel="Save changes" onCancel={() => setEditing(null)}
            onSubmit={async (f) => { const r = await act(() => api.put(`/api/expenses/${editing.id}`, f), 'Entry updated'); if (r) setEditing(null); }} />
        </Modal>
      )}
    </>
  );
}
