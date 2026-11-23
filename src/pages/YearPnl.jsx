import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api.js';
import { Card, PageHeader, Field, Btn, Th, KpiCard, Notice, inputCls } from '../components/ui.jsx';
import { computeEnterprises, formatBDT, FARM_WIDE } from '../lib/calc.js';
import { TrendingUp, Coins, Scale, Percent } from 'lucide-react';

export default function YearPnl({ data, act }) {
  const st = data.settings;
  const [from, setFrom] = useState(st.seasonStart || '');
  const [to, setTo] = useState(st.seasonEnd || '');
  const dirty = from !== (st.seasonStart || '') || to !== (st.seasonEnd || '');
  const r = useMemo(() => computeEnterprises(data, from, to), [data, from, to]);
  const tone = (n) => (n >= 0 ? 'text-emerald-700' : 'text-red-600');
  const chart = r.rows.filter((x) => x.income || x.cost).map((x) => ({ name: x.name, Income: x.income, Cost: x.cost }));

  return (
    <>
      <PageHeader title="Year Profit & Loss" subtitle="Your whole 18-bigha farm in one view: income, cost and profit for every business line, plus farm-wide costs like land lease. Set your 1-year period to see the final result." />

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="Period start"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Period end"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Btn variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>All time</Btn>
          <Btn disabled={!dirty} onClick={() => act(() => api.put('/api/settings', { seasonStart: from, seasonEnd: to }), 'Period saved')}>{dirty ? 'Save period' : 'Saved'}</Btn>
        </div>
        <p className="text-[11px] text-stone-500 mt-2">Blank dates = everything recorded so far. Tip: set it to your lease year (e.g. 2026-11-01 → 2027-10-31).</p>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total income" value={formatBDT(r.totalIncome)} sub="All business lines" icon={<TrendingUp className="w-6 h-6 text-emerald-700" />} />
        <KpiCard title="Total cost" value={formatBDT(r.totalCost)} sub="Investment + expenses + courier" accent="bg-purple-100" icon={<Coins className="w-6 h-6 text-purple-700" />} />
        <KpiCard title="Net profit / loss" value={formatBDT(r.netProfit)} valueColor={tone(r.netProfit)} accent={r.netProfit >= 0 ? 'bg-emerald-100' : 'bg-orange-100'} icon={<Scale className="w-6 h-6 text-emerald-700" />} />
        <KpiCard title="Return on cost" value={`${r.roi.toFixed(1)}%`} valueColor={tone(r.roi)} accent="bg-amber-100" icon={<Percent className="w-6 h-6 text-amber-600" />} />
      </div>

      <Card>
        <h3 className="text-base font-bold text-stone-900 mb-3">Profit by business line</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-stone-200"><Th>Business line</Th><Th right>Income</Th><Th right>Investment</Th><Th right>Expenses</Th><Th right>Courier</Th><Th right>Profit / loss</Th><Th right>ROI</Th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {r.rows.map((x) => (
                <tr key={x.name} className={x.name === FARM_WIDE ? 'bg-stone-50' : ''}>
                  <td className="py-2.5 px-2 font-semibold">{x.name}{x.name === FARM_WIDE && <span className="block text-[11px] font-normal text-stone-500">shared costs, e.g. land lease</span>}</td>
                  <td className="py-2.5 px-2 text-right text-emerald-700">{formatBDT(x.income)}{x.orderIncome > 0 && <span className="block text-[11px] text-stone-500">orders {formatBDT(x.orderIncome)}</span>}</td>
                  <td className="py-2.5 px-2 text-right">{formatBDT(x.investment)}</td>
                  <td className="py-2.5 px-2 text-right">{formatBDT(x.operating)}</td>
                  <td className="py-2.5 px-2 text-right">{x.courier ? formatBDT(x.courier) : '—'}</td>
                  <td className={`py-2.5 px-2 text-right font-extrabold ${tone(x.profit)}`}>{formatBDT(x.profit)}</td>
                  <td className="py-2.5 px-2 text-right text-xs">{x.cost > 0 ? `${x.roi.toFixed(0)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-300 font-extrabold">
                <td className="py-3 px-2">Whole farm</td>
                <td className="py-3 px-2 text-right">{formatBDT(r.totalIncome)}</td>
                <td colSpan={3} className="py-3 px-2 text-right text-stone-500 font-medium">cost {formatBDT(r.totalCost)}</td>
                <td className={`py-3 px-2 text-right ${tone(r.netProfit)}`}>{formatBDT(r.netProfit)}</td>
                <td className="py-3 px-2 text-right text-xs">{r.roi.toFixed(0)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {r.farm && r.farm.cost > 0 && (
          <Notice tone="blue"><span className="block mt-0">Each line's profit is <strong>before</strong> farm-wide costs of {formatBDT(r.farm.cost)}. The whole-farm row already subtracts them.</span></Notice>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-bold text-stone-900 mb-3">Income vs cost</h3>
        {chart.length === 0 ? <p className="text-xs text-stone-400 py-8 text-center">Add some income or costs to see the chart.</p> : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => formatBDT(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Income" fill="#059669" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Cost" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-bold text-stone-900">Where costs go — by category and business line</h3>
        <p className="text-xs text-stone-500 mb-3">Fertilizer, medicine, labor, equipment purchase and every other category, split per business line.</p>
        {r.matrix.length === 0 ? <p className="text-xs text-stone-400 py-6 text-center">No costs recorded in this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-stone-200"><Th>Category</Th>{r.all.map((n) => <Th key={n} right>{n}</Th>)}<Th right>Total</Th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {r.matrix.map((c) => (
                  <tr key={c.category}>
                    <td className="py-2 px-2 font-medium">{c.category}</td>
                    {r.all.map((n) => <td key={n} className="py-2 px-2 text-right text-stone-600">{c.by[n] ? formatBDT(c.by[n]) : '—'}</td>)}
                    <td className="py-2 px-2 text-right font-bold">{formatBDT(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
