/* EventDetailPanel — synthèse, décomposition du score, timeline des observations,
   tableau des détections originales (distance, écart temporel), méthode et avertissement. */
import type { Detection, HarmonizedEventDetail } from '../api/types';
import { ConfidenceBadge, DemoBadge, SatelliteBadge, SensorBadge } from './Badges';
import { DataTable } from './DataTable';
import { HarmonizationBreakdown, HarmonizationScore } from './HarmonizationScore';
import { Icon, ShapeSymbol } from './Icon';
import { zoneLabel } from './Lists';
import { DISCLAIMERS } from '../utils/glossary';
import { fmt } from '../utils/format';
import { useSettings } from '../state/settings';

const KM = 111.32;
const dist = (a: Detection, b: Detection) => Math.hypot((a.longitude - b.longitude) * KM * Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180)), (a.latitude - b.latitude) * KM);
const tOf = (d: Detection) => Date.parse(`${d.acq_date}T${fmt.hhmm(d.acq_time)}:00Z`);

export function ObservationTimeline({ detections }: { detections: Detection[] }) {
  const t0 = tOf(detections[0]), t1 = tOf(detections.at(-1)!); const h0 = Math.floor(t0 / 216e5) * 216e5; const hEnd = Math.ceil(t1 / 216e5) * 216e5 + 216e5;
  const X = (t: number) => ((t - h0) / (hEnd - h0)) * 100; const ticks: number[] = []; for (let t = h0; t <= hEnd; t += 216e5) ticks.push(t);
  return (
    <div className="otl"><div className="otl__track">
      {ticks.map((t) => <span key={t}><span className="otl__tick" style={{ left: `${X(t)}%` }} /><span className="otl__ticklbl" style={{ left: `${X(t)}%` }}>{fmt.utc(t).replace(' UTC', '')}</span></span>)}
      {detections.map((d, i) => (
        <button key={d.id} className="otl__obs" style={{ left: `${X(tOf(d))}%`, top: -28 + (i % 2) * 52 }} aria-label={`Observation ${i + 1} : ${d.satellite}, ${d.acq_date} ${fmt.hhmm(d.acq_time)} UTC`}>
          {i % 2 === 1 && <span className="otl__stem" />}<ShapeSymbol kind={d.instrument} size={13} /><span className="lbl">{i + 1} · {d.satellite}</span>{i % 2 === 0 && <span className="otl__stem" />}
        </button>
      ))}
    </div></div>
  );
}

