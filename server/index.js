import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import {
  ORDER_STATUSES, LEDGER_KINDS, quote, num, sum, todayStr, normalizePhone, orderTotal, computeMetrics, isActive
} from '../src/lib/calc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
store.load();
const db = () => store.get();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));

// ---------- CORS: public endpoints honour the allowed-origins list from Settings ----------
app.use(
  cors({
    origin(origin, cb) {
      const list = db().settings.allowedOrigins || [];
      if (!origin || list.length === 0 || list.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
  })
);

// ---------- helpers ----------
const s = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const n = (v) => num(v);
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const validDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : todayStr());
const fail = (res, code, error) => res.status(code).json({ ok: false, error });

const hits = new Map();
function rateLimit(max, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.ip + req.path.split('/').slice(0, 4).join('/');
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return fail(res, 429, 'Too many requests, please slow down.');
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}
setInterval(() => hits.clear(), 10 * 60000).unref();

// ---------- admin auth (signed token) ----------
const signToken = () => {
  const exp = String(Date.now() + 7 * 86400000);
  return `${exp}.${crypto.createHmac('sha256', db().secrets.tokenSecret).update(exp).digest('hex')}`;
};
const tokenOk = (t) => {
  const [exp, sig] = String(t || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEq(sig, crypto.createHmac('sha256', db().secrets.tokenSecret).update(exp).digest('hex'));
};
const requireAdmin = (req, res, next) => {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ') && tokenOk(h.slice(7))) return next();
  fail(res, 401, 'Not signed in');
};
const requireApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (key && safeEq(key, db().secrets.apiKey)) return next();
  fail(res, 401, 'Invalid or missing API key');
};

// ---------- sanitizers ----------
function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => ({ variety: s(i.variety, 80), weightKg: n(i.weightKg), ratePerKg: n(i.ratePerKg) }))
    .filter((i) => i.variety && i.weightKg > 0);
}

function cleanOrder(b, base = {}) {
  const has = (k) => b[k] !== undefined;
  const o = { ...base };
  const str = (k, max) => { if (has(k)) o[k] = s(b[k], max); };
  const nm = (k) => { if (has(k)) o[k] = n(b[k]); };
  ['customerName', 'phone', 'email', 'district', 'source', 'courier', 'consignmentId', 'paymentMethod', 'paymentRef'].forEach((k) => str(k, 100));
  str('address', 400);
  str('notes', 500);
  ['packagingCost', 'courierFee', 'discount', 'totalBill', 'advancePaid', 'codAmount', 'returnCost'].forEach(nm);
  if (has('items')) o.items = cleanItems(b.items);
  if (has('date')) o.date = validDate(b.date);
  if (has('paymentVerified')) o.paymentVerified = !!b.paymentVerified;
  if (has('status') && ORDER_STATUSES.includes(b.status)) o.status = b.status;
  return o;
}

function finalizeOrder(o, b) {
  // fill in derived money fields unless the admin explicitly typed them
  if (b.totalBill === undefined || b.totalBill === '') {
    o.totalBill = (o.items || []).reduce((t, i) => t + i.weightKg * i.ratePerKg, 0) + n(o.packagingCost) + n(o.courierFee) - n(o.discount);
  }
  o.advancePaid = n(o.advancePaid);
  if (b.codAmount === undefined || b.codAmount === '') o.codAmount = Math.max(0, n(o.totalBill) - o.advancePaid);
  return o;
}

function stockMap() {
  const m = computeMetrics(db());
  return Object.fromEntries(m.varietyStock.map((v) => [v.variety, v.available]));
}

function pushStatus(o, status) {
  o.status = status;
  o.statusHistory = [...(o.statusHistory || []), { status, at: new Date().toISOString() }];
}

// ====================================================================================
// PUBLIC API (used by your order-placing website)
// ====================================================================================
const pub = express.Router();
pub.use(rateLimit(60));

pub.get('/catalog', (_req, res) => {
  const st = db().settings;
  const stock = stockMap();
  res.json({
    ok: true,
    business: st.businessName,
    currency: 'BDT',
    acceptsPreOrders: !st.enforceStock,
    varieties: st.varieties.filter((v) => v.active && n(v.pricePerKg) > 0).map((v) => ({
      name: v.name,
      pricePerKg: n(v.pricePerKg),
      availableKg: Math.max(0, Math.round(stock[v.name] || 0)),
      inStock: (stock[v.name] || 0) > 0
    })),
    packaging: st.packaging,
    delivery: st.delivery,
    paymentMethods: st.paymentMethods
  });
});

