/* FireMap — carte MapLibre GL : clustering natif, couches détections / événements / hotspots,
   vues prédéfinies, contrôles clavier, état vide superposé, alternative textuelle. */
import maplibregl, { type Map as MLMap, type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BBox, Detection, HarmonizedEvent, Hotspot } from '../api/types';
import { detectionSource, detectionsToGeoJSON, eventsToGeoJSON, hotspotsToGeoJSON, LAYERS } from './layers';
import { MapLegend } from './MapLegend';
import { EmptyState } from '../feedback/States';
import { Icon } from '../components/Icon';
import { useSettings } from '../state/settings';

export const VIEWS: Record<'world' | 'africa' | 'gabon', BBox> = { world: [-170, -58, 180, 80], africa: [-20, -36, 53, 38], gabon: [8.5, -4.1, 14.6, 2.4] };

export interface FireMapProps {
  detections: Detection[]; events?: HarmonizedEvent[]; hotspots?: Hotspot[];
  initialView?: keyof typeof VIEWS | BBox; recentSince: number; styleUrl?: string | StyleSpecification;
  onSelectDetection?: (id: string) => void; onSelectEvent?: (id: string) => void; onLocate?: () => void;
  emptyKind?: 'emptymap' | 'noresult' | 'empty' | null; controls?: boolean; viewButtons?: boolean; legend?: boolean; topLeft?: ReactNode; children?: ReactNode;
  adminBoundaries?: GeoJSON.FeatureCollection; // ex. Gabon niveau 1 (OCHA COD-AB / GADM)
}

/** Fond sombre recommandé : style vectoriel auto-hébergé (Protomaps / OpenMapTiles) teinté avec les tokens map.*. */
export const DEFAULT_STYLE = '/map/firewatch-dark.json';

export function FireMap(p: FireMapProps) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<MLMap | null>(null); const [ready, setReady] = useState(false);
  const { cluster, reduceMotion } = useSettings();
  const [view, setView] = useState(typeof p.initialView === 'string' ? p.initialView : undefined);

  useEffect(() => {
    if (!el.current) return;
    const bbox = typeof p.initialView === 'string' || !p.initialView ? VIEWS[(p.initialView as keyof typeof VIEWS) ?? 'world'] : p.initialView;
    const m = new maplibregl.Map({ container: el.current, style: p.styleUrl ?? DEFAULT_STYLE, bounds: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]], attributionControl: { compact: true }, keyboard: true, dragRotate: false, pitchWithRotate: false });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.ScaleControl({ unit: useSettings.getState().unit === 'mi' ? 'imperial' : 'metric' }), 'bottom-left');
    m.on('load', () => {
      addShapeIcons(m);
      m.addSource('detections', detectionSource(detectionsToGeoJSON([], 0), cluster) as maplibregl.SourceSpecification);
      m.addSource('events', { type: 'geojson', data: eventsToGeoJSON([]) });
      m.addSource('hotspots', { type: 'geojson', data: hotspotsToGeoJSON([]) });
      if (p.adminBoundaries) { m.addSource('admin', { type: 'geojson', data: p.adminBoundaries }); m.addLayer({ id: 'admin-line', type: 'line', source: 'admin', paint: { 'line-color': '#3B5068', 'line-dasharray': [4, 3] } }); }
      [LAYERS.hotspotFill, LAYERS.hotspotLine, LAYERS.clusterHalo, LAYERS.cluster, LAYERS.clusterCount, LAYERS.recent, LAYERS.viirs, LAYERS.modis, LAYERS.events].forEach((l) => m.addLayer(l as unknown as maplibregl.LayerSpecification));
      // Interactions
      m.on('click', 'cluster', async (e) => { const f = e.features?.[0]; if (!f) return; const z = await (m.getSource('detections') as maplibregl.GeoJSONSource).getClusterExpansionZoom(f.properties!.cluster_id); m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }); });
      ['det-viirs', 'det-modis'].forEach((id) => m.on('click', id, (e) => { const f = e.features?.[0]; if (f) p.onSelectDetection?.(String(f.properties!.id)); }));
      m.on('click', 'events', (e) => { const f = e.features?.[0]; if (f) p.onSelectEvent?.(String(f.properties!.id)); });
      ['cluster', 'det-viirs', 'det-modis', 'events'].forEach((id) => { m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer')); m.on('mouseleave', id, () => (m.getCanvas().style.cursor = '')); });
      setReady(true);
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mise à jour des données sans recréer la carte
  useEffect(() => {
    const m = map.current; if (!ready || !m) return;
    (m.getSource('detections') as maplibregl.GeoJSONSource).setData(detectionsToGeoJSON(p.detections, p.recentSince));
    (m.getSource('events') as maplibregl.GeoJSONSource).setData(eventsToGeoJSON(p.events ?? []));
    (m.getSource('hotspots') as maplibregl.GeoJSONSource).setData(hotspotsToGeoJSON(p.hotspots ?? []));
  }, [ready, p.detections, p.events, p.hotspots, p.recentSince]);

  // Pulsation discrète des détections récentes
  useEffect(() => {
    const m = map.current; if (!ready || !m || reduceMotion) return; let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const ph = ((t - t0) % 2400) / 2400; m.setPaintProperty('det-recent', 'circle-radius', 4 + ph * 10); m.setPaintProperty('det-recent', 'circle-stroke-opacity', 0.9 * (1 - ph)); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [ready, reduceMotion]);

  const fly = (v: keyof typeof VIEWS) => { const b = VIEWS[v]; setView(v); map.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { duration: reduceMotion ? 0 : 600, padding: 24 }); };

  return (
    <div className="map" role="region" aria-label="Carte des détections thermiques">
      <div ref={el} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />
      {p.controls !== false && <div className="map__ctrl map__ctrl--tr"><div className="map__btngroup">
        <button aria-label="Zoom avant" onClick={() => map.current?.zoomIn()}><Icon name="plus" /></button>
        <button aria-label="Zoom arrière" onClick={() => map.current?.zoomOut()}><Icon name="minus" /></button>
        <button aria-label="Centrer sur ma position" onClick={p.onLocate}><Icon name="crosshair" /></button>
      </div></div>}
      <div className="map__ctrl map__ctrl--tl">
        {p.viewButtons !== false && <div className="map__views" role="group" aria-label="Vues prédéfinies">{(['world', 'africa', 'gabon'] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => fly(v)}>{{ world: 'Monde', africa: 'Afrique', gabon: 'Gabon' }[v]}</button>)}</div>}
        {p.topLeft}
      </div>
      {p.legend !== false && <div className="map__ctrl map__ctrl--br"><MapLegend /></div>}
      {p.emptyKind && <div className="map__empty"><EmptyState kind={p.emptyKind} actions={p.emptyKind === 'emptymap' ? <button className="btn btn--sm" onClick={() => fly('world')}>Vue mondiale</button> : undefined} /></div>}
      {p.children}
    </div>
  );
}

/** Icônes SDF (carré MODIS, losange événement) générées en canvas — teintables via icon-color. */
function addShapeIcons(m: MLMap) {
  const make = (draw: (c: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d')!; x.fillStyle = '#fff'; draw(x); return x.getImageData(0, 0, 24, 24); };
  m.addImage('fw-square', make((x) => x.fillRect(4, 4, 16, 16)), { sdf: true });
  m.addImage('fw-diamond', make((x) => { x.beginPath(); x.moveTo(12, 1); x.lineTo(23, 12); x.lineTo(12, 23); x.lineTo(1, 12); x.closePath(); x.fill(); }), { sdf: true });
}
