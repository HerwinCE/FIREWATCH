"""Alertes thermiques automatiques (EF « alertes ») sur la couche harmonisée.

Unité d'alerte : un carreau de 1° (≈ 110 km) sur les dernières heures de données (24 h par défaut,
comptées depuis la dernière observation, pas depuis l'horloge : les collectes ont du retard).
Niveau = le plus élevé atteint par l'étendue (cellules actives de 0,01°) OU l'intensité (FRP max).
Seuils calibrés le 2026-11-16 sur la distribution réelle des carreaux (Afrique : p50 = 6 cellules,
p90 = 61, p99 = 244 ; FRP max observé 1 025 MW). Une alerte ne prouve pas un incendie : c'est un
signal d'activité thermique inhabituellement forte à vérifier.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.filters import common_filters
from app.services.boundaries import load_provinces

router = APIRouter(prefix="/api", tags=["alerts"])

LEVELS = ["faible", "modere", "eleve", "critique"]
LABELS = {"faible": "Faible", "modere": "Modéré", "eleve": "Élevé", "critique": "Critique"}
# (cellules actives minimales, FRP max minimale en MW) pour atteindre chaque niveau.
RULES = {"faible": (5, None), "modere": (25, 100.0), "eleve": (80, 300.0), "critique": (200, 800.0)}
MIN_CELLS_FOR_FRP = 3  # un pic de puissance isolé (1–2 cellules) ne suffit pas à monter de niveau
SCOPES = {"world": None, "africa": (-20, -36, 53, 38), "gabon": (8.5, -4.1, 14.6, 2.4)}


def level_of(cells: int, max_frp: float | None) -> str | None:
    """Niveau d'un carreau : le plus haut seuil franchi par l'étendue ou par l'intensité."""
    frp = float(max_frp or 0)
    found = None
    for name in LEVELS:
        min_cells, min_frp = RULES[name]
        if cells >= min_cells or (min_frp is not None and frp >= min_frp and cells >= MIN_CELLS_FOR_FRP):
            found = name
    return found


def _province_at(lon: float, lat: float) -> str | None:
    """Province du Gabon contenant le point (test du rayon, anneaux extérieurs)."""
    for p in load_provinces().get("GAB", []):
        w, s, e, n = p["bbox"]
        if not (w <= lon <= e and s <= lat <= n):
            continue
        for ring in p["polygons"]:
            inside, j = False, len(ring) - 1
            for i in range(len(ring)):
                xi, yi = ring[i][0], ring[i][1]
                xj, yj = ring[j][0], ring[j][1]
                if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
                    inside = not inside
                j = i
            if inside:
                return p["name"]
    return None


@router.get("/alerts")
async def alerts(
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Literal["world", "africa", "gabon"] = "world",
    hours: int = Query(default=24, ge=6, le=168),
    sensor: Literal["MODIS", "VIIRS"] | None = None,
    limit: int = Query(default=40, ge=1, le=200),
    max_points: int = Query(default=12000, ge=0, le=40000),
) -> dict:
    box = SCOPES[scope]
    f = common_filters(start_date=None, end_date=None, bbox=",".join(map(str, box)) if box else None, sensor_family=sensor,
                       sensor=None, satellite=None, confidence=None, vegetation_only=True)
    last = (await db.execute(text(f"SELECT MAX(h.acquired_at) FROM firewatch.harmonized_detections h WHERE {f.where}"), f.params)).scalar()
    if last is None:
        return {"window": None, "counts": {k: 0 for k in LEVELS}, "alerts": [], "points": {"fields": [], "rows": []}, "rules": RULES}
    since = last - timedelta(hours=hours)
    params = {**f.params, "since": since}
    rows = (await db.execute(text(f"""
        SELECT floor(h.longitude)::int AS gx, floor(h.latitude)::int AS gy,
               COUNT(*) AS detections, COUNT(DISTINCT h.grid_cell_id) AS cells, MAX(h.frp_mw) AS max_frp,
               COALESCE(SUM(h.frp_mw), 0) AS total_frp, AVG(h.longitude) AS lon, AVG(h.latitude) AS lat,
               MAX(h.acquired_at) AS last_seen,
               COUNT(*) FILTER (WHERE h.sensor_family = 'MODIS') AS modis, COUNT(*) FILTER (WHERE h.sensor_family = 'VIIRS') AS viirs
        FROM firewatch.harmonized_detections h WHERE {f.where} AND h.acquired_at > :since
        GROUP BY 1, 2"""), params)).mappings().all()

    found = []
    counts = {k: 0 for k in LEVELS}
    for r in rows:
        lvl = level_of(r["cells"], r["max_frp"])
        if not lvl:
            continue
        counts[lvl] += 1
        lon, lat = float(r["lon"]), float(r["lat"])
        found.append({
            "id": f"{r['gx']}_{r['gy']}_{last:%Y%m%d}", "level": lvl, "label": LABELS[lvl], "rank": LEVELS.index(lvl) + 1,
            "lon": round(lon, 3), "lat": round(lat, 3), "bbox": [r["gx"], r["gy"], r["gx"] + 1, r["gy"] + 1],
            "cells": r["cells"], "detections": r["detections"], "max_frp": round(float(r["max_frp"] or 0), 1),
            "total_frp": round(float(r["total_frp"]), 1), "modis": r["modis"], "viirs": r["viirs"],
            "last_seen": r["last_seen"].isoformat(), "province": _province_at(lon, lat),
        })
    found.sort(key=lambda a: (a["rank"], a["cells"], a["max_frp"]), reverse=True)

    # Points des carreaux en alerte, les plus intenses d'abord, avec le rang du niveau pour l'effet visuel.
    points: list[list] = []
    if found and max_points:
        tiles = {(a["bbox"][0], a["bbox"][1]): a["rank"] for a in found}
        pts = (await db.execute(text(f"""
            SELECT h.longitude, h.latitude, h.frp_mw, floor(h.longitude)::int AS gx, floor(h.latitude)::int AS gy
            FROM firewatch.harmonized_detections h WHERE {f.where} AND h.acquired_at > :since
            ORDER BY h.frp_mw DESC NULLS LAST LIMIT :cap"""), {**params, "cap": max_points * 3})).all()
        for lon, lat, frp, gx, gy in pts:
            rank = tiles.get((gx, gy))
            if rank:
                points.append([round(lon, 4), round(lat, 4), round(float(frp or 0), 1), rank])
                if len(points) >= max_points:
                    break
    return {
        "window": {"from": since.isoformat(), "to": last.isoformat(), "hours": hours},
        "scope": scope, "counts": counts, "total": len(found), "top": found[0]["level"] if found else None,
        "alerts": found[:limit], "points": {"fields": ["lon", "lat", "frp", "rank"], "rows": points},
        "rules": {k: {"cells": v[0], "frp": v[1]} for k, v in RULES.items()},
    }
