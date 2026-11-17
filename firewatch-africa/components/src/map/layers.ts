/* DetectionMarker / EventMarker / Hotspot : définitions de couches MapLibre.
   Encodage : forme = capteur (rond VIIRS, carré MODIS, losange événement),
   couleur = classe de FRP (rouge réservé à ≥ 100 MW), anneau pulsé = < 24 h. */
import type { Detection, HarmonizedEvent, Hotspot } from '../api/types';

export const FRP_CLASSES = [
  { max: 15, color: '#FFB067', label: 'FRP < 15 MW' },
  { max: 100, color: '#F28C28', label: 'FRP 15–100 MW' },
  { max: Infinity, color: '#F0585D', label: 'FRP ≥ 100 MW (élevé)' },
] as const;

export function detectionsToGeoJSON(items: Detection[], recentSince: number): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: items.map((d) => ({
      type: 'Feature', id: d.id,
      geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] },
      properties: { id: d.id, sensor: d.instrument, frp: d.frp, conf: d.conf_class, recent: Date.parse(`${d.acq_date}T${d.acq_time.slice(0, 2)}:${d.acq_time.slice(2)}:00Z`) >= recentSince ? 1 : 0, event: d.event_id ?? '' },
    })),
  };
}
export const eventsToGeoJSON = (items: HarmonizedEvent[]): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: 'FeatureCollection', features: items.map((e) => ({ type: 'Feature', id: e.id, geometry: { type: 'Point', coordinates: e.center }, properties: { id: e.id, score: e.score, n: e.n } })),
});
export const hotspotsToGeoJSON = (items: Hotspot[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> => ({
  type: 'FeatureCollection', features: items.map((h) => { const [a, b, c, d] = h.bbox; return { type: 'Feature', id: h.id, geometry: { type: 'Polygon', coordinates: [[[a, b], [c, b], [c, d], [a, d], [a, b]]] }, properties: { id: h.id, level: h.level, score: h.score, name: h.name } }; }),
});

const frpColor = ['step', ['get', 'frp'], FRP_CLASSES[0].color, 15, FRP_CLASSES[1].color, 100, FRP_CLASSES[2].color];

/** Source « detections » avec clustering natif MapLibre (regroupement par niveau de zoom). */
export const detectionSource = (data: GeoJSON.FeatureCollection, cluster: boolean) => ({
  type: 'geojson' as const, data, cluster, clusterRadius: 46, clusterMaxZoom: 8,
  clusterProperties: { frp_max: ['max', ['get', 'frp']], high: ['+', ['case', ['>=', ['get', 'frp'], 100], 1, 0]] },
});

export const LAYERS = {
  clusterHalo: { id: 'cluster-halo', type: 'circle', source: 'detections', filter: ['has', 'point_count'], paint: { 'circle-color': 'rgba(242,140,40,0.16)', 'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 14, 100, 24, 2000, 34] } },
  cluster: { id: 'cluster', type: 'circle', source: 'detections', filter: ['has', 'point_count'], paint: { 'circle-color': '#2B1A0D', 'circle-stroke-width': 1.4, 'circle-stroke-color': ['case', ['all', ['>=', ['get', 'high'], 3], ['>=', ['/', ['get', 'high'], ['get', 'point_count']], 0.08]], '#F0585D', '#F28C28'], 'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 9, 100, 16, 2000, 23] } },
  clusterCount: { id: 'cluster-count', type: 'symbol', source: 'detections', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#ECE7DE' } },
  // DetectionMarker — VIIRS (rond)
  viirs: { id: 'det-viirs', type: 'circle', source: 'detections', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'sensor'], 'VIIRS']], paint: { 'circle-color': frpColor, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.5, 10, 5], 'circle-stroke-color': '#070B10', 'circle-stroke-width': 1 } },
  // DetectionMarker — MODIS (carré : icône SDF « square » ajoutée au style, teintée par FRP)
  modis: { id: 'det-modis', type: 'symbol', source: 'detections', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'sensor'], 'MODIS']], layout: { 'icon-image': 'fw-square', 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.45, 10, 0.9], 'icon-allow-overlap': true }, paint: { 'icon-color': frpColor, 'icon-halo-color': '#070B10', 'icon-halo-width': 1 } },
  // Pulsation des détections < 24 h (rayon animé côté JS via setPaintProperty, désactivé si reduceMotion)
  recent: { id: 'det-recent', type: 'circle', source: 'detections', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'recent'], 1]], paint: { 'circle-color': 'transparent', 'circle-stroke-color': '#FFB067', 'circle-stroke-width': 1.4, 'circle-radius': 6, 'circle-stroke-opacity': 0.8 } },
  // EventMarker — losange violet
  events: { id: 'events', type: 'symbol', source: 'events', layout: { 'icon-image': 'fw-diamond', 'icon-size': 0.8, 'icon-allow-overlap': true }, paint: { 'icon-color': '#B39DFA', 'icon-halo-color': '#070B10', 'icon-halo-width': 1 } },
  hotspotFill: { id: 'hotspots-fill', type: 'fill', source: 'hotspots', paint: { 'fill-color': ['match', ['get', 'level'], 'high', 'rgba(240,88,93,0.12)', 'rgba(242,140,40,0.13)'] } },
  hotspotLine: { id: 'hotspots-line', type: 'line', source: 'hotspots', paint: { 'line-color': ['match', ['get', 'level'], 'high', 'rgba(240,88,93,0.7)', 'rgba(242,140,40,0.55)'], 'line-dasharray': [3, 2], 'line-width': 1 } },
} as const;
