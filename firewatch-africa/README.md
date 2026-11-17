# FireWatch Africa — Maquette, design system et composants

Plateforme d'analyse des détections thermiques satellitaires NASA FIRMS (MODIS Terra/Aqua ≈ 1 km ; VIIRS Suomi-NPP, NOAA-20, NOAA-21 — 375 m), avec un focus Afrique et Gabon.

> **Données de démonstration.** Tous les chiffres visibles dans la maquette sont générés localement (graine fixe, 9 228 détections synthétiques, 92 jours, du 15/08 au 14/11/2026). Ils reproduisent la *forme* des réponses de l'API, pas des observations réelles, et sont marqués **DÉMO** partout.

## Contenu

```
firewatch-africa/
├── mockup/index.html            Maquette navigable autonome (un seul fichier, hors ligne)
├── mockup/src/                  Sources de la maquette (styles, données démo + API simulée, composants, écrans, shell)
├── design-tokens/
│   ├── tokens.json              SOURCE UNIQUE (format W3C DTCG) — couleurs sombre/clair, typo, espacements, rayons, ombres, mouvement, z-index, breakpoints
│   ├── tokens.css               variables CSS --fw-* (généré)
│   ├── tokens.ts                objet typé + références CSS + métadonnées niveaux/capteurs (généré)
│   └── tailwind.preset.js       preset Tailwind (généré)
├── components/                  Bibliothèque React + TypeScript (31 fichiers, vérifiée tsc)
│   ├── src/api/                 types du contrat, client fetch, hooks TanStack Query
│   ├── src/state/               filtres (zustand + URL) et préférences
│   ├── src/components/          AppShell, Sidebar, Topbar, StatCard, badges, score, filtres, listes, détail d'événement, tableau…
│   ├── src/map/                 FireMap (MapLibre GL, clustering natif), couches Detection/Event/Hotspot, légende, fiche
│   ├── src/charts/              TimelineChart, BarChart, HeatmapCalendar, alternative textuelle
│   ├── src/feedback/            EmptyState, LoadingState, ErrorState, DataState, Toast, bannières d'état
│   ├── src/assistant/           AssistantPanel + bouton flottant
│   ├── src/styles/firewatch.css styles des composants (identiques à la maquette)
│   └── examples/DashboardPage.tsx  écran complet branché sur les hooks
├── docs/
│   ├── DESIGN-SYSTEM.md         couleurs + contrastes vérifiés, typographie, espacements, mouvement, encodage carto, accessibilité
│   ├── SCREENS.md               inventaire des écrans, endpoints, interactions, matrice des états
│   ├── COMPONENTS.md            inventaire des composants (props, états, accessibilité)
│   └── REACT-INTEGRATION.md     pile, correspondance filtres → API, extensions d'API proposées, carte, assistant, perf, tests
├── screenshots/                 35 captures PNG (desktop 1440, laptop 1280, tablette 768, mobile 390, 9 états, thème clair)
└── scripts/                     build-tokens.mjs, build-geo.mjs, build-mockup.py, shoot.py, contrast.py
```

## Utiliser la maquette

Ouvrir `mockup/index.html` dans un navigateur récent (aucun serveur nécessaire). La **barre de maquette** en haut permet de :

- changer d'écran ;
- simuler un **état** sur n'importe quel écran : normal, chargement, absence de données, erreur API, données partielles, absence de connexion, filtre sans résultat, carte vide, erreur de localisation ;
- prévisualiser en **Desktop / Tablette 768 / Mobile 390** (responsive par container queries) ;
- voir le dernier appel à l'API simulée (`GET /api/...`).

Paramètres d'URL utiles pour la revue : `#carte?state=offline&frame=mobile&theme=light&chrome=0` (dans le fichier local ; les routes simples `#carte`, `#gabon`, `#evenement-EVT-GA-0007` fonctionnent partout).

## Régénérer

```bash
node scripts/build-tokens.mjs     # tokens.json → tokens.css / tokens.ts / tailwind.preset.js
node scripts/build-geo.mjs        # géométries schématiques (nécessite d3-delaunay)
python3 scripts/build-mockup.py   # assemble mockup/index.html
python3 scripts/shoot.py '<json>' screenshots   # captures (Playwright + Chrome)
```

## Points d'attention pour l'équipe frontend

1. Les contours de pays et les **limites provinciales du Gabon sont schématiques** (dessinées pour la maquette). En production : tuiles vectorielles + OCHA COD-AB / GADM niveau 1.
2. Les filtres **confiance**, **jour/nuit** et **événements uniquement** n'existent pas dans le contrat API : ils sont appliqués côté client (badge « client ») — voir les extensions proposées dans `docs/REACT-INTEGRATION.md`.
3. L'assistant de la maquette est un moteur à règles qui calcule ses réponses depuis l'API simulée et cite ses sources ; en production, il doit passer par un backend avec appels d'outils et refus de répondre sans données.
4. Vocabulaire imposé : jamais « incendie confirmé » (`components/src/utils/glossary.ts`).
