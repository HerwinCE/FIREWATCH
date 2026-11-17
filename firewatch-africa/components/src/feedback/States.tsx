/* EmptyState · LoadingState · ErrorState · DataState (orchestrateur des états obligatoires) */
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';

export type EmptyKind = 'empty' | 'noresult' | 'offline' | 'geoloc' | 'emptymap';
const COPY: Record<EmptyKind, { icon: string; title: string; text: string }> = {
  empty: { icon: 'inbox', title: 'Aucune donnée disponible', text: 'Aucune détection thermique n’a été enregistrée pour cette période et cette zone. Essayez une période plus longue.' },
  noresult: { icon: 'filter', title: 'Aucun résultat pour ces filtres', text: 'Les filtres actifs excluent toutes les détections. Élargissez la période, réactivez un capteur ou abaissez le niveau de confiance.' },
  offline: { icon: 'wifiOff', title: 'Vous êtes hors connexion', text: 'Les données affichées proviennent du cache local. Elles seront actualisées dès le retour de la connexion.' },
  geoloc: { icon: 'pinOff', title: 'Position indisponible', text: 'Votre position n’a pas pu être déterminée (autorisation refusée ou signal insuffisant). La vue Afrique est utilisée par défaut.' },
  emptymap: { icon: 'globe', title: 'Aucune détection dans cette vue', text: 'La zone visible ne contient aucune détection pour les filtres actuels. Dézoomez ou revenez à la vue mondiale.' },
};

export function EmptyState({ kind = 'empty', actions, title, text }: { kind?: EmptyKind; actions?: ReactNode; title?: string; text?: string }) {
  const c = COPY[kind];
  return (
    <div className={`state state--${kind === 'noresult' ? 'filter' : kind}`} role="status">
      <div className="state__ico"><Icon name={c.icon} size={24} /></div>
      <h3>{title ?? c.title}</h3><p>{text ?? c.text}</p>
      {actions && <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>{actions}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  if (e?.isOffline) return <EmptyState kind="offline" actions={onRetry && <button className="btn btn--sm" onClick={onRetry}><Icon name="refresh" />Réessayer</button>} />;
  return (
    <div className="state state--error" role="alert">
      <div className="state__ico"><Icon name="server" size={24} /></div>
      <h3>Les données n’ont pas pu être chargées</h3>
      <p>{(error as Error)?.message ?? 'Erreur inconnue.'} Vos filtres sont conservés ; réessayez dans quelques instants.</p>
      {e && <code>{e.status} · {e.code ?? ''} · GET {e.path}</code>}
      {onRetry && <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}><button className="btn btn--sm" onClick={onRetry}><Icon name="refresh" />Réessayer</button></div>}
    </div>
  );
}

export function LoadingState({ variant = 'block', height = 220, label = 'Chargement…' }: { variant?: 'block' | 'stats' | 'chart' | 'list' | 'map'; height?: number; label?: string }) {
  if (variant === 'stats') return <div className="stats" aria-busy="true" aria-label={label}>{Array.from({ length: 6 }, (_, i) => <div key={i} className="card stat"><div className="skel" style={{ height: 12, width: '60%' }} /><div className="skel" style={{ height: 28, width: '70%', marginTop: 12 }} /><div className="skel" style={{ height: 10, width: '40%', marginTop: 10 }} /></div>)}</div>;
  if (variant === 'chart') return <div aria-busy="true" aria-label={label} style={{ height, display: 'flex', alignItems: 'flex-end', gap: 6, padding: '10px 0' }}>{Array.from({ length: 28 }, (_, i) => <div key={i} className="skel" style={{ flex: 1, height: `${25 + 60 * Math.abs(Math.sin(i / 3))}%` }} />)}</div>;
  if (variant === 'list') return <div aria-busy="true" aria-label={label}>{Array.from({ length: 5 }, (_, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--fw-color-border-subtle)' }}><div className="skel" style={{ width: 22, height: 14 }} /><div style={{ flex: 1 }}><div className="skel" style={{ height: 12, width: '70%' }} /><div className="skel" style={{ height: 8, width: '40%', marginTop: 8 }} /></div></div>)}</div>;
  if (variant === 'map') return <div className="map" aria-busy="true" aria-label={label} style={{ display: 'grid', placeItems: 'center' }}><div className="small muted">{label}</div><div className="loading-line" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} /></div>;
  return <div aria-busy="true" aria-label={label}><div className="skel" style={{ height }} /></div>;
}

/**
 * DataState — applique la même grammaire d'états à toute requête :
 * chargement → erreur API / hors ligne → vide → sans résultat (filtres) → contenu.
 */
export function DataState<T>({ query, isEmpty, filtered, onResetFilters, loading, children }: {
  query: { data?: T; error: unknown; isPending: boolean; refetch: () => unknown };
  isEmpty?: (d: T) => boolean; filtered?: boolean; onResetFilters?: () => void; loading?: ReactNode; children: (d: T) => ReactNode;
}) {
  if (query.isPending) return <>{loading ?? <LoadingState />}</>;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const d = query.data as T;
  if (isEmpty?.(d)) return filtered ? <EmptyState kind="noresult" actions={onResetFilters && <button className="btn btn--sm" onClick={onResetFilters}><Icon name="reset" />Réinitialiser les filtres</button>} /> : <EmptyState kind="empty" />;
  return <>{children(d)}</>;
}