export function EventDetailPanel({ event: e, map, demo }: { event: HarmonizedEventDetail; map?: React.ReactNode; demo?: boolean }) {
  const unit = useSettings((s) => s.unit); const a = e.analysis;
  return (
    <div className="stack">
      <div className="page-head"><div><div className="overline">Événement harmonisé</div><h2><span className="mono" style={{ fontWeight: 500 }}>{e.id}</span> {demo && <DemoBadge />}</h2><p>{zoneLabel(e)} · {e.region}</p></div></div>
      <div className="notice notice--sci"><Icon name="info" /><div><strong>Avertissement scientifique</strong>{DISCLAIMERS.event}</div></div>
      <div className="grid g-12">
        <section className="card span-7 span-lap-12"><div className="card__head"><h3 className="card__title">Carte rapprochée</h3></div><div className="card__body"><div style={{ height: 400, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>{map}</div></div></section>
        <div className="span-5 span-lap-12 stack">
          <section className="card"><div className="card__head"><h3 className="card__title">Synthèse</h3><div className="card__sub">{fmt.utc(e.start)} → {fmt.utc(e.end)}</div></div><div className="card__body">
            <div className="row" style={{ gap: 20, flexWrap: 'nowrap' }}><HarmonizationScore score={e.score} size={96} showLabel={false} />
              <dl className="kv" style={{ padding: 0, flex: 1 }}><dt>Position centrale</dt><dd>{fmt.lat(e.center[1])}<br />{fmt.lon(e.center[0])}</dd><dt>Durée estimée</dt><dd>{fmt.d1(e.duration_h)} h</dd><dt>Détections associées</dt><dd>{e.n}</dd><dt>FRP maximale</dt><dd>{fmt.d1(e.frp_max)} MW</dd></dl></div>
            <div className="row" style={{ marginTop: 14 }}><span className="small muted">Capteurs</span>{e.sensors.map((s) => <SensorBadge key={s} sensor={s} />)}</div>
            <div className="row" style={{ marginTop: 8 }}><span className="small muted">Satellites</span>{e.satellites.map((s) => <SatelliteBadge key={s} satellite={s} />)}</div>
          </div></section>
          <section className="card"><div className="card__head"><h3 className="card__title">Décomposition du score d’harmonisation</h3></div><div className="card__body">
            <HarmonizationBreakdown sub={e.sub} params={a.params} hints={{ spatial: `Distance moyenne au centre ${fmt.dist(e.dmean, unit)} · seuil ${fmt.dist(e.dmax, unit)}`, temporel: `Écart médian ${fmt.d1(e.gapMedian)} h · fenêtre ${a.params.dt_max_h} h`, capteurs: `${e.satellites.length} satellite(s) / 4`, confiance: 'MODIS % ÷ 100 ; VIIRS 0,3 / 0,6 / 0,9' }} />
          </div><div className="card__foot">Score = Σ (composante × poids) = <b className="mono">{fmt.d2(e.score)}</b></div></section>
        </div>
        <section className="card span-12"><div className="card__head"><h3 className="card__title">Timeline des observations</h3></div><div className="card__body"><ObservationTimeline detections={e.detections} /></div></section>
        <section className="card span-12"><div className="card__head"><h3 className="card__title">Détections originales</h3></div><div className="card__body">
          <DataTable caption="Détections originales rattachées à l’événement" rows={e.detections} rowKey={(d) => d.id} columns={[
            { key: 'i', label: '#', mono: true, render: (_, i) => i + 1 },
            { key: 'id', label: 'Identifiant', mono: true, render: (d) => <span className="small">{d.id}</span> },
            { key: 't', label: 'Date / heure UTC', mono: true, render: (d) => `${d.acq_date} ${fmt.hhmm(d.acq_time)}`, sortValue: (d) => tOf(d) },
            { key: 'sat', label: 'Satellite', render: (d) => <SatelliteBadge satellite={d.satellite} /> },
            { key: 'lat', label: 'Lat', align: 'right', mono: true, render: (d) => d.latitude.toFixed(4) },
            { key: 'lon', label: 'Lon', align: 'right', mono: true, render: (d) => d.longitude.toFixed(4) },
            { key: 'conf', label: 'Confiance', render: (d) => <ConfidenceBadge detection={d} /> },
            { key: 'frp', label: 'FRP (MW)', align: 'right', mono: true, render: (d) => fmt.d1(d.frp), sortValue: (d) => d.frp },
            { key: 'dc', label: 'Dist. au centre', align: 'right', mono: true, render: (_, i) => fmt.dist(a.dists[i], unit) },
            { key: 'dp', label: 'Dist. obs. préc.', align: 'right', mono: true, render: (d, i) => (i ? fmt.dist(dist(d, e.detections[i - 1]), unit) : '—') },
            { key: 'dt', label: 'Écart temporel', align: 'right', mono: true, render: (_, i) => (i ? `${fmt.d1(a.gaps_h[i - 1])} h` : '—') },
          ]} />
        </div></section>
        <section className="card span-6 span-lap-12"><div className="card__head"><h3 className="card__title">Méthode utilisée</h3></div><div className="card__body small secondary">
          Voisinage ≤ {a.params.dmax_viirs} km (VIIRS) / ≤ {a.params.dmax_modis} km (MODIS), chaînage ≤ {a.params.chain_h} h, composantes connexes, score pondéré. <span className="badge badge--nasa">method_version {e.method_version}</span>
        </div></section>
        <section className="card span-6 span-lap-12"><div className="card__head"><h3 className="card__title">Avertissement scientifique</h3></div><div className="card__body small secondary">Une détection signale une anomalie thermique dans un pixel (feu, brûlage, torchère, surface chaude…). L’absence de détection ne prouve pas l’absence de feu (nuages, fumée, heure de passage).</div></section>
      </div>
    </div>
  );
}
