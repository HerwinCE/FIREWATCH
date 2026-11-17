"""Aller-retour Gemini simulé : appel d'outil, renvoi de la thoughtSignature et du functionResponse."""

import asyncio
import json
from datetime import date

import httpx
import pytest

from app import assistant
from app.assistant import Ask


@pytest.fixture
def gemini(monkeypatch):
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append({"url": str(request.url), "key": request.headers.get("x-goog-api-key"), "body": body})
        if len(sent) == 1:  # 1er tour : le modèle demande un outil
            return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"id": "call-1", "name": "zone_summary", "args": {"zone": "gabon"}}, "thoughtSignature": "SIG-A"}]}}]})
        return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [
            {"text": "réflexion", "thought": True}, {"text": "Au Gabon, **129 détections**."}]}}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))

    async def last(_db):
        return date(2026, 11, 14)

    async def zone_summary(_db, **kw):
        return {"zone": kw.get("zone"), "total_detections": 129}

    monkeypatch.setattr(assistant, "_last_day", last)
    monkeypatch.setitem(assistant.TOOLS, "zone_summary", zone_summary)
    monkeypatch.setattr(assistant.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(assistant.settings, "gemini_model", "gemini-3.8-flash")
    return sent


def test_gemini_tool_round_trip(gemini):
    out = asyncio.run(assistant.answer_gemini(None, Ask(question="Combien de détections au Gabon ?")))
    assert out["mode"] == "gemini" and out["answer"] == "Au Gabon, **129 détections**."  # la pensée n'est pas affichée
    assert out["understood"]["tools"] == ["zone_summary"]
    first, second = gemini
    assert first["url"].endswith("/models/gemini-3.8-flash:generateContent") and first["key"] == "test-key"
    assert first["body"]["tools"][0]["functionDeclarations"][0]["name"] == "zone_summary"
    model_turn, reply = second["body"]["contents"][-2:]
    assert model_turn["parts"][0]["thoughtSignature"] == "SIG-A"  # renvoyée telle quelle
    fr = reply["parts"][0]["functionResponse"]
    assert reply["role"] == "user" and fr["id"] == "call-1" and fr["name"] == "zone_summary"
    assert fr["response"]["result"]["total_detections"] == 129


def test_gemini_quota_error_falls_back(monkeypatch):
    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(429, json={})), **kw))

    async def last(_db):
        return date(2026, 11, 14)

    monkeypatch.setattr(assistant, "_last_day", last)
    monkeypatch.setattr(assistant.settings, "gemini_api_key", "test-key")
    out = asyncio.run(assistant.answer_gemini(None, Ask(question="Bonjour")))
    assert "quota" in out["error"]


def test_provider_order(monkeypatch):
    monkeypatch.setattr(assistant.settings, "gemini_api_key", "")
    monkeypatch.setattr(assistant.settings, "anthropic_api_key", "")
    assert assistant._provider()[0] == "local"
    monkeypatch.setattr(assistant.settings, "gemini_api_key", "k")
    assert assistant._provider() == ("gemini", assistant.settings.gemini_model)


def test_overloaded_model_falls_back_to_lite(monkeypatch):
    urls = []

    def handler(request):
        urls.append(str(request.url))
        if "gemini-3.8-flash" in str(request.url):
            return httpx.Response(503, json={"error": {"status": "UNAVAILABLE"}})
        return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [{"text": "Réponse du modèle de secours."}]}}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))

    async def last(_db):
        return date(2026, 11, 14)

    monkeypatch.setattr(assistant, "_last_day", last)
    monkeypatch.setattr(assistant.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(assistant.settings, "gemini_model", "gemini-3.8-flash")
    out = asyncio.run(assistant.answer_gemini(None, Ask(question="Bonjour")))
    assert out["answer"] == "Réponse du modèle de secours." and out["model"] == "gemini-3.5-flash-lite"
    assert "gemini-3.8-flash" in urls[0] and "gemini-3.5-flash-lite" in urls[1]
