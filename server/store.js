import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'db.json');

export const hashPassword = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');

export const DEFAULT_CATEGORIES = [
  'Land Lease',
  'Equipment Purchase',
  'Tools & Machinery Repair',
  'Trees / Seedlings / Seeds',
  'Livestock Purchase (Sheep)',
  'Fertilizer',
  'Pesticide',
  'Medicine / Vet Care',
  'Labor / Wages',
  'Plucking & Packing Labor',
  'Feed & Fodder',
  'Irrigation / Electricity / Diesel',
  'Cartons & Packaging',
  'Local Transport',
  'Marketing & Ads',
  'Shed / Fencing / Storage',
  'Crop / Produce Sales',
  'Livestock Sales',
  'Grade-B / Local Market Sales',
  'Other'
];

export function defaultSettings() {
  return {
    businessName: 'Padma Agro Farm',
    location: 'Chapainawabganj Sadar',
    totalBigha: 18,
    // Prices start at 0 on purpose: set your real prices in Settings before opening the website API.
    varieties: ['Katimon', 'Aamrupali', 'Gormoti', 'Bari-4', 'Himsagar (Khirsapat)', 'Langra'].map((name) => ({
      name,
      pricePerKg: 0,
      active: true
    })),
    blocks: [
      { name: 'Block A (North)', bigha: 6 },
      { name: 'Block B (Central)', bigha: 6 },
      { name: 'Block C (South River-side)', bigha: 6 }
    ],
    couriers: ['Steadfast', 'Pathao', 'RedX', 'Sundarban Courier', 'SA Paribahan'],
    paymentMethods: ['Cash on Delivery (COD)', 'bKash', 'Nagad', 'Rocket', 'Bank Transfer'],
    orderSources: ['Website', 'Facebook', 'WhatsApp', 'Phone Call', 'Other'],
    enterprises: ['Mango', 'Sheep', 'Kali Dal', 'Vegetables'],
    seasonStart: '',
    seasonEnd: '',
    categories: DEFAULT_CATEGORIES,
    delivery: { insideDhakaDistricts: ['Dhaka', 'Gazipur', 'Narayanganj'], insidePerKg: 12, outsidePerKg: 14, minCharge: 100 },
    packaging: { boxKg: 12, perBox: 80 },
    codFeePercent: 1,
    enforceStock: false, // false = website may take pre-orders beyond logged stock
    allowedOrigins: [],
    analysis: {
      expectedTotalKg: 0,
      gradeAPercent: 85,
      wastagePercent: 3,
      avgRatePerKg: 0,
      returnPercent: 3,
      gradeBRatePerKg: 0,
      plannedExtraCost: 0
    }
  };
}

function freshDb() {
  const salt = crypto.randomBytes(16).toString('hex');
  const initialPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  return {
    db: {
      settings: defaultSettings(),
      harvests: [],
      orders: [],
      expenses: [],
      settlements: [],
      counters: { order: 0, harvest: 0, expense: 0, settlement: 0 },
      secrets: {
        apiKey: 'pa_live_' + crypto.randomBytes(18).toString('hex'),
        tokenSecret: crypto.randomBytes(32).toString('hex'),
        salt,
        passwordHash: hashPassword(initialPassword, salt)
      }
    },
    initialPassword: process.env.ADMIN_PASSWORD ? null : initialPassword
  };
}

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = k in base && !Array.isArray(base[k]) && typeof base[k] === 'object' && base[k] !== null ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

let db;
export let firstRunPassword = null;

export function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db = { ...freshDb().db, ...raw, settings: deepMerge(defaultSettings(), raw.settings || {}) };
    // upgrade older files: add new default categories / keep Mango as a business line
    db.settings.categories = [...new Set([...(db.settings.categories || []), ...DEFAULT_CATEGORIES])];
    if (db.settings.businessName === 'Chapai Mango Direct') db.settings.businessName = 'Padma Agro Farm';
    if (!db.settings.enterprises.includes('Mango')) db.settings.enterprises.unshift('Mango');
  } else {
    const f = freshDb();
    db = f.db;
    firstRunPassword = f.initialPassword;
    save();
  }
  return db;
}

export const get = () => db;

export function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

export function nextId(kind) {
  const prefix = { order: 'ORD', harvest: 'HRV', expense: 'EXP', settlement: 'STL' }[kind];
  db.counters[kind] = (db.counters[kind] || 0) + 1;
  return `${prefix}-${String(db.counters[kind]).padStart(4, '0')}`;
}

export function resetData() {
  const keep = db.secrets;
  db = { ...freshDb().db, secrets: keep, settings: db.settings };
  save();
}
