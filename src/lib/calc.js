// Shared business logic. Imported by BOTH the Node server and the React app,
// so numbers on the dashboard, the API and the website quote always agree.

export const TZ = 'Asia/Dhaka';

export const ORDER_FLOW = ['New', 'Confirmed', 'Packed', 'Handed to Courier', 'In Transit', 'Delivered'];
export const ORDER_STATUSES = [...ORDER_FLOW, 'Returned', 'Cancelled'];
export const OPEN_STATUSES = ['New', 'Confirmed', 'Packed', 'Handed to Courier', 'In Transit'];
export const LEDGER_KINDS = ['Investment', 'Operating', 'Income'];
export const MANGO = 'Mango';
export const FARM_WIDE = 'Farm-wide';
export const entOf = (e) => e.enterprise || FARM_WIDE;

export const DISTRICTS = [
  'Dhaka', 'Gazipur', 'Narayanganj', 'Narsingdi', 'Manikganj', 'Munshiganj', 'Tangail', 'Kishoreganj',
  'Faridpur', 'Gopalganj', 'Madaripur', 'Rajbari', 'Shariatpur', 'Chattogram', "Cox's Bazar", 'Cumilla',
  'Feni', 'Brahmanbaria', 'Chandpur', 'Lakshmipur', 'Noakhali', 'Rangamati', 'Khagrachhari', 'Bandarban',
  'Sylhet', 'Moulvibazar', 'Habiganj', 'Sunamganj', 'Rajshahi', 'Chapainawabganj', 'Naogaon', 'Natore',
  'Pabna', 'Bogura', 'Joypurhat', 'Sirajganj', 'Khulna', 'Bagerhat', 'Satkhira', 'Jashore', 'Narail',
  'Magura', 'Jhenaidah', 'Chuadanga', 'Kushtia', 'Meherpur', 'Barishal', 'Bhola', 'Patuakhali', 'Pirojpur',
  'Jhalokati', 'Barguna', 'Rangpur', 'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari',
  'Panchagarh', 'Thakurgaon', 'Mymensingh', 'Jamalpur', 'Netrokona', 'Sherpur'
];

// ---------- small helpers ----------
export const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
export const sum = (arr, f) => arr.reduce((s, x) => s + num(f(x)), 0);
export const formatBDT = (n) => (num(n) < 0 ? '-' : '') + '৳' + Math.round(Math.abs(num(n))).toLocaleString('en-IN');
export const kgToMon = (kg) => (num(kg) / 40).toFixed(2);
export const fmtKg = (kg) => `${Math.round(num(kg) * 100) / 100} kg`;

export function todayStr(offsetDays = 0) {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
}

export const isActive = (o) => o.status !== 'Returned' && o.status !== 'Cancelled';
export const orderWeight = (o) => sum(o.items || [], (i) => i.weightKg);
export const orderItemsRevenue = (o) => sum(o.items || [], (i) => num(i.weightKg) * num(i.ratePerKg));
export const itemsSummary = (o) =>
  (o.items || []).map((i) => `${i.variety} ${num(i.weightKg)}kg`).join(' + ') || '—';

export function normalizePhone(p) {
  const digits = String(p || '').replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return m ? m[1] : null;
}

// ---------- pricing ----------
export function zoneRate(settings, district) {
  const d = String(district || '').trim().toLowerCase();
  const inside = (settings.delivery?.insideDhakaDistricts || []).map((x) => x.toLowerCase());
  return inside.includes(d) ? num(settings.delivery?.insidePerKg) : num(settings.delivery?.outsidePerKg);
}

export function priceOf(settings, variety) {
  const v = (settings.varieties || []).find((x) => x.name === variety);
  return v ? num(v.pricePerKg) : 0;
}

/** Price a basket from the server-side price list + packaging/delivery rules. */
export function quote(settings, items, district) {
  const lines = (items || [])
    .map((i) => ({
      variety: i.variety,
      weightKg: num(i.weightKg),
      ratePerKg: i.ratePerKg !== undefined && i.ratePerKg !== '' ? num(i.ratePerKg) : priceOf(settings, i.variety)
    }))
    .filter((i) => i.weightKg > 0);
  const kg = sum(lines, (l) => l.weightKg);
  const subtotal = sum(lines, (l) => l.weightKg * l.ratePerKg);
  const boxKg = num(settings.packaging?.boxKg) || 12;
  const packagingCost = kg > 0 ? Math.ceil(kg / boxKg) * num(settings.packaging?.perBox) : 0;
  const courierFee =
    kg > 0 ? Math.max(num(settings.delivery?.minCharge), Math.round(kg * zoneRate(settings, district))) : 0;
  return { items: lines, totalKg: kg, subtotal, packagingCost, courierFee, total: subtotal + packagingCost + courierFee };
}

