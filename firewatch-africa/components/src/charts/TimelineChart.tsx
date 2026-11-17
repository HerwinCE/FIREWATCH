/* TimelineChart — séries temporelles SVG (lignes / aires / empilé), un seul axe Y,
   info-bulle au survol, marqueurs « jour inhabituel », alternative tabulaire. */
import { useId, useMemo, useRef, useState } from 'react';
import { useElementWidth } from './useElementWidth';
import { fmt } from '../utils/format';

export interface Series { name: string; color: string; values: number[]; dash?: string }
export interface TimelineChartProps { x: string[]; series: Series[]; height?: number; stacked?: boolean; area?: boolean; unusual?: number[]; yFormat?: (v: number) => string; caption: string; granularity?: 'day' | 'week' | 'month' }

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const shortDate = (k: string, g: 'day' | 'week' | 'month' = 'day') => { const [y, m, d] = k.split('-'); return g === 'month' ? `${MOIS[+m - 1]} ${y}` : `${+d} ${MOIS[+m - 1]}`; };
const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
/** Indices des valeurs à plus de `z` écarts-types au-dessus de la moyenne. */
export const unusualIndices = (vals: number[], z = 2) => { if (vals.length < 7) return []; const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length) || 1; return vals.flatMap((v, i) => ((v - m) / sd > z ? [i] : [])); };

export function TimelineChart({ x, series, height = 220, stacked = false, area = true, unusual = [], yFormat = fmt.n, caption, granularity = 'day' }: TimelineChartProps) {
  const [ref, W] = useElementWidth<HTMLDivElement>(600); const [hover, setHover] = useState<number | null>(null); const svgRef = useRef<SVGSVGElement>(null); const id = useId();
  const m = { t: 12, r: 12, b: 26, l: 40 }; const iw = Math.max(10, W - m.l - m.r), ih = height - m.t - m.b; const n = x.length;
  const geo = useMemo(() => {
    const totals = x.map((_, i) => (stacked ? series.reduce((s, se) => s + se.values[i], 0) : Math.max(...series.map((se) => se.values[i]))));
    const ymax = niceMax(Math.max(1, ...totals)); const X = (i: number) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw); const Y = (v: number) => m.t + ih - (v / ymax) * ih;
    const base = new Array(n).fill(0); const shapes = series.map((se) => { const top = se.values.map((v, i) => (stacked ? base[i] + v : v)); const line = top.map((v, i) => `${X(i)},${Y(v)}`).join(' '); const bottom = stacked ? base.map((v, i) => `${X(i)},${Y(v)}`).reverse().join(' ') : `${X(n - 1)},${Y(0)} ${X(0)},${Y(0)}`; if (stacked) top.forEach((v, i) => (base[i] = v)); return { se, line, poly: `${line} ${bottom}` }; });
    return { ymax, X, Y, shapes, totals };
  }, [x, series, stacked, iw, ih, n]);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * geo.ymax);
  return (
    <figure className="chart" ref={ref} style={{ margin: 0 }} aria-labelledby={`${id}-c`}>
      <figcaption id={`${id}-c`} className="sr-only">{caption}</figcaption>
      <svg ref={svgRef} width={W} height={height} role="img" aria-label={caption}
        onPointerMove={(e) => { const r = svgRef.current!.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - m.l) / iw) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))); }}
        onPointerLeave={() => setHover(null)}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={geo.Y(t)} y2={geo.Y(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={m.l - 8} y={geo.Y(t) + 4} textAnchor="end">{yFormat(t)}</text>)}
          {x.map((k, i) => (i % every === 0 ? <text key={k} x={geo.X(i)} y={height - 6} textAnchor="middle">{shortDate(k, granularity)}</text> : null))}
        </g>
        {geo.shapes.map(({ se, line, poly }, si) => (
          <g key={se.name}>
            {area && <polygon className="chart__area" points={poly} fill={se.color} />}
            <polyline className={se.dash ? 'chart__line' : 'chart__line chart__draw'} points={line} stroke={se.color} strokeDasharray={se.dash} style={{ animationDelay: `${si * 120}ms` }} />
          </g>
        ))}
        {unusual.map((i) => <path key={i} d={`M${geo.X(i)} ${geo.Y(geo.totals[i]) - 14} l5 8 h-10z`} fill="var(--fw-color-text-primary)"><title>Jour inhabituel : {shortDate(x[i])}</title></path>)}
        {hover != null && <line className="chart__rule" x1={geo.X(hover)} x2={geo.X(hover)} y1={m.t} y2={m.t + ih} />}
      </svg>
      {hover != null && (
        <div className="tooltip is-on" style={{ left: geo.X(hover) + 184 > W ? geo.X(hover) - 184 : geo.X(hover) + 14, top: m.t }} aria-hidden="true">
          <b>{shortDate(x[hover], granularity)}</b>
          {series.map((se) => <div className="tr" key={se.name}><span><i className="sw" style={{ background: se.color }} />{se.name}</span><em>{yFormat(se.values[hover])}</em></div>)}
        </div>
      )}
    </figure>
  );
}
