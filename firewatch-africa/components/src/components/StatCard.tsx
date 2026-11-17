/* StatCard — chiffre clé + libellé + pied (variation, unité) + sparkline optionnelle. */
import type { ReactNode } from 'react';
import { cx, fmt } from '../utils/format';

export interface StatCardProps { label: string; value: ReactNode; unit?: string; foot?: ReactNode; symbol?: ReactNode; accent?: boolean; spark?: number[]; sparkColor?: string; loading?: boolean }

export function Sparkline({ values, width = 76, height = 26, color = 'var(--fw-color-thermal-500)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (!values.length) return null;
  const mx = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${height - 2 - (v / mx) * (height - 4)}`).join(' ');
  return <svg width={width} height={height} aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" /></svg>;
}
export const Delta = ({ value, suffix = 'vs préc.' }: { value: number | null; suffix?: string }) => (
  <><span className="delta">{value == null ? '—' : `${value > 0 ? '▲' : value < 0 ? '▼' : '■'} ${fmt.pct(value)}`}</span>{value != null && <span>{suffix}</span>}</>
);

export function StatCard({ label, value, unit, foot, symbol, accent, spark, sparkColor, loading }: StatCardProps) {
  if (loading) return <div className="card stat" aria-busy="true"><div className="skel" style={{ height: 12, width: '60%' }} /><div className="skel" style={{ height: 28, width: '70%', marginTop: 12 }} /><div className="skel" style={{ height: 10, width: '40%', marginTop: 10 }} /></div>;
  return (
    <div className={cx('card stat', accent && 'stat--accent')}>
      <div className="stat__label">{symbol}{label}</div>
      <div className="stat__row">
        <div className="stat__value">{value}{unit && <small>{unit}</small>}</div>
        {spark && <div className="stat__spark"><Sparkline values={spark} color={sparkColor} /></div>}
      </div>
      <div className="stat__foot">{foot}</div>
    </div>
  );
}
