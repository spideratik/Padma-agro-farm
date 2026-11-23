import React, { useState } from 'react';
import { Copy, RefreshCw, Eye, EyeOff, Plus, Trash2, Save } from 'lucide-react';
import { api, setToken } from '../api.js';
import { Card, PageHeader, Field, NumInput, Btn, Notice, inputCls } from '../components/ui.jsx';
import { num } from '../lib/calc.js';

const lines = (v) => (v || []).join('\n');
const parse = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);

function ListField({ label, hint, value, onChange }) {
  // keep raw text locally so Enter / trailing blank lines can be typed; commit the parsed list upward
  const [text, setText] = useState(lines(value));
  return (
    <Field label={label} hint={hint}>
      <textarea rows={5} className={inputCls} value={text} onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }} />
    </Field>
  );
}

export default function Settings({ data, act, notify }) {
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(data.settings)));
  const [showKey, setShowKey] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [originsText, setOriginsText] = useState(lines(data.settings.allowedOrigins));
  const base = typeof window !== 'undefined' ? window.location.origin.replace(':5173', ':3001') : '';
  const key = data.settings.apiKey;

  const upd = (patch) => setS((p) => ({ ...p, ...patch }));
  const save = () => act(() => api.put('/api/settings', { ...s, allowedOrigins: parse(originsText) }), 'Settings saved');
  const copy = (t, what) => navigator.clipboard?.writeText(t).then(() => notify(`${what} copied`));

  const setVar = (i, patch) => upd({ varieties: s.varieties.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  const setBlock = (i, patch) => upd({ blocks: s.blocks.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });

  const curl = `curl -X POST ${base}/api/public/orders \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${key}" \\
  -d '{
    "externalId": "WEB-10231",
    "customerName": "Arif Rahman",
    "phone": "01712345678",
    "district": "Dhaka",
    "address": "House 5, Road 3, Mirpur 10",
    "items": [{ "variety": "Langra", "weightKg": 12 }],
    "paymentMethod": "Cash on Delivery (COD)",
    "notes": "Call before delivery"
  }'`;

  const js = `// Server-side (Node / PHP / Laravel / WordPress hook) — keeps the key secret
const res = await fetch("${base}/api/public/orders", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": process.env.PADMA_API_KEY },
  body: JSON.stringify({
    externalId: order.id,            // prevents duplicates if your site retries
    customerName: order.name,
    phone: order.phone,              // 01XXXXXXXXX
    district: order.district,
    address: order.address,
    items: order.items.map(i => ({ variety: i.variety, weightKg: i.kg })),
    paymentMethod: "bKash",          // must match a payment method in Settings
    paymentRef: "9AB12CDE",          // trxID — required for prepaid methods
  }),
});
const data = await res.json();       // { ok, orderId, total, codAmount, status: "New", ... }`;

  return (
    <>
      <PageHeader title="Settings & Website API" subtitle="Prices, packaging and delivery rules drive every website order. The API connects your order-placing website to this ERP.">
        <Btn icon={Save} onClick={save}>Save all settings</Btn>
      </PageHeader>

      <Card>
        <h3 className="text-base font-bold text-stone-900 mb-3">Business</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Business name"><input className={inputCls} value={s.businessName} onChange={(e) => upd({ businessName: e.target.value })} /></Field>
          <Field label="Orchard location"><input className={inputCls} value={s.location} onChange={(e) => upd({ location: e.target.value })} /></Field>
          <Field label="Total leased area (bigha)"><NumInput value={s.totalBigha} onChange={(v) => upd({ totalBigha: num(v) })} /></Field>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-stone-900">Varieties & selling prices</h3>
          <Btn size="sm" variant="ghost" icon={Plus} onClick={() => upd({ varieties: [...s.varieties, { name: '', pricePerKg: 0, active: true }] })}>Add variety</Btn>
        </div>
        <p className="text-xs text-stone-500 mb-3">Price per kg is what the website charges. A variety with price 0 (or inactive) cannot be ordered online.</p>
        <div className="space-y-2">
          {s.varieties.map((v, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input className={`${inputCls} col-span-6 sm:col-span-5`} value={v.name} onChange={(e) => setVar(i, { name: e.target.value })} placeholder="Variety name" />
              <div className="col-span-4 sm:col-span-3"><NumInput value={v.pricePerKg} onChange={(x) => setVar(i, { pricePerKg: num(x) })} placeholder="৳ / kg" /></div>
              <label className="col-span-2 sm:col-span-3 flex items-center gap-1.5 text-xs text-stone-600"><input type="checkbox" checked={v.active !== false} onChange={(e) => setVar(i, { active: e.target.checked })} />Active</label>
              <button className="col-span-12 sm:col-span-1 justify-self-end p-1.5 text-red-600 hover:bg-red-50 rounded-lg" onClick={() => upd({ varieties: s.varieties.filter((_, x) => x !== i) })}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-base font-bold text-stone-900 mb-3">Packaging, delivery & courier charges</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Box capacity (kg)"><NumInput value={s.packaging.boxKg} onChange={(v) => upd({ packaging: { ...s.packaging, boxKg: num(v) } })} /></Field>
            <Field label="Packaging per box (৳)"><NumInput value={s.packaging.perBox} onChange={(v) => upd({ packaging: { ...s.packaging, perBox: num(v) } })} /></Field>
            <Field label="Delivery inside zone (৳/kg)"><NumInput value={s.delivery.insidePerKg} onChange={(v) => upd({ delivery: { ...s.delivery, insidePerKg: num(v) } })} /></Field>
            <Field label="Delivery outside zone (৳/kg)"><NumInput value={s.delivery.outsidePerKg} onChange={(v) => upd({ delivery: { ...s.delivery, outsidePerKg: num(v) } })} /></Field>
            <Field label="Minimum delivery charge (৳)"><NumInput value={s.delivery.minCharge} onChange={(v) => upd({ delivery: { ...s.delivery, minCharge: num(v) } })} /></Field>
            <Field label="Courier COD fee (%)" hint="Used to estimate cost before settlement"><NumInput value={s.codFeePercent} onChange={(v) => upd({ codFeePercent: num(v) })} /></Field>
          </div>
          <div className="mt-3"><ListField label="'Inside zone' districts (one per line)" value={s.delivery.insideDhakaDistricts} onChange={(v) => upd({ delivery: { ...s.delivery, insideDhakaDistricts: v } })} /></div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-stone-900">Orchard blocks</h3>
            <Btn size="sm" variant="ghost" icon={Plus} onClick={() => upd({ blocks: [...s.blocks, { name: '', bigha: 0 }] })}>Add block</Btn>
          </div>
          <div className="space-y-2">
            {s.blocks.map((b, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input className={`${inputCls} col-span-7`} value={b.name} onChange={(e) => setBlock(i, { name: e.target.value })} />
                <div className="col-span-4"><NumInput value={b.bigha} onChange={(v) => setBlock(i, { bigha: num(v) })} placeholder="bigha" /></div>
                <button className="col-span-1 p-1.5 text-red-600 hover:bg-red-50 rounded-lg" onClick={() => upd({ blocks: s.blocks.filter((_, x) => x !== i) })}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 mt-5 text-sm text-stone-700">
            <input type="checkbox" className="mt-1" checked={!!s.enforceStock} onChange={(e) => upd({ enforceStock: e.target.checked })} />
            <span><strong>Block orders beyond logged Grade-A stock.</strong><span className="block text-xs text-stone-500">Off = website accepts pre-orders before harvest (stock shows negative until you log the harvest).</span></span>
          </label>
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-bold text-stone-900 mb-3">Lists used in dropdowns</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ListField label="Couriers" value={s.couriers} onChange={(v) => upd({ couriers: v })} />
          <ListField label="Payment methods" hint="First = default. Names with 'COD' or 'Cash' are treated as cash on delivery." value={s.paymentMethods} onChange={(v) => upd({ paymentMethods: v })} />
          <ListField label="Order sources" value={s.orderSources} onChange={(v) => upd({ orderSources: v })} />
          <ListField label="Expense categories" value={s.categories} onChange={(v) => upd({ categories: v })} />
        </div>
        <div className="mt-4 max-w-md">
          <ListField label="Business lines (Mango is always included)" hint="e.g. Sheep, Kali Dal, Vegetables, Fish. Removing a line keeps its old entries visible in reports." value={s.enterprises.filter((x) => x !== 'Mango')} onChange={(v) => upd({ enterprises: ['Mango', ...v] })} />
        </div>
      </Card>

      <Card className="border-2 border-emerald-300">
        <h3 className="text-base font-bold text-stone-900">Website order API</h3>
        <p className="text-xs text-stone-500 mb-4">Your order website sends orders to this ERP. Prices, packaging and delivery are always recalculated here from your Settings — the website cannot set its own prices.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="API base URL" hint="Replace with your public server address once deployed (https://…)">
            <div className="flex gap-2"><input readOnly className={`${inputCls} font-mono text-xs`} value={base} /><Btn variant="ghost" icon={Copy} onClick={() => copy(base, 'URL')} /></div>
          </Field>
          <Field label="API key (x-api-key header)">
            <div className="flex gap-2">
              <input readOnly className={`${inputCls} font-mono text-xs`} type={showKey ? 'text' : 'password'} value={key} />
              <Btn variant="ghost" icon={showKey ? EyeOff : Eye} onClick={() => setShowKey(!showKey)} />
              <Btn variant="ghost" icon={Copy} onClick={() => copy(key, 'API key')} />
              <Btn variant="ghost" icon={RefreshCw} title="Rotate key" onClick={() => window.confirm('Rotate the API key? Your website stops working until you paste the new key.') && act(() => api.post('/api/settings/rotate-key'), 'New API key generated')} />
            </div>
          </Field>
        </div>

        <Field label="Allowed website origins (one per line)" hint="If your site calls the API from the visitor's browser, list its address here (e.g. https://mymangoshop.com). Empty = any origin." className="mt-4">
          <textarea rows={2} className={inputCls} value={originsText} onChange={(e) => setOriginsText(e.target.value)} />
        </Field>

        <Notice tone="amber"><strong>Keep the key private.</strong> Best practice is to call the API from your website's server (the code below). If you must call it from browser JavaScript, the key is visible to visitors — restrict origins above and rotate the key if it leaks.</Notice>

        <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-50"><tr><th className="p-2.5">Endpoint</th><th className="p-2.5">Auth</th><th className="p-2.5">Purpose</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {[
                ['GET /api/public/catalog', 'none', 'Priced varieties, live availability, packaging & delivery rules, payment methods'],
                ['POST /api/public/quote', 'none', 'Body: { district, items:[{variety, weightKg}] } → exact total before checkout'],
                ['POST /api/public/orders', 'x-api-key', 'Place an order. Returns orderId, total, codAmount. Retry-safe via externalId'],
                ['GET /api/public/orders/:id?phone=', 'phone match', 'Customer order tracking (status history, courier, consignment ID)']
              ].map((r) => <tr key={r[0]}><td className="p-2.5 font-mono font-semibold">{r[0]}</td><td className="p-2.5">{r[1]}</td><td className="p-2.5 text-stone-600">{r[2]}</td></tr>)}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div>
            <div className="flex items-center justify-between mb-1"><span className="text-xs font-bold text-stone-700">cURL test</span><button className="text-xs text-emerald-700 font-semibold" onClick={() => copy(curl, 'cURL')}>Copy</button></div>
            <pre className="bg-stone-900 text-emerald-100 text-[11px] p-3 rounded-xl overflow-x-auto leading-relaxed">{curl}</pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><span className="text-xs font-bold text-stone-700">JavaScript (server-side)</span><button className="text-xs text-emerald-700 font-semibold" onClick={() => copy(js, 'Code')}>Copy</button></div>
            <pre className="bg-stone-900 text-emerald-100 text-[11px] p-3 rounded-xl overflow-x-auto leading-relaxed">{js}</pre>
          </div>
        </div>
        <p className="text-xs text-stone-500 mt-3">A ready-made customer order page is included at <code className="bg-stone-100 px-1 rounded">/examples/order-form.html</code> — open it, paste your API key into the config at the top, and host it anywhere.</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-base font-bold text-stone-900 mb-3">Change admin password</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current password"><input type="password" className={inputCls} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password (8+ chars)"><input type="password" className={inputCls} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          </div>
          <Btn className="mt-3" disabled={!pw.current || pw.next.length < 8}
            onClick={async () => { const r = await act(() => api.post('/api/settings/password', pw), 'Password changed'); if (r?.token) { setToken(r.token); setPw({ current: '', next: '' }); } }}>Update password</Btn>
        </Card>
        <Card className="border-red-200">
          <h3 className="text-base font-bold text-red-700 mb-1">Danger zone</h3>
          <p className="text-xs text-stone-500 mb-3">Deletes all harvests, orders, expenses and settlements. Settings, prices and API key stay.</p>
          <Btn variant="danger" onClick={() => { const t = window.prompt('Type RESET to delete all harvest, order and ledger records'); if (t === 'RESET') act(() => api.post('/api/reset', { confirm: 'RESET' }), 'All records cleared'); }}>Reset all records</Btn>
        </Card>
      </div>
    </>
  );
}
