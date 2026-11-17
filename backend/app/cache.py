"""Cache des réponses statistiques (lecture seule).

Les agrégats sur ~740 000 détections coûtent plusieurs secondes, alors que les données ne changent
qu'à chaque collecte ou harmonisation. On garde donc la réponse JSON de chaque requête GET identique
pendant TTL secondes ; le cache est vidé dès qu'une harmonisation se termine. Au démarrage, les
requêtes du tableau de bord par défaut sont précalculées pour que la première visite soit rapide.
"""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import Request, Response

log = logging.getLogger(__name__)

CACHED_PREFIXES = ("/api/statistics", "/api/analytics", "/api/detections/timeline", "/api/alerts", "/api/events",
                   "/api/metadata", "/api/map/all-points")
TTL = 600
MAX_ENTRIES = 400
_store: dict[str, tuple[float, bytes, str]] = {}
_locks: dict[str, asyncio.Lock] = {}

# Requêtes envoyées par l'interface à l'ouverture (tableau de bord, monde, végétation, tous capteurs).
WARM_URLS = [
    "/api/statistics/summary", "/api/statistics/timeline", "/api/statistics/satellites",
    "/api/analytics/hotspots?limit=10", "/api/statistics/anomaly?sensor_family=VIIRS&metric=active_cells",
    "/api/detections/timeline?sensor_family=VIIRS&metric=active_cells&granularity=month",
    "/api/alerts?scope=world", "/api/events?limit=20&offset=0",
]


def _key(request: Request) -> str:
    parts = sorted(p for p in request.url.query.split("&") if p)
    return request.url.path + "?" + "&".join(parts)


def clear() -> None:
    _store.clear()


async def response_cache(request: Request, call_next):
    if request.method != "GET" or not request.url.path.startswith(CACHED_PREFIXES):
        return await call_next(request)
    key = _key(request)
    hit = _store.get(key)
    if hit and hit[0] > time.time():
        return Response(content=hit[1], media_type=hit[2], headers={"X-Cache": "HIT"})
    # Une seule exécution à la fois par requête identique : les visiteurs suivants attendent le résultat.
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _store.get(key)
        if hit and hit[0] > time.time():
            return Response(content=hit[1], media_type=hit[2], headers={"X-Cache": "HIT"})
        response = await call_next(request)
        if response.status_code != 200:
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])
        media = response.media_type or response.headers.get("content-type", "application/json")
        if len(_store) >= MAX_ENTRIES:
            _store.clear()
        _store[key] = (time.time() + TTL, body, media)
        return Response(content=body, media_type=media, headers={"X-Cache": "MISS"})


async def warm(app) -> None:
    """Précalcule les statistiques par défaut après le démarrage, sans bloquer le serveur."""
    import httpx

    await asyncio.sleep(1)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://warm", timeout=120) as client:
        for url in WARM_URLS:
            try:
                await client.get(url)
            except Exception:  # le préchauffage est facultatif
                log.warning("Préchauffage impossible : %s", url)