pub.post('/quote', (req, res) => {
  const items = parseItems(req.body);
  const bad = checkItems(items);
  if (bad) return fail(res, 400, bad);
  const q = quote(db().settings, items.map((i) => ({ variety: i.variety, weightKg: i.weightKg })), s(req.body.district));
  res.json({ ok: true, ...q });
});

function parseItems(b) {
  if (Array.isArray(b.items)) return b.items.map((i) => ({ variety: s(i.variety, 80), weightKg: n(i.weightKg) }));
  if (b.variety) return [{ variety: s(b.variety, 80), weightKg: n(b.weightKg) }];
  return [];
}
function checkItems(items) {
  const st = db().settings;
  if (!items.length) return 'At least one item (variety + weightKg) is required';
  if (items.length > 10) return 'Too many items';
  for (const i of items) {
    const v = st.varieties.find((x) => x.name === i.variety && x.active);
    if (!v) return `Unknown mango variety: ${i.variety}`;
    if (n(v.pricePerKg) <= 0) return `${i.variety} is not open for orders yet`;
    if (!(i.weightKg > 0)) return `Invalid weight for ${i.variety}`;
  }
  if (sum(items, (i) => i.weightKg) > 500) return 'Maximum 500 kg per order';
  return null;
}

pub.post('/orders', requireApiKey, (req, res) => {
  const b = req.body || {};
  const st = db().settings;

  // idempotency: same externalId from the website returns the existing order instead of a duplicate
  const externalId = s(b.externalId, 80);
  if (externalId) {
    const dup = db().orders.find((o) => o.externalId === externalId);
    if (dup) return res.json({ ok: true, duplicate: true, ...publicOrderView(dup) });
  }

  const customerName = s(b.customerName, 100);
  const phone = normalizePhone(b.phone);
  const address = s(b.address, 400);
  const district = s(b.district, 60);
  if (customerName.length < 2) return fail(res, 400, 'customerName is required');
  if (!phone) return fail(res, 400, 'A valid Bangladeshi mobile number is required (01XXXXXXXXX)');
  if (address.length < 5) return fail(res, 400, 'address is required');
  if (!district) return fail(res, 400, 'district is required');

  const items = parseItems(b);
  const bad = checkItems(items);
  if (bad) return fail(res, 400, bad);

  if (st.enforceStock) {
    const stock = stockMap();
    for (const i of items) {
      const want = sum(items.filter((x) => x.variety === i.variety), (x) => x.weightKg);
      if (want > (stock[i.variety] || 0)) {
        return res.status(409).json({ ok: false, error: `Only ${Math.max(0, Math.floor(stock[i.variety] || 0))} kg of ${i.variety} available`, availableKg: Math.max(0, stock[i.variety] || 0) });
      }
    }
  }

  const q = quote(st, items, district);
  const method = st.paymentMethods.includes(b.paymentMethod) ? b.paymentMethod : st.paymentMethods[0];
  const isCod = /cod|cash/i.test(method);
  const paymentRef = s(b.paymentRef || b.trxId, 60);
  if (!isCod && !paymentRef) return fail(res, 400, 'paymentRef (transaction ID) is required for prepaid payment methods');
  const advance = isCod ? 0 : Math.min(q.total, b.advanceAmount !== undefined ? n(b.advanceAmount) : q.total);

  const id = store.nextId('order');
  const order = {
    id,
    date: todayStr(),
    createdAt: new Date().toISOString(),
    source: st.orderSources.includes(b.source) ? b.source : 'Website',
    externalId: externalId || undefined,
    customerName, phone, email: s(b.email, 100), district, address,
    notes: s(b.notes, 500),
    items: q.items,
    packagingCost: q.packagingCost,
    courierFee: q.courierFee,
    discount: 0,
    totalBill: q.total,
    paymentMethod: method,
    paymentRef,
    paymentVerified: isCod, // prepaid payments wait for the admin to verify the trxId
    advancePaid: advance,
    codAmount: Math.max(0, q.total - advance),
    courier: '',
    consignmentId: '',
    status: 'New',
    seen: false,
    codSettled: false,
    statusHistory: [{ status: 'New', at: new Date().toISOString() }]
  };
  db().orders.unshift(order);
  store.save();
  res.status(201).json({ ok: true, ...publicOrderView(order) });
});

