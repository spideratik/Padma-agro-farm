import React, { useMemo, useState } from 'react';
import { Plus, Search, Download, Printer, Edit3, Trash2, ArrowRight, Phone, Globe, BadgeCheck, X } from 'lucide-react';
import { api } from '../api.js';
import { Card, PageHeader, Field, Combo, Select, NumInput, Btn, Modal, Empty, StatusBadge, Notice, inputCls } from '../components/ui.jsx';
import { ORDER_FLOW, ORDER_STATUSES, DISTRICTS, num, formatBDT, kgToMon, quote, orderTotal, orderWeight, itemsSummary, todayStr, isActive } from '../lib/calc.js';

// ---------------------------------------------------------------- order form (create + edit)
function OrderForm({ settings, metrics, initial, onSubmit, onCancel }) {
  const editing = !!initial;
  const [f, setF] = useState(
    initial
      ? { ...initial, items: initial.items.map((i) => ({ ...i })) }
      : {
          date: todayStr(), customerName: '', phone: '', email: '', district: '', address: '', source: 'Phone Call',
          items: [{ variety: '', weightKg: '', ratePerKg: '' }], packagingCost: '', courierFee: '', discount: '', totalBill: '',
          advancePaid: '', codAmount: '', paymentMethod: settings.paymentMethods[0], paymentRef: '', paymentVerified: true,
          courier: settings.couriers[0] || '', consignmentId: '', status: 'Confirmed', notes: '', returnCost: ''
        }
  );
  const [auto, setAuto] = useState(!editing); // auto-fill packaging + delivery from Settings rules
  const stock = Object.fromEntries(metrics.varietyStock.map((v) => [v.variety, v.available]));

  // central recalculation: only touches the fields that depend on what changed
  const apply = (patch, opts = {}) => {
    const n = { ...f, ...patch };
    const pricingChanged = ['items', 'district', 'packagingCost', 'courierFee', 'discount'].some((k) => k in patch);
    if (auto && ('items' in patch || 'district' in patch) && !opts.keepFees) {
      const q = quote(settings, n.items.map((i) => ({ variety: i.variety, weightKg: i.weightKg, ratePerKg: i.ratePerKg === '' ? undefined : i.ratePerKg })), n.district);
      n.packagingCost = q.totalKg ? String(q.packagingCost) : '';
      n.courierFee = q.totalKg ? String(q.courierFee) : '';
    }
    if (pricingChanged) {
      const sub = n.items.reduce((s, i) => s + num(i.weightKg) * num(i.ratePerKg), 0);
      n.totalBill = sub + num(n.packagingCost) + num(n.courierFee) - num(n.discount) || '';
    }
    if (pricingChanged || 'totalBill' in patch || 'advancePaid' in patch) {
      n.codAmount = Math.max(0, num(n.totalBill) - num(n.advancePaid));
      if (n.totalBill === '' && n.advancePaid === '') n.codAmount = '';
    }
    setF(n);
  };

  const setItem = (idx, patch) => {
    const items = f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    // picking a variety pre-fills its configured price
    if (patch.variety !== undefined) {
      const price = settings.varieties.find((v) => v.name === patch.variety)?.pricePerKg;
      if (price) items[idx].ratePerKg = String(price);
    }
    apply({ items });
  };
  const addItem = () => setF({ ...f, items: [...f.items, { variety: '', weightKg: '', ratePerKg: '' }] });
  const removeItem = (idx) => apply({ items: f.items.filter((_, i) => i !== idx) });

  const totalKg = orderWeight(f);
  const valid = f.customerName.trim() && f.items.some((i) => i.variety && num(i.weightKg) > 0);

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit({ ...f, items: f.items.filter((i) => i.variety && num(i.weightKg) > 0) }); }} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Field label="Customer name *"><input required className={inputCls} value={f.customerName} onChange={(e) => apply({ customerName: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputCls} placeholder="01XXXXXXXXX" value={f.phone} onChange={(e) => apply({ phone: e.target.value })} /></Field>
        <Field label="District"><Combo value={f.district} onChange={(v) => apply({ district: v })} options={DISTRICTS} placeholder="Select or type" /></Field>
        <Field label="Order source"><Combo value={f.source || ''} onChange={(v) => apply({ source: v })} options={settings.orderSources} /></Field>
      </div>
      <Field label="Full delivery address"><input className={inputCls} value={f.address} onChange={(e) => apply({ address: e.target.value })} placeholder="House, road, area / thana" /></Field>

      <div className="rounded-xl border border-stone-200 p-3 bg-stone-50/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-stone-700">Mango lines</span>
          <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-calculate packaging & delivery from Settings
          </label>
        </div>
        {f.items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 sm:col-span-5">
              <Select value={it.variety} onChange={(v) => setItem(idx, { variety: v })} placeholder="— Variety —"
                options={settings.varieties.map((v) => ({ value: v.name, label: `${v.name} (${Math.round(stock[v.name] || 0)} kg avail.)` }))} />
            </div>
            <div className="col-span-5 sm:col-span-3"><NumInput value={it.weightKg} onChange={(v) => setItem(idx, { weightKg: v })} placeholder="Weight kg" /></div>
            <div className="col-span-5 sm:col-span-3"><NumInput value={it.ratePerKg} onChange={(v) => setItem(idx, { ratePerKg: v })} placeholder="৳ / kg" /></div>
            <div className="col-span-2 sm:col-span-1 text-right">
              {f.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><X className="w-4 h-4" /></button>}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={addItem} className="text-xs font-semibold text-emerald-700 hover:underline">+ Add another variety</button>
          <span className="text-xs text-stone-500">Total {totalKg} kg ({kgToMon(totalKg)} Mon)</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Packaging (৳)"><NumInput value={f.packagingCost} onChange={(v) => apply({ packagingCost: v })} /></Field>
        <Field label="Courier / delivery fee (৳)"><NumInput value={f.courierFee} onChange={(v) => apply({ courierFee: v })} /></Field>
        <Field label="Discount (৳)"><NumInput value={f.discount} onChange={(v) => apply({ discount: v })} /></Field>
        <Field label="Courier partner"><Combo value={f.courier || ''} onChange={(v) => apply({ courier: v })} options={settings.couriers} /></Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-stone-100">
        <Field label="Total bill (৳) — editable"><NumInput value={f.totalBill} onChange={(v) => apply({ totalBill: v })} className="font-extrabold bg-emerald-50/50 border-emerald-300" /></Field>
        <Field label="Advance paid (৳)"><NumInput value={f.advancePaid} onChange={(v) => apply({ advancePaid: v })} /></Field>
        <Field label="COD receivable (৳) — editable"><NumInput value={f.codAmount} onChange={(v) => setF({ ...f, codAmount: v })} className="font-extrabold bg-amber-50/50 border-amber-300" /></Field>
        <Field label="Payment method"><Select value={f.paymentMethod} onChange={(v) => setF({ ...f, paymentMethod: v })} options={settings.paymentMethods} /></Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Order status"><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={ORDER_STATUSES} /></Field>
        <Field label="Payment ref / trxID"><input className={inputCls} value={f.paymentRef || ''} onChange={(e) => setF({ ...f, paymentRef: e.target.value })} /></Field>
        <Field label="Courier consignment ID"><input className={inputCls} value={f.consignmentId || ''} onChange={(e) => setF({ ...f, consignmentId: e.target.value })} placeholder="From courier panel" /></Field>
        {f.status === 'Returned' ? <Field label="Return cost (৳)"><NumInput value={f.returnCost} onChange={(v) => setF({ ...f, returnCost: v })} /></Field> : <Field label="Order date"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>}
      </div>
      <Field label="Notes"><input className={inputCls} value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Delivery instructions, gift message…" /></Field>

      <div className="flex justify-between items-center gap-3 pt-2">
        <span className="text-sm font-bold text-emerald-900">Bill {formatBDT(f.totalBill)} • COD {formatBDT(f.codAmount)}</span>
        <div className="flex gap-2">
          {onCancel && <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>}
          <Btn type="submit" disabled={!valid}>{editing ? 'Save changes' : 'Save order'}</Btn>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- waybill / carton label
function Waybill({ order, settings, onClose }) {
  const total = orderTotal(order);
  const cod = num(order.codAmount);
  return (
    <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 bg-stone-100 border-b flex items-center justify-between print:hidden">
          <span className="text-sm font-bold">Carton label</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-200"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 bg-white text-stone-950" id="printable-waybill">
          <div className="flex items-start justify-between border-b-2 border-stone-900 pb-3">
            <div>
              <h2 className="text-lg font-black uppercase">{settings.businessName}</h2>
              <p className="text-xs font-semibold text-stone-600">Orchard: {settings.location}</p>
            </div>
            <div className="text-right">
              {order.courier && <span className="inline-block px-2.5 py-1 bg-stone-900 text-white text-xs font-black uppercase rounded">{order.courier}</span>}
              <p className="text-xs font-mono font-bold mt-1">{order.consignmentId || order.id}</p>
            </div>
          </div>
          <div className="border-2 border-dashed border-stone-900 bg-amber-50 px-3 py-2 rounded-lg text-center">
            <p className="text-xs font-black uppercase">⚠ Fragile / perishable fresh mango — do not stack heavy load ⚠</p>
          </div>
          <div className="space-y-1 border-b border-stone-300 pb-3">
            <span className="text-[10px] font-bold uppercase text-stone-500">Deliver to</span>
            <p className="text-lg font-extrabold">{order.customerName}</p>
            <p className="text-sm font-bold">Phone: {order.phone}</p>
            <p className="text-sm leading-snug">{order.address}</p>
            {order.district && <p className="text-xs font-black uppercase pt-1">District: <span className="underline">{order.district}</span></p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-stone-300 bg-stone-50">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">Contents</span>
              <p className="text-sm font-extrabold mt-0.5">{itemsSummary(order)}</p>
              <p className="text-xs font-bold text-stone-700 mt-0.5">Net {orderWeight(order)} kg ({kgToMon(orderWeight(order))} Mon)</p>
            </div>
            <div className="p-3 rounded-lg border-2 border-stone-900 flex flex-col justify-center items-center text-center">
              <span className="text-[10px] font-black uppercase text-stone-600">{cod > 0 ? 'Cash to collect (COD)' : 'Payment status'}</span>
              <p className="text-xl font-black mt-0.5">{cod > 0 ? formatBDT(cod) : 'PAID IN FULL'}</p>
              <span className="text-[10px] font-mono text-stone-500">Bill {formatBDT(total)} • {order.id}</span>
            </div>
          </div>
        </div>
        <div className="px-5 py-3.5 bg-stone-50 border-t flex justify-end gap-2.5 print:hidden">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          <Btn icon={Printer} onClick={() => window.print()}>Print label</Btn>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function Orders({ data, metrics, act, notify }) {
  const [tab, setTab] = useState(metrics.newOrders > 0 ? 'inbox' : 'all');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [form, setForm] = useState(null); // null | 'new' | order
  const [label, setLabel] = useState(null);
  const settings = data.settings;

  const list = useMemo(() => {
    const base = tab === 'inbox' ? data.orders.filter((o) => o.status === 'New' || o.paymentVerified === false) : data.orders;
    const needle = q.toLowerCase();
    return base.filter((o) =>
      (statusFilter === 'All' || o.status === statusFilter) &&
      (!needle || [o.customerName, o.phone, o.id, o.district, o.consignmentId].some((x) => (x || '').toLowerCase().includes(needle)))
    );
  }, [data.orders, tab, q, statusFilter]);

  const next = (st) => { const i = ORDER_FLOW.indexOf(st); return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null; };

  const exportCSV = () => {
    const rows = data.orders.filter((o) => ['Confirmed', 'Packed'].includes(o.status));
    if (!rows.length) return notify('No Confirmed or Packed orders to export.', 'error');
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Invoice', 'Customer', 'Phone', 'District', 'Address', 'Items', 'Weight_KG', 'Total_Bill', 'Advance', 'COD_Amount', 'Courier', 'Note'];
    const body = rows.map((o) => [o.id, o.customerName, o.phone, o.district, o.address, itemsSummary(o), orderWeight(o), orderTotal(o), o.advancePaid || 0, o.codAmount || 0, o.courier, `Perishable fresh mango ${orderWeight(o)}kg${o.notes ? ' - ' + o.notes : ''}`].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `courier_dispatch_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${rows.length} orders for courier bulk upload`);
  };

  const inboxCount = data.orders.filter((o) => o.status === 'New' || o.paymentVerified === false).length;

  return (
    <>
      <PageHeader title="Orders & Courier" subtitle="Website orders arrive here automatically through your API. Confirm, pack, hand to courier and track every parcel.">
        <Btn variant="ghost" icon={Download} onClick={exportCSV}>Courier CSV</Btn>
        <Btn variant="accent" icon={Plus} onClick={() => setForm('new')}>New order</Btn>
      </PageHeader>

      <div className="flex gap-2">
        {[['inbox', `Website inbox${inboxCount ? ` (${inboxCount})` : ''}`], ['all', `All orders (${data.orders.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === id ? 'bg-emerald-800 text-white' : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-100'}`}>{label}</button>
        ))}
      </div>
      {tab === 'inbox' && <Notice tone="blue">Inbox shows orders still <strong>New</strong> or with a prepaid payment (bKash/Nagad…) <strong>not yet verified</strong>. Check the trxID in your wallet, then verify and confirm.</Notice>}

      <Card className="flex flex-col md:flex-row gap-3 justify-between !p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, phone, district, order ID…" className={`${inputCls} pl-9`} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['All', ...ORDER_STATUSES].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${statusFilter === s ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>{s}</button>
          ))}
        </div>
      </Card>

      {list.length === 0 ? <Empty>{tab === 'inbox' ? 'Inbox is clear — no orders waiting.' : 'No orders match. Website orders appear automatically; or add one manually.'}</Empty> : (
        <div className="space-y-3">
          {list.map((o) => {
            const nx = next(o.status);
            const cod = num(o.codAmount);
            return (
              <div key={o.id} className={`bg-white rounded-2xl p-4 sm:p-5 border shadow-xs ${o.status === 'New' ? 'border-rose-300 ring-1 ring-rose-200' : 'border-stone-200'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold text-stone-500">{o.id}</span>
                      <StatusBadge status={o.status} />
                      {o.source === 'Website' && <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold inline-flex items-center gap-1"><Globe className="w-3 h-3" />Website</span>}
                      {o.source && o.source !== 'Website' && <span className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-600">via {o.source}</span>}
                      {o.courier && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">{o.courier}{o.consignmentId ? ` • ${o.consignmentId}` : ''}</span>}
                      <span className="text-[11px] text-stone-400">{o.date}</span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
                      <h4 className="text-base font-bold">{o.customerName}</h4>
                      {o.phone && <span className="text-xs text-stone-600 inline-flex items-center gap-1"><Phone className="w-3 h-3" />{o.phone}</span>}
                      {o.district && <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">{o.district}</span>}
                    </div>
                    <p className="text-xs text-stone-500">{o.address}</p>
                    <p className="text-xs font-semibold text-stone-800 pt-1">🥭 {(o.items || []).map((i) => `${i.variety} ${i.weightKg}kg @৳${i.ratePerKg}`).join(' + ')}</p>
                    <p className="text-xs text-stone-500">Pkg ৳{o.packagingCost || 0} • Delivery ৳{o.courierFee || 0}{num(o.discount) > 0 && ` • Discount ৳${o.discount}`} • {o.paymentMethod}{o.paymentRef && ` (${o.paymentRef})`}{o.notes && ` • “${o.notes}”`}</p>
                    {o.paymentVerified === false && isActive(o) && (
                      <p className="text-xs font-semibold text-rose-700">⚠ Prepaid ৳{num(o.advancePaid)} claimed — not yet verified in your wallet</p>
                    )}
                  </div>
                  <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between border-t lg:border-t-0 pt-3 lg:pt-0 gap-2 shrink-0">
                    <div className="text-left lg:text-right">
                      <span className="text-[11px] text-stone-500 block">Bill <strong>{formatBDT(orderTotal(o))}</strong></span>
                      <span className="text-base font-extrabold">{cod > 0 ? `COD ${formatBDT(cod)}` : 'PAID'}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {o.paymentVerified === false && <Btn size="sm" variant="accent" icon={BadgeCheck} onClick={() => act(() => api.post(`/api/orders/${o.id}/verify-payment`), 'Payment verified')}>Verify payment</Btn>}
                      <Btn size="sm" variant="soft" icon={Edit3} onClick={() => setForm(o)}>Edit</Btn>
                      <Btn size="sm" variant="soft" icon={Printer} onClick={() => setLabel(o)}>Label</Btn>
                      {nx && <Btn size="sm" icon={ArrowRight} onClick={() => act(() => api.post(`/api/orders/${o.id}/status`, { status: nx }), `${o.id} → ${nx}`)}>{nx}</Btn>}
                      {['Handed to Courier', 'In Transit'].includes(o.status) && <Btn size="sm" variant="ghost" onClick={() => act(() => api.post(`/api/orders/${o.id}/status`, { status: 'Returned' }), `${o.id} marked Returned`)}>Returned</Btn>}
                      {o.status === 'New' && <Btn size="sm" variant="ghost" onClick={() => window.confirm('Cancel this order?') && act(() => api.post(`/api/orders/${o.id}/status`, { status: 'Cancelled' }), `${o.id} cancelled`)}>Cancel</Btn>}
                      <button title="Delete" onClick={() => window.confirm(`Permanently delete ${o.id}?`) && act(() => api.del(`/api/orders/${o.id}`), 'Order deleted')} className="p-1.5 rounded-xl hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <Modal wide title={form === 'new' ? 'New customer order' : `Edit order ${form.id}`} subtitle="Every figure is editable — totals recalculate when you change weight, rate or fees, and you can override them." onClose={() => setForm(null)}>
          <OrderForm settings={settings} metrics={metrics} initial={form === 'new' ? null : form} onCancel={() => setForm(null)}
            onSubmit={async (f) => {
              const r = await act(() => (form === 'new' ? api.post('/api/orders', f) : api.put(`/api/orders/${form.id}`, f)), form === 'new' ? 'Order saved' : 'Order updated');
              if (r) setForm(null);
            }} />
        </Modal>
      )}
      {label && <Waybill order={label} settings={settings} onClose={() => setLabel(null)} />}
    </>
  );
}
