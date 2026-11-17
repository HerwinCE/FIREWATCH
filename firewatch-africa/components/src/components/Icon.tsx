/* Icônes : lucide-react (trait 1,75 px, grille 24) + silhouette exacte du Gabon (geoBoundaries ADM1). */
import type { SVGProps, ComponentType } from 'react';
import {
  LayoutDashboard, Earth, History, Flame, Crosshair, Columns2, BookOpen, Sparkles, Settings2, SlidersHorizontal,
  RotateCcw, X, Menu, PanelLeftClose, PanelLeftOpen, Download, ChevronDown, TrendingUp, TrendingDown, Equal, Plus, Minus,
  TriangleAlert, Info, WifiOff, Server, Inbox, PinOff, Clock, Send, RefreshCw, Satellite, ArrowRight, Table2, Moon, Sun,
  ChartSpline, Layers, CalendarDays, GitMerge, Radar, Activity, Map as MapIcon, Target, Eye, Check, Link2, Play, Pause, SkipBack, SkipForward, ChevronUp, Image as ImageIcon, FileJson, Minimize2, Maximize2, Siren, BellOff, Bell, LocateFixed, Zap, Mic, MicOff, Volume2,
} from 'lucide-react';

type L = ComponentType<any>;
const M: Record<string, L> = {
  dashboard: LayoutDashboard, globe: Earth, history: History, events: Flame, zones: Crosshair, compare: Columns2,
  book: BookOpen, sparkle: Sparkles, settings: Settings2, filter: SlidersHorizontal, reset: RotateCcw, x: X, menu: Menu,
  panelCollapse: PanelLeftClose, panelExpand: PanelLeftOpen, download: Download, chevronDown: ChevronDown,
  trendUp: TrendingUp, trendDown: TrendingDown, equal: Equal, plus: Plus, minus: Minus, crosshair: Target,
  alert: TriangleAlert, info: Info, wifiOff: WifiOff, server: Server, inbox: Inbox, pinOff: PinOff, clock: Clock,
  send: Send, refresh: RefreshCw, satellite: Satellite, flame: Flame, arrowRight: ArrowRight, table: Table2,
  moon: Moon, sun: Sun, chart: ChartSpline, layers: Layers, calendar: CalendarDays, merge: GitMerge, radar: Radar,
  activity: Activity, map: MapIcon, eye: Eye, check: Check, link: Link2, play: Play, pause: Pause, stepBack: SkipBack, stepForward: SkipForward, chevronUp: ChevronUp, image: ImageIcon, json: FileJson, shrink: Minimize2, expand: Maximize2, siren: Siren, bellOff: BellOff, bell: Bell, locate: LocateFixed, zap: Zap, mic: Mic, micOff: MicOff, volume: Volume2,
};

