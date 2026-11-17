/* HotspotRanking · EventCard */
import type { HarmonizedEvent, Hotspot } from '../api/types';
import { LevelBadge, SatelliteBadge } from './Badges';
import { HarmonizationScore } from './HarmonizationScore';
import { Icon } from './Icon';
import { fmt } from '../utils/format';

/** Formulation prudente imposée : « zone présentant une concentration élevée de détections ». */
export function HotspotRanking({ items, onSelect, limit = 6 }: { items: Hotspot[]; onSelect?: (h: Hotspot) => void; limit?: number }) {
  return (
    <ol className="rank" aria-label="Zones présentant une concentration élevée de détections">
      {items.slice(0, limit).map((h, i) => (
        <li key={h.id}>
          <span className="rank__n">{String(i + 1).padStart(2, '0')}</span>
          <button className="rank__btn" style={{ all: 'unset', cursor: 'pointer', minWidth: 0 }} onClick={() => onSelect?.(h)}>
            <div className="rank__name">{h.province ? `Gabon · ${h.province}` : h.name}</div>
            <div className="rank__sub">{h.cell_label} · {fmt.n(h.count)} dét. · {h.active_days} j</div>
            <div className="rank__bar"><i style={{ width: `${h.score}%` }} /></div>
          </button>
          <LevelBadge level={h.level} />
        </li>
      ))}
    </ol>
  );
}

export const zoneLabel = (e: Pick<HarmonizedEvent, 'province' | 'zone'>) => (e.province && !e.zone.startsWith(e.province) ? `${e.province} — ${e.zone}` : e.zone);
export function EventCard({ event: e, href }: { event: HarmonizedEvent; href: string }) {
  return (
    <a className="card evcard" href={href}>
      <HarmonizationScore score={e.score} showLabel={false} />
      <div style={{ minWidth: 0 }}>
        <div className="evcard__id">{e.id}</div>
        <div className="evcard__name">{zoneLabel(e)}</div>
        <div className="evcard__meta"><span><Icon name="clock" size={12} />{fmt.utc(e.start)} · {fmt.d1(e.duration_h)} h</span><span>{e.n} détections</span><span>FRP max {fmt.d1(e.frp_max)} MW</span></div>
      </div>
      <div className="evcard__badges">{e.satellites.map((s) => <SatelliteBadge key={s} satellite={s} />)}</div>
    </a>
  );
}
