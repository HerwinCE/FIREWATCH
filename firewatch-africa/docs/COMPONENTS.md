# FireWatch Africa — Inventaire des composants

Bibliothèque React : `components/src` (TypeScript, vérifiée avec `tsc --noEmit`). Styles : `design-tokens/tokens.css` + `components/src/styles/firewatch.css` (mêmes classes que la maquette — ce que vous voyez dans la maquette est exactement ce que produisent les composants).

| Composant | Fichier | Props principales | États / variantes | Accessibilité |
|---|---|---|---|---|
| **AppShell** | `components/AppShell.tsx` | `route`, `sidebar`, `topbar(openNav)`, `banners`, `bottomNav(openNav)`, `overlay` | desktop / tablette (sidebar 68 px) / mobile (tiroir + barre inférieure) | lien d'évitement, Échap ferme le tiroir, `main#main` focusable |
| **Sidebar** | `components/AppShell.tsx` | `current`, `hrefOf`, `health`, `assistantEnabled` | déployée / repliée (icônes + `title`) | `aria-current="page"`, groupes libellés |
| **Topbar** | `components/AppShell.tsx` | `title`, `crumbs`, `lastUpdate`, `freshness`, `periodControl`, `onAssistant` | pastille ok / warn / err | `role="status"` sur la fraîcheur |
| BottomNav | `components/AppShell.tsx` | `current`, `hrefOf`, `onMore` | mobile uniquement | cibles ≥ 44 px |
| **StatCard** | `components/StatCard.tsx` | `label`, `value`, `unit`, `foot`, `symbol`, `accent`, `spark`, `loading` | normal / accent / chargement | chiffres tabulaires ; la variation a un symbole ▲▼ en plus du signe |
| **FireMap** | `map/FireMap.tsx` | `detections`, `events`, `hotspots`, `initialView`, `recentSince`, `onSelectDetection`, `onSelectEvent`, `onLocate`, `emptyKind`, `adminBoundaries` | clustering natif, vues Monde / Afrique / Gabon, vide / sans résultat superposé | clavier MapLibre, boutons libellés, `role="region"` ; alternative textuelle à fournir à côté |
| **DetectionMarker** | `map/layers.ts` (`LAYERS.viirs`, `LAYERS.modis`, `LAYERS.recent`) | — | ● VIIRS, ■ MODIS ; couleur = classe FRP ; anneau pulsé < 24 h | forme ≠ couleur seule |
| **EventMarker** | `map/layers.ts` (`LAYERS.events`) | — | ◆ violet | idem |
| **MapLegend** | `map/MapLegend.tsx` | `hotspots`, `events`, `admin`, `defaultCollapsed` | dépliée / repliée (repliée par défaut < 560 px) | `aria-expanded` |
| DetectionPopup | `map/DetectionPopup.tsx` | `d`, `expert`, `onClose`, `eventHref`, `demo` | standard / expert ; feuille basse en mobile | `role="dialog"`, bouton Fermer |
| **FilterPanel** | `components/Filters.tsx` | `period`, `coverage`, `resultLabel`, `onClose` | panneau / tiroir (tablette) / feuille (mobile) | compteur `aria-live`, chips `aria-pressed` |
| **DateRangePicker** | `components/Filters.tsx` | `min`, `max`, `start`, `end` | préréglages 24 h / 7 j / 30 j / 90 j + dates personnalisées | `<input type="date">` natifs, bornes min/max |
| **SensorToggle** | `components/Filters.tsx` | — (lit `useFilters`) | MODIS / VIIRS | `aria-pressed`, forme + texte |
| SatelliteToggle · ConfidenceToggle | `components/Filters.tsx` | — | 5 satellites ; 3 classes de confiance | idem |
| **SatelliteBadge** | `components/Badges.tsx` | `satellite` | couleur + forme du capteur | texte complet |
| SensorBadge | `components/Badges.tsx` | `sensor` | avec résolution | — |
| **TimelineChart** | `charts/TimelineChart.tsx` | `x`, `series`, `stacked`, `area`, `unusual`, `granularity`, `yFormat`, `caption` | lignes / aires / empilé ; ▲ jours inhabituels ; info-bulle | `figure` + `figcaption`, `aria-label` ; un seul axe Y |
| **HeatmapCalendar** | `charts/HeatmapCalendar.tsx` | `days`, `unusual`, `cell` | rampe 6 pas + échelle | `role="grid"`, `aria-label` par cellule |
| BarChart | `charts/BarChart.tsx` | `categories`, `series`, `colorOf`, `caption` | groupé | `<title>` par barre |
| DataAlternative | `charts/DataAlternative.tsx` | `label`, `children` | `<details>` | alternative textuelle des visuels |
| **HotspotRanking** | `components/Lists.tsx` | `items`, `onSelect`, `limit` | — | liste ordonnée libellée « Zones présentant une concentration élevée… » |
| **EventCard** | `components/Lists.tsx` | `event`, `href` | — | lien unique sur toute la carte |
| **EventDetailPanel** | `components/EventDetailPanel.tsx` | `event`, `map`, `demo` | synthèse, score, timeline, tableau, méthode, avertissement | tableau avec caption, tri au clavier |
| ObservationTimeline | `components/EventDetailPanel.tsx` | `detections` | — | une marque = un bouton libellé |
| **DataTable** | `components/DataTable.tsx` | `columns`, `rows`, `caption`, `rowKey`, `onRowClick`, `maxHeight` | tri, lignes cliquables | `caption`, `scope`, `aria-sort`, Entrée/Espace |
| **ConfidenceBadge** | `components/Badges.tsx` | `detection` | faible / nominale / élevée (+ valeur brute) | 3 barres + texte |
| LevelBadge | `components/Badges.tsx` | `level`, `pill` | ▽ Faible · ◆ Modéré · ▲ Élevé | icône + texte |
| DemoBadge · ExperimentalBadge | `components/Badges.tsx` | `label` | — | `title` explicatif |
| **HarmonizationScore** | `components/HarmonizationScore.tsx` | `score`, `size`, `showLabel` | 44 px / 96 px ; libellé qualitatif | `role="img"` + `aria-label` |
| HarmonizationBreakdown | `components/HarmonizationScore.tsx` | `sub`, `params`, `hints` | 4 jauges | `role="meter"` |
| **MethodologyCard** | `components/MethodologyCard.tsx` | `id`, `icon`, `title`, `children` | ancrable | `aria-labelledby` |
| **AssistantPanel** | `assistant/AssistantPanel.tsx` | `ask`, `context`, `variant`, `open`, `onClose`, `demo` | tiroir / page / feuille mobile ; accueil, chargement, réponse + sources, erreur | `role="log"` `aria-live`, focus auto à l'ouverture |
| AssistantFab | `assistant/AssistantPanel.tsx` | `onClick` | libellé masqué en mobile | `aria-label` |
| **EmptyState** | `feedback/States.tsx` | `kind`, `actions`, `title`, `text` | `empty`, `noresult`, `offline`, `geoloc`, `emptymap` | `role="status"` |
| **LoadingState** | `feedback/States.tsx` | `variant`, `height`, `label` | `block`, `stats`, `chart`, `list`, `map` | `aria-busy` |
| **ErrorState** | `feedback/States.tsx` | `error`, `onRetry` | API / hors ligne (bascule auto) | `role="alert"` |
| DataState | `feedback/States.tsx` | `query`, `isEmpty`, `filtered`, `onResetFilters`, `loading`, `children` | orchestre chargement → erreur → vide → sans résultat → contenu | — |
| **ToastNotification** | `feedback/Toast.tsx` | `toast(title, body, kind, ms)` + `<ToastViewport/>` | info / ok / warn / err | `aria-live`, `role="alert"` pour les erreurs |
| StatusBanners | `feedback/StatusBanners.tsx` | `meta`, `healthStatus`, `geolocError`, `onRetry` | partiel, hors ligne, dégradé, localisation | `aria-live` |
| Icon · ShapeSymbol | `components/Icon.tsx` | `name`, `size` / `kind`, `fill` | — | `aria-hidden` |

## Modules non visuels

| Module | Rôle |
|---|---|
| `api/types.ts` | types du contrat (détection, événement, statistiques, hotspots, enveloppe `{data, meta}`) |
| `api/client.ts` | `fetch` typé, normalisation des erreurs (`ApiError`, hors ligne = status 0), `toQuery` |
| `api/hooks.ts` | hooks TanStack Query (clés dérivées des filtres, annulation, `keepPreviousData`) |
| `state/filters.ts` | état des filtres (zustand), `toApiFilters()`, synchronisation URL, régions → `bbox` |
| `state/settings.ts` | préférences persistées + application au document (`data-theme`, etc.) |
| `utils/format.ts` | formats FR (nombres, UTC, coordonnées, distances km/mi) |
| `utils/glossary.ts` | vocabulaire contrôlé, avertissements imposés, termes interdits |
| `examples/DashboardPage.tsx` | assemblage complet d'un écran (modèle pour les autres) |
