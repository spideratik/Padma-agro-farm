import React from 'react';
import { Sprout, Package, Truck, TrendingUp, ArrowRight, Globe } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, PageHeader, KpiCard, StatusBadge, Notice, Btn, ProgressBar, Th, CHART_COLORS } from '../components/ui.jsx';
import { formatBDT, kgToMon, fmtKg, itemsSummary, orderTotal } from '../lib/calc.js';

export default function Dashboard({ data, metrics: m, go }) {
  const st = data.settings;
  const unpriced = st.varieties.filter((v) => v.active && !(Number(v.pricePerKg) > 0)).length;
  const pie = m.varietyStock.filter((v) => v.revenue > 0).map((v) => ({ name: v.variety, value: v.revenue }));
  const recent = data.orders.slice(0, 6);

  return (
    <>
      <PageHeader title="Orchard & D2C Command Centre" subtitle={`Live view of your ${st.totalBigha}-bigha harvest, Grade-A stock, courier sales and season profit.`}>
        <Btn onClick={() => go('harvest')} icon={Sprout}>Log harvest</Btn>
        <Btn variant="accent" onClick={() => go('orders')} icon={Truck}>Orders</Btn>
      </PageHeader>

      {unpriced > 0 && (
        <Notice>
          <strong>{unpriced} mango variet{unpriced > 1 ? 'ies have' : 'y has'} no selling price yet.</strong> The website API only accepts orders for priced varieties.{' '}
          <button className="underline font-semibold" onClick={() => go('settings')}>Set prices in Settings</button>
        </Notice>
      )}
      {m.newOrders > 0 && (
        <Notice tone="red">
          <Globe className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          <strong>{m.newOrders} new order{m.newOrders > 1 ? 's' : ''} waiting for confirmation.</strong>{' '}
          <button className="underline font-semibold" onClick={() => go('orders')}>Open order inbox</button>
        </Notice>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Today's Harvest" value={fmtKg(m.todayHarvestKg)} sub={`${kgToMon(m.todayHarvestKg)} Mon (মণ) plucked today`} icon={<Sprout className="w-6 h-6 text-emerald-700" />} />
        <KpiCard title="Ready Grade-A Stock" value={fmtKg(m.availableGradeAKg)} accent="bg-amber-100" valueColor={m.availableGradeAKg < 0 ? 'text-red-600' : 'text-stone-900'}
          sub={m.availableGradeAKg < 0 ? 'Pre-orders exceed harvested stock' : `${kgToMon(m.availableGradeAKg)} Mon after open orders`} icon={<Package className="w-6 h-6 text-amber-600" />} />
        <KpiCard title="Open Parcels" value={m.openOrders} accent="bg-blue-100" sub={`${formatBDT(m.totalPendingCod + m.codInTransit)} COD outstanding`} icon={<Truck className="w-6 h-6 text-blue-600" />} />
        <KpiCard title="Net Season Profit" value={formatBDT(m.netProfit)} accent={m.netProfit >= 0 ? 'bg-emerald-100' : 'bg-orange-100'} valueColor={m.netProfit >= 0 ? 'text-emerald-700' : 'text-stone-900'}
          sub={`ROI ${m.roiPercent.toFixed(1)}% • cash ${formatBDT(m.cashBalance)}`} icon={<TrendingUp className="w-6 h-6 text-emerald-700" />} />
      </div>

      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Whole-farm break-even progress</span>
            <p className="text-xs text-stone-500 mt-2">
              Cost <strong>{formatBDT(m.totalCost)}</strong> = Investment {formatBDT(m.investment)} + Operating {formatBDT(m.operating)} + Courier {formatBDT(m.courierCosts)}
              {' '}• Income <strong>{formatBDT(m.totalIncome)}</strong> (orders {formatBDT(m.revenueBooked)} + other {formatBDT(m.otherIncome)})
            </p>
          </div>
          <div className="md:text-right shrink-0">
            <span className="text-2xl font-extrabold text-emerald-700">{Math.round(m.breakEvenPercent)}%</span>
            <p className="text-xs text-stone-500">{m.remainingToBreakEven > 0 ? `${formatBDT(m.remainingToBreakEven)} to go` : 'Break-even reached 🎉'}</p>
          </div>
        </div>
        <ProgressBar percent={m.breakEvenPercent} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-stone-100 text-xs">
          <Stat label="Total harvested" value={`${fmtKg(m.totalHarvestedKg)} (${kgToMon(m.totalHarvestedKg)} Mon)`} />
          <Stat label="Cost / kg produced" value={`${formatBDT(m.costPerKgProduced)}`} />
          <Stat label="Avg selling rate" value={`${formatBDT(m.avgSellingRate)} / kg`} good />
          <Stat label="Sell more to break even" value={m.kgToBreakEven === null ? '—' : m.kgToBreakEven <= 0 ? 'Done' : fmtKg(m.kgToBreakEven)} />
        </div>
        <button onClick={() => go('pnl')} className="mt-3 text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1">Year profit &amp; loss by business line <ArrowRight className="w-3.5 h-3.5" /></button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-base font-bold text-stone-900">Harvested vs ordered (kg) — last 7 days</h3>
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.dailyTrend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Harvested" fill="#059669" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Ordered" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="flex flex-col">
          <h3 className="text-base font-bold text-stone-900">Mango sales by variety</h3>
          <div className="h-56 flex-1 flex items-center justify-center mt-2">
            {pie.length === 0 ? <p className="text-xs text-stone-400 text-center px-4">No sales yet.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={4}>
                    {pie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatBDT(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-stone-900">Grade-A stock by variety</h3>
            <button onClick={() => go('harvest')} className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1">Manage <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-stone-200"><Th>Variety</Th><Th right>Harvested A</Th><Th right>Ordered</Th><Th right>Available</Th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {m.varietyStock.map((v) => (
                  <tr key={v.variety}>
                    <td className="py-2 px-2 font-medium">{v.variety}</td>
                    <td className="py-2 px-2 text-right text-stone-600">{v.harvestedA}</td>
                    <td className="py-2 px-2 text-right text-stone-600">{v.reservedKg}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${v.available < 0 ? 'bg-red-100 text-red-700' : v.available > 50 ? 'bg-emerald-100 text-emerald-800' : v.available > 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-400'}`}>{v.available} kg</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-stone-900">Recent orders</h3>
            <button onClick={() => go('orders')} className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1">All orders <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          {recent.length === 0 ? <p className="p-6 text-center text-xs text-stone-500 bg-stone-50 rounded-xl">No orders yet. Website orders will appear here automatically.</p> : (
            <div className="space-y-2.5">
              {recent.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-stone-50 border border-stone-200/70">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-stone-900 truncate">{o.customerName} <span className="text-[11px] font-medium text-stone-500">{o.district}</span></p>
                    <p className="text-xs text-stone-500 truncate">{itemsSummary(o)} • <strong>{formatBDT(orderTotal(o))}</strong>{o.source === 'Website' && ' • 🌐'}</p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, good }) {
  return (
    <div>
      <span className="text-stone-500 block">{label}</span>
      <span className={`font-bold text-sm ${good ? 'text-emerald-700' : 'text-stone-800'}`}>{value}</span>
    </div>
  );
}
