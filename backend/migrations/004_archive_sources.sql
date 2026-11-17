-- Sources des archives annuelles par pays NASA FIRMS (qualité scientifique, attribut « type »).
BEGIN;

INSERT INTO firewatch.sources
    (name, sensor, satellite, instrument, product_name, resolution_meters, data_type, documentation_url)
VALUES
    ('MODIS_SP_COUNTRY', 'MODIS', 'Terra+Aqua', 'MODIS', 'MCD14ML', 1000, 'ARCHIVE', 'https://firms.modaps.eosdis.nasa.gov/country/'),
    ('VIIRS_SNPP_SP_COUNTRY', 'VIIRS', 'Suomi-NPP', 'VIIRS', 'VNP14IMGTDL', 375, 'ARCHIVE', 'https://firms.modaps.eosdis.nasa.gov/country/'),
    ('VIIRS_NOAA20_SP_COUNTRY', 'VIIRS', 'NOAA-20', 'VIIRS', 'VJ114IMGTDL', 375, 'ARCHIVE', 'https://firms.modaps.eosdis.nasa.gov/country/')
ON CONFLICT (name) DO NOTHING;

COMMIT;