export function orderTotal(o) {
  if (o.totalBill !== undefined && o.totalBill !== null && o.totalBill !== '') return num(o.totalBill);
  return orderItemsRevenue(o) + num(o.packagingCost) + num(o.courierFee) - num(o.discount);
}

/** What the courier actually costs us on this order (actual once settled, estimate before). */
export function courierCost(o, settings) {
  if (o.status === 'Cancelled') return 0;
  if (o.status === 'Returned') return num(o.returnCost);
  if (o.courierCostActual !== undefined && o.courierCostActual !== null) return num(o.courierCostActual);
  return num(o.courierFee) + (num(o.codAmount) * num(settings.codFeePercent)) / 100;
}

// ---------- dashboard / finance metrics ----------
export function computeMetrics(state) {
  const settings = state.settings || {};
  const harvests = state.harvests || [];
  const orders = state.orders || [];
  const expenses = state.expenses || [];
  const settlements = state.settlements || [];
  const today = todayStr(0);
  const active = orders.filter(isActive);

  // --- harvest & stock
  const totalHarvestedKg = sum(harvests, (h) => h.totalKg);
  const totalGradeAKg = sum(harvests, (h) => h.gradeAKg);
  const totalGradeBKg = sum(harvests, (h) => h.gradeBKg);
  const totalWastageKg = sum(harvests, (h) => h.wastageKg);
  const todayHarvestKg = sum(harvests.filter((h) => h.date === today), (h) => h.totalKg);
  const soldKg = sum(active, orderWeight);

  const names = new Set((settings.varieties || []).map((v) => v.name));
  harvests.forEach((h) => h.variety && names.add(h.variety));
  orders.forEach((o) => (o.items || []).forEach((i) => i.variety && names.add(i.variety)));

  const varietyStock = [...names].map((variety) => {
    const harvestedA = sum(harvests.filter((h) => h.variety === variety), (h) => h.gradeAKg);
    const harvestedB = sum(harvests.filter((h) => h.variety === variety), (h) => h.gradeBKg);
    const lines = active.flatMap((o) => (o.items || []).filter((i) => i.variety === variety));
    const reservedKg = sum(lines, (i) => i.weightKg);
    const revenue = sum(lines, (i) => num(i.weightKg) * num(i.ratePerKg));
    return {
      variety,
      price: priceOf(settings, variety),
      harvestedA,
      harvestedB,
      reservedKg,
      available: harvestedA - reservedKg, // can go negative = pre-orders not yet harvested
      revenue
    };
  });

  // --- money
  const revenueBooked = sum(active, orderTotal);
  const revenueDelivered = sum(orders.filter((o) => o.status === 'Delivered'), orderTotal);
  const itemRevenue = sum(active, orderItemsRevenue);
  const courierCosts = sum(orders, (o) => courierCost(o, settings));
  const byKind = (k) => expenses.filter((e) => e.kind === k);
  const investment = sum(byKind('Investment'), (e) => e.amount);
  const operating = sum(byKind('Operating'), (e) => e.amount);
  const otherIncome = sum(byKind('Income'), (e) => e.amount);

  const isMangoEntry = (e) => [MANGO, FARM_WIDE].includes(entOf(e));
  const mangoInvestOp = sum(expenses.filter((e) => e.kind !== 'Income' && isMangoEntry(e)), (e) => e.amount);
  const mangoOtherIncome = sum(expenses.filter((e) => e.kind === 'Income' && isMangoEntry(e)), (e) => e.amount);

  const totalCost = investment + operating + courierCosts;
  const totalIncome = revenueBooked + otherIncome;
  const netProfit = totalIncome - totalCost;
  const roiPercent = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
  const breakEvenPercent = totalCost > 0 ? (totalIncome / totalCost) * 100 : 0;
  const remainingToBreakEven = Math.max(0, totalCost - totalIncome);
  const avgSellingRate = soldKg > 0 ? itemRevenue / soldKg : 0;
  const kgToBreakEven = avgSellingRate > 0 ? remainingToBreakEven / avgSellingRate : null;
  const costPerKgProduced = totalHarvestedKg > 0 ? totalCost / totalHarvestedKg : 0;
  const costPerKgGradeA = totalGradeAKg > 0 ? totalCost / totalGradeAKg : 0;
  const breakEvenRateGradeA = totalGradeAKg > 0 ? Math.max(0, mangoInvestOp - mangoOtherIncome) / totalGradeAKg : 0;

  // --- cash (estimated)
  const cashIn =
    sum(active, (o) => (o.paymentVerified === false ? 0 : o.advancePaid)) +
    sum(settlements, (s) => s.received) +
    otherIncome;
  const cashOut = investment + operating + sum(orders.filter((o) => num(o.codAmount) <= 0), (o) => courierCost(o, settings));
  const cashBalance = cashIn - cashOut;

  // --- COD
  const pendingCodOrders = orders.filter((o) => o.status === 'Delivered' && num(o.codAmount) > 0 && !o.codSettled);
  const totalPendingCod = sum(pendingCodOrders, (o) => o.codAmount);
  const codInTransit = sum(orders.filter((o) => OPEN_STATUSES.includes(o.status)), (o) => o.codAmount);

  const openOrders = orders.filter((o) => OPEN_STATUSES.includes(o.status)).length;
  const newOrders = orders.filter((o) => o.status === 'New').length;
  const unpaidVerify = orders.filter((o) => isActive(o) && o.paymentVerified === false).length;

  // --- charts
  const dailyTrend = [6, 5, 4, 3, 2, 1, 0].map((off) => {
    const date = todayStr(off);
    return {
      date: date.slice(5),
      Harvested: sum(harvests.filter((h) => h.date === date), (h) => h.totalKg),
      Ordered: sum(active.filter((o) => o.date === date), orderWeight)
    };
  });

  const monthSet = new Set();
  [...orders, ...expenses].forEach((r) => r.date && monthSet.add(r.date.slice(0, 7)));
  const monthly = [...monthSet].sort().map((m) => {
    const rev = sum(active.filter((o) => (o.date || '').startsWith(m)), orderTotal);
    const inc = sum(expenses.filter((e) => e.kind === 'Income' && (e.date || '').startsWith(m)), (e) => e.amount);
    const spend = sum(expenses.filter((e) => e.kind !== 'Income' && (e.date || '').startsWith(m)), (e) => e.amount);
    const cc = sum(orders.filter((o) => (o.date || '').startsWith(m)), (o) => courierCost(o, settings));
    return { month: m, Revenue: rev + inc, Costs: spend + cc, Net: rev + inc - spend - cc };
  });

  const catMap = {};
  expenses.filter((e) => e.kind !== 'Income').forEach((e) => {
    const k = e.category || 'Other';
    catMap[k] = (catMap[k] || 0) + num(e.amount);
  });
  if (courierCosts > 0) catMap['Courier & COD charges'] = courierCosts;
  const costByCategory = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // --- per block cost (direct + shared allocated by bigha)
  const blocks = settings.blocks || [];
  const totalBigha = sum(blocks, (b) => b.bigha) || 1;
  const blockNames = blocks.map((b) => b.name);
  const costExp = expenses.filter((e) => e.kind !== 'Income');
  const sharedCost = sum(costExp.filter((e) => !e.block || !blockNames.includes(e.block)), (e) => e.amount);
  const blockStats = blocks.map((b) => {
    const direct = sum(costExp.filter((e) => e.block === b.name), (e) => e.amount);
    const allocated = (sharedCost * num(b.bigha)) / totalBigha;
    const hs = harvests.filter((h) => h.block === b.name);
    const kg = sum(hs, (h) => h.totalKg);
    const kgA = sum(hs, (h) => h.gradeAKg);
    const cost = direct + allocated;
    return { name: b.name, bigha: num(b.bigha), direct, allocated, cost, kg, kgA, costPerKg: kg > 0 ? cost / kg : 0, costPerBigha: b.bigha ? cost / b.bigha : 0 };
  });

  return {
    totalHarvestedKg, totalGradeAKg, totalGradeBKg, totalWastageKg, todayHarvestKg, soldKg,
    availableGradeAKg: totalGradeAKg - soldKg, varietyStock,
    revenueBooked, revenueDelivered, itemRevenue, courierCosts, investment, operating, otherIncome, mangoInvestOp,
    totalCost, totalIncome, netProfit, roiPercent, breakEvenPercent, remainingToBreakEven,
    avgSellingRate, kgToBreakEven, costPerKgProduced, costPerKgGradeA, breakEvenRateGradeA,
    cashIn, cashOut, cashBalance, pendingCodOrders, totalPendingCod, codInTransit,
    openOrders, newOrders, unpaidVerify, dailyTrend, monthly, costByCategory, blockStats
  };
}

