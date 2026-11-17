"""Tests de la médiane, de l'anomalie et de la couverture (cahier des charges T20, T21, §3.3.6)."""

from datetime import date, timedelta

from app.services.history import month_coverage, period_coverage, position, quantile


def test_quantiles_linear():
    values = [41, 60, 78, 50, 70]
    assert quantile(values, .5) == 60
    assert quantile([10, 20, 30, 40], .5) == 25
    assert quantile([10, 20, 30, 40], .25) == 17.5
    assert quantile([], .5) is None


def test_median_resists_extreme_year():
    # Une année exceptionnelle (El Niño) déplace la moyenne, pas la médiane.
    normal = [60, 62, 58, 61, 59]
    assert quantile(normal + [600], .5) == quantile(normal + [63], .5)


def test_position():
    assert position(87, 41, 78) == "above_normal"
    assert position(30, 41, 78) == "below_normal"
    assert position(60, 41, 78) == "normal"
    assert position(60, None, None) == "unknown"


def _days(start: date, end: date) -> set[date]:
    return {start + timedelta(days=i) for i in range((end - start).days + 1)}


def test_viirs_before_2012_is_unavailable_not_zero():
    assert month_coverage(2005, 6, "VIIRS", set(), date(2026, 11, 14)) == ("unavailable", 0.0)


def test_future_month_unavailable():
    assert month_coverage(2026, 12, "MODIS", set(), date(2026, 11, 14))[0] == "unavailable"


def test_gap_distinct_from_zero():
    covered = _days(date(2025, 1, 1), date(2025, 12, 31))
    # 2026 janvier : aucun fichier reçu -> trou, jamais zéro.
    assert month_coverage(2026, 1, "MODIS", covered, date(2026, 11, 14)) == ("gap", 0.0)
    assert month_coverage(2025, 3, "MODIS", covered, date(2026, 11, 14)) == ("full", 1.0)


def test_partial_current_month():
    covered = _days(date(2026, 11, 10), date(2026, 11, 14))
    status, share = month_coverage(2026, 11, "VIIRS", covered, date(2026, 11, 14))
    assert status == "partial" and round(share, 3) == round(5 / 14, 3)
    assert period_coverage(date(2026, 11, 10), date(2026, 11, 14), "VIIRS", covered, date(2026, 11, 14))[0] == "full"