function publicOrderView(o) {
  return {
    orderId: o.id, status: o.status, items: o.items, packagingCost: o.packagingCost, courierFee: o.courierFee,
    total: orderTotal(o), advancePaid: o.advancePaid, codAmount: o.codAmount, paymentMethod: o.paymentMethod,
    courier: o.courier || null, consignmentId: o.consignmentId || null,
    history: (o.statusHistory || []).map((h) => ({ status: h.status, at: h.at }))
  };
}

pub.get('/orders/:id', (req, res) => {
  const o = db().orders.find((x) => x.id === req.params.id.toUpperCase());
  const phone = normalizePhone(req.query.phone);
  if (!o || !phone || o.phone !== phone) return fail(res, 404, 'Order not found');
  res.json({ ok: true, ...publicOrderView(o) });
});

app.use('/api/public', pub);
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ====================================================================================
// ADMIN API
// ====================================================================================
const loginAttempts = new Map();
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip;
  const rec = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (rec.until > Date.now()) return fail(res, 429, 'Too many attempts. Try again in a few minutes.');
  const { salt, passwordHash } = db().secrets;
  if (safeEq(store.hashPassword(req.body?.password || '', salt), passwordHash)) {
    loginAttempts.delete(ip);
    return res.json({ ok: true, token: signToken() });
  }
  rec.count += 1;
  if (rec.count >= 8) { rec.until = Date.now() + 5 * 60000; rec.count = 0; }
  loginAttempts.set(ip, rec);
  fail(res, 401, 'Wrong password');
});

const admin = express.Router();
admin.use(requireAdmin);

const viewState = () => ({
  settings: { ...db().settings, apiKey: db().secrets.apiKey },
  harvests: db().harvests,
  orders: db().orders,
  expenses: db().expenses,
  settlements: db().settlements
});
admin.get('/state', (_req, res) => res.json({ ok: true, ...viewState() }));

// ---- harvests
function cleanHarvest(b, base = {}) {
  const h = { ...base };
  if (b.date !== undefined) h.date = validDate(b.date);
  if (b.block !== undefined) h.block = s(b.block, 100);
  if (b.variety !== undefined) h.variety = s(b.variety, 80);
  ['totalKg', 'gradeAKg', 'gradeBKg', 'wastageKg'].forEach((k) => { if (b[k] !== undefined) h[k] = Math.max(0, n(b[k])); });
  if (b.notes !== undefined) h.notes = s(b.notes, 300);
  return h;
}
admin.post('/harvests', (req, res) => {
  const h = cleanHarvest(req.body);
  if (!h.variety || !(h.totalKg > 0)) return fail(res, 400, 'Variety and total weight are required');
  if (n(h.gradeAKg) + n(h.gradeBKg) > h.totalKg + 0.001) return fail(res, 400, 'Grade A + Grade B cannot exceed total weight');
  h.id = store.nextId('harvest');
  db().harvests.unshift(h);
  store.save();
  res.status(201).json({ ok: true, harvest: h });
});
admin.put('/harvests/:id', (req, res) => {
  const i = db().harvests.findIndex((x) => x.id === req.params.id);
  if (i < 0) return fail(res, 404, 'Not found');
  const h = cleanHarvest(req.body, db().harvests[i]);
  if (n(h.gradeAKg) + n(h.gradeBKg) > h.totalKg + 0.001) return fail(res, 400, 'Grade A + Grade B cannot exceed total weight');
  db().harvests[i] = h;
  store.save();
  res.json({ ok: true, harvest: h });
});
admin.delete('/harvests/:id', (req, res) => {
  db().harvests = db().harvests.filter((x) => x.id !== req.params.id);
  store.save();
  res.json({ ok: true });
});

