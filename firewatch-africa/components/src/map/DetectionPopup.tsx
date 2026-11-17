/* DetectionPopup — fiche d'une détection (latitude, longitude, date, heure UTC, satellite, capteur,
   confiance, FRP, jour/nuit, produit source). Mobile : feuille en bas d'écran (CSS). */
import type { Detection } from '../api/types';
import { ConfidenceBadge, DemoBadge, SatelliteBadge } from '../components/Badges';
import { Icon, ShapeSymbol } from '../components/Icon';
import { fmt } from '../utils/format';

export function DetectionPopup({ d, expert = false, onClose, eventHref, demo }: { d: Detection; expert?: boolean; onClose: () => void; eventHref?: (id: string) => string; demo?: boolean }) {
  return (
    <div className="popup" role="dialog" aria-label={`Détail de la détection ${d.id}`} style={{ top: 56, right: 58 }}>
      <div className="popup__head"><ShapeSymbol kind={d.instrument} size={12} fill="var(--fw-color-thermal-500)" /><div><h3>Détection thermique</h3><div className="mono small muted">{d.id}</div></div><button className="btn btn--ghost btn--sm btn--icon" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button></div>
      <dl className="kv">
        <dt>Latitude</dt><dd>{fmt.lat(d.latitude)}</dd><dt>Longitude</dt><dd>{fmt.lon(d.longitude)}</dd>
        <dt>Date</dt><dd>{d.acq_date.split('-').reverse().join('/')}</dd><dt>Heure UTC</dt><dd>{fmt.hhmm(d.acq_time)} UTC</dd>
        <dt>Satellite</dt><dd className="sans"><SatelliteBadge satellite={d.satellite} /></dd><dt>Capteur</dt><dd className="sans">{d.instrument} · {d.instrument === 'MODIS' ? '≈ 1 km' : '375 m'}</dd>
        <dt>Confiance</dt><dd className="sans"><ConfidenceBadge detection={d} /></dd><dt>FRP</dt><dd>{fmt.d1(d.frp)} MW {d.frp >= 100 && <span className="lvl lvl--high">▲</span>}</dd>
        <dt>Jour / nuit</dt><dd className="sans">{d.daynight === 'D' ? 'Jour' : 'Nuit'}</dd><dt>Produit source</dt><dd style={{ fontSize: 11 }}>{d.product}</dd>
        {expert && <><dt>Brightness (K)</dt><dd>{fmt.d1(d.brightness)}</dd><dt>Scan × track</dt><dd>{d.scan} × {d.track}</dd><dt>Version</dt><dd>{d.version}</dd></>}
      </dl>
      <div className="popup__foot">
        {d.event_id && eventHref ? <a className="btn btn--sm btn--nasa" href={eventHref(d.event_id)}><ShapeSymbol kind="EVENT" size={10} /> Voir l’événement {d.event_id}</a> : <span>Non rattachée à un événement harmonisé</span>}
        {demo && <span style={{ marginLeft: 'auto' }}><DemoBadge /></span>}
      </div>
    </div>
  );
}
