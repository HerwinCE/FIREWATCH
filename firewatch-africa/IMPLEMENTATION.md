# Frontend connecté — étape 1

La maquette d’origine reste dans mockup/, screenshots/ et components/. L’application connectée est dans src/ ; elle réutilise les tokens, AppShell, StatCard et graphiques de Claude.

## Lancement

Depuis backend : python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

Depuis firewatch-africa : npm install puis npm run dev

Ouvrir http://localhost:5173. Vite transmet /api à FastAPI, sans exposer la clé FIRMS. Le token public Mapbox est lu dans .env.local (VITE_MAPBOX_TOKEN), exclu de Git. Le point final de ponctuation du token communiqué a été retiré.

## Réalisé

- Navigation responsive, thème sombre/clair et préférences locales.
- Dashboard connecté aux statistiques PostgreSQL.
- Carte Mapbox exhaustive via /api/map/observations : cellules calculées côté serveur, filtres par dates, capteur et emprise visible ; clic sur une cellule pour zoomer puis sur une observation pour ses détails.
- Vue Gabon par emprise rectangulaire.
- Historique quotidien, comparaison des satellites et cellules de concentration.
- Liste paginée d’événements et consultation de leurs détections associées.
- Méthodologie et état explicite du service assistant encore indisponible.

## Limites de cette étape

- Carte : toute la sélection est représentée par des cellules adaptatives (4 000 formes maximum). Au zoom 8 et au-delà, les détections individuelles sont retournées si leur nombre ne dépasse pas 5 000 ; sinon le service conserve les cellules sans tronquer les observations. Les cellules sont en degrés et ne sont pas une mesure de densité par unité de surface. Le compteur de carte porte sur l’emprise visible, celui du dashboard sur la zone sélectionnée.
- Les limites provinciales officielles, le calendrier multiannuel, la comparaison de deux périodes et l’assistant IA ne sont pas encore implémentés.
- Le thème s’applique à l’interface ; la carte conserve son fond sombre.
- Pas de validation scientifique supplémentaire des groupes DBSCAN. Les limites de projection et des fenêtres fixes sont expliquées à l’écran Méthodologie.
- Les chiffres de démonstration Claude ne sont pas réutilisés. Les indicateurs non disponibles ont été remplacés par des indicateurs calculés dans l’API.
- Déploiement : configurer un reverse proxy /api et les restrictions de domaine Mapbox.

## Vérifications

npm run build : TypeScript et bundle de production.

node scripts/check-frontend.mjs : navigateur Edge headless, navigation des écrans, captures desktop/mobile, erreurs JavaScript et débordement horizontal.

Les captures frontend-dashboard-desktop.png et frontend-dashboard-mobile.png sont les rendus de l’application connectée ; les autres captures appartiennent à la maquette de référence.

Étape 2 : le moteur Mapbox est chargé à la demande. Vérification de l’agrégation en lecture seule : depuis backend, exécuter python -m scripts.check_map. Cette commande contrôle la conservation des comptages mondiaux, MODIS, Gabon, un passage à l’antiméridien, les dates et les paramètres invalides. Le Gabon reste une emprise rectangulaire et non une sélection par frontières administratives.
