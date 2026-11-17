/* SatelliteBadge · SensorBadge · ConfidenceBadge · LevelBadge · DemoBadge · ExperimentalBadge */
import type { ConfidenceClass, Detection, Level, SatelliteId, Sensor } from '../api/types';
import { Icon, ShapeSymbol } from './Icon';

export const SATELLITES: Record<SatelliteId, { label: string; sensor: Sensor; short: string }> = {
  Terra: { label: 'Terra', sensor: 'MODIS', short: 'T' },
  Aqua: { label: 'Aqua', sensor: 'MODIS', short: 'A' },
  'Suomi-NPP': { label: 'Suomi-NPP', sensor: 'VIIRS', short: 'N' },
  'NOAA-20': { label: 'NOAA-20', sensor: 'VIIRS', short: 'N20' },
  'NOAA-21': { label: 'NOAA-21', sensor: 'VIIRS', short: 'N21' },
};

export function SatelliteBadge({ satellite }: { satellite: SatelliteId }) {
  const s = SATELLITES[satellite];
  return <span className={`badge badge--${s.sensor.toLowerCase()}`}><ShapeSymbol kind={s.sensor} size={9} />{s.label}</span>;
}
export function SensorBadge({ sensor }: { sensor: Sensor }) {
  return (
    <span className={`badge badge--${sensor.toLowerCase()}`}>
      <ShapeSymbol kind={sensor} size={9} />{sensor} <span className="muted" style={{ fontWeight: 500 }}>{sensor === 'MODIS' ? '≈1 km' : '375 m'}</span>
    </span>
  );
}

const CONF_LABEL: Record<ConfidenceClass, string> = { low: 'Faible', nominal: 'Nominale', high: 'Élevée' };
/** Confiance harmonisée (MODIS % → classe) avec la valeur brute FIRMS en complément. */
export function ConfidenceBadge({ detection }: { detection: Pick<Detection, 'instrument' | 'confidence' | 'conf_class'> }) {
  const raw = detection.instrument === 'MODIS' ? `${detection.confidence} %` : String(detection.confidence).toUpperCase();
  return (
    <span className={`conf conf--${detection.conf_class}`} title={`Valeur brute FIRMS : ${raw}`}>
      <span className="conf__bars" aria-hidden="true"><i /><i /><i /></span>
      {CONF_LABEL[detection.conf_class]} <span className="muted mono small">({raw})</span>
    </span>
  );
}

export const LEVELS: Record<Level, { label: string; icon: string }> = { low: { label: 'Faible', icon: '▽' }, moderate: { label: 'Modéré', icon: '◆' }, high: { label: 'Élevé', icon: '▲' } };
/** Niveau analytique : couleur + icône + libellé (jamais la couleur seule). */
export function LevelBadge({ level, pill = false }: { level: Level; pill?: boolean }) {
  return <span className={`lvl lvl--${level}${pill ? ' pill' : ''}`}><span className="lvl__ico" aria-hidden="true">{LEVELS[level].icon}</span>{LEVELS[level].label}</span>;
}
export const DemoBadge = ({ label = 'DÉMO' }: { label?: string }) => <span className="badge badge--demo" title="Données de démonstration — non issues d'observations réelles">{label}</span>;
export const ExperimentalBadge = () => <span className="badge badge--exp"><Icon name="alert" size={10} />Expérimental</span>;