// ---------- season projection / sensitivity ----------
export function projectSeason(metrics, a = {}) {
  const totalKg = num(a.expectedTotalKg) || metrics.totalHarvestedKg;
  const gA = num(a.gradeAPercent) / 100;
  const wst = num(a.wastagePercent) / 100;
  const ret = num(a.returnPercent) / 100;
  const calc = (kgMult, rateMult) => {
    const kg = totalKg * kgMult;
    const kgA = kg * gA;
    const kgB = Math.max(0, kg * (1 - gA - wst));
    const revenueA = kgA * (1 - ret) * num(a.avgRatePerKg) * rateMult;
    const revenueB = kgB * num(a.gradeBRatePerKg);
    const cost = metrics.mangoInvestOp + num(a.plannedExtraCost);
    const revenue = revenueA + revenueB;
    const profit = revenue - cost;
    return { kg, kgA, kgB, revenueA, revenueB, revenue, cost, profit, roi: cost > 0 ? (profit / cost) * 100 : 0 };
  };
  const base = calc(1, 1);
  const sellableA = base.kgA * (1 - ret);
  const breakEvenRate = sellableA > 0 ? Math.max(0, base.cost - base.revenueB) / sellableA : 0;
  const yieldMults = [0.8, 1, 1.2];
  const rateMults = [0.8, 0.9, 1, 1.1, 1.2];
  const grid = yieldMults.map((ym) => ({ yieldMult: ym, cells: rateMults.map((rm) => ({ rateMult: rm, ...calc(ym, rm) })) }));
  return { ...base, totalKg, breakEvenRate, grid, rateMults };
}