// ---- ledger (expenses / investments / other income)
function cleanExpense(b, base = {}) {
  const e = { ...base };
  if (b.date !== undefined) e.date = validDate(b.date);
  if (b.kind !== undefined && LEDGER_KINDS.includes(b.kind)) e.kind = b.kind;
  if (b.category !== undefined) e.category = s(b.category, 80);
  if (b.description !== undefined) e.description = s(b.description, 200);
  if (b.block !== undefined) e.block = s(b.block, 100);
  if (b.amount !== undefined) e.amount = Math.max(0, n(b.amount));
  if (b.paidTo !== undefined) e.paidTo = s(b.paidTo, 100);
  return e;
}
admin.post('/expenses', (req, res) => {
  const e = cleanExpense({ kind: 'Operating', ...req.body });
  if (!(e.amount > 0)) return fail(res, 400, 'Amount must be greater than zero');
  e.category = e.category || 'Other';
  e.id = store.nextId('expense');
  db().expenses.unshift(e);
  store.save();
  res.status(201).json({ ok: true, expense: e });
});
admin.put('/expenses/:id', (req, res) => {
  const i = db().expenses.findIndex((x) => x.id === req.params.id);
  if (i < 0) return fail(res, 404, 'Not found');
  db().expenses[i] = cleanExpense(req.body, db().expenses[i]);
  store.save();
  res.json({ ok: true, expense: db().expenses[i] });
});
admin.delete('/expenses/:id', (req, res) => {
  db().expenses = db().expenses.filter((x) => x.id !== req.params.id);
  store.save();
  res.json({ ok: true });
});

// ---- orders
admin.post('/orders', (req, res) => {
  const b = req.body || {};
  const o = cleanOrder(b, { date: todayStr(), source: 'Other', status: 'Confirmed', paymentVerified: true, codSettled: false });
  if (!o.customerName) return fail(res, 400, 'Customer name is required');
  if (!o.items?.length) return fail(res, 400, 'Add at least one mango line with weight');
  finalizeOrder(o, b);
  if (o.codAmount <= 0) o.codSettled = true;
  o.id = store.nextId('order');
  o.createdAt = new Date().toISOString();
  o.seen = true;
  o.statusHistory = [{ status: o.status, at: o.createdAt }];
  db().orders.unshift(o);
  store.save();
  res.status(201).json({ ok: true, order: o });
});
admin.put('/orders/:id', (req, res) => {
  const i = db().orders.findIndex((x) => x.id === req.params.id);
  if (i < 0) return fail(res, 404, 'Not found');
  const prev = db().orders[i];
  const o = cleanOrder(req.body, prev);
  if (!o.items?.length) return fail(res, 400, 'Order needs at least one mango line');
  finalizeOrder(o, { totalBill: req.body.totalBill, codAmount: req.body.codAmount });
  if (o.status !== prev.status) pushStatus(o, o.status);
  o.seen = true;
  if (o.codAmount <= 0) o.codSettled = true;
  db().orders[i] = o;
  store.save();
  res.json({ ok: true, order: o });
});
admin.post('/orders/:id/status', (req, res) => {
  const o = db().orders.find((x) => x.id === req.params.id);
  if (!o) return fail(res, 404, 'Not found');
  if (!ORDER_STATUSES.includes(req.body.status)) return fail(res, 400, 'Invalid status');
  pushStatus(o, req.body.status);
  o.seen = true;
  store.save();
  res.json({ ok: true, order: o });
});
admin.post('/orders/:id/verify-payment', (req, res) => {
  const o = db().orders.find((x) => x.id === req.params.id);
  if (!o) return fail(res, 404, 'Not found');
  o.paymentVerified = true;
  if (req.body.advancePaid !== undefined) {
    o.advancePaid = n(req.body.advancePaid);
    o.codAmount = Math.max(0, orderTotal(o) - o.advancePaid);
    if (o.codAmount <= 0) o.codSettled = true;
  }
  store.save();
  res.json({ ok: true, order: o });
});
admin.delete('/orders/:id', (req, res) => {
  db().orders = db().orders.filter((x) => x.id !== req.params.id);
  store.save();
  res.json({ ok: true });
});

// ---- COD settlements
admin.post('/settlements', (req, res) => {
  const { courier, orderIds, received, date, note } = req.body || {};
  const orders = db().orders.filter((o) => (orderIds || []).includes(o.id) && o.status === 'Delivered' && n(o.codAmount) > 0 && !o.codSettled);
  if (!orders.length) return fail(res, 400, 'Select at least one delivered, unsettled COD order');
  const expected = sum(orders, (o) => o.codAmount);
  const got = Math.max(0, n(received));
  const id = store.nextId('settlement');
  let given = 0;
  orders.forEach((o, idx) => {
    const share = idx === orders.length - 1 ? got - given : Math.round((got * n(o.codAmount)) / expected);
    given += share;
    o.codSettled = true;
    o.settlementId = id;
    o.courierCostActual = Math.max(0, n(o.codAmount) - share);
  });
  const st = { id, date: validDate(date), courier: s(courier, 80) || orders[0].courier, orderIds: orders.map((o) => o.id), expected, received: got, deduction: expected - got, note: s(note, 200) };
  db().settlements.unshift(st);
  store.save();
  res.status(201).json({ ok: true, settlement: st });
});
admin.delete('/settlements/:id', (req, res) => {
  db().orders.forEach((o) => {
    if (o.settlementId === req.params.id) { o.codSettled = false; delete o.settlementId; o.courierCostActual = null; }
  });
  db().settlements = db().settlements.filter((x) => x.id !== req.params.id);
  store.save();
  res.json({ ok: true });
});

