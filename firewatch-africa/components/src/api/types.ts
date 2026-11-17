/* Types du contrat API FireWatch Africa (miroir des réponses de l'API). */
export type Sensor = 'MODIS' | 'VIIRS';
export type SatelliteId = 'Terra' | 'Aqua' | 'Suomi-NPP' | 'NOAA-20' | 'NOAA-21';
export type ConfidenceClass = 'low' | 'nominal' | 'high';
export type Level = 'low' | 'moderate' | 'high';
export type Granularity = 'day' | 'week' | 'month';
/** [minLon, minLat, maxLon, maxLat] */
export type BBox = [number, number, number, number];

/** Filtres du contrat API (tous optionnels). */
export interface ApiFilters {
  start_date?: string; // YYYY-MM-DD (UTC)
  end_date?: string;
  sensor?: Sensor | Sensor[];
  satellite?: SatelliteId | SatelliteId[];
  bbox?: BBox;
  limit?: number;
  offset?: number;
  method_version?: string;
}
/** Extensions proposées (non présentes dans le contrat initial — voir REACT-INTEGRATION.md). */
export interface ApiFilterExtensions {
  granularity?: Granularity; // /statistics/timeline
  cell?: number; // /analytics/hotspots (degrés)
  min_count?: number;
}

export interface Detection {
  id: string;
  latitude: number;
  longitude: number;
  acq_date: string; // YYYY-MM-DD
  acq_time: string; // HHMM UTC
  satellite: SatelliteId;
  instrument: Sensor;
  /** MODIS : 0–100 ; VIIRS : 'l' | 'n' | 'h' */
  confidence: number | 'l' | 'n' | 'h';
  conf_class: ConfidenceClass;
  frp: number; // MW
  brightness: number; // K (MODIS brightness / VIIRS bright_ti4)
  scan: number;
  track: number;
  daynight: 'D' | 'N';
  version: string; // ex. 6.1NRT, 2.0NRT
  product: string;
  event_id: string | null;
  province?: string | null;
}

export interface HarmonizationSubscores { spatial: number; temporel: number; capteurs: number; confiance: number }

export interface HarmonizedEvent {
  id: string;
  zone: string;
  region: string;
  province: string | null;
  center: [number, number]; // [lon, lat]
  start: number; // epoch ms UTC
  end: number;
  duration_h: number;
  n: number;
  sensors: Sensor[];
  satellites: SatelliteId[];
  frp_max: number;
  frp_sum: number;
  score: number; // 0–1
  sub: HarmonizationSubscores;
  dmean: number; // km
  dmax: number; // km
  gapMedian: number; // h
  method_version: string;
  detection_ids: string[];
}
export interface HarmonizationParams { dmax_viirs: number; dmax_modis: number; dt_max_h: number; chain_h: number; w: Record<keyof HarmonizationSubscores, number> }
export interface HarmonizedEventDetail extends HarmonizedEvent {
  detections: Detection[];
  analysis: { dists: number[]; gaps_h: number[]; params: HarmonizationParams };
}

export interface Paginated<T> { total: number; limit: number; offset: number; items: T[] }

export interface Health { status: 'ok' | 'degraded' | 'down'; version: string; uptime_s: number; checks: Record<string, string> }
export interface Metadata {
  dataset: string;
  last_update: string; // ISO
  coverage: { start: string; end: string };
  sensors: Sensor[];
  satellites: { id: SatelliteId; sensor: Sensor; product: string; resolution_m: number }[];
  method_versions: string[];
  harmonization: HarmonizationParams;
}
export interface SummaryStats { total: number; modis: number; viirs: number; events: number; active_zones: number; frp_mean: number; frp_max: number; day: number; night: number; last_update: string }
export interface TimelineBucket { date: string; total: number; modis: number; viirs: number; frp_sum: number; frp_max: number; events: number; by_satellite: Record<SatelliteId, number> }
export interface Timeline { granularity: Granularity; series: TimelineBucket[] }
export interface SatelliteStats { satellite: SatelliteId; sensor: Sensor; product: string; resolution_m: number; count: number; frp_mean: number; frp_max: number; first: string | null; last: string | null; day: number; night: number }
export interface Hotspot {
  id: string; name: string; region: string; cell_label: string; center: [number, number]; bbox: BBox;
  count: number; modis: number; viirs: number; active_days: number; frp_sum: number; frp_max: number;
  previous: number; variation: number | null; score: number; level: Level; province: string | null;
}

/** Métadonnées d'enveloppe : données partielles, cache hors ligne, jeu de démonstration. */
export interface ResponseMeta { dataset?: string; method_version?: string; partial?: { missing: SatelliteId[]; reason: string }; stale?: { cached_at: string } }
export interface ApiEnvelope<T> { data: T; meta: ResponseMeta }
