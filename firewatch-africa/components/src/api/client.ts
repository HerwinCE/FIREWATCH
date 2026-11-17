/* Client HTTP typé — un seul point d'entrée pour les 10 endpoints du contrat. */
import type {
  ApiEnvelope, ApiFilters, ApiFilterExtensions, Detection, Health, HarmonizedEvent, HarmonizedEventDetail,
  Hotspot, Metadata, Paginated, SatelliteStats, SummaryStats, Timeline,
} from './types';

export class ApiError extends Error {
  constructor(public status: number, public path: string, message: string, public code?: string) { super(message); }
  get isOffline() { return this.status === 0; }
}

const BASE = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';

export function toQuery(params: Record<string, unknown> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function get<T>(path: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<ApiEnvelope<T>> {
  const url = `${BASE}${path}${toQuery(params)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, path, 'Connexion impossible. Vérifiez votre réseau.', 'OFFLINE');
  }
  if (!res.ok) {
    let body: { message?: string; code?: string } = {};
    try { body = await res.json(); } catch { /* corps non JSON */ }
    throw new ApiError(res.status, path, body.message ?? `Erreur ${res.status}`, body.code);
  }
  const json = await res.json();
  // L'API peut renvoyer soit { data, meta }, soit la ressource brute : on normalise.
  return json && typeof json === 'object' && 'data' in json ? json : { data: json as T, meta: {} };
}

type F = ApiFilters & ApiFilterExtensions;
export const api = {
  health: (s?: AbortSignal) => get<Health>('/api/health', undefined, s),
  metadata: (s?: AbortSignal) => get<Metadata>('/api/metadata', undefined, s),
  detections: (f: F, s?: AbortSignal) => get<Paginated<Detection>>('/api/detections', f as Record<string, unknown>, s),
  detection: (id: string, s?: AbortSignal) => get<Detection>(`/api/detections/${encodeURIComponent(id)}`, undefined, s),
  events: (f: F, s?: AbortSignal) => get<Paginated<HarmonizedEvent>>('/api/events', f as Record<string, unknown>, s),
  event: (id: string, s?: AbortSignal) => get<HarmonizedEventDetail>(`/api/events/${encodeURIComponent(id)}`, undefined, s),
  summary: (f: F, s?: AbortSignal) => get<SummaryStats>('/api/statistics/summary', f as Record<string, unknown>, s),
  timeline: (f: F, s?: AbortSignal) => get<Timeline>('/api/statistics/timeline', f as Record<string, unknown>, s),
  satellites: (f: F, s?: AbortSignal) => get<SatelliteStats[]>('/api/statistics/satellites', f as Record<string, unknown>, s),
  hotspots: (f: F, s?: AbortSignal) => get<Hotspot[]>('/api/analytics/hotspots', f as Record<string, unknown>, s),
};
export type Api = typeof api;