// ---- settings
admin.put('/settings', (req, res) => {
  const b = req.body || {};
  const st = db().settings;
  const list = (a, max = 80) => (Array.isArray(a) ? a.map((x) => s(x, max)).filter(Boolean) : null);
  if (b.businessName !== undefined) st.businessName = s(b.businessName, 100);
  if (b.location !== undefined) st.location = s(b.location, 100);
  if (b.totalBigha !== undefined) st.totalBigha = n(b.totalBigha);
  if (Array.isArray(b.varieties)) st.varieties = b.varieties.map((v) => ({ name: s(v.name, 80), pricePerKg: Math.max(0, n(v.pricePerKg)), active: v.active !== false })).filter((v) => v.name);
  if (Array.isArray(b.blocks)) st.blocks = b.blocks.map((x) => ({ name: s(x.name, 100), bigha: Math.max(0, n(x.bigha)) })).filter((x) => x.name);
  ['couriers', 'paymentMethods', 'orderSources', 'categories'].forEach((k) => { const l = list(b[k]); if (l && l.length) st[k] = l; });
  if (Array.isArray(b.allowedOrigins)) st.allowedOrigins = b.allowedOrigins.map((x) => s(x, 200).replace(/\/$/, '')).filter(Boolean);
  if (b.delivery) st.delivery = { ...st.delivery, insidePerKg: n(b.delivery.insidePerKg), outsidePerKg: n(b.delivery.outsidePerKg), minCharge: n(b.delivery.minCharge), insideDhakaDistricts: list(b.delivery.insideDhakaDistricts) || st.delivery.insideDhakaDistricts };
  if (b.packaging) st.packaging = { boxKg: Math.max(1, n(b.packaging.boxKg)), perBox: n(b.packaging.perBox) };
  if (b.codFeePercent !== undefined) st.codFeePercent = n(b.codFeePercent);
  if (b.enforceStock !== undefined) st.enforceStock = !!b.enforceStock;
  if (b.analysis) Object.keys(st.analysis).forEach((k) => { if (b.analysis[k] !== undefined) st.analysis[k] = n(b.analysis[k]); });
  store.save();
  res.json({ ok: true, settings: viewState().settings });
});
admin.post('/settings/rotate-key', (_req, res) => {
  db().secrets.apiKey = 'cm_live_' + crypto.randomBytes(18).toString('hex');
  store.save();
  res.json({ ok: true, apiKey: db().secrets.apiKey });
});
admin.post('/settings/password', (req, res) => {
  const { current, next } = req.body || {};
  const { salt, passwordHash } = db().secrets;
  if (!safeEq(store.hashPassword(current || '', salt), passwordHash)) return fail(res, 400, 'Current password is wrong');
  if (String(next || '').length < 8) return fail(res, 400, 'New password must be at least 8 characters');
  const newSalt = crypto.randomBytes(16).toString('hex');
  db().secrets.salt = newSalt;
  db().secrets.passwordHash = store.hashPassword(next, newSalt);
  db().secrets.tokenSecret = crypto.randomBytes(32).toString('hex'); // signs everyone else out
  store.save();
  res.json({ ok: true, token: signToken() });
});
admin.post('/reset', (req, res) => {
  if (req.body?.confirm !== 'RESET') return fail(res, 400, 'Type RESET to confirm');
  store.resetData();
  res.json({ ok: true });
});

app.use('/api', admin);
app.use('/api', (_req, res) => fail(res, 404, 'Unknown API route'));

// ---------- static front end ----------
app.use('/examples', express.static(path.join(ROOT, 'examples')));
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nChapaiMango ERP running on http://localhost:${PORT}`);
  if (store.firstRunPassword) {
    console.log('\n  FIRST RUN — admin password (change it in Settings):');
    console.log(`  ${store.firstRunPassword}\n`);
  }
});
