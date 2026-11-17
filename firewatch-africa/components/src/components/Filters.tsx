/* FilterPanel · DateRangePicker · SensorToggle · SatelliteToggle · ConfidenceToggle
   Les filtres alimentent directement le contrat API (start_date, end_date, sensor, satellite, bbox).
   Confiance / jour-nuit / événements uniquement : filtres client (extensions API proposées). */
import type { ConfidenceClass, SatelliteId, Sensor } from '../api/types';
import { ALL_SATELLITES, activeFilterCount, type RangePreset, useFilters } from '../state/filters';
import { SATELLITES } from './Badges';
import { Icon, ShapeSymbol } from './Icon';

const PRESETS: [RangePreset, string][] = [['24h', '24 h'], ['7d', '7 j'], ['30d', '30 j'], ['90d', '90 j']];
export function DateRangePicker({ min, max, start, end }: { min: string; max: string; start: string; end: string }) {
  const { range, set } = useFilters();
  return (
    <div className="filters__group">
      <span className="label">Période</span>
      <div className="seg" role="group" aria-label="Période prédéfinie">{PRESETS.map(([k, l]) => <button key={k} aria-pressed={range === k} onClick={() => set({ range: k })}>{l}</button>)}</div>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <label className="field" style={{ flex: 1 }}><span>Début</span><input className="input" type="date" value={start} min={min} max={end} onChange={(e) => set({ range: 'custom', start: e.target.value, end })} /></label>
        <label className="field" style={{ flex: 1 }}><span>Fin</span><input className="input" type="date" value={end} min={start} max={max} onChange={(e) => set({ range: 'custom', start, end: e.target.value })} /></label>
      </div>
    </div>
  );
}
export function SensorToggle() {
  const { sensors, toggle } = useFilters();
  return (
    <div className="filters__group"><span className="label">Capteur <span className="muted small">sensor</span></span>
      <div className="filters__chips">{(['MODIS', 'VIIRS'] as Sensor[]).map((s) => <button key={s} className="chip" aria-pressed={sensors.includes(s)} onClick={() => toggle('sensors', s)}><ShapeSymbol kind={s} size={10} />{s} <span className="muted">{s === 'MODIS' ? '1 km' : '375 m'}</span></button>)}</div>
    </div>
  );
}
export function SatelliteToggle() {
  const { satellites, toggle } = useFilters();
  return (
    <div className="filters__group"><span className="label">Satellite <span className="muted small">satellite</span></span>
      <div className="filters__chips">{ALL_SATELLITES.map((s: SatelliteId) => <button key={s} className="chip" aria-pressed={satellites.includes(s)} onClick={() => toggle('satellites', s)}><ShapeSymbol kind={SATELLITES[s].sensor} size={9} />{SATELLITES[s].label}</button>)}</div>
    </div>
  );
}
export function ConfidenceToggle() {
  const { confidence, toggle } = useFilters();
  return (
    <div className="filters__group"><span className="label">Niveau de confiance <span className="badge" title="Filtre appliqué côté client">client</span></span>
      <div className="filters__chips">{(['low', 'nominal', 'high'] as ConfidenceClass[]).map((c) => <button key={c} className="chip" aria-pressed={confidence.includes(c)} onClick={() => toggle('confidence', c)}><span className={`conf conf--${c}`}><span className="conf__bars" aria-hidden="true"><i /><i /><i /></span></span>{{ low: 'Faible', nominal: 'Nominale', high: 'Élevée' }[c]}</button>)}</div>
    </div>
  );
}
export function FilterPanel({ period, coverage, resultLabel, onClose }: { period: { start: string; end: string }; coverage: { start: string; end: string }; resultLabel?: string; onClose?: () => void }) {
  const s = useFilters();
  return (
    <aside className="mapscreen__panel" aria-label="Filtres de la carte">
      <div className="drawer-handle" aria-hidden="true" />
      <div className="card__head" style={{ padding: '16px 16px 0' }}><div><h3 className="card__title">Filtres</h3><div className="result-count" aria-live="polite">{resultLabel}</div></div>
        {onClose && <div className="card__actions"><button className="btn btn--ghost btn--sm btn--icon only-narrow" onClick={onClose} aria-label="Fermer les filtres"><Icon name="x" /></button></div>}</div>
      <div className="filters">
        <DateRangePicker min={coverage.start} max={coverage.end} start={period.start} end={period.end} />
        <SensorToggle /><SatelliteToggle /><ConfidenceToggle />
        <div className="filters__group"><span className="label">Jour / nuit</span><div className="seg" role="group" aria-label="Jour ou nuit">{([['all', 'Tous'], ['D', 'Jour'], ['N', 'Nuit']] as const).map(([k, l]) => <button key={k} aria-pressed={s.daynight === k} onClick={() => s.set({ daynight: k })}>{l}</button>)}</div></div>
        <div className="filters__group"><span className="label">Couches</span>
          <label className="toggle-row"><span><ShapeSymbol kind="EVENT" size={11} /> Événements probables uniquement<small>Détections rattachées à un événement harmonisé</small></span><span className="switch"><input type="checkbox" checked={s.eventsOnly} onChange={(e) => s.set({ eventsOnly: e.target.checked })} /><span /></span></label>
          <label className="toggle-row"><span>Zones de concentration<small>/api/analytics/hotspots</small></span><span className="switch"><input type="checkbox" checked={s.showHotspots} onChange={(e) => s.set({ showHotspots: e.target.checked })} /><span /></span></label>
        </div>
      </div>
      <div className="filters__foot"><button className="btn btn--sm" onClick={s.reset}><Icon name="reset" />Réinitialiser{activeFilterCount(s) ? ` (${activeFilterCount(s)})` : ''}</button>{onClose && <button className="btn btn--sm btn--primary only-narrow" style={{ marginLeft: 'auto' }} onClick={onClose}>Afficher les résultats</button>}</div>
    </aside>
  );
}
