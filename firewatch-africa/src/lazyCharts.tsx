/* Graphiques chargés à la demande : Recharts (≈ 350 Ko) n'est téléchargé que sur les pages qui en affichent. */
import {lazy, Suspense, type ComponentProps} from 'react';
import type * as Charts from './charts';

const L = {
 Trend: lazy(() => import('./charts').then(m => ({default: m.TrendChart}))),
 Satellite: lazy(() => import('./charts').then(m => ({default: m.SatelliteChart}))),
 Median: lazy(() => import('./charts').then(m => ({default: m.MedianCurve}))),
};
const Wait = ({h = 240}: {h?: number}) => <div className="chart-wait" style={{height: h}} role="status" aria-label="Chargement du graphique"/>;

export const TrendChart = (p: ComponentProps<typeof Charts.TrendChart>) => <Suspense fallback={<Wait h={p.height}/>}><L.Trend {...p}/></Suspense>;
export const SatelliteChart = (p: ComponentProps<typeof Charts.SatelliteChart>) => <Suspense fallback={<Wait h={p.height ?? 200}/>}><L.Satellite {...p}/></Suspense>;
export const MedianCurve = (p: ComponentProps<typeof Charts.MedianCurve>) => <Suspense fallback={<Wait h={p.height}/>}><L.Median {...p}/></Suspense>;
