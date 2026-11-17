# FireWatch Africa — Recommandations d'intégration React

## 1. Pile technique recommandée

| Besoin | Choix | Pourquoi |
|---|---|---|
| Build | **Vite** + React 18/19 + TypeScript strict | démarrage rapide, `import.meta.env.VITE_API_URL` |
| Routage | **React Router** (data routers) ou TanStack Router | routes = écrans de `SCREENS.md` ; filtres dans l'URL (partage de vue au jury) |
| Données serveur | **TanStack Query v5** (`components/src/api/hooks.ts`) | cache par filtres, annulation, `keepPreviousData` (pas de clignotement lors d'un changement de période), retry |
| État client | **zustand** (`state/filters.ts`, `state/settings.ts`) | filtres partagés carte ↔ graphiques ↔ assistant |
| Carte | **MapLibre GL JS** (`map/FireMap.tsx`) + tuiles vectorielles sombres auto-hébergées (Protomaps PMTiles ou OpenMapTiles) | clustering GeoJSON natif, WebGL (> 50 000 points), aucune clé obligatoire |
| Gros volumes (> 100 k) | `deck.gl` `ScatterplotLayer` / `HeatmapLayer` en surcouche MapLibre | rendu GPU |
| Graphiques | composants SVG fournis (`charts/`) ; si besoin d'axes avancés : **visx** | zéro dépendance, mêmes tokens |
| Styles | `tokens.css` + `firewatch.css` (ou `tailwind.preset.js`) | un seul jeu de variables, thèmes par `data-theme` |
| i18n | `react-i18next`, clés par écran ; FR par défaut | anglais prévu dans Paramètres |
| Tests | Vitest + Testing Library ; Playwright (parcours + captures) ; `axe-core` | voir § 9 |

## 2. Structure du projet

```
src/
  app/            routes, AppShell, providers (QueryClient, i18n)
  pages/          Dashboard, MapPage, Gabon, Events, EventDetail, Compare, History, Hotspots, Methodology, Assistant, Settings
  ui/             ← copier components/src (ou paquet @firewatch-africa/ui)
  styles/         tokens.css, firewatch.css
  map/style/      firewatch-dark.json (style MapLibre teinté avec les tokens map.*)
  data/geo/       gabon-adm1.geojson (OCHA COD-AB / GADM)
```

Ordre d'import des styles : `tokens.css` puis `firewatch.css`. Les règles `.fw-stage*` de `firewatch.css` ne servent qu'à la maquette et peuvent être supprimées.

## 3. Correspondance filtres → contrat API

| Contrôle UI | Paramètre API | Remarque |
|---|---|---|
| Période (préréglage ou dates) | `start_date`, `end_date` (UTC, `YYYY-MM-DD`) | « aujourd'hui » = `metadata.last_update`, pas l'horloge du navigateur |
| Capteur | `sensor` | omis si les deux sont actifs |
| Satellite | `satellite` (liste séparée par des virgules) | omis si les 5 sont actifs |
| Région / vue / zone | `bbox` (`minLon,minLat,maxLon,maxLat`) | régions prédéfinies dans `REGIONS` |
| Pagination | `limit`, `offset` | liste d'événements : 20 par page |
| Méthode | `method_version` | affichée en badge sur les écrans d'événements |
| Confiance, jour/nuit, « événements uniquement » | *aucun* | **filtrés côté client** (badge « client » dans l'UI) |

### Extensions d'API proposées (non bloquantes)

| Extension | Endpoint | Justification |
|---|---|---|
| `confidence=low,nominal,high` | `/api/detections`, `/api/statistics/*` | les compteurs serveur reflèteraient le filtre de confiance |
| `daynight=D\|N` | idem | idem |
| `granularity=day\|week\|month` | `/api/statistics/timeline` | écran Historique (sinon agrégation côté client) |
| `cell=1\|0.5\|0.25`, `min_count` | `/api/analytics/hotspots` | taille de cellule des zones |
| enveloppe `{ data, meta }` avec `meta.partial`, `meta.stale`, `meta.dataset` | tous | états « données partielles » et « démonstration » pilotés par l'API |
| `format=csv` | `/api/events/{id}`, `/api/detections` | export |
| `fields=` / `format=geojson` | `/api/detections` | alléger les charges utiles de la carte |

Le client (`api/client.ts`) accepte déjà les deux formes de réponse (ressource brute ou enveloppe).

## 4. Gestion des états (une seule grammaire)

Utiliser `DataState` pour chaque bloc :

```tsx
<DataState query={useSummary(f)} loading={<LoadingState variant="stats" />}
  isEmpty={(r) => r.data.total === 0} filtered={activeFilterCount(filters) > 0} onResetFilters={filters.reset}>
  {({ data }) => <StatsRow s={data} />}
</DataState>
```

| Cas | Détection | Composant |
|---|---|---|
| chargement | `isPending` | `LoadingState` (variante à la forme du contenu) |
| erreur API | `ApiError.status >= 400` | `ErrorState` + `onRetry={refetch}` |
| hors connexion | `ApiError.status === 0` ou `navigator.onLine === false` | `ErrorState` bascule sur `EmptyState kind="offline"` ; bannière via `StatusBanners` ; données du cache Query affichées |
| données partielles | `meta.partial` | `StatusBanners` |
| vide / sans résultat | `total === 0` sans / avec filtres | `EmptyState kind="empty"` / `"noresult"` |
| carte vide | aucun point dans `map.getBounds()` | `FireMap emptyKind="emptymap"` |
| géolocalisation | `GeolocationPositionError` | `toast(...)` + `StatusBanners geolocError` + vue Afrique |

Configurer le `QueryClient` : `retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2`, `refetchOnWindowFocus: false`, persistance du cache (`@tanstack/query-sync-storage-persister`) pour l'usage hors ligne.

## 5. Carte (MapLibre)

1. **Fond** : style sombre auto-hébergé, couleurs `map.ocean`, `map.land`, `map.landStroke`, `map.focusLand` (Afrique teintée forêt). Les contours de la maquette sont **schématiques** : ne pas les réutiliser.
2. **Limites du Gabon** : OCHA COD-AB (`gab_admbnda_adm1`) ou GADM niveau 1, passées à `FireMap adminBoundaries`. Le rattachement détection → province doit être fait **côté API** (champ `province`), pas dans le navigateur.
3. **Clustering** : source GeoJSON `cluster: true`, `clusterRadius: 46`, `clusterMaxZoom: 8`, propriétés agrégées `frp_max` et `high` (déjà dans `layers.ts`). Clic = `getClusterExpansionZoom`.
4. **Marqueurs** : rond (cercle) pour VIIRS, carré et losange en images SDF teintées (`addShapeIcons`). Ne jamais différencier les capteurs par la seule couleur.
5. **Pulsation < 24 h** : animée par `requestAnimationFrame`, coupée si `reduceMotion`.
6. **Performance** : demander `/api/detections` par emprise visible (`bbox` = `map.getBounds()` arrondi, débounce 300 ms) au-delà de 30 jours ; `limit` adapté au zoom.
7. **Accessibilité** : la carte a toujours un tableau alternatif (15 détections les plus intenses, ou résultats paginés).

## 6. Assistant IA

Architecture recommandée : **backend** (jamais de clé de modèle dans le navigateur) exposant `POST /api/assistant` → `{ html|text, sources[], actions[] }`.

- Le modèle n'a accès qu'à des **outils** qui appellent les endpoints FireWatch (`summary`, `timeline`, `satellites`, `hotspots`, `events`, `events/{id}`, `detections`) avec les filtres du contexte (`AssistantContext` : route, filtres, `eventId`).
- **Règle de non-invention** : une réponse chiffrée sans appel d'outil est rejetée côté serveur ; le client affiche les `sources` sous chaque réponse.
- Le *prompt système* impose le vocabulaire de `utils/glossary.ts` (aucune affirmation d'incendie confirmé) et l'avertissement de l'assistant.
- Journaliser les questions et les endpoints appelés (sans données personnelles).
- La maquette contient un moteur de démonstration à règles qui illustre ce contrat (réponses calculées depuis l'API simulée, sources affichées, refus lorsque les données manquent).

## 7. Responsive

- `firewatch.css` utilise des **container queries** sur `.fw-frame` : seuils 768 / 1024 / 1280 / 1440 px. Le rendu dépend de la largeur réelle disponible (fonctionne aussi dans un iframe ou un panneau).
- Mobile (< 768) : barre inférieure 5 entrées + tiroir « Plus », carte prioritaire, filtres en feuille basse, fiche détection en feuille basse, statistiques en 2 colonnes, assistant en feuille modale via FAB.
- Tablette (768–1023) : sidebar 68 px, filtres en tiroir latéral, grilles en pleine largeur.

## 8. Performance (budgets)

| Indicateur | Cible |
|---|---|
| LCP (Dashboard, 4G) | < 2,5 s |
| JS initial | < 250 Ko gzip (MapLibre chargé à la demande sur les routes carte) |
| Interaction filtre → carte mise à jour | < 300 ms (données en cache) |
| Points rendus sans clustering | ≤ 5 000 (au-delà : clustering ou deck.gl) |

Techniques : `React.lazy` par route, `keepPreviousData`, virtualisation des longues listes (`@tanstack/react-virtual`), mémoïsation des GeoJSON, requêtes par emprise.

## 9. Qualité et tests

- **Unitaires** : `toApiFilters`, formats, `unusualIndices`, `DataState` (5 branches).
- **Accessibilité** : `axe-core` sur chaque route et chaque état ; navigation clavier complète (Playwright).
- **Visuels** : captures Playwright desktop 1440 / laptop 1280 / tablette 768 / mobile 390, comparées aux captures de `screenshots/`.
- **Vocabulaire** : test CI qui échoue si une chaîne de traduction contient un terme de `FORBIDDEN`.
- **Contrat** : schémas zod ou OpenAPI générés à partir de `api/types.ts` ; tests de contrat sur les 10 endpoints.

## 10. Données de démonstration

Tant que l'API réelle n'est pas branchée : le jeu de démonstration doit être servi par l'API avec `meta.dataset = "DEMO"`, ce qui affiche automatiquement les badges **DÉMO**. Ne jamais livrer au jury une vue mêlant données réelles et synthétiques sans ce marquage.

## 11. Liste de contrôle d'intégration

- [ ] Tokens importés, thème sombre par défaut, thème clair testé
- [ ] 10 endpoints branchés via `api/client.ts`, `VITE_API_URL` configuré
- [ ] Filtres synchronisés avec l'URL
- [ ] Chaque bloc enveloppé dans `DataState` ; 9 états vérifiés par écran
- [ ] Limites administratives officielles du Gabon
- [ ] Assistant derrière un backend avec outils et sources obligatoires
- [ ] Audit axe sans violation sérieuse ; parcours clavier complet
- [ ] Liens NASA FIRMS présents dans Méthodologie
