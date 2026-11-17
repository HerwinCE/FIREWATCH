"""Agent vocal : liste fermée d'actions, confirmation des actions sensibles, ordre des réponses."""

import asyncio
import json
from datetime import date

import httpx
import pytest

from app import voice_api
from app.voice_api import CONFIRM, Turn, _spoken, _ui_args


def test_ui_args_are_validated():
    assert _ui_args("navigate", {"page": "carte"}) == {"page": "carte"}
    assert _ui_args("navigate", {"page": "admin"}) == {}                       # hors liste
    assert _ui_args("set_period", {"last_days": 7.0, "evil": "x"}) == {"last_days": 7}
    assert _ui_args("set_map_display", {"all_points": "oui"}) == {}            # type refusé
    assert _ui_args("locate_place", {"name": "x" * 200}) == {}                 # trop long


def test_sensitive_actions_need_confirmation():
    assert CONFIRM == {"run_harmonization", "export_data"}


def test_spoken_text_has_no_markdown():
    assert _spoken("**Haut-Ogooué** : _10 740_ détections\n\n| a |") == "Haut-Ogooué : 10 740 détections a"


@pytest.fixture
def gemini(monkeypatch):
    sent = []

    def handler(request):
        body = json.loads(request.content)
        sent.append(body)
        if len(sent) == 1:  # le modèle demande deux actions d'interface et une donnée
            return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"id": "a", "name": "set_sensors", "args": {"selection": "VIIRS"}}, "thoughtSignature": "S"},
                {"functionCall": {"id": "b", "name": "zone_summary", "args": {"zone": "gabon"}}},
                {"functionCall": {"id": "c", "name": "run_harmonization", "args": {}}}]}}]})
        return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [{"text": "J'ai affiché **VIIRS**."}]}}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))

    async def last(_db):
        return date(2026, 11, 14)

    async def zone_summary(_db, **kw):
        return {"zone": kw.get("zone"), "total_detections": 129}

    monkeypatch.setattr(voice_api, "_last_day", last)
    monkeypatch.setitem(voice_api.DATA_TOOLS, "zone_summary", zone_summary)
    monkeypatch.setattr(voice_api.settings, "gemini_api_key", "k")
    monkeypatch.setattr(voice_api.settings, "gemini_model", "gemini-3.8-flash")
    return sent


def test_agent_round_trip(gemini):
    first = asyncio.run(voice_api.turn(Turn(message="Montre VIIRS au Gabon puis harmonise", state={"route": "dashboard"}), db=None))
    assert first["done"] is False
    assert [a["name"] for a in first["actions"]] == ["set_sensors", "run_harmonization"]
    assert [a["confirm"] for a in first["actions"]] == [False, True]          # l'harmonisation exige un accord
    assert first["server_results"][0]["result"]["total_detections"] == 129   # donnée exécutée côté serveur
    # L'interface renvoie les résultats constatés (dans le désordre) ; le serveur les remet dans l'ordre des appels.
    results = [{"id": "c", "name": "run_harmonization", "result": {"ok": False, "message": "refusé"}},
               {"id": "a", "name": "set_sensors", "result": {"ok": True, "message": "VIIRS seul"}}]
    second = asyncio.run(voice_api.turn(Turn(results=results, server_results=first["server_results"], conversation=first["conversation"], model=first["model"]), db=None))
    assert second["done"] is True and second["say"] == "J'ai affiché VIIRS."
    reply = gemini[1]["contents"][-1]
    assert [p["functionResponse"]["id"] for p in reply["parts"]] == ["a", "b", "c"]
    assert gemini[1]["contents"][-2]["parts"][0]["thoughtSignature"] == "S"
