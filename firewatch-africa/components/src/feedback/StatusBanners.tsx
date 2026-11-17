/* Bannières globales : données partielles, hors connexion, service dégradé, géolocalisation. */
import type { ResponseMeta } from '../api/types';
import { Icon } from '../components/Icon';

export function StatusBanners({ meta, healthStatus, geolocError, onRetry }: { meta?: ResponseMeta; healthStatus?: string; geolocError?: boolean; onRetry?: () => void }) {
  return (
    <div className="fw-banners" aria-live="polite">
      {meta?.partial && <div className="banner banner--warn"><Icon name="alert" /><span><strong>Données partielles.</strong> {meta.partial.reason}. Les totaux excluent : {meta.partial.missing.join(', ')}.</span></div>}
      {meta?.stale && <div className="banner banner--offline"><Icon name="wifiOff" /><span><strong>Absence de connexion.</strong> Affichage du cache du <span className="mono">{new Date(meta.stale.cached_at).toISOString().slice(0, 16).replace('T', ' ')} UTC</span>.</span>{onRetry && <button className="btn btn--sm" onClick={onRetry}><Icon name="refresh" />Réessayer</button>}</div>}
      {healthStatus && healthStatus !== 'ok' && <div className="banner banner--err"><Icon name="server" /><span><strong>Service dégradé.</strong> <span className="mono">GET /api/health</span> → {healthStatus}.</span></div>}
      {geolocError && <div className="banner banner--info"><Icon name="pinOff" /><span><strong>Erreur de localisation.</strong> Vue Afrique utilisée ; choisissez une région manuellement.</span></div>}
    </div>
  );
}
