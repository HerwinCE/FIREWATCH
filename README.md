# FIREWATCH AFRICA

Plateforme de surveillance des **points chauds satellitaires NASA FIRMS** en Afrique, avec un focus sur le Gabon.
Projet NASA Space Apps 2026 : *harmonisation des points chauds MODIS et VIIRS*.

## Ce que fait l'application

- **Harmonisation MODIS + VIIRS** : confiance unifiée, grille commune de 0,01° (≈ 1 km), exclusion des sources non végétales, version scientifique (SP) préférée au temps réel (NRT), rapprochements inter-capteurs (≤ 2 km, ≤ 3 h).
- **Carte opérationnelle** (Mapbox) : zoom fluide sur un pays ou une province, fenêtre de données, chronologie animée, exports (image, GeoJSON, CSV).
- **Alertes thermiques automatiques** en quatre niveaux (faible, modéré, élevé, critique) avec zoom sur la zone en alerte.
- **Tableau de bord, historique et anomalies** : médiane historique MODIS 2001–2025 et VIIRS 2012–2025, calendrier de feu.
- **Assistant vocal** (Gemini) : comprend des demandes en français, agit dans l'application à partir d'une liste fermée d'actions, vérifie chaque résultat et demande confirmation pour les actions sensibles.

## Structure

| Dossier | Contenu |
|---|---|
| `backend/` | API FastAPI (Python), PostgreSQL, pipeline d'harmonisation, alertes, assistant vocal, tests |
| `firewatch-africa/` | Interface React + Vite (TypeScript), carte Mapbox, graphiques Recharts |
| `data/boundaries/` | Limites des provinces du Gabon (geoBoundaries, CC BY-SA 3.0) |
| `*.ps1` | Scripts Windows : démarrer la base, lancer l'application, télécharger les archives FIRMS |

## Installation

1. **Base de données** : PostgreSQL 17 (sans PostGIS). Créer la base, puis appliquer `backend/migrations/`.
2. **Backend** :
   ```powershell
   cd backend
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   copy .env.example .env   # puis renseigner DATABASE_URL, FIRMS_MAP_KEY, ADMIN_TOKEN, GEMINI_API_KEY
   ```
3. **Interface** :
   ```powershell
   cd firewatch-africa
   npm install
   copy .env.example .env.local   # puis renseigner VITE_MAPBOX_TOKEN
   ```
4. **Lancement** : `lancer-appli.ps1`, puis ouvrir http://localhost:5180.

Les clés (`.env`, `.env.local`) et les données FIRMS brutes (`data/raw/`) ne sont jamais versionnées.

## Tests

```powershell
cd backend
.venv\Scripts\python -m pytest
```

## Sources

NASA FIRMS (MODIS C6.1, VIIRS 375 m) · geoBoundaries · Mapbox. Une détection thermique n'est pas un incendie confirmé.
