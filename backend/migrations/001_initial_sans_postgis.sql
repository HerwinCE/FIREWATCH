BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Variante sans PostGIS : positions stockées en latitude/longitude (WGS84).
-- Pour revenir à PostGIS, utiliser 001_initial.sql.

CREATE SCHEMA IF NOT EXISTS firewatch;

CREATE TABLE IF NOT EXISTS firewatch.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    sensor TEXT NOT NULL CHECK (sensor IN ('MODIS', 'VIIRS')),
    satellite TEXT NOT NULL,
    instrument TEXT NOT NULL,
    product_name TEXT NOT NULL,
    resolution_meters INTEGER CHECK (resolution_meters > 0),
    data_type TEXT NOT NULL CHECK (data_type IN ('NRT', 'STANDARD', 'ARCHIVE')),
    documentation_url TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS firewatch.ingestion_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES firewatch.sources(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL')),
    request_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    records_received INTEGER NOT NULL DEFAULT 0 CHECK (records_received >= 0),
    records_inserted INTEGER NOT NULL DEFAULT 0 CHECK (records_inserted >= 0),
    records_rejected INTEGER NOT NULL DEFAULT 0 CHECK (records_rejected >= 0),
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS firewatch.raw_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES firewatch.sources(id),
    external_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, external_id),
    UNIQUE (source_id, payload_hash)
);

CREATE TABLE IF NOT EXISTS firewatch.detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES firewatch.sources(id),
    raw_detection_id UUID REFERENCES firewatch.raw_detections(id),
    external_id TEXT NOT NULL,
    sensor TEXT NOT NULL CHECK (sensor IN ('MODIS', 'VIIRS')),
    satellite TEXT NOT NULL,
    instrument TEXT NOT NULL,
    acquisition_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    confidence TEXT,
    frp DOUBLE PRECISION CHECK (frp IS NULL OR frp >= 0),
    daynight CHAR(1) CHECK (daynight IS NULL OR daynight IN ('D', 'N')),
    source_product TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, external_id)
);

CREATE TABLE IF NOT EXISTS firewatch.harmonized_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code TEXT NOT NULL UNIQUE,
    centroid_latitude DOUBLE PRECISION NOT NULL CHECK (centroid_latitude BETWEEN -90 AND 90),
    centroid_longitude DOUBLE PRECISION NOT NULL CHECK (centroid_longitude BETWEEN -180 AND 180),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    detection_count INTEGER NOT NULL DEFAULT 0 CHECK (detection_count >= 0),
    sensor_count INTEGER NOT NULL DEFAULT 0 CHECK (sensor_count >= 0),
    max_frp DOUBLE PRECISION CHECK (max_frp IS NULL OR max_frp >= 0),
    mean_confidence NUMERIC(6, 3),
    harmonization_score NUMERIC(6, 3) CHECK (harmonization_score IS NULL OR harmonization_score BETWEEN 0 AND 1),
    method_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROBABLE' CHECK (status IN ('PROBABLE', 'REVIEWED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_time >= start_time)
);

CREATE TABLE IF NOT EXISTS firewatch.event_detections (
    event_id UUID NOT NULL REFERENCES firewatch.harmonized_events(id) ON DELETE CASCADE,
    detection_id UUID NOT NULL REFERENCES firewatch.detections(id) ON DELETE CASCADE,
    distance_km NUMERIC(10, 3),
    time_difference_hours NUMERIC(10, 3),
    association_score NUMERIC(6, 3) CHECK (association_score IS NULL OR association_score BETWEEN 0 AND 1),
    PRIMARY KEY (event_id, detection_id)
);

CREATE TABLE IF NOT EXISTS firewatch.data_quality_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID,
    issue_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR')),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sources_sensor ON firewatch.sources(sensor);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_started ON firewatch.ingestion_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_detections_time ON firewatch.detections(acquisition_time);
CREATE INDEX IF NOT EXISTS idx_detections_sensor ON firewatch.detections(sensor);
CREATE INDEX IF NOT EXISTS idx_detections_satellite ON firewatch.detections(satellite);
CREATE INDEX IF NOT EXISTS idx_detections_latlon ON firewatch.detections(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_events_time ON firewatch.harmonized_events(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_events_centroid ON firewatch.harmonized_events(centroid_latitude, centroid_longitude);
CREATE INDEX IF NOT EXISTS idx_event_detections_detection ON firewatch.event_detections(detection_id);

INSERT INTO firewatch.sources
    (name, sensor, satellite, instrument, product_name, resolution_meters, data_type, documentation_url)
VALUES
    ('MODIS_TERRA_NRT', 'MODIS', 'Terra', 'MODIS', 'MODIS_NRT', 1000, 'NRT', 'https://firms.modaps.eosdis.nasa.gov/'),
    ('MODIS_AQUA_NRT', 'MODIS', 'Aqua', 'MODIS', 'MODIS_NRT', 1000, 'NRT', 'https://firms.modaps.eosdis.nasa.gov/'),
    ('VIIRS_SNPP_NRT', 'VIIRS', 'Suomi-NPP', 'VIIRS', 'VIIRS_SNPP_NRT', 375, 'NRT', 'https://firms.modaps.eosdis.nasa.gov/'),
    ('VIIRS_NOAA20_NRT', 'VIIRS', 'NOAA-20', 'VIIRS', 'VIIRS_NOAA20_NRT', 375, 'NRT', 'https://firms.modaps.eosdis.nasa.gov/'),
    ('VIIRS_NOAA21_NRT', 'VIIRS', 'NOAA-21', 'VIIRS', 'VIIRS_NOAA21_NRT', 375, 'NRT', 'https://firms.modaps.eosdis.nasa.gov/')
ON CONFLICT (name) DO NOTHING;

COMMIT;
