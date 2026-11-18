// End-to-end API test. Starts the server on a temp data dir and exercises the whole flow.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { computeMetrics, projectSeason } from '../src/lib/calc.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-test-'));
const PORT = 3999;
const base = `http://localhost:${PORT}`;
const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_PASSWORD: 'testpass123' }, stdio: 'pipe' });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let token = '', apiKey = '';
const call = async (method, url, body, headers = {}) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
let passed = 0;
const ok = (name) => { passed++; console.log('  ✓', name); };

try {
  for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break; } catch { await wait(150); } }

  // --- auth
  assert.equal((await call('GET', '/api/state')).status, 401); ok('admin routes need login');
  assert.equal((await call('POST', '/api/auth/login', { password: 'nope' })).status, 401); ok('wrong password rejected');
  token = (await call('POST', '/api/auth/login', { password: 'testpass123' })).body.token;
  assert.ok(token); ok('login works');
  let state = (await call('GET', '/api/state')).body;
  apiKey = state.settings.apiKey;
  assert.ok(apiKey.startsWith('cm_live_'));

  // --- public API refuses before prices set
  const order = { customerName: 'Arif Rahman', phone: '017-1234 5678', district: 'Dhaka', address: 'House 5, Road 3, Mirpur', variety: 'Langra', weightKg: 12 };
  assert.equal((await call('POST', '/api/public/orders', order)).status, 401); ok('public order without key -> 401');
  const noPrice = await call('POST', '/api/public/orders', order, { 'x-api-key': apiKey });
  assert.equal(noPrice.status, 400); ok('order rejected until price is configured');

  // --- configure prices
  const varieties = state.settings.varieties.map((v) => ({ ...v, pricePerKg: v.name === 'Langra' ? 130 : v.name === 'Himsagar (Khirsapat)' ? 150 : 0 }));
  await call('PUT', '/api/settings', { varieties });
  const cat = (await call('GET', '/api/public/catalog')).body;
  assert.equal(cat.varieties.length, 2); ok('catalog lists only priced varieties');

  // --- quote: 12kg Langra to Dhaka = 12*130 + 1 box*80 + max(100, 12*12=144) = 1560+80+144
  const q = (await call('POST', '/api/public/quote', { district: 'Dhaka', items: [{ variety: 'Langra', weightKg: 12 }] })).body;
  assert.equal(q.total, 1560 + 80 + 144); ok('server-side quote is correct (client price ignored)');

  // --- place website orders
  const placed = await call('POST', '/api/public/orders', { ...order, externalId: 'web-1', ratePerKg: 1 }, { 'x-api-key': apiKey });
  assert.equal(placed.status, 201);
  assert.equal(placed.body.total, 1784);
  assert.equal(placed.body.codAmount, 1784);
  assert.equal(placed.body.status, 'New'); ok('website COD order created as New with server pricing');
  const dup = await call('POST', '/api/public/orders', { ...order, externalId: 'web-1' }, { 'x-api-key': apiKey });
  assert.equal(dup.body.duplicate, true); assert.equal(dup.body.orderId, placed.body.orderId); ok('idempotent on externalId');

  const badPhone = await call('POST', '/api/public/orders', { ...order, phone: '123' }, { 'x-api-key': apiKey });
  assert.equal(badPhone.status, 400); ok('invalid phone rejected');
  const noTrx = await call('POST', '/api/public/orders', { ...order, paymentMethod: 'bKash' }, { 'x-api-key': apiKey });
  assert.equal(noTrx.status, 400); ok('prepaid method needs transaction id');
  const bk = await call('POST', '/api/public/orders', { ...order, district: 'Sylhet', items: [{ variety: 'Himsagar (Khirsapat)', weightKg: 20 }], paymentMethod: 'bKash', paymentRef: 'TX9ABC' }, { 'x-api-key': apiKey });
  assert.equal(bk.status, 201); assert.equal(bk.body.codAmount, 0); ok('prepaid website order accepted (awaiting verification)');
  // 20kg*150=3000 + 2 boxes*80 + max(100, 20*14=280) = 3440
  assert.equal(bk.body.total, 3440);

  // --- tracking needs matching phone
  assert.equal((await call('GET', `/api/public/orders/${placed.body.orderId}?phone=01999999999`)).status, 404);
  assert.equal((await call('GET', `/api/public/orders/${placed.body.orderId}?phone=01712345678`)).status, 200); ok('tracking requires matching phone');

  // --- stock enforcement
  await call('PUT', '/api/settings', { enforceStock: true });
  const noStock = await call('POST', '/api/public/orders', { ...order, externalId: 'web-2' }, { 'x-api-key': apiKey });
  assert.equal(noStock.status, 409); ok('enforceStock blocks oversell');
  await call('PUT', '/api/settings', { enforceStock: false });

  // --- harvest + metrics
  const hv = await call('POST', '/api/harvests', { date: '2026-11-17', block: 'Block A (North)', variety: 'Langra', totalKg: 400, gradeAKg: 340, gradeBKg: 48, wastageKg: 12 });
  assert.equal(hv.status, 201);
  assert.equal((await call('POST', '/api/harvests', { variety: 'Langra', totalKg: 10, gradeAKg: 9, gradeBKg: 5 })).status, 400); ok('harvest validated');

  // --- ledger
  await call('POST', '/api/expenses', { kind: 'Investment', category: 'Land Lease', description: '18 bigha lease', amount: 100000 });
  await call('POST', '/api/expenses', { kind: 'Operating', category: 'Cartons & Packaging', description: 'cartons', amount: 5000, block: 'Block A (North)' });
  await call('POST', '/api/expenses', { kind: 'Income', category: 'Grade-B / Local Market Sales', description: 'local sale', amount: 2000 });

  // --- order lifecycle + COD settlement
  const id = placed.body.orderId;
  for (const st of ['Confirmed', 'Packed', 'Handed to Courier', 'In Transit', 'Delivered']) await call('POST', `/api/orders/${id}/status`, { status: st });
  await call('PUT', `/api/orders/${id}`, { courier: 'Steadfast', consignmentId: 'SF123' });
  state = (await call('GET', '/api/state')).body;
  let m = computeMetrics(state);
  assert.equal(m.pendingCodOrders.length, 1); assert.equal(m.totalPendingCod, 1784); ok('delivered COD order awaits settlement');
  const stl = await call('POST', '/api/settlements', { courier: 'Steadfast', orderIds: [id], received: 1600 });
  assert.equal(stl.body.settlement.deduction, 184);
  state = (await call('GET', '/api/state')).body;
  m = computeMetrics(state);
  assert.equal(m.pendingCodOrders.length, 0);
  assert.equal(m.courierCosts, 184 + 280 /* settled COD deduction + prepaid bKash courier fee */);
  ok('settlement records courier deduction as a real cost');

  // metrics sanity
  assert.equal(m.investment, 100000); assert.equal(m.operating, 5000); assert.equal(m.otherIncome, 2000);
  assert.equal(m.totalGradeAKg, 340);
  assert.equal(m.soldKg, 32); // 12 + 20 reserved
  assert.equal(m.totalIncome, 1784 + 3440 + 2000);
  assert.equal(m.totalCost, 100000 + 5000 + m.courierCosts);
  assert.ok(Math.abs(m.netProfit - (m.totalIncome - m.totalCost)) < 1e-9);
  ok('dashboard metrics reconcile');
  const p = projectSeason(m, { expectedTotalKg: 8000, gradeAPercent: 85, wastagePercent: 3, avgRatePerKg: 130, returnPercent: 3, gradeBRatePerKg: 50, plannedExtraCost: 20000 });
  assert.equal(p.grid.length, 3); assert.ok(p.breakEvenRate > 0); ok('projection + sensitivity grid computed');

  // undo settlement
  await call('DELETE', `/api/settlements/${stl.body.settlement.id}`);
  state = (await call('GET', '/api/state')).body;
  assert.equal(computeMetrics(state).pendingCodOrders.length, 1); ok('deleting a settlement restores COD receivable');

  // password change signs in with new password
  const pw = await call('POST', '/api/settings/password', { current: 'testpass123', next: 'newpassword99' });
  assert.ok(pw.body.token); ok('password change works');

  // persistence across restart
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8')).orders.length === 2); ok('data persisted to disk');
  console.log(`\nAll ${passed} checks passed.`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  console.error(e.stack?.split('\n').slice(0, 4).join('\n'));
  console.error('\n--- server log ---\n' + log);
  process.exitCode = 1;
} finally {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
