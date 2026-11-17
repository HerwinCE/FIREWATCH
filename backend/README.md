# FireWatch Africa — Backend

API et pipeline de données pour les observations de feux MODIS/VIIRS de NASA FIRMS.

Initialisation locale :

1. Copier .env.example vers .env.
2. Remplacer CHANGE_ME par les valeurs locales.
3. Exécuter migrations/001_initial.sql avec PostgreSQL.
4. Installer les dépendances avec pip install -r requirements.txt.
5. Lancer l’API avec uvicorn app.main:app --reload.

La documentation est disponible sur /docs.

Principes de données :

- Les données RAW sont conservées.
- Les dates sont stockées en UTC.
- Les géométries utilisent EPSG:4326.
- Les imports doivent être idempotents.
- Une détection thermique n’est pas automatiquement un incendie confirmé.
