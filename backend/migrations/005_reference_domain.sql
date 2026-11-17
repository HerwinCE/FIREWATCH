-- Domaine de référence de l'historique : carreaux de 0,1° couverts par les archives par pays.
-- Les archives FIRMS par pays ne contiennent que les détections situées dans le pays (Gabon, mer comprise) ;
-- une emprise rectangulaire déborde sur les pays voisins. Pour comparer le mois en cours à la médiane,
-- les deux doivent porter sur le même territoire : on restreint donc les calculs historiques à ce domaine.
BEGIN;
CREATE TABLE IF NOT EXISTS firewatch.reference_domain (
    tile VARCHAR(16) PRIMARY KEY,           -- floor(lat*10)_floor(lon*10)
    built_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
