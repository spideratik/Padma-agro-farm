import React, { useId } from 'react';
import { X } from 'lucide-react';

export const inputCls =
  'w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm focus:ring-2 focus:ring-emerald-600 outline-none disabled:bg-stone-100';

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl p-5 border border-stone-200 shadow-xs ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">{title}</h2>
        {subtitle && <p className="text-sm text-stone-500 mt-0.5 max-w-2xl">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2.5">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-stone-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-stone-500 mt-1">{hint}</span>}
    </label>
  );
}

export function Combo({ value, onChange, options, placeholder, className = '', ...rest }) {
  const id = useId();
  return (
    <>
      <input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} ${className}`} {...rest} />
      <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}

export function Select({ value, onChange, options, placeholder, className = '', ...rest }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className}`} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const v = typeof o === 'string' ? { value: o, label: o } : o;
        return <option key={v.value} value={v.value}>{v.label}</option>;
      })}
    </select>
  );
}

export function NumInput({ value, onChange, className = '', ...rest }) {
  return (
    <input type="number" min="0" step="any" placeholder="0" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className}`} {...rest} />
  );
}

const btnStyles = {
  primary: 'bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm',
  accent: 'bg-amber-500 hover:bg-amber-600 text-stone-950 shadow-sm',
  ghost: 'bg-white hover:bg-stone-100 text-stone-800 border border-stone-300',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  soft: 'bg-stone-100 hover:bg-stone-200 text-stone-800'
};
export function Btn({ variant = 'primary', size = 'md', className = '', icon: Icon, children, ...rest }) {
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  return (
    <button type="button" {...rest} className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${pad} ${btnStyles[variant]} ${className}`}>
      {Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
      {children}
    </button>
  );
}

export function KpiCard({ title, value, sub, icon, accent = 'bg-emerald-100', valueColor = 'text-stone-900' }) {
  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="text-xs font-semibold text-stone-500">{title}</span>
        <div className={`text-2xl font-extrabold mt-1 tracking-tight ${valueColor}`}>{value}</div>
        {sub && <p className="text-xs text-stone-500 mt-1">{sub}</p>}
      </div>
      <div className={`w-11 h-11 rounded-xl ${accent} flex items-center justify-center shrink-0`}>{icon}</div>
    </Card>
  );
}

const statusStyles = {
  New: 'bg-rose-100 text-rose-800 border-rose-200',
  Confirmed: 'bg-amber-100 text-amber-800 border-amber-200',
  Packed: 'bg-purple-100 text-purple-800 border-purple-200',
  'Handed to Courier': 'bg-blue-100 text-blue-800 border-blue-200',
  'In Transit': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  Delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Returned: 'bg-red-100 text-red-800 border-red-200',
  Cancelled: 'bg-stone-200 text-stone-600 border-stone-300'
};
export function StatusBadge({ status }) {
  return <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${statusStyles[status] || 'bg-stone-100 text-stone-700'}`}>{status}</span>;
}

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className={`bg-white rounded-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} p-6 shadow-2xl border border-stone-200 my-8`}>
        <div className="flex items-start justify-between border-b border-stone-100 pb-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-stone-900">{title}</h3>
            {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="p-8 text-center bg-stone-50 rounded-xl border border-stone-200/70 text-sm text-stone-500">{children}</div>;
}

export function Notice({ tone = 'amber', children }) {
  const tones = { amber: 'bg-amber-50 border-amber-300 text-amber-900', red: 'bg-red-50 border-red-300 text-red-900', blue: 'bg-blue-50 border-blue-200 text-blue-900', green: 'bg-emerald-50 border-emerald-200 text-emerald-900' };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Th({ children, right }) {
  return <th className={`py-2.5 px-2 text-[11px] font-semibold text-stone-500 uppercase ${right ? 'text-right' : ''}`}>{children}</th>;
}

export function ProgressBar({ percent }) {
  return (
    <div className="w-full h-4 bg-stone-100 rounded-full overflow-hidden border border-stone-200">
      <div className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-400 transition-all duration-500 rounded-full" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

export const CHART_COLORS = ['#059669', '#f59e0b', '#2563eb', '#ea580c', '#84cc16', '#9333ea', '#0891b2', '#dc2626'];
