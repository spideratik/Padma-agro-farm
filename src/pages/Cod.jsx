import React, { useMemo, useState } from 'react';
import { Check, Trash2, Building2 } from 'lucide-react';
import { api } from '../api.js';
import { Card, PageHeader, Field, NumInput, Btn, Empty, Notice, Th, KpiCard, inputCls } from '../components/ui.jsx';
import { formatBDT, num, todayStr, sum } from '../lib/calc.js';

function CourierDesk({ courier, orders, codFeePercent, act }) {
  const [picked, setPicked] = useState(() => new Set(orders.map((o) => o.id)));
  const [received, setReceived] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const chosen = orders.filter((o) => picked.has(o.id));
  const expected = sum(chosen, (o) => o.codAmount);
  const hint = Math.round(expected * (1 - codFeePercent / 100) - sum(chosen, (o) => o.courierFee));
  const recv = received === '' ? '' : received;
  const deduction = expected - num(received);
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-stone-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-600" />{courier}</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{orders.length} delivered COD parcels</span>
      </div>
      <div className="divide-y divide-blue-100 bg-white rounded-lg border border-blue-100 max-h-48 overflow-y-auto">
        {orders.map((o) => (
          <label key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50/50">
            <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
            <span className="font-mono text-xs text-stone-500">{o.id}</span>
            <span className="flex-1 truncate">{o.customerName}</span>
            <span className="font-bold">{formatBDT(o.codAmount)}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <Field label="COD collected (selected)"><div className="px-3 py-2 rounded-xl bg-white border border-stone-200 text-sm font-extrabold">{formatBDT(expected)}</div></Field>
        <Field label="Net payout received (৳)" hint={`Estimate after fees: ${formatBDT(hint)}`}>
          <NumInput value={recv} onChange={setReceived} className="font-extrabold border-blue-300" />
        </Field>
        <Field label="Payout date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="bKash / bank ref" /></Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-stone-600">
          {received === '' ? 'Enter the amount the courier actually paid you.' : <>Courier deducted <strong className={deduction < 0 ? 'text-red-600' : ''}>{formatBDT(deduction)}</strong> (delivery + COD fee) — recorded as a cost.</>}
        </span>
        <Btn icon={Check} disabled={!chosen.length || received === ''}
          onClick={() => act(() => api.post('/api/settlements', { courier, orderIds: chosen.map((o) => o.id), received: num(received), date, note }), `Settlement recorded for ${courier}`)}>Record settlement</Btn>
      </div>
    </div>
  );
}

export default function Cod({ data, metrics: m, act }) {
  const groups = useMemo(() => {
    const g = {};
    m.pendingCodOrders.forEach((o) => { const k = o.courier || 'No courier set'; (g[k] ||= []).push(o); });
    return Object.entries(g);
  }, [m.pendingCodOrders]);

  return (
    <>
      <PageHeader title="COD Settlements" subtitle="Couriers collect cash on delivery and pay you later, minus their charges. Record each payout here so profit reflects the real courier cost." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Awaiting payout (delivered)" value={formatBDT(m.totalPendingCod)} sub={`${m.pendingCodOrders.length} parcels`} accent="bg-blue-100" valueColor="text-blue-700" icon={<Building2 className="w-6 h-6 text-blue-600" />} />
        <KpiCard title="COD still in transit" value={formatBDT(m.codInTransit)} sub="Not delivered yet" accent="bg-amber-100" icon={<Building2 className="w-6 h-6 text-amber-600" />} />
        <KpiCard title="Total deducted by couriers" value={formatBDT(data.settlements.reduce((s, x) => s + num(x.deduction), 0))} sub="Across all settlements" accent="bg-stone-100" icon={<Building2 className="w-6 h-6 text-stone-600" />} />
      </div>

      <Card>
        <h3 className="text-base font-bold text-stone-900 mb-3">Record courier payouts</h3>
        {groups.length === 0 ? <Empty>No delivered COD parcels are waiting for payout. Mark orders as <strong>Delivered</strong> in Orders and they will appear here.</Empty> : (
          <div className="space-y-4">
            {groups.map(([courier, orders]) => <CourierDesk key={courier + orders.length} courier={courier} orders={orders} codFeePercent={num(data.settings.codFeePercent)} act={act} />)}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-bold text-stone-900 mb-3">Settlement history</h3>
        {data.settlements.length === 0 ? <Empty>No settlements recorded yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-stone-200"><Th>Date</Th><Th>ID</Th><Th>Courier</Th><Th right>Parcels</Th><Th right>COD collected</Th><Th right>Received</Th><Th right>Deducted</Th><Th>Note</Th><Th right>Undo</Th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {data.settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 px-2 whitespace-nowrap">{s.date}</td>
                    <td className="py-2.5 px-2 font-mono text-xs text-stone-500">{s.id}</td>
                    <td className="py-2.5 px-2 font-semibold">{s.courier}</td>
                    <td className="py-2.5 px-2 text-right">{s.orderIds.length}</td>
                    <td className="py-2.5 px-2 text-right">{formatBDT(s.expected)}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-emerald-700">{formatBDT(s.received)}</td>
                    <td className="py-2.5 px-2 text-right text-red-600">{formatBDT(s.deduction)}</td>
                    <td className="py-2.5 px-2 text-xs text-stone-500">{s.note}</td>
                    <td className="py-2.5 px-2 text-right">
                      <button title="Delete settlement (parcels return to 'awaiting payout')" onClick={() => window.confirm('Undo this settlement? Its parcels go back to awaiting payout.') && act(() => api.del(`/api/settlements/${s.id}`), 'Settlement removed')} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
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
