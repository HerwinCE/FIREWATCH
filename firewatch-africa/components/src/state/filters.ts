/* État global des filtres (zustand) + synchronisation avec l'URL et conversion vers les paramètres API. */
import { create } from 'zustand';
import type { ApiFilters, BBox, ConfidenceClass, SatelliteId, Sensor } from '../api/types';

export type RangePreset = '24h' | '7d' | '30d' | '90d' | 'custom';
export const ALL_SATELLITES: SatelliteId[] = ['Terra', 'Aqua', 'Suomi-NPP', 'NOAA-20', 'NOAA-21'];
export const REGIONS: Record<string, { label: string; bbox: BBox }> = {
  world: { label: 'Monde', bbox: [-180, -60, 180, 84] },
  africa: { label: 'Afrique', bbox: [-20, -36, 53, 38] },
  west: { label: 'Afrique de l’Ouest', bbox: [-18, 4, 16, 25] },
  central: { label: 'Afrique centrale', bbox: [8, -6, 31, 12] },
  east: { label: 'Afrique de l’Est', bbox: [28, -12, 52, 18] },
  south: { label: 'Afrique australe', bbox: [10, -35, 52, -8] },
  gabon: { label: 'Gabon', bbox: [8.5, -4.1, 14.6, 2.4] },
};

export interface FiltersState {
  range: RangePreset;
  start: string | null;
  end: string | null;
  sensors: Sensor[];
  satellites: SatelliteId[];
  confidence: ConfidenceClass[]; // filtre client
  daynight: 'all' | 'D' | 'N'; // filtre client
  eventsOnly: boolean; // filtre client
  showHotspots: boolean;
  region: keyof typeof REGIONS;
  set: (patch: Partial<Omit<FiltersState, 'set' | 'reset' | 'toggle'>>) => void;
  toggle: (key: 'sensors' | 'satellites' | 'confidence', value: string) => void;
  reset: () => void;
}
const DEFAULTS = { range: '30d' as RangePreset, start: null, end: null, sensors: ['MODIS', 'VIIRS'] as Sensor[], satellites: [...ALL_SATELLITES], confidence: ['low', 'nominal', 'high'] as ConfidenceClass[], daynight: 'all' as const, eventsOnly: false, showHotspots: true, region: 'world' as const };

export const useFilters = create<FiltersState>((set) => ({
  ...DEFAULTS,
  set: (patch) => set(patch),
  toggle: (key, value) => set((s) => { const arr = s[key] as string[]; return { [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] } as Partial<FiltersState>; }),
  reset: () => set(DEFAULTS),
}));

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Convertit l'état UI en paramètres du contrat API. `today` = date de dernière mise à jour (metadata). */
export function toApiFilters(s: Pick<FiltersState, 'range' | 'start' | 'end' | 'sensors' | 'satellites' | 'region'>, today: string, extra: Partial<ApiFilters> = {}): ApiFilters {
  const days = { '24h': 2, '7d': 7, '30d': 30, '90d': 90, custom: 0 }[s.range];
  const end = s.range === 'custom' && s.end ? s.end : today;
  const start = s.range === 'custom' && s.start ? s.start : iso(Date.parse(today) - (days - 1) * 86_400_000);
  const f: ApiFilters = { start_date: start, end_date: end, ...extra };
  if (s.sensors.length === 1) f.sensor = s.sensors[0];
  if (s.satellites.length < ALL_SATELLITES.length) f.satellite = s.satellites;
  if (s.region !== 'world' && !extra.bbox) f.bbox = REGIONS[s.region].bbox;
  return f;
}
export const activeFilterCount = (s: FiltersState) => Number(s.sensors.length < 2) + Number(s.satellites.length < ALL_SATELLITES.length) + Number(s.confidence.length < 3) + Number(s.eventsOnly) + Number(s.daynight !== 'all') + Number(s.range !== '30d');

/** Synchronisation URL ↔ filtres (à appeler une fois dans AppShell). */
export function syncFiltersWithUrl() {
  const p = new URLSearchParams(location.search);
  const patch: Partial<FiltersState> = {};
  if (p.get('range')) patch.range = p.get('range') as RangePreset;
  if (p.get('start')) patch.start = p.get('start');
  if (p.get('end')) patch.end = p.get('end');
  if (p.get('sensor')) patch.sensors = p.get('sensor')!.split(',') as Sensor[];
  if (p.get('satellite')) patch.satellites = p.get('satellite')!.split(',') as SatelliteId[];
  useFilters.getState().set(patch);
  return useFilters.subscribe((s) => {
    const q = new URLSearchParams();
    if (s.range !== '30d') q.set('range', s.range);
    if (s.range === 'custom' && s.start && s.end) { q.set('start', s.start); q.set('end', s.end); }
    if (s.sensors.length < 2) q.set('sensor', s.sensors.join(','));
    if (s.satellites.length < ALL_SATELLITES.length) q.set('satellite', s.satellites.join(','));
    history.replaceState(null, '', `${location.pathname}${q.toString() ? '?' + q : ''}${location.hash}`);
  });
}
