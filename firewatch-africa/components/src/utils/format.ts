/* Formatage FR (nombres, dates UTC, distances) — toujours via Intl, jamais à la main. */
const nf = new Intl.NumberFormat('fr-FR');
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt = {
  n: (v?: number | null) => (v == null ? '—' : nf.format(v)),
  d1: (v?: number | null) => (v == null ? '—' : nf1.format(v)),
  d2: (v?: number | null) => (v == null ? '—' : nf2.format(v)),
  pct: (v?: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`),
  /** "12/11 09:42 UTC" */
  utc: (t: number | string) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${d.toISOString().slice(11, 16)} UTC`; },
  hhmm: (acq: string) => `${acq.slice(0, 2)}:${acq.slice(2)}`,
  lat: (v: number) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? 'N' : 'S'}`,
  lon: (v: number) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? 'E' : 'O'}`,
  dist: (km: number, unit: 'km' | 'mi' = 'km') => (unit === 'mi' ? `${nf2.format(km * 0.621371)} mi` : `${nf2.format(km)} km`),
};
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
