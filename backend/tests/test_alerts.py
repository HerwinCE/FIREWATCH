"""Niveaux d'alerte : étendue OU intensité, le plus haut seuil franchi l'emporte."""

import pytest

from app.alerts_api import _province_at, level_of


@pytest.mark.parametrize("cells,frp,expected", [
    (2, 50, None),            # trop peu de cellules
    (5, 10, "faible"),
    (24, 90, "faible"),
    (25, 10, "modere"),       # étendue
    (6, 120, "modere"),       # intensité
    (2, 900, None),           # pic isolé : pas assez de cellules pour monter de niveau
    (3, 900, "critique"),     # pic très puissant sur plusieurs cellules
    (80, 50, "eleve"),
    (10, 350, "eleve"),
    (200, 20, "critique"),
    (150, 820, "critique"),
])
def test_levels(cells, frp, expected):
    assert level_of(cells, frp) == expected


def test_gabon_province_lookup():
    assert _province_at(9.45, 0.39) == "Estuaire"      # Libreville
    assert _province_at(13.58, -1.63) == "Haut-Ogooué"  # Franceville
    assert _province_at(20.0, 5.0) is None
