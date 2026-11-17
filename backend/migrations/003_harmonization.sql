-- Couche harmonisée MODIS / VIIRS (cahier des charges §3.3 et §6.2).
-- Les détections brutes (firewatch.detections) ne sont jamais modifiées :
-- harmonized_detections est une table dérivée, versionnée et recalculable.
BEGIN;

CREATE TABLE IF NOT EXISTS firewatch.harmonization_runs (
    id BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    mode TEXT NOT NULL CHECK (mode IN ('incremental', 'full')),
    version TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    rows_processed INTEGER NOT NULL DEFAULT 0,
    rows_vegetation INTEGER NOT NULL DEFAULT 0,
    rows_superseded INTEGER NOT NULL DEFAULT 0,
    groups_created INTEGER NOT NULL DEFAULT 0,
    rows_rejected INTEGER NOT NULL DEFAULT 0,
    duration_seconds NUMERIC(10, 2),
    error_message TEXT
);
-- Une seule exécution à la fois (refus 409 côté API).
CREATE UNIQUE INDEX IF NOT EXISTS uq_harmonization_running
    ON firewatch.harmonization_runs ((status)) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS firewatch.harmonized_detections (
    detection_id UUID PRIMARY KEY REFERENCES firewatch.detections(id) ON DELETE CASCADE,
    harmonization_run_id BIGINT NOT NULL REFERENCES firewatch.harmonization_runs(id),
    acquired_at TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    satellite_code VARCHAR(8) NOT NULL CHECK (satellite_code IN ('TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21')),
    sensor_family VARCHAR(5) NOT NULL CHECK (sensor_family IN ('MODIS', 'VIIRS')),
    native_resolution_m SMALLINT NOT NULL CHECK (native_resolution_m IN (375, 1000)),
    quality_level VARCHAR(3) NOT NULL CHECK (quality_level IN ('NRT', 'SP')),
    confidence_raw VARCHAR(8),
    confidence_level VARCHAR(8) NOT NULL CHECK (confidence_level IN ('low', 'nominal', 'high')),
    detection_type SMALLINT CHECK (detection_type IS NULL OR detection_type BETWEEN 0 AND 3),
    is_vegetation BOOLEAN NOT NULL,
    type_basis VARCHAR(24) NOT NULL CHECK (type_basis IN ('firms_type', 'static_mask', 'presumed_outside_mask')),
    grid_cell_id VARCHAR(16) NOT NULL,
    group_id BIGINT,
    is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
    frp_mw DOUBLE PRECISION,
    daynight CHAR(1),
    source_product TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hd_time ON firewatch.harmonized_detections (acquired_at);
CREATE INDEX IF NOT EXISTS idx_hd_latlon ON firewatch.harmonized_detections (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_hd_filters ON firewatch.harmonized_detections
    (sensor_family, is_vegetation, confidence_level) WHERE NOT is_superseded;
CREATE INDEX IF NOT EXISTS idx_hd_cell_time ON firewatch.harmonized_detections (grid_cell_id, acquired_at);
CREATE INDEX IF NOT EXISTS idx_hd_group ON firewatch.harmonized_detections (group_id) WHERE group_id IS NOT NULL;

-- Masque des sources statiques (torchères, industrie, volcans, offshore), en cellules de 0,01°.
-- Rempli à partir des archives FIRMS (attribut type 1, 2, 3) ; vide tant que les archives ne sont pas importées.
CREATE TABLE IF NOT EXISTS firewatch.static_source_mask (
    grid_cell_id VARCHAR(16) PRIMARY KEY,
    origin TEXT NOT NULL CHECK (origin IN ('firms_type_archive', 'firms_sta')),
    detection_type SMALLINT NOT NULL CHECK (detection_type BETWEEN 1 AND 3),
    built_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
