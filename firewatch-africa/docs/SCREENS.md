# FireWatch Africa — Inventaire des écrans

Toutes les routes sont accessibles dans la maquette (`mockup/index.html#<route>`, détail : `#evenement-<id>`). Chaque écran accepte `?state=<état>&frame=<desktop|tablet|mobile>&theme=<dark|light>` pour la revue.

**États simulables (tous les écrans)** : `normal`, `loading`, `empty`, `error`, `partial`, `offline`, `noresult`, `emptymap`, `geoloc`. L'affichage mobile est obtenu avec `frame=mobile` ou sur un vrai téléphone.

| # | Écran | Route | Endpoints | Captures |
|---|---|---|---|---|
| 1 | Dashboard | `#/dashboard` | metadata, statistics/summary (×3), statistics/timeline, statistics/satellites, analytics/hotspots, detections | `01-*` |
| 2 | Carte mondiale | `#/carte` | detections, events, analytics/hotspots, detections/{id} | `02-*` |
| 3 | Vue Gabon | `#/gabon` | statistics/summary (bbox), detections (bbox), events (bbox), statistics/timeline (semaine), analytics/hotspots (0,25°) | `03-*` |
| 4 | Détail d'un événement | `#/evenements/{id}` | events/{id} | `04-*` |
| 4b | Liste des événements | `#/evenements` | events (`method_version`, `bbox`) | `04b-*` |
| 5 | Comparaison MODIS / VIIRS | `#/comparaison` | detections, statistics/satellites, statistics/timeline, events | `05-*` |
| 6 | Historique temporel | `#/historique` | statistics/timeline (granularité + jour), statistics/summary (A et B) | `06-*` |
| 7 | Zones de concentration | `#/zones` | analytics/hotspots, detections | `07-*` |
| 8 | Sources et méthodologie | `#/methodologie` | metadata (paramètres de méthode) | `08-*` |
| 9 | Assistant IA | `#/assistant` + panneau latéral global | selon la question (summary, hotspots, events/{id}, satellites, detections) | `09-*` |
| 10 | Paramètres | `#/parametres` | health (version) | `10-*` |
| A | Design system | `#/design-system` | — | `11-*` |
| B | États & composants | `#/etats` | — | `12-*` |

---

## 1. Dashboard — `#/dashboard`

**Objectif** : en 10 secondes, savoir combien, où, depuis quand, et par quels capteurs.

- **Hero** : badges DÉMO + NASA FIRMS, titre, phrase pédagogique imposée, boutons « Explorer les données » (→ carte), « Accès rapide Gabon », « Comprendre la méthode ». À droite : dernière mise à jour, période, plateformes, version de méthode (`/api/metadata`).
- **6 StatCards** : total (avec variation vs période précédente + sparkline), MODIS, VIIRS, événements probables, zones actives (score ≥ 40), dernière mise à jour.
- **Carte miniature mondiale** (FireMap, clustering, vues Monde / Afrique / Gabon) + lien plein écran.
- **Principales zones de concentration** (HotspotRanking, 6 lignes, niveau ▽◆▲).
- **Évolution des détections** (TimelineChart, jours inhabituels ▲, tableau alternatif).
- **MODIS versus VIIRS** (BarChart par satellite, couleur = capteur).
- **Bloc Gabon** : mini-carte provinces, chiffres, indicateur analytique + badge Expérimental + mention « ne constitue pas une alerte officielle ».
- **États** : chargement = squelettes des tuiles + carte ; vide = EmptyState + lien Historique ; sans résultat = EmptyState + Réinitialiser ; erreur = ErrorState global, hero conservé ; partiel / hors ligne = bannière globale.
- **Mobile** : hero empilé, stats 2 colonnes, cartes en pleine largeur, FAB assistant.

## 2. Carte mondiale — `#/carte`

**Objectif** : explorer librement les détections.

