import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutDashboard, Sprout, Truck, Wallet, Banknote, LineChart, Settings as SettingsIcon, PieChart, Leaf, Menu, X, MapPin, LogOut, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, getToken, setToken, login } from './api.js';
import { computeMetrics } from './lib/calc.js';
import { Btn, Field, inputCls } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Harvest from './pages/Harvest.jsx';
import Orders from './pages/Orders.jsx';
import Cod from './pages/Cod.jsx';
import Expenses from './pages/Expenses.jsx';
import Analysis from './pages/Analysis.jsx';
import YearPnl from './pages/YearPnl.jsx';
import Settings from './pages/Settings.jsx';

function LoginScreen({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(pw);
      onDone();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-emerald-950 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl p-7 w-full max-w-sm shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-emerald-950"><Leaf className="w-6 h-6" /></div>
          <div>
            <h1 className="font-bold text-lg text-stone-900">Padma Agro Farm ERP</h1>
            <p className="text-xs text-stone-500">Sign in to manage your orchard</p>
          </div>
        </div>
        <Field label="Admin password">
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Btn type="submit" className="w-full" disabled={busy || !pw}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
        <p className="text-[11px] text-stone-500">Forgot it? Stop the server and run: npm run reset-password</p>
      </form>
    </div>
  );
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'harvest', label: 'Harvest & Stock', icon: Sprout },
  { id: 'orders', label: 'Orders & Courier', icon: Truck },
  { id: 'cod', label: 'COD Settlements', icon: Banknote },
  { id: 'expenses', label: 'Expenses & Income', icon: Wallet },
  { id: 'pnl', label: 'Year Profit & Loss', icon: PieChart },
  { id: 'analysis', label: 'Mango Investment Analysis', icon: LineChart },
  { id: 'settings', label: 'Settings & Website API', icon: SettingsIcon }
];

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const knownOrders = useRef(null);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), 3800);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const d = await api.get('/api/state');
      setData(d);
      setLoadErr('');
      const ids = new Set(d.orders.map((o) => o.id));
      if (knownOrders.current) {
        const fresh = d.orders.filter((o) => !knownOrders.current.has(o.id) && o.source === 'Website');
        if (fresh.length) notify(`🛒 ${fresh.length} new website order${fresh.length > 1 ? 's' : ''} — ${fresh[0].customerName}`);
      }
      knownOrders.current = ids;
    } catch (e) {
      if (getToken()) setLoadErr(e.message);
    }
  }, [notify]);

  useEffect(() => {
    const out = () => { setAuthed(false); setData(null); knownOrders.current = null; };
    window.addEventListener('cm-logout', out);
    return () => window.removeEventListener('cm-logout', out);
  }, []);

  useEffect(() => {
    if (!authed) return;
    refresh();
    const t = setInterval(refresh, 15000); // pick up website orders automatically
    return () => clearInterval(t);
  }, [authed, refresh]);

  // run a mutation, then reload; shows errors as toasts
  const act = useCallback(async (fn, okMsg) => {
    try {
      const r = await fn();
      await refresh();
      if (okMsg) notify(okMsg);
      return r;
    } catch (e) {
      notify(e.message, 'error');
      return null;
    }
  }, [refresh, notify]);

  const metrics = useMemo(() => (data ? computeMetrics(data) : null), [data]);

  if (!authed) return <LoginScreen onDone={() => setAuthed(true)} />;
  if (!data || !metrics) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-500 text-sm">
        {loadErr ? <div className="text-center"><p className="text-red-600">{loadErr}</p><Btn className="mt-3" onClick={refresh}>Retry</Btn></div> : 'Loading your orchard…'}
      </div>
    );
  }

  const badge = { orders: metrics.newOrders > 0 ? String(metrics.newOrders) : null, cod: metrics.pendingCodOrders.length > 0 ? String(metrics.pendingCodOrders.length) : null };
  const ctx = { data, metrics, act, notify, go: setTab, refresh };
  const page = {
    dashboard: <Dashboard {...ctx} />,
    harvest: <Harvest {...ctx} />,
    orders: <Orders {...ctx} />,
    cod: <Cod {...ctx} />,
    expenses: <Expenses {...ctx} />,
    pnl: <YearPnl {...ctx} />,
    analysis: <Analysis {...ctx} />,
    settings: <Settings {...ctx} />
  }[tab];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 flex flex-col md:flex-row">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium max-w-sm ${toast.type === 'error' ? 'bg-red-900 text-white border-red-700' : 'bg-emerald-900 text-white border-emerald-700'}`}>
          {toast.type === 'error' ? <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      <header className="md:hidden bg-emerald-950 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-emerald-950"><Leaf className="w-5 h-5" /></div>
          <h1 className="font-bold text-base">{data.settings.businessName}</h1>
        </div>
        <button onClick={() => setMenu(!menu)} className="p-2 rounded-lg bg-emerald-900 text-emerald-100">{menu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}</button>
      </header>

      <aside className={`${menu ? 'flex' : 'hidden'} md:flex md:w-64 flex-col md:fixed md:inset-y-0 bg-emerald-950 text-emerald-50 z-20 shadow-xl`}>
        <div className="hidden md:flex items-center gap-3 px-6 py-5 border-b border-emerald-900/80">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-emerald-950"><Leaf className="w-6 h-6" /></div>
          <div className="min-w-0">
            <h1 className="font-bold text-base text-white truncate">{data.settings.businessName}</h1>
            <p className="text-xs text-amber-300 font-medium">{data.settings.totalBigha}-Bigha D2C ERP</p>
          </div>
        </div>
        <div className="mx-4 mt-4 p-3 rounded-xl bg-emerald-900/60 border border-emerald-800/80">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300"><MapPin className="w-3.5 h-3.5" /><span>{data.settings.location}</span></div>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setTab(id); setMenu(false); }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === id ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-emerald-950 font-semibold shadow-md' : 'text-emerald-100 hover:bg-emerald-900/70 hover:text-white'}`}>
              <span className="flex items-center gap-3"><Icon className="w-5 h-5" />{label}</span>
              {badge[id] && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tab === id ? 'bg-emerald-950 text-amber-300' : 'bg-rose-500 text-white'}`}>{badge[id]}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-emerald-900/80">
          <button onClick={() => { setToken(null); window.dispatchEvent(new Event('cm-logout')); }} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-emerald-300 hover:text-white hover:bg-emerald-900">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 md:pl-64 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">{page}</div>
      </main>
    </div>
  );
}