/** Silhouette du Gabon : union des 9 provinces, projection équirectangulaire corrigée, simplifiée (Douglas-Peucker). */
const GABON = 'M17.11 5.03L17.41 4.50L17.02 3.97L17.20 2.95L17.07 2.88L17.54 2.17L17.52 1.73L12.29 1.56L11.12 1.56L11.08 5.93L7.97 5.95L7.88 7.14L9.78 6.51L9.80 7.14L9.32 8.19L9.36 8.51L11.80 8.46L11.50 8.05L13.96 6.34L13.96 5.89L14.44 5.06L17.11 5.03ZM7.97 5.95L6.59 5.96L6.58 6.18L6.35 6.22L5.77 5.82L5.19 5.94L5.29 7.73L5.13 7.39L4.86 7.29L4.97 7.11L4.32 7.29L4.30 7.58L4.56 7.68L4.89 8.30L5.13 8.19L5.65 8.64L6.33 8.69L5.78 8.98L5.40 8.85L5.19 8.97L4.97 8.78L4.88 9.04L4.76 8.73L4.57 8.74L4.44 8.19L4.30 8.22L4.29 10.36L4.71 11.04L5.08 11.26L5.19 10.73L6.07 10.57L6.30 10.36L6.70 10.73L8.16 9.75L8.43 9.24L8.76 9.06L8.81 8.61L9.36 8.51L9.32 8.19L9.80 7.14L9.78 6.51L7.88 7.14L7.97 5.95ZM9.36 8.51L8.81 8.61L8.76 9.06L8.43 9.24L8.42 9.46L7.08 10.54L6.59 10.75L6.59 10.49L6.23 10.36L6.07 10.57L5.17 10.74L5.43 12.19L6.43 12.53L6.30 13.31L6.54 13.50L6.91 13.53L7.07 13.34L7.90 13.17L8.33 12.42L8.35 12.04L8.65 11.85L8.81 11.42L9.24 11.50L10.53 11.22L11.16 11.69L11.79 11.74L10.87 9.58L10.99 9.16L11.81 8.77L11.87 8.47L9.36 8.51ZM17.57 9.01L17.04 8.83L16.96 8.50L16.46 8.29L16.16 8.45L15.75 8.18L15.26 8.25L14.77 10.67L11.77 11.78L11.63 12.07L11.80 13.02L12.52 12.87L12.75 13.42L13.35 13.82L13.45 14.84L14.12 15.39L14.90 15.54L15.08 15.64L15.36 15.31L15.87 15.50L16.37 14.12L17.24 13.45L17.20 12.93L17.50 13.04L17.67 12.91L18.56 11.69L17.31 9.52L17.57 9.01ZM15.87 15.50L16.16 15.68L16.81 17.03L18.33 17.33L19.27 16.22L19.81 17.06L19.67 17.45L20.39 17.56L20.54 17.18L20.87 17.04L20.55 16.67L20.86 16.30L20.86 15.71L21.46 15.51L21.52 14.87L21.37 14.66L21.64 13.88L21.37 12.50L21.70 11.18L21.44 10.89L20.67 10.79L20.46 10.21L19.68 10.15L19.45 9.85L19.59 9.44L19.13 9.19L17.57 9.01L17.31 9.52L18.56 11.69L17.67 12.91L17.50 13.04L17.20 12.93L17.24 13.45L16.37 14.12L15.87 15.50ZM6.82 13.55L6.85 13.77L6.51 14.16L6.54 14.70L6.21 15.05L6.57 15.52L8.18 15.92L8.19 16.30L8.70 17.06L10.20 16.86L11.82 18.71L12.03 18.05L11.74 17.17L12.15 17.07L12.56 17.40L13.36 17.12L13.73 17.36L14.53 17.16L14.96 16.84L14.80 15.47L14.12 15.39L13.45 14.84L13.35 13.82L12.75 13.42L12.52 12.87L11.80 13.02L11.61 12.38L11.77 11.78L11.16 11.69L10.53 11.22L9.24 11.50L8.81 11.42L8.65 11.85L8.35 12.04L8.33 12.42L7.90 13.17L7.26 13.21L6.82 13.55ZM4.29 10.36L3.59 11.77L3.25 11.48L3.11 11.91L2.93 11.75L2.78 12.13L2.50 11.59L2.31 11.40L2.29 11.53L3.25 13.17L3.35 13.74L4.12 14.76L4.20 15.58L5.29 16.78L5.31 17.21L6.74 18.56L7.82 18.24L8.15 17.38L8.71 17.06L8.19 16.30L8.18 15.92L6.57 15.52L6.23 15.13L6.54 14.70L6.54 14.07L6.85 13.77L6.82 13.55L6.30 13.31L6.43 12.53L5.43 12.19L5.18 11.27L4.71 11.04L4.29 10.36ZM8.71 17.06L8.15 17.38L7.82 18.24L6.74 18.56L8.88 20.43L8.87 20.81L10.00 21.71L10.12 22.15L10.55 22.50L10.83 21.64L11.61 21.02L11.96 21.05L12.31 21.52L12.97 21.65L13.10 21.48L12.89 21.23L13.32 20.43L12.39 19.96L12.42 19.57L12.68 19.32L12.23 18.81L11.86 18.95L11.82 18.71L10.20 16.86L8.71 17.06ZM11.80 8.46L11.81 8.77L10.99 9.16L10.87 9.58L11.77 11.78L14.77 10.67L15.26 8.25L15.75 8.18L16.16 8.45L16.46 8.29L16.96 8.50L17.22 8.93L18.95 9.10L19.55 9.43L19.75 9.10L19.60 8.34L20.22 7.64L20.13 7.29L20.86 7.26L21.54 6.20L21.02 5.54L20.90 4.80L19.65 4.43L19.32 4.44L19.22 4.71L18.69 4.76L18.56 5.00L17.89 4.95L17.61 5.18L17.19 5.19L17.14 5.03L14.44 5.06L13.96 5.89L13.96 6.34L11.50 8.05L11.80 8.46Z';

export type IconName = keyof typeof M | 'gabon' | string;
export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  if (name === 'gabon') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
        <path d={GABON} fill="currentColor" stroke="currentColor" strokeWidth={0.6} strokeLinejoin="round" />
      </svg>
    );
  }
  const C = M[name] ?? Info;
  return <C size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" {...rest} />;
}

/** Symbole de forme : la forme double toujours la couleur (accessibilité daltonisme). */
export function ShapeSymbol({ kind, size = 12, fill }: { kind: 'MODIS' | 'VIIRS' | 'EVENT'; size?: number; fill?: string }) {
  const h = size / 2;
  const color = fill ?? (kind === 'MODIS' ? 'var(--fw-color-sensor-modis)' : kind === 'VIIRS' ? 'var(--fw-color-sensor-viirs)' : 'var(--fw-color-sensor-fused)');
  return (
    <svg className="sym" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {kind === 'MODIS' && <rect x={1} y={1} width={size - 2} height={size - 2} rx={1.5} fill={color} />}
      {kind === 'VIIRS' && <circle cx={h} cy={h} r={h - 1} fill={color} />}
      {kind === 'EVENT' && <path d={`M${h} .5L${size - 0.5} ${h}L${h} ${size - 0.5}L.5 ${h}Z`} fill={color} />}
    </svg>
  );
}
