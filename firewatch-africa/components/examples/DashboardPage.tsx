/* Exemple d'assemblage : écran Dashboard branché sur l'API réelle.
   Montre le schéma attendu pour chaque écran : filtres → paramètres API → hooks → DataState → composants. */
import {
  DataState, DemoBadge, DISCLAIMERS, FireMap, HotspotRanking, LoadingState, ShapeSymbol, StatCard, TimelineChart, BarChart,
  toApiFilters, unusualIndices, useDetections, useFilters, useHotspots, useMetadata, useSatelliteStats, useSummary, useTimeline, fmt,
} from '../src';

export function DashboardPage() {
  const meta = useMetadata();
  const filters = useFilters();
  const today = meta.data?.data.last_update.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const f = toApiFilters(filters, today);
  const summary = useSummary(f);
  const timeline = useTimeline({ ...f, granularity: 'day' });
  const sats = useSatelliteStats(f);
  const hotspots = useHotspots({ ...f, limit: 6 });
  const detections = useDetections({ ...f, limit: 20000 });
  const isDemo = meta.data?.data.dataset === 'DEMO';

  return (
    <div className="fw-page">
      <section className="hero">
        <div>{isDemo && <DemoBadge />}<h2>L’activité thermique <em>mondiale</em>, lue depuis l’Afrique et le Gabon.</h2><p>{DISCLAIMERS.pedagogy}</p>
          <div className="row"><a className="btn btn--primary" href="/carte">Explorer les données</a><a className="btn" href="/gabon">Accès rapide Gabon</a></div></div>
      </section>

      <DataState query={summary} loading={<LoadingState variant="stats" />} isEmpty={(r) => r.data.total === 0} onResetFilters={filters.reset}>
        {({ data: s }) => (
          <div className="stats">
            <StatCard label="Détections thermiques" value={fmt.n(s.total)} accent spark={timeline.data?.data.series.map((b) => b.total)} />
            <StatCard label="Détections MODIS" value={fmt.n(s.modis)} symbol={<ShapeSymbol kind="MODIS" size={10} />} foot="≈ 1 km" />
            <StatCard label="Détections VIIRS" value={fmt.n(s.viirs)} symbol={<ShapeSymbol kind="VIIRS" size={10} />} foot="375 m" />
            <StatCard label="Événements probables" value={fmt.n(s.events)} symbol={<ShapeSymbol kind="EVENT" size={11} />} />
            <StatCard label="Zones actives" value={fmt.n(s.active_zones)} />
            <StatCard label="Dernière mise à jour" value={fmt.utc(s.last_update)} />
          </div>
        )}
      </DataState>

      <div className="grid g-12">
        <section className="card span-8"><div className="card__body" style={{ height: 380 }}>
          <DataState query={detections} loading={<LoadingState variant="map" />}>
            {({ data }) => <FireMap detections={data.items} hotspots={hotspots.data?.data} recentSince={Date.parse(meta.data?.data.last_update ?? '') - 86_400_000} legend={false} controls={false} />}
          </DataState>
        </div></section>
        <section className="card span-4"><div className="card__body">
          <DataState query={hotspots} loading={<LoadingState variant="list" />} isEmpty={(r) => !r.data.length}>{({ data }) => <HotspotRanking items={data} />}</DataState>
        </div></section>
        <section className="card span-8"><div className="card__body">
          <DataState query={timeline} loading={<LoadingState variant="chart" />}>
            {({ data }) => <TimelineChart caption="Évolution quotidienne des détections" x={data.series.map((b) => b.date)} series={[{ name: 'Détections', color: 'var(--fw-color-thermal-500)', values: data.series.map((b) => b.total) }]} unusual={unusualIndices(data.series.map((b) => b.total))} />}
          </DataState>
        </div></section>
        <section className="card span-4"><div className="card__body">
          <DataState query={sats} loading={<LoadingState variant="chart" />}>
            {({ data }) => <BarChart caption="Détections par satellite" categories={data.map((s) => s.satellite)} series={[{ name: 'Détections', color: 'var(--fw-color-sensor-viirs)', values: data.map((s) => s.count) }]} colorOf={(_, i) => (data[i].sensor === 'MODIS' ? 'var(--fw-color-sensor-modis)' : 'var(--fw-color-sensor-viirs)')} />}
          </DataState>
        </div></section>
      </div>
    </div>
  );
}