// ---------- business lines (Mango, Sheep, Kali Dal, Vegetables …) over a date range ----------
export function computeEnterprises(state, from = '', to = '') {
  const settings = state.settings || {};
  const orders = state.orders || [];
  const expenses = state.expenses || [];
  const inRange = (d) => (!from || (d || '') >= from) && (!to || (d || '') <= to);

  const names = [...(settings.enterprises || [MANGO])];
  expenses.forEach((e) => { const n = entOf(e); if (n !== FARM_WIDE && !names.includes(n)) names.push(n); });
  const all = [...names, FARM_WIDE];

  const rows = all.map((name) => {
    const L = expenses.filter((e) => entOf(e) === name && inRange(e.date));
    const ledgerIncome = sum(L.filter((e) => e.kind === 'Income'), (e) => e.amount);
    const investment = sum(L.filter((e) => e.kind === 'Investment'), (e) => e.amount);
    const operating = sum(L.filter((e) => e.kind === 'Operating'), (e) => e.amount);
    const isMango = name === MANGO;
    const orderIncome = isMango ? sum(orders.filter((o) => isActive(o) && inRange(o.date)), orderTotal) : 0;
    const courier = isMango ? sum(orders.filter((o) => inRange(o.date)), (o) => courierCost(o, settings)) : 0;
    const income = ledgerIncome + orderIncome;
    const cost = investment + operating + courier;
    return { name, orderIncome, ledgerIncome, income, investment, operating, courier, cost, profit: income - cost, roi: cost > 0 ? ((income - cost) / cost) * 100 : 0, entries: L.length };
  });

  const farm = rows.find((r) => r.name === FARM_WIDE);
  const lines = rows.filter((r) => r.name !== FARM_WIDE);
  const totalIncome = sum(rows, (r) => r.income);
  const totalCost = sum(rows, (r) => r.cost);

  // category x business-line cost matrix (fertilizer, medicine, labour, equipment …)
  const cat = {};
  expenses.filter((e) => e.kind !== 'Income' && inRange(e.date)).forEach((e) => {
    const c = e.category || 'Other';
    cat[c] ||= { category: c, total: 0, by: {} };
    cat[c].by[entOf(e)] = (cat[c].by[entOf(e)] || 0) + num(e.amount);
    cat[c].total += num(e.amount);
  });
  const mangoCourier = rows.find((r) => r.name === MANGO)?.courier || 0;
  if (mangoCourier > 0) cat['Courier & COD charges'] = { category: 'Courier & COD charges', total: mangoCourier, by: { [MANGO]: mangoCourier } };
  const matrix = Object.values(cat).sort((a, b) => b.total - a.total);

  return { rows, lines, farm, all, totalIncome, totalCost, netProfit: totalIncome - totalCost, roi: totalCost > 0 ? ((totalIncome - totalCost) / totalCost) * 100 : 0, matrix };
}