- Disposition : panneau de filtres 320 px + carte plein écran.
- **Filtres** : période (24 h / 7 j / 30 j / 90 j + dates), capteur, satellite (5 chips), niveau de confiance *(client)*, jour/nuit *(client)*, « événements probables uniquement », couche hotspots, clustering. Compteur de résultats live (`aria-live`). « Réinitialiser » dans le panneau **et** sur la carte.
- **Carte** : vues Monde / Afrique / Gabon, zoom +/−, molette, glisser, clavier, bouton « ma position », regroupement par niveau de zoom (clic = zoom sur l'emprise), lecture des coordonnées au survol, échelle (km/mi selon paramètres), légende repliable.
- **Clic sur une détection** → fiche : latitude, longitude, date, heure UTC (+ heure locale si fuseau WAT), satellite, capteur, confiance (classe + valeur brute FIRMS), FRP, jour/nuit, produit source ; en mode Expert : brightness, scan × track, version. Lien vers l'événement rattaché.
- **Clic sur un événement (◆)** → résumé + « Ouvrir le détail ».
- **Alternative textuelle** : les 15 détections les plus intenses en tableau.
- **États** : chargement carte (indicateur de balayage) ; erreur dans la zone carte ; filtre sans résultat / carte vide = état superposé à la carte ; erreur de localisation = toast + vue Afrique.
- **Tablette** : filtres en tiroir latéral (bouton « Filtres (n) ») ; **mobile** : carte prioritaire, filtres en feuille basse (78 % de hauteur, poignée), fiche détection en feuille basse, légende repliée.

## 3. Vue Gabon — `#/gabon`

- Encadré **Indicateur analytique expérimental** (non-alerte) en tête de page.
- 6 StatCards (total + variation, VIIRS, MODIS, événements + score moyen, provinces concernées, FRP max).
- **Carte détaillée** : contour national, 9 provinces (limites *schématiques* dans la maquette — à remplacer par OCHA COD-AB / GADM niveau 1), choroplèthe du nombre de détections, villes, détections individuelles (sans clustering), événements ◆.
- **Indicateur analytique** faible / modéré / élevé : jauge 3 segments + icône + texte + formule (rapport activité de la période / moyenne 92 j : < 0,75 faible ; 0,75–1,5 modéré ; > 1,5 élevé).
- **Comparaison MODIS / VIIRS** par province (barres horizontales, top 5).
- **Tableau par province** : détections, VIIRS, MODIS, FRP max, événements, indicateur.
- **Évolution récente** : courbe hebdomadaire sur 92 jours (fenêtre fixe, indiquée).
- **Événements probables** (EventCards) et **zones de concentration** (cellules 0,25°).

## 4. Détail d'un événement harmonisé — `#/evenements/{id}`

- En-tête : identifiant (mono), zone, région, boutons « Expliquer ce score » (ouvre l'assistant avec le contexte) et « Copier l'identifiant ».
- Bloc imposé : *« Cet événement est un rapprochement analytique de plusieurs observations satellitaires. Il ne constitue pas une confirmation terrain. »*
- **Carte rapprochée** : observations numérotées, cercle du rayon de rapprochement (1 km VIIRS / 2 km si MODIS), centre.
- **Synthèse** : score (anneau 96 px), position centrale, durée estimée, nombre de détections, FRP max, capteurs, satellites, fenêtre UTC.
- **Décomposition du score** : 4 jauges avec poids et justification (distance moyenne, écart médian, nb de plateformes, confiance moyenne) + formule.
- **Timeline des observations** : axe UTC (graduations 6 h), une marque par observation (forme = capteur), alternance haut/bas pour la lisibilité.
- **Tableau des détections originales** : identifiant, date/heure UTC, satellite, lat, lon, confiance, FRP, J/N, distance au centre, distance à l'observation précédente, écart temporel. Export CSV.
- **Méthode utilisée** + **Avertissement scientifique**.
- États : 404 → EmptyState + retour à la liste ; erreur → ErrorState.

**4b. Liste** : filtres région (bbox), score minimal (curseur), tri (score, récence, nb de détections, FRP), badge `method_version`, pagination « Afficher 20 de plus », histogramme des scores, encart pédagogique.

## 5. Comparaison MODIS / VIIRS — `#/comparaison`

- Sélecteur de région : Afrique centrale / Gabon / Afrique.
- **Trois cartes synchronisées** : MODIS uniquement (■), VIIRS uniquement (●), fusionnée (+ ◆ événements).
- **Tableau de comparaison** : résolution, satellites, nombre de détections, part nocturne, FRP moyenne et maximale, couverture temporelle, heures de passage, expression de la confiance, produits FIRMS.
- **Graphique comparatif** : deux séries sur un seul axe.
- **Avant / après harmonisation** : curseur glissant (souris, tactile, clavier) — à gauche les détections brutes, à droite les événements probables, avec le nombre de chaque côté.
- **Pourquoi les capteurs diffèrent** : résolution, heures de passage, nombre de plateformes, géométrie et nuages.

## 6. Historique temporel — `#/historique`

- **Formulaire** : date de début, date de fin, région (bbox), capteur, satellite, granularité jour / semaine / mois ; validation (début ≤ fin) avec toast d'erreur.
- **Indicateurs** : activité moyenne/jour, période précédente (ou « hors couverture »), jours inhabituels, FRP moyenne, événements harmonisés, part nocturne.
- **Courbe temporelle** empilée MODIS + VIIRS avec ▲ jours inhabituels (> 2σ), tableau alternatif.
- **Heatmap calendrier** (semaines × jours) avec échelle et ▲.
- **Comparaison de deux périodes** (A = sélection, B = période précédente de même durée, en pointillé).
- **Évolution de la FRP** (cumulée), **jours inhabituels** (tableau), **événements harmonisés** par période.

## 7. Zones de concentration — `#/zones`

- Taille de cellule : 1° / 0,5° / 0,25° ; filtres régionaux (chips) — Gabon passe automatiquement à 0,25°.
- **Carte de densité** (cellules en pointillé + détections regroupées).
- **Classement** : rang, zone (+ coordonnées de cellule), détections, jours actifs, FRP cumulée, variation vs période précédente, score de concentration (barre), niveau.
- Clic / Entrée sur une ligne → panneau de zone (chiffres, niveau, « Explorer sur la carte », « Événements de la zone ») et zoom de la carte.
- Formulation imposée : « zone présentant une concentration élevée de détections ».

## 8. Sources et méthodologie — `#/methodologie`

Sommaire collant + 11 sections : NASA FIRMS ; MODIS et VIIRS ; résolution ; NRT vs données standard ; méthode d'harmonisation ; calcul du score (formule) ; limites ; nuages et fumée ; détection thermique ≠ feu confirmé ; contrat API (endpoint → usage dans l'interface) ; liens NASA (`https://firms.modaps.eosdis.nasa.gov/`, `https://firms.modaps.eosdis.nasa.gov/content/active_fire/`).

## 9. Assistant IA — panneau latéral, bouton flottant, page `#/assistant`

- **Panneau latéral** (400 px, desktop) ouvert depuis la topbar ou le **FAB** ; **feuille modale** plein écran sur mobile.
- **Page** : historique des conversations (gauche) + conversation.
- Contexte affiché (écran, période, ou identifiant d'événement) ; badge MODE DÉMO.
- **Suggestions** (les 4 questions du cahier des charges + 2) ; saisie multi-ligne (Entrée = envoyer, Maj+Entrée = retour).
- **États** : accueil, chargement (« Analyse des données… »), réponse avec **sources** (endpoints appelés) et actions (liens vers l'écran concerné), **erreur** (« je ne répondrai pas sans données vérifiables »), **refus d'inventer** (« je n'ai pas de donnée permettant de répondre »).
- Avertissement permanent : *« L'assistant fournit une interprétation des données disponibles. Il ne remplace pas une analyse scientifique, les autorités locales ou les observations terrain. »*

## 10. Paramètres — `#/parametres`

Langue ; unité de distance (km/mi, appliquée à l'échelle de carte et aux distances d'événement) ; fuseau horaire (UTC / Africa/Libreville — l'UTC reste toujours affiché) ; thème sombre/clair ; niveau de détail (Simplifié / Standard / Expert) ; préférences de carte (fond, regroupement, libellés, graticule) ; accessibilité (réduire les animations, contraste renforcé, texte agrandi) ; activation de l'assistant IA (masque FAB, bouton topbar, entrée de menu, page). Enregistrement local + toast de confirmation.

---

## Matrice des états par écran

| État | Déclencheur API | Rendu |
|---|---|---|
| Normal | 200 | contenu |
| Chargement | requête en cours | squelettes à la forme du contenu ; carte : indicateur de balayage ; données précédentes conservées lors d'un changement de filtre |
| Absence de données | 200, `total = 0`, aucun filtre restrictif | EmptyState « Aucune donnée disponible » + proposition d'élargir la période |
| Erreur API | 4xx / 5xx | ErrorState : message, code, endpoint, « Réessayer » ; bannière « Service dégradé » si `/api/health` ≠ ok |
| Données partielles | `meta.partial` | bannière ambre globale + valeurs marquées « partiel » |
| Absence de connexion | échec réseau / `meta.stale` | bannière hors ligne + données du cache (horodatées) ; toast |
| Filtre sans résultat | 200, `total = 0` avec filtres actifs | EmptyState « Aucun résultat pour ces filtres » + Réinitialiser |
| Carte vide | aucun point dans l'emprise visible | état superposé à la carte + « Vue mondiale » |
| Erreur de localisation | `GeolocationPositionError` | toast + bannière info + vue Afrique |
| Mobile | largeur < 768 px | voir § responsive de chaque écran |
