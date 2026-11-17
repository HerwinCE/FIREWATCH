/* HeatmapCalendar — calendrier semaines × jours ; rampe séquentielle mono-teinte (orange) + légende. */
import { shortDate } from './TimelineChart';
import { fmt } from '../utils/format';

const STEPS = ['var(--fw-color-bg-surface2)', 'var(--fw-color-chart-seq1)', 'var(--fw-color-chart-seq2)', 'var(--fw-color-chart-seq3)', 'var(--fw-color-chart-seq4)', 'var(--fw-color-chart-seq5)'];
export function HeatmapCalendar({ days, unusual = new Set<string>(), cell = 16 }: { days: { date: string; value: number }[]; unusual?: Set<string>; cell?: number }) {
  if (!days.length) return null;
  const mx = Math.max(1, ...days.map((d) => d.value)); const lvl = (v: number) => (v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / mx) * 4.999)));
  const offset = (new Date(days[0].date + 'T00:00:00Z').getUTCDay() + 6) % 7; const cells = [...Array(offset).fill(null), ...days] as ({ date: string; value: number } | null)[];
  const weeks = Math.ceil(cells.length / 7);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `16px auto`, gap: 6, justifyContent: 'start' }}>
        <div className="cal" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, fontSize: 10, color: 'var(--fw-color-text-muted)' }} aria-hidden="true">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => <span key={i} style={{ display: 'grid', alignItems: 'center' }}>{l}</span>)}</div>
        <div className="cal" role="grid" aria-label="Calendrier de l’activité thermique quotidienne" style={{ gridTemplateColumns: `repeat(${weeks}, ${cell}px)`, gridTemplateRows: `repeat(7, ${cell}px)`, gridAutoFlow: 'column' }}>
          {cells.map((c, i) => c ? <span key={c.date} role="gridcell" className={`cal__cell${unusual.has(c.date) ? ' is-unusual' : ''}`} style={{ background: STEPS[lvl(c.value)] }} title={`${shortDate(c.date)} : ${fmt.n(c.value)} détections`} aria-label={`${shortDate(c.date)} : ${c.value} détections${unusual.has(c.date) ? ', jour inhabituel' : ''}`} /> : <span key={`e${i}`} />)}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <div className="cal__scale">Moins {STEPS.map((s) => <i key={s} style={{ background: s }} />)} Plus</div>
        <span className="small muted">▲ jour inhabituel (écart &gt; 2σ)</span>
      </div>
    </div>
  );
}
