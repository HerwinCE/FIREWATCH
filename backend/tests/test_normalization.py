"""Tests du pipeline d'harmonisation (cahier des charges EF-17, EF-18, EF-19, EF-20, T13, T14)."""

from datetime import datetime, timezone

import pytest

from app.services.normalization import (
    Point,
    classify_source,
    cross_sensor_groups,
    grid_cell_id,
    harmonize_row,
    normalize_satellite,
    quality_level,
    superseded_keys,
    unified_confidence,
)


# EF-17 / T13 — bornes 29/30, 79/80 et valeurs l/n/h
@pytest.mark.parametrize("raw, expected", [
    ("0", "low"), ("29", "low"), ("30", "nominal"), ("79", "nominal"), ("80", "high"), ("100", "high"),
])
def test_modis_confidence_bounds(raw, expected):
    assert unified_confidence(raw, "MODIS") == expected


@pytest.mark.parametrize("raw, expected", [("l", "low"), ("n", "nominal"), ("h", "high"), ("H", "high")])
def test_viirs_confidence(raw, expected):
    assert unified_confidence(raw, "VIIRS") == expected


@pytest.mark.parametrize("raw, family", [("101", "MODIS"), ("-1", "MODIS"), ("abc", "MODIS"), ("x", "VIIRS"), (None, "VIIRS")])
def test_invalid_confidence_rejected(raw, family):
    with pytest.raises(ValueError):
        unified_confidence(raw, family)


@pytest.mark.parametrize("raw, code", [
    ("Terra", "TERRA"), ("T", "TERRA"), ("Aqua", "AQUA"), ("A", "AQUA"), ("N", "SNPP"), ("Suomi NPP", "SNPP"),
    ("N20", "NOAA20"), ("1", "NOAA20"), ("NOAA-20", "NOAA20"), ("N21", "NOAA21"), ("2", "NOAA21"),
])
def test_satellite_normalization(raw, code):
    assert normalize_satellite(raw) == code


def test_quality_level():
    assert quality_level("6.1NRT") == "NRT"
    assert quality_level("2.0NRT") == "NRT"
    assert quality_level("2.1URT") == "NRT"  # Ultra Real-Time : temps réel, jamais SP
    assert quality_level("6.03") == "SP"
    assert quality_level("2") == "SP"


# EF-19 — rattachement à la grille de 0,01°
def test_grid_cell_example():
    assert grid_cell_id(0.12, 8.9) == "9012_18890"


def test_grid_cell_shared_within_cell():
    assert grid_cell_id(0.1201, 8.9001) == grid_cell_id(0.1299, 8.9099)
    assert grid_cell_id(0.1199, 8.9) != grid_cell_id(0.1201, 8.9)


# EF-18 / T14 — filtre des sources non végétales
def test_firms_type_used_when_present():
    assert classify_source("0", "x", {}) == (0, True, "firms_type")
    assert classify_source("2", "x", {}) == (2, False, "firms_type")
    assert classify_source("3", "x", {}) == (3, False, "firms_type")


def test_static_mask_for_nrt():
    assert classify_source(None, "8800_18870", {"8800_18870": 2}) == (2, False, "static_mask")
    assert classify_source(None, "8800_18871", {"8800_18870": 2}) == (None, True, "presumed_outside_mask")


def test_harmonize_row_full():
    row = harmonize_row({
        "id": 1, "satellite": "N21", "instrument": "VIIRS", "acquisition_time": datetime(2026, 11, 14, 1, 4, tzinfo=timezone.utc),
        "latitude": -0.5, "longitude": 9.4, "confidence": "h", "frp": 3.2, "daynight": "N",
        "source_product": "2.0NRT", "firms_type": None, "version": "2.0NRT",
    }, {})
    assert (row.satellite_code, row.sensor_family, row.native_resolution_m) == ("NOAA21", "VIIRS", 375)
    assert (row.confidence_raw, row.confidence_level, row.quality_level) == ("h", "high", "NRT")
    assert row.is_vegetation and row.type_basis == "presumed_outside_mask"


def _p(key, lat, lon, minutes, sat, quality="NRT"):
    return Point(key, lat, lon, minutes * 60.0, sat, quality)


# EF-20 — rapprochements inter-capteurs (2 km, 3 h)
def test_groups_link_only_different_sensors():
    points = [
        _p("m", 0.0, 9.0, 0, "AQUA"),
        _p("v", 0.01, 9.0, 60, "NOAA20"),    # ~1,1 km, 1 h, autre capteur -> lié
        _p("v2", 0.012, 9.0, 61, "NOAA20"),  # même capteur que v, mais relié à m -> même groupe
        _p("far", 0.1, 9.0, 60, "NOAA21"),   # ~11 km -> non lié
        _p("late", 0.0, 9.0, 300, "NOAA21"), # ≥ 4 h de tous les autres -> non lié
    ]
    groups = cross_sensor_groups(points)
    assert groups["m"] == groups["v"] == groups["v2"]
    assert "far" not in groups and "late" not in groups


def test_same_sensor_alone_never_grouped():
    points = [_p("a", 0.0, 9.0, 0, "NOAA20"), _p("b", 0.001, 9.0, 1, "NOAA20")]
    assert cross_sensor_groups(points) == {}


def test_every_group_has_two_sensors():
    points = [_p(i, (i % 7) * 0.004, 9 + (i % 5) * 0.004, i * 7, ["AQUA", "NOAA20", "NOAA21"][i % 3]) for i in range(60)]
    groups = cross_sensor_groups(points)
    sats = {}
    for p in points:
        if p.key in groups:
            sats.setdefault(groups[p.key], set()).add(p.satellite_code)
    assert sats and all(len(s) >= 2 for s in sats.values())


def test_groups_at_high_latitude():
    # À 70° N, 2 km représentent ~0,05° de longitude : la recherche doit s'élargir.
    points = [_p("a", 70.0, 20.0, 0, "AQUA"), _p("b", 70.0, 20.045, 30, "NOAA20")]
    assert cross_sensor_groups(points)["a"] == cross_sensor_groups(points)["b"]


# Masque des sources statiques : tampon d'une cellule (~1 km) autour des types 1-3
def test_static_mask_buffer():
    from collections import Counter
    from scripts.build_static_mask import buffered_cells
    mask = buffered_cells({"8800_18870": Counter({2: 5})})
    assert len(mask) == 9 and mask["8799_18869"] == 2 and mask["8801_18871"] == 2
    assert "8802_18870" not in mask


# Étape 5 — supersession NRT -> SP
def test_nrt_superseded_by_sp():
    points = [_p("nrt", 0.0, 9.0, 0, "NOAA20", "NRT"), _p("sp", 0.005, 9.005, 5, "NOAA20", "SP"),
              _p("other_sat", 0.0, 9.0, 0, "NOAA21", "NRT"), _p("too_late", 0.0, 9.0, 30, "NOAA20", "NRT")]
    assert superseded_keys(points) == {"nrt"}
