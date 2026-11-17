"""Représentation cartographique exhaustive et bornée en nombre de formes (couche harmonisée)."""

import calendar
import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.filters import common_filters
from app.services.history import covered_days, period_coverage

router = APIRouter(prefix="/api/map", tags=["map"])


@router.get("/observations")
async def observations(
    db: Annotated[AsyncSession, Depends(get_db)],
    bbox: str = Query(default="-180,-90,180,90", description="emprise visible (peut traverser l'antiméridien)"),
    zoom: int = Query(default=1, ge=0, le=22),
    start_date: date | None = None,
    end_date: date | None = None,
    sensor: Literal["MODIS", "VIIRS"] | None = None,
    satellite: str | None = None,
    confidence: str | None = None,
    vegetation_only: bool = True,
    scope: Literal["world", "africa", "gabon"] = "world",
    all_points: bool = Query(default=False, description="tous les points individuels (jusqu'à 60 000, les plus intenses d'abord)"),
) -> dict:
    f = common_filters(start_date=start_date, end_date=end_date, bbox=None, sensor_family=sensor, sensor=None,
                       satellite=satellite, confidence=confidence, vegetation_only=vegetation_only)
    try:
        west, south, east, north = map(float, bbox.split(","))
        if not all(map(math.isfinite, (west, south, east, north))):
            raise ValueError
        if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south < north <= 90):
            raise ValueError
    except ValueError as exc:
        raise HTTPException(422, "Emprise invalide : west,south,east,north.") from exc
    params = dict(f.params, west=west, south=south, east=east, north=north)
    clauses = [f.where, "h.latitude BETWEEN :south AND :north"]
    if west <= east:
        clauses.append("h.longitude BETWEEN :west AND :east")
    else:  # emprise qui traverse l'antiméridien
        clauses.append("(h.longitude BETWEEN :west AND 180 OR h.longitude BETWEEN -180 AND :east)")
    if scope != "world":
        region = (8.5, -4.1, 14.6, 2.4) if scope == "gabon" else (-20, -36, 53, 38)
        params.update(dict(sw=region[0], ss=region[1], se=region[2], sn=region[3]))
        clauses.append("h.longitude BETWEEN :sw AND :se AND h.latitude BETWEEN :ss AND :sn")
    where = " AND ".join(clauses)
    table = "firewatch.harmonized_detections h"
    total = (await db.execute(text(f"SELECT COUNT(*) FROM {table} WHERE {where}"), params)).scalar_one()
    cell = None
    # Points individuels dès le zoom 7 (≈ échelle d'une province) si le volume le permet.
    if all_points or (zoom >= 7 and total <= 5000):
        limit = 60000 if all_points else 5001
        order = "h.frp_mw DESC NULLS LAST, h.detection_id" if all_points else "h.acquired_at, h.detection_id"
        rows = (await db.execute(text(f"""
            SELECT h.detection_id AS id, h.sensor_family AS sensor, h.satellite_code, h.confidence_level,
                   h.is_vegetation, h.group_id, h.longitude, h.latitude, h.frp_mw, h.acquired_at, h.daynight
            FROM {table} WHERE {where} ORDER BY {order} LIMIT {limit}
        """), params)).mappings().all()
        mode = "detections"
        features = [dict(type="Feature", geometry=dict(type="Point", coordinates=[r["longitude"], r["latitude"]]),
                         properties=dict(id=str(r["id"]), sensor=r["sensor"], satellite=r["satellite_code"],
                                         confidence=r["confidence_level"], vegetation=r["is_vegetation"],
                                         grouped=r["group_id"] is not None, count=1, frp=r["frp_mw"],
                                         time=r["acquired_at"].isoformat() if r["acquired_at"] else None,
                                         daynight=r["daynight"])) for r in rows]
    else:
        mode = "aggregates"
        # Cellules deux fois plus fines qu'avant : des agrégats plus précis, bornés à 6 000 formes.
        cell = max(0.02, 360 / 2 ** (zoom + 6))
        while True:
            params["cell"] = cell
            rows = (await db.execute(text(f"""
                SELECT floor(h.longitude/:cell) AS x, floor(h.latitude/:cell) AS y,
                       AVG(h.longitude) AS longitude, AVG(h.latitude) AS latitude,
                       COUNT(*) AS count,
                       COUNT(DISTINCT h.grid_cell_id) AS active_cells,
                       COUNT(*) FILTER (WHERE h.sensor_family='MODIS') AS modis,
                       COUNT(*) FILTER (WHERE h.sensor_family='VIIRS') AS viirs,
                       MAX(h.frp_mw) AS max_frp, MAX(h.acquired_at) AS last_time
                FROM {table} WHERE {where}
                GROUP BY x,y ORDER BY x,y LIMIT 6001
            """), params)).mappings().all()
            if len(rows) <= 6000:
                break
            cell *= 2
        features = [dict(type="Feature", geometry=dict(type="Point", coordinates=[r["longitude"], r["latitude"]]),
                         properties=dict(count=r["count"], active_cells=r["active_cells"], modis=r["modis"],
                                         viirs=r["viirs"], cell_degrees=cell, max_frp=r["max_frp"],
                                         key=f"{int(r['x'])}_{int(r['y'])}",
                                         last_time=r["last_time"].isoformat() if r["last_time"] else None,
                                         bbox=[r["x"] * cell, r["y"] * cell, (r["x"] + 1) * cell, (r["y"] + 1) * cell]))
                    for r in rows]
    represented = sum(f_["properties"]["count"] for f_ in features)
    return dict(type="FeatureCollection", features=features, meta=dict(
        mode=mode, total=total, represented=represented, partial=represented != total,
        cell_degrees=cell, scope=scope, filters=f.description,
    ))


