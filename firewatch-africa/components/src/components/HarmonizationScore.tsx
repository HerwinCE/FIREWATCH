/* HarmonizationScore — anneau 0–1 + libellé qualitatif ; variante détaillée avec les 4 composantes. */
import type { HarmonizationParams, HarmonizationSubscores } from '../api/types';
import { fmt } from '../utils/format';

export function HarmonizationScore({ score, size = 44, showLabel = true }: { score: number; size?: number; showLabel?: boolean }) {
  const lg = size > 60; const sw = lg ? 7 : 4; const r = size / 2 - sw; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(1, score));
  const label = v >= 0.75 ? 'Rapprochement fort' : v >= 0.5 ? 'Rapprochement modéré' : 'Rapprochement faible';
  return (
    <span className={`hscore${lg ? ' hscore--lg' : ''}`} role="img" aria-label={`Score d'harmonisation ${fmt.d2(score)} sur 1 — ${label}`}>
      <span className="hscore__ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fw-color-bg-surface3)" strokeWidth={sw} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fw-color-sensor-fused)" strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset var(--fw-motion-duration-slow) var(--fw-motion-easing-standard)' }} />
        </svg>
        <b>{fmt.d2(score)}</b>
      </span>
      {showLabel && <span className="small muted">{label}</span>}
    </span>
  );
}

const ROWS: { key: keyof HarmonizationSubscores; label: string }[] = [
  { key: 'spatial', label: 'Cohérence spatiale' }, { key: 'temporel', label: 'Cohérence temporelle' },
  { key: 'capteurs', label: 'Convergence des plateformes' }, { key: 'confiance', label: 'Confiance moyenne' },
];
export function HarmonizationBreakdown({ sub, params, hints }: { sub: HarmonizationSubscores; params: HarmonizationParams; hints?: Partial<Record<keyof HarmonizationSubscores, string>> }) {
  return (
    <div>
      {ROWS.map(({ key, label }) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
            <span className="small">{label} <span className="muted">× {fmt.d2(params.w[key])}</span></span>
            <span className="mono small">{fmt.d2(sub[key])}</span>
          </div>
          <div className="hbar" style={{ marginTop: 5 }} role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={sub[key]} aria-label={label}><i style={{ width: `${sub[key] * 100}%` }} /></div>
          {hints?.[key] && <div className="small muted" style={{ marginTop: 4 }}>{hints[key]}</div>}
        </div>
      ))}
    </div>
  );
}
