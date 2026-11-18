import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart, PieChart, Pie, Cell } from 'recharts';
import { api } from '../api.js';
import { Card, PageHeader, Field, NumInput, Btn, KpiCard, ProgressBar, Th, Notice, Empty, CHART_COLORS } from '../components/ui.jsx';
import { formatBDT, projectSeason, num, fmtKg } from '../lib/calc.js';
import { TrendingUp, Scale, Coins, Percent } from 'lucide-react';

const A_FIELDS = [
  ['expectedTotalKg', 'Expected total harvest (kg)', 'Whole season. 0 = use harvested so far'],
  ['gradeAPercent', 'Grade A share (%)', 'Courier-quality fruit'],
  ['wastagePercent', 'Wastage (%)', 'Rest becomes Grade B'],
  ['avgRatePerKg', 'Avg Grade-A selling rate (৳/kg)', 'Product price, excl. packaging & delivery'],
  ['returnPercent', 'Returns / failed delivery (%)', 'Share of Grade A not paid for'],
  ['gradeBRatePerKg', 'Grade-B local rate (৳/kg)', 'Sold in local market'],
  ['plannedExtraCost', 'Costs still to come (৳)', 'Labour, cartons, ads not yet entered']
];

export default function Analysis({ data, metrics: m, act }) {
  const saved = data.settings.analysis;
  const [a, setA] = useState({ ...saved });
  const dirty = JSON.stringify(a) !== JSON.stringify(saved);
  const proj = useMemo(() => projectSeason(m, a), [m, a]);
  const roiTone = m.roiPercent >= 0 ? 'text-emerald-700' : 'text-red-600';
  const noData = m.totalCost === 0 && m.totalIncome === 0;

  return (
    <>
      <PageHeader title="Investment Analysis" subtitle="How much you have put in, how much has come back, where you break even — and what the rest of the season could look like. Change any assumption and the projection updates live." />

      {noData && <Notice tone="blue">Nothing to analyse yet. Add your land lease and costs under <strong>Expenses & Investment</strong>, and orders will feed revenue automatically.</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total invested + spent" value={formatBDT(m.totalCost)} sub={`Invest ${formatBDT(m.investment)} • Run ${formatBDT(m.operating)} • Courier ${formatBDT(m.courierCosts)}`} accent="bg-purple-100" icon={<Coins className="w-6 h-6 text-purple-700" />} />
        <KpiCard title="Income so far" value={formatBDT(m.totalIncome)} sub={`Delivered revenue ${formatBDT(m.revenueDelivered)}`} icon={<TrendingUp className="w-6 h-6 text-emerald-700" />} />
        <KpiCard title="Net profit / loss" value={formatBDT(m.netProfit)} valueColor={roiTone} accent={m.netProfit >= 0 ? 'bg-emerald-100' : 'bg-orange-100'} icon={<Scale className="w-6 h-6 text-emerald-700" />} sub="Booked orders + other income − all costs" />
        <KpiCard title="Return on investment" value={`${m.roiPercent.toFixed(1)}%`} valueColor={roiTone} accent="bg-amber-100" icon={<Percent className="w-6 h-6 text-amber-600" />} sub={`Cash balance (est.) ${formatBDT(m.cashBalance)}`} />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-stone-900">Break-even tracker</h3>
          <span className="text-xl font-extrabold text-emerald-700">{Math.round(m.breakEvenPercent)}%</span>
        </div>
        <ProgressBar percent={m.breakEvenPercent} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs">
          <Fact label="Still to recover" value={formatBDT(m.remainingToBreakEven)} />
          <Fact label="Sell this much more at today's average" value={m.kgToBreakEven === null ? 'Needs first sale' : fmtKg(m.kgToBreakEven)} />
          <Fact label="Cost per kg produced" value={`${formatBDT(m.costPerKgProduced)} (Grade A basis ${formatBDT(m.costPerKgGradeA)})`} />
          <Fact label="Min. price on all Grade A to break even" value={`${formatBDT(m.breakEvenRateGradeA)} / kg`} />
        </div>
        <p className="text-[11px] text-stone-500 mt-3">Your current average selling rate is {formatBDT(m.avgSellingRate)}/kg. The break-even price compares investment + operating costs (after other income) with all harvested Grade A.</p>
      </Card>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-stone-900">Season projection — your assumptions</h3>
            <p className="text-xs text-stone-500">Everything below is editable. Costs already in your ledger are included automatically.</p>
          </div>
          <Btn disabled={!dirty} onClick={() => act(() => api.put('/api/settings', { analysis: a }), 'Assumptions saved')}>{dirty ? 'Save assumptions' : 'Saved'}</Btn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {A_FIELDS.map(([k, label, hint]) => <Field key={k} label={label} hint={hint}><NumInput value={a[k]} onChange={(v) => setA({ ...a, [k]: v })} /></Field>)}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-5 pt-4 border-t border-stone-100">
          <Fact label="Projected Grade A (sellable)" value={fmtKg(proj.kgA * (1 - num(a.returnPercent) / 100))} />
          <Fact label="Projected revenue" value={formatBDT(proj.revenue)} />
          <Fact label="Projected total cost" value={formatBDT(proj.cost)} />
          <Fact label="Projected profit" value={formatBDT(proj.profit)} tone={proj.profit >= 0 ? 'good' : 'bad'} />
          <Fact label="Break-even Grade-A rate" value={`${formatBDT(proj.breakEvenRate)} / kg`} />
        </div>

        <h4 className="text-sm font-bold text-stone-800 mt-6 mb-2">What-if: profit by yield and selling price</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center border-collapse">
            <thead>
              <tr><Th>Yield ↓ / Price →</Th>{proj.rateMults.map((r) => <Th key={r}>{r === 1 ? 'Base' : `${r > 1 ? '+' : ''}${Math.round((r - 1) * 100)}%`}<span className="block normal-case font-normal">{formatBDT(num(a.avgRatePerKg) * r)}/kg</span></Th>)}</tr>
            </thead>
            <tbody>
              {proj.grid.map((row) => (
                <tr key={row.yieldMult} className="border-t border-stone-100">
                  <td className="py-2 px-2 text-left text-xs font-semibold">{row.yieldMult === 1 ? 'Base' : `${row.yieldMult > 1 ? '+' : ''}${Math.round((row.yieldMult - 1) * 100)}%`} ({fmtKg(row.cells[0].kg)})</td>
                  {row.cells.map((c) => (
                    <td key={c.rateMult} className={`py-2 px-2 font-bold ${c.profit >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'} ${row.yieldMult === 1 && c.rateMult === 1 ? 'ring-2 ring-inset ring-stone-400' : ''}`}>
                      {formatBDT(c.profit)}<span className="block text-[10px] font-medium opacity-70">{c.roi.toFixed(0)}% ROI</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {num(a.avgRatePerKg) <= 0 && <p className="text-xs text-amber-700 mt-2">Enter an average Grade-A rate to see projected revenue.</p>}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-base font-bold text-stone-900 mb-3">Monthly revenue vs costs</h3>
          {m.monthly.length === 0 ? <Empty>No dated orders or expenses yet.</Empty> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={m.monthly} margin={{ left: -10, right: 10, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => formatBDT(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Revenue" fill="#059669" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Costs" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  <Line dataKey="Net" stroke="#1c1917" strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card>
          <h3 className="text-base font-bold text-stone-900 mb-3">Cost mix</h3>
          {m.costByCategory.length === 0 ? <Empty>No costs yet.</Empty> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={m.costByCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                    {m.costByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatBDT(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-bold text-stone-900">Cost per block</h3>
        <p className="text-xs text-stone-500 mb-3">Costs you assign to a block count fully; "Shared" costs are split by bigha.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-stone-200"><Th>Block</Th><Th right>Bigha</Th><Th right>Direct</Th><Th right>Shared share</Th><Th right>Total cost</Th><Th right>Harvest</Th><Th right>Cost / kg</Th><Th right>Cost / bigha</Th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {m.blockStats.map((b) => (
                <tr key={b.name}>
                  <td className="py-2.5 px-2 font-semibold">{b.name}</td>
                  <td className="py-2.5 px-2 text-right">{b.bigha}</td>
                  <td className="py-2.5 px-2 text-right">{formatBDT(b.direct)}</td>
                  <td className="py-2.5 px-2 text-right">{formatBDT(b.allocated)}</td>
                  <td className="py-2.5 px-2 text-right font-bold">{formatBDT(b.cost)}</td>
                  <td className="py-2.5 px-2 text-right">{fmtKg(b.kg)}</td>
                  <td className="py-2.5 px-2 text-right">{b.kg ? formatBDT(b.costPerKg) : '—'}</td>
                  <td className="py-2.5 px-2 text-right">{formatBDT(b.costPerBigha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-bold text-stone-900 mb-3">Profitability by variety (orders)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-stone-200"><Th>Variety</Th><Th right>Sold kg</Th><Th right>Mango sales</Th><Th right>Avg ৳/kg</Th><Th right>Harvested A</Th><Th right>Sell-through</Th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {m.varietyStock.map((v) => (
                <tr key={v.variety}>
                  <td className="py-2.5 px-2 font-semibold">{v.variety}</td>
                  <td className="py-2.5 px-2 text-right">{v.reservedKg}</td>
                  <td className="py-2.5 px-2 text-right">{formatBDT(v.revenue)}</td>
                  <td className="py-2.5 px-2 text-right">{v.reservedKg ? formatBDT(v.revenue / v.reservedKg) : '—'}</td>
                  <td className="py-2.5 px-2 text-right">{v.harvestedA}</td>
                  <td className="py-2.5 px-2 text-right">{v.harvestedA ? `${Math.round((v.reservedKg / v.harvestedA) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Fact({ label, value, tone }) {
  return (
    <div>
      <span className="text-stone-500 block text-xs">{label}</span>
      <span className={`font-bold text-sm ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-stone-900'}`}>{value}</span>
    </div>
  );
}
