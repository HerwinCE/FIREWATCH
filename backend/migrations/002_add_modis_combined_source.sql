BEGIN;

INSERT INTO firewatch.sources
    (name, sensor, satellite, instrument, product_name, resolution_meters, data_type, documentation_url)
VALUES
    ('MODIS_NRT', 'MODIS', 'Terra+Aqua', 'MODIS', 'MCD14DL', 1000, 'NRT', 'https://firms.modaps.eosdis.nasa.gov/')
ON CONFLICT (name) DO NOTHING;

COMMIT;
