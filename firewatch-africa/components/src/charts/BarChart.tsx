/* BarChart — barres groupées verticales (extrémités arrondies ancrées à la base) ; une couleur par entité. */
import { useElementWidth } from './useElementWidth';
import { fmt } from '../utils/format';
import type { Series } from './TimelineChart';

export function BarChart({ categories, series, height = 200, yFormat = fmt.n, caption, colorOf }: { categories: string[]; series: Series[]; height?: number; yFormat?: (v: number) => string; caption: string; colorOf?: (seriesIdx: number, catIdx: number) => string }) {
  const [ref, W] = useElementWidth<HTMLDivElement>(500);
  const m = { t: 10, r: 8, b: 30, l: 40 }; const iw = W - m.l - m.r, ih = height - m.t - m.b;
  const mx = Math.max(1, ...series.flatMap((s) => s.values)); const nice = 10 ** Math.floor(Math.log10(mx)); const ymax = Math.ceil(mx / nice) * nice;
  const gw = iw / categories.length; const bw = Math.min(26, (gw - 12) / series.length); const Y = (v: number) => m.t + ih - (v / ymax) * ih;
  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={height} role="img" aria-label={caption}>
        <g className="grid">{[0, 0.5, 1].map((f) => <line key={f} x1={m.l} x2={W - m.r} y1={Y(f * ymax)} y2={Y(f * ymax)} />)}</g>
        <g className="axis">{[0, 0.5, 1].map((f) => <text key={f} x={m.l - 8} y={Y(f * ymax) + 4} textAnchor="end">{yFormat(f * ymax)}</text>)}</g>
        {categories.map((c, ci) => {
          const gx = m.l + ci * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
          return (
            <g key={c}>
              {series.map((se, si) => { const v = se.values[ci]; const h = Math.max(1, ih - (Y(v) - m.t)); const x = gx + si * (bw + 2); return (
                <path key={se.name} className="chart__bar" d={`M${x} ${m.t + ih} V${m.t + ih - h + 3} q0 -3 3 -3 h${bw - 6} q3 0 3 3 V${m.t + ih} Z`} fill={colorOf ? colorOf(si, ci) : se.color}><title>{`${c} · ${se.name} : ${yFormat(v)}`}</title></path>
              ); })}
              <text x={m.l + ci * gw + gw / 2} y={height - 10} textAnchor="middle" fill="var(--fw-color-text-secondary)" fontSize={11.5}>{c}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