@router.get("/region")
async def region(
    db: Annotated[AsyncSession, Depends(get_db)],
    bbox: str = Query(description="lon_min,lat_min,lon_max,lat_max de la région cliquée"),
    start_date: date | None = None,
    end_date: date | None = None,
    sensor: Literal["MODIS", "VIIRS"] | None = None,
    satellite: str | None = None,
    confidence: str | None = None,
    vegetation_only: bool = True,
) -> dict:
    """Synthèse d'une région cliquée sur la carte : volumes, pic de chaleur, jour le plus actif, dernière détection."""
    f = common_filters(start_date=start_date, end_date=end_date, bbox=bbox, sensor_family=sensor, sensor=None,
                       satellite=satellite, confidence=confidence, vegetation_only=vegetation_only)
    table = "firewatch.harmonized_detections h"
    totals = (await db.execute(text(f"""
        SELECT COUNT(*) AS detections, COUNT(DISTINCT h.grid_cell_id) AS active_cells,
               COUNT(*) FILTER (WHERE h.sensor_family = 'MODIS') AS modis,
               COUNT(*) FILTER (WHERE h.sensor_family = 'VIIRS') AS viirs,
               COUNT(*) FILTER (WHERE h.daynight = 'D') AS day, COUNT(*) FILTER (WHERE h.daynight = 'N') AS night,
               COUNT(*) FILTER (WHERE h.confidence_level = 'high') AS high_confidence,
               ROUND(AVG(h.frp_mw)::numeric, 1) AS mean_frp,
               MIN(h.acquired_at) AS first_time, MAX(h.acquired_at) AS last_time,
               COUNT(DISTINCT h.acquired_at::date) AS active_days
        FROM {table} WHERE {f.where}"""), f.params)).mappings().one()
    peak = (await db.execute(text(f"""
        SELECT h.frp_mw, h.latitude, h.longitude, h.acquired_at, h.satellite_code
        FROM {table} WHERE {f.where} AND h.frp_mw IS NOT NULL
        ORDER BY h.frp_mw DESC LIMIT 1"""), f.params)).mappings().first()
    busiest = (await db.execute(text(f"""
        SELECT h.acquired_at::date AS day, COUNT(*) AS detections
        FROM {table} WHERE {f.where} GROUP BY 1 ORDER BY 2 DESC, 1 DESC LIMIT 1"""), f.params)).mappings().first()
    month = (await db.execute(text(f"""
        SELECT EXTRACT(MONTH FROM h.acquired_at)::int AS month, COUNT(DISTINCT h.grid_cell_id) AS cells
        FROM {table} WHERE {f.where} GROUP BY 1 ORDER BY 2 DESC LIMIT 1"""), f.params)).mappings().first()
    return {"bbox": bbox, **dict(totals), "peak_frp": dict(peak) if peak else None,
            "busiest_day": dict(busiest) if busiest else None, "peak_month": dict(month) if month else None,
            "filters": f.description}
