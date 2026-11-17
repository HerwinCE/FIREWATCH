# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Source : cahier des charges FIREWATCH AFRICA v2.0, §2, confirmé par l'utilisateur le 15/11/2026.

- **Services environnementaux** : surveiller l'activité thermique et repérer les écarts à la normale (tableau de bord, anomalie vs médiane, export CSV).
- **Agents forestiers** : identifier les zones à vérifier sur le terrain (carte, coordonnées, filtre végétation).
- **Pompiers** : intervention immédiate, zones à forte activité, coordonnées copiables, confiance haute.
- **Secouristes d'alerte précoce** : détection précoce, comparaison à la médiane, notifications (évolution future).
- **Chercheurs** : séries temporelles, cohérence entre capteurs, harmonisation documentée, données d'origine.
- **ONG environnementales** : tendances, changements de régime de feu.
- **Étudiants** : comprendre les données d'observation de la Terre.
- **Grand public** : répartition et nature des détections, avec l'avertissement « détection ≠ incendie confirmé ».

## Product Purpose

Plateforme web qui collecte, harmonise et analyse les détections thermiques MODIS et VIIRS de NASA FIRMS, et situe l'activité actuelle d'une zone par rapport à sa normale historique. Réalisée pour le NASA Space Apps Challenge 2026, défi « Harmonisation des points chauds MODIS et VIIRS ». Ambition : toute l'Afrique ; zone pilote : Gabon.

## Positioning

Rend comparables des capteurs hétérogènes (MODIS 1 km, VIIRS 375 m) au moment où MODIS s'arrête et où Suomi-NPP a cessé (2 nov. 2026) : grille commune de 0,01°, confiance unifiée, filtrage des sources non végétales (torchères, industrie, offshore), comparaison de chaque famille à sa propre médiane historique.

## Operating Context

- Démonstration devant un jury (vidéoprojecteur) ; usage bureau ; salle de veille.
- Données : NASA FIRMS temps quasi réel (5 jours) + archives annuelles Gabon 2000–2025.

## Capabilities and Constraints

- Fonctionnalités en place : tableau de bord, carte (Mapbox), filtres capteur/confiance/type, fiche d'observation, comparaison MODIS/VIIRS en cellules actives, zones de concentration, anomalie vs médiane, calendrier de feu, export CSV, panneau Repères.
- Vocabulaire imposé : « détection thermique », « rapprochement possible » ; jamais « incendie confirmé ».
- L'application ne mesure pas la température de l'air : elle ne détecte pas les canicules en tant que telles.

## Brand Commitments

- Direction « Nuit futuriste » (15/11/2026) : Glassmorphism + Dark Futuristic UI sur toute l'application, **mode nuit par défaut**, mode jour disponible. Cyan = structure et sélection, braise = information thermique uniquement, couleurs capteurs fixes (MODIS #CC79A7, VIIRS #E69F00). Typographie Space Grotesk (titres, chiffres) + Inter (texte). Icônes lucide-react, icône du Gabon à sa vraie silhouette (geoBoundaries ADM1). Graphiques Recharts. Carte : fonctions principales en rail d'icônes, chacune avec son panneau dédié. Le verre ne porte jamais un texte sous 78 % d'opacité de fond.

## Evidence on Hand

- Cahier des charges : `../cahier_des_charges.pdf`.
- Données réelles en base : 797 314 détections harmonisées (archives Gabon 2000–2025 + NRT monde 10–14/11/2026).

## Accessibility & Inclusion

WCAG 2.2 AA ; jamais la couleur seule (formes par capteur, flèches et texte pour l'anomalie, hachures pour l'indisponibilité).
