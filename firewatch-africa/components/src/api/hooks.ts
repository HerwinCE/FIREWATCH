/* Hooks TanStack Query — clés de cache dérivées des filtres, annulation automatique. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { ApiFilterExtensions, ApiFilters } from './types';

type F = ApiFilters & ApiFilterExtensions;
const STALE = { meta: 5 * 60_000, data: 2 * 60_000 };

export const qk = {
  health: ['health'] as const,
  metadata: ['metadata'] as const,
  detections: (f: F) => ['detections', f] as const,
  detection: (id: string) => ['detection', id] as const,
  events: (f: F) => ['events', f] as const,
  event: (id: string) => ['event', id] as const,
  summary: (f: F) => ['summary', f] as const,
  timeline: (f: F) => ['timeline', f] as const,
  satellites: (f: F) => ['satellites', f] as const,
  hotspots: (f: F) => ['hotspots', f] as const,
};

export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: ({ signal }) => api.health(signal), refetchInterval: 60_000, staleTime: 30_000 });
export const useMetadata = () => useQuery({ queryKey: qk.metadata, queryFn: ({ signal }) => api.metadata(signal), staleTime: STALE.meta });
export const useDetections = (f: F, enabled = true) => useQuery({ queryKey: qk.detections(f), queryFn: ({ signal }) => api.detections(f, signal), placeholderData: keepPreviousData, staleTime: STALE.data, enabled });
export const useDetection = (id?: string) => useQuery({ queryKey: qk.detection(id ?? ''), queryFn: ({ signal }) => api.detection(id!, signal), enabled: !!id });
export const useEvents = (f: F) => useQuery({ queryKey: qk.events(f), queryFn: ({ signal }) => api.events(f, signal), placeholderData: keepPreviousData, staleTime: STALE.data });
export const useEvent = (id?: string) => useQuery({ queryKey: qk.event(id ?? ''), queryFn: ({ signal }) => api.event(id!, signal), enabled: !!id });
export const useSummary = (f: F) => useQuery({ queryKey: qk.summary(f), queryFn: ({ signal }) => api.summary(f, signal), placeholderData: keepPreviousData, staleTime: STALE.data });
export const useTimeline = (f: F) => useQuery({ queryKey: qk.timeline(f), queryFn: ({ signal }) => api.timeline(f, signal), placeholderData: keepPreviousData, staleTime: STALE.data });
export const useSatelliteStats = (f: F) => useQuery({ queryKey: qk.satellites(f), queryFn: ({ signal }) => api.satellites(f, signal), staleTime: STALE.data });
export const useHotspots = (f: F) => useQuery({ queryKey: qk.hotspots(f), queryFn: ({ signal }) => api.hotspots(f, signal), placeholderData: keepPreviousData, staleTime: STALE.data });
