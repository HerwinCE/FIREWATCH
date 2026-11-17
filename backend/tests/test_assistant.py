"""Compréhension des questions de l'assistant (mode local), sans base de données."""

import asyncio
from datetime import date

import pytest

from app import assistant
from app.assistant import Context, fold, fr_num, parse


@pytest.fixture(autouse=True)
def last_day(monkeypatch):
    async def fake(_db):
        return date(2026, 11, 14)
    monkeypatch.setattr(assistant, "_last_day", fake)


def ask(q: str, ctx: Context | None = None) -> dict:
    return asyncio.run(parse(None, q, ctx or Context()))


def test_fold_and_numbers():
    assert fold("Ogooué-Ivindo Août") == "ogooue-ivindo aout"
    assert fr_num(10740) == "10 740"
    assert fr_num(3.944, 2) == "3,94"


@pytest.mark.parametrize("question,intent,zone", [
    ("Combien de détections au Gabon les 7 derniers jours ?", "summary", "gabon"),
    ("Quelle province du Gabon est la plus active en 2024 ?", "provinces", "gabon"),
    ("Le mois en cours est-il normal au Gabon ?", "anomaly", "gabon"),
    ("Compare MODIS et VIIRS en Afrique", "compare", "afrique"),
    ("Quels sont les jours les plus actifs dans le monde ?", "daily", "monde"),
    ("Où sont les foyers les plus actifs au Gabon ?", "hotspots", "gabon"),
    ("Combien de détections dans l'Estuaire ?", "summary", "Estuaire"),
    ("Quelles données sont disponibles ?", "coverage", "monde"),
    ("Comment marche l'harmonisation ?", "method", "monde"),
])
def test_intents(question, intent, zone):
    p = ask(question)
    assert p["intent"] == intent
    assert p["zone"] == zone


def test_periods_are_anchored_on_last_data_day():
    p = ask("Combien de détections les 7 derniers jours ?")
    assert (p["start"], p["end"]) == (date(2026, 11, 8), date(2026, 11, 14))
    p = ask("Activité au Gabon en août 2023")
    assert (p["start"], p["end"]) == (date(2023, 8, 1), date(2023, 8, 31))
    p = ask("Total en 2024")
    assert (p["start"], p["end"]) == (date(2024, 1, 1), date(2024, 12, 31))


def test_interface_context_is_the_default():
    p = ask("Combien de détections ?", Context(zone="afrique", sensor="VIIRS", start=date(2026, 11, 10), end=date(2026, 11, 12)))
    assert p["zone"] == "afrique" and p["sensor"] == "VIIRS"
    assert (p["start"], p["end"]) == (date(2026, 11, 10), date(2026, 11, 12))
    assert ask("Combien de détections MODIS ?")["sensor"] == "MODIS"
