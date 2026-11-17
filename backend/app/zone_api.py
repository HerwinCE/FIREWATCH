"""Fenêtre d'une zone cliquée sur la carte : pays, région (carreau) ou province.

Une même requête renvoie la synthèse sur la période choisie, une série temporelle (jour / mois / année
selon la durée), le détail par province et par satellite, et le calendrier de feu complet de la zone.
"""

import calendar
import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.filters import common_filters
from app.services.boundaries import load_provinces, province, provinces_intersecting
from app.services.history import covered_days, period_coverage

router = APIRouter(prefix="/api/map", tags=["map"])
TABLE = "firewatch.harmonized_detections h"


class ZoneRequest(BaseModel):
    kind: Literal["country", "region", "province"] = "country"
    iso: str | None = Field(default=None, max_length=3)
    name: str = Field(max_length=120)
    name_en: str | None = Field(default=None, max_length=120)
    # Anneaux extérieurs (lon, lat) : frontières Mapbox pour un pays, rectangle pour une région.
    polygons: list[list[list[float]]] | None = Field(default=None, max_length=400)
    start_date: date | None = None
    end_date: date | None = None
    sensor: Literal["MODIS", "VIIRS"] | None = None
    satellite: str | None = None
    confidence: str | None = None
    vegetation_only: bool = True


def polygon_sql(polygons: list[list[list[float]]], params: dict, prefix: str = "poly") -> tuple[str, tuple]:
    """Test « point dans la zone » avec le type polygon natif de PostgreSQL (sans PostGIS)."""
    clauses, xs, ys = [], [], []
    for i, ring in enumerate(polygons):
        pts = [(float(x), float(y)) for x, y, *_ in ring if -180 <= x <= 180 and -90 <= y <= 90]
        if len(pts) < 3:
            continue
        xs += [p[0] for p in pts]
        ys += [p[1] for p in pts]
        params[f"{prefix}{i}"] = "(" + ",".join(f"({x},{y})" for x, y in pts) + ")"
        clauses.append(f"CAST(CAST(:{prefix}{i} AS text) AS polygon) @> point(h.longitude, h.latitude)")
    if not clauses:
        raise HTTPException(422, "Géométrie de la zone vide.")
    return "(" + " OR ".join(clauses) + ")", (min(xs), min(ys), max(xs), max(ys))


def _months(start: date, end: date):
    d = date(start.year, start.month, 1)
    while d <= end:
        last = date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])
        yield d, last
        d = last + timedelta(days=1)


async def _archive_countries(db: AsyncSession) -> set[str]:
    files = (await db.execute(text(
        "SELECT r.request_parameters->>'file' FROM firewatch.ingestion_runs r JOIN firewatch.sources s "
        "ON s.id = r.source_id WHERE s.data_type = 'ARCHIVE'"))).scalars().all()
    return {re.sub(r"\.csv$", "", fp.replace("\\", "/").split("/")[-1]).split("_", 2)[-1].lower() for fp in files if fp}


@router.post("/zone")
@router.post("/country")
async def zone(body: ZoneRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    if body.kind == "province":
        p = province(body.iso or "", body.name)
        if p is None:
            raise HTTPException(404, "Province inconnue.")
        polygons = p["polygons"]
    elif body.polygons:
        polygons = body.polygons
    else:
        raise HTTPException(422, "Fournissez la géométrie de la zone.")

    filters = dict(bbox=None, sensor_family=body.sensor, sensor=None, satellite=body.satellite,
                   confidence=body.confidence, vegetation_only=body.vegetation_only)
    f_all = common_filters(start_date=None, end_date=None, **filters)
    f_per = common_filters(start_date=body.start_date, end_date=body.end_date, **filters)
    params = {**f_all.params, **f_per.params}
    inside, bbox = polygon_sql(polygons, params)
    w, s, e, n = bbox
    params.update(bw=w, bs=s, be=e, bn=n)
    space = f"h.longitude BETWEEN :bw AND :be AND h.latitude BETWEEN :bs AND :bn AND {inside}"

    # Les archives sont des fichiers PAR PAYS : un pays voisin ne doit pas hériter des archives du Gabon
    # captées par des frontières simplifiées. Régions et provinces gardent les archives situées dans leur emprise.
    if body.kind == "country" and not ({body.name.lower(), (body.name_en or "").lower()} & await _archive_countries(db)):
        space += " AND h.quality_level = 'NRT'"
    where_all = f"{f_all.where} AND {space}"
    where = f"{f_per.where} AND {space}"

    totals = (await db.execute(text(f"""
        SELECT COUNT(*) AS detections, COUNT(DISTINCT h.grid_cell_id) AS active_cells,
               COUNT(*) FILTER (WHERE h.sensor_family = 'MODIS') AS modis,
               COUNT(*) FILTER (WHERE h.sensor_family = 'VIIRS') AS viirs,
               COUNT(*) FILTER (WHERE h.daynight = 'D') AS day, COUNT(*) FILTER (WHERE h.daynight = 'N') AS night,
               ROUND(AVG(h.frp_mw)::numeric, 1) AS mean_frp, MAX(h.frp_mw) AS max_frp,
               MIN(h.acquired_at) AS first_time, MAX(h.acquired_at) AS last_time,
               COUNT(DISTINCT h.acquired_at::date) AS active_days
        FROM {TABLE} WHERE {where}"""), params)).mappings().one()
    has_archive = bool((await db.execute(text(
        f"SELECT EXISTS (SELECT 1 FROM {TABLE} WHERE {where_all} AND h.quality_level = 'SP')"), params)).scalar())
    peak = (await db.execute(text(f"""
        SELECT h.frp_mw, h.latitude, h.longitude, h.acquired_at, h.satellite_code FROM {TABLE}
        WHERE {where} AND h.frp_mw IS NOT NULL ORDER BY h.frp_mw DESC LIMIT 1"""), params)).mappings().first()
    busiest = (await db.execute(text(f"""
        SELECT h.acquired_at::date AS day, COUNT(*) AS detections FROM {TABLE}
        WHERE {where} GROUP BY 1 ORDER BY 2 DESC, 1 DESC LIMIT 1"""), params)).mappings().first()
    by_satellite = (await db.execute(text(f"""
        SELECT h.satellite_code, h.sensor_family, COUNT(*) AS detections, COUNT(DISTINCT h.grid_cell_id) AS active_cells,
               ROUND(AVG(h.frp_mw)::numeric, 1) AS mean_frp, MAX(h.frp_mw) AS max_frp
        FROM {TABLE} WHERE {where} GROUP BY 1, 2 ORDER BY 2, 1"""), params)).mappings().all()

    # Série temporelle : granularité adaptée à la durée analysée.
    first = body.start_date or (totals["first_time"].date() if totals["first_time"] else None)
    last = body.end_date or (totals["last_time"].date() if totals["last_time"] else None)
    span = (last - first).days if first and last else 0
    granularity = "day" if span <= 92 else "month" if span <= 3 * 366 else "year"
    series = (await db.execute(text(f"""
        SELECT date_trunc('{granularity}', h.acquired_at)::date AS period, COUNT(*) AS detections,
               COUNT(DISTINCT h.grid_cell_id) AS active_cells, MAX(h.frp_mw) AS max_frp,
               COUNT(DISTINCT h.acquired_at::date) AS active_days
        FROM {TABLE} WHERE {where} GROUP BY 1 ORDER BY 1"""), params)).mappings().all()

    # Provinces recoupant la zone (une seule passe, CASE sur les polygones de province).
    provinces = []
    if body.kind != "province":
        candidates = provinces_intersecting(bbox)
        if body.kind == "country":
            # Un pays ne liste que SES provinces (pas celles d'un voisin dont l'emprise le recoupe).
            candidates = [(iso, p) for iso, p in candidates if iso == (body.iso or "").upper()]
        if candidates:
            cases = []
            for i, (iso, p) in enumerate(candidates):
                test, _ = polygon_sql(p["polygons"], params, prefix=f"prov{i}_")
                params[f"pname{i}"] = f"{iso}|{p['name']}"
                cases.append(f"WHEN {test} THEN :pname{i}")
            rows = (await db.execute(text(f"""
                SELECT CASE {' '.join(cases)} END AS province, COUNT(*) AS detections,
                       COUNT(DISTINCT h.grid_cell_id) AS active_cells, MAX(h.frp_mw) AS max_frp,
                       COUNT(DISTINCT h.acquired_at::date) AS active_days
                FROM {TABLE} WHERE {where} GROUP BY 1"""), params)).mappings().all()
            counts = {r["province"]: r for r in rows if r["province"]}
            for iso, p in candidates:
                r = counts.get(f"{iso}|{p['name']}")
                provinces.append({"iso": iso, "name": p["name"], "detections": r["detections"] if r else 0,
                                  "active_cells": r["active_cells"] if r else 0,
                                  "max_frp": r["max_frp"] if r else None, "active_days": r["active_days"] if r else 0})
            provinces.sort(key=lambda x: -x["active_cells"])

    # Calendrier complet (toute la période disponible), indépendant de la durée choisie.
    monthly = (await db.execute(text(f"""
        SELECT date_trunc('month', h.acquired_at)::date AS period, COUNT(DISTINCT h.grid_cell_id) AS value
        FROM {TABLE} WHERE {where_all} GROUP BY 1"""), params)).mappings().all()
    today = datetime.now(timezone.utc).date()
    nrt = (await db.execute(text(
        "SELECT MIN(acquired_at)::date, MAX(acquired_at)::date FROM firewatch.harmonized_detections "
        "WHERE quality_level = 'NRT'"))).one()
    covered: set = set()
    for fam in ("MODIS", "VIIRS"):
        days = await covered_days(db, fam)
        if not has_archive:
            days = {d for d in days if nrt[0] and nrt[0] <= d <= nrt[1]}
        covered |= days
    values = {r["period"]: int(r["value"]) for r in monthly}
    calendar_items = []
    for m_first, m_last in _months(date(2000, 1, 1), today):
        status, share = period_coverage(m_first, m_last, "MODIS", covered, today)
        calendar_items.append({"period": m_first.isoformat(), "sensor_family": "MODIS+VIIRS",
                               "value": None if status in ("unavailable", "gap") else values.get(m_first, 0),
                               "coverage": status, "coverage_share": round(share, 3)})

    return {
        "kind": body.kind, "iso": body.iso, "name": body.name, "bbox": bbox, **dict(totals),
        "has_archive": has_archive, "has_province_data": bool(load_provinces()),
        "peak_frp": dict(peak) if peak else None, "busiest_day": dict(busiest) if busiest else None,
        "by_satellite": [dict(r) for r in by_satellite], "provinces": provinces,
        "series": {"granularity": granularity, "items": [dict(r) for r in series]},
        "calendar": calendar_items,
        "period": {"start": body.start_date, "end": body.end_date},
        "filters": f_per.description,
    }


# ---------------------------------------------------------------------------------------------------
# Points à afficher sur la carte, au format compact (≈ 4 fois plus léger que GeoJSON) :
# [longitude, latitude, FRP MW, satellite, confiance, végétation 0/1, jour 1/nuit 0, horodatage s, id]
# ---------------------------------------------------------------------------------------------------
POINTS_LIMIT = 60000
SAT_CODES = ["TERRA", "AQUA", "SNPP", "NOAA20", "NOAA21"]
CONF_CODES = ["low", "nominal", "high"]


async def _compact_points(db: AsyncSession, where: str, params: dict) -> dict:
    total = (await db.execute(text(f"SELECT COUNT(*) FROM {TABLE} WHERE {where}"), params)).scalar_one()
    rows = (await db.execute(text(f"""
        SELECT h.longitude, h.latitude, h.frp_mw, h.satellite_code, h.confidence_level, h.is_vegetation,
               h.daynight, EXTRACT(EPOCH FROM h.acquired_at)::bigint AS t, h.detection_id
        FROM {TABLE} WHERE {where}
        ORDER BY h.frp_mw DESC NULLS LAST, h.detection_id LIMIT {POINTS_LIMIT}"""), params)).all()
    points = [[round(r[0], 4), round(r[1], 4), None if r[2] is None else round(r[2], 1),
               SAT_CODES.index(r[3]) if r[3] in SAT_CODES else -1, CONF_CODES.index(r[4]) if r[4] in CONF_CODES else 1,
               1 if r[5] else 0, 1 if r[6] == "D" else 0, r[7], str(r[8])] for r in rows]
    return {"fields": ["lon", "lat", "frp", "satellite", "confidence", "vegetation", "day", "time", "id"],
            "satellites": SAT_CODES, "confidences": CONF_CODES,
            "points": points, "total": total, "shown": len(points), "partial": len(points) < total}


@router.post("/zone-points")
async def zone_points(body: ZoneRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    """Points d'une zone cliquée (pays, région, province) sur la période choisie dans sa fenêtre."""
    if body.kind == "province":
        p = province(body.iso or "", body.name)
        if p is None:
            raise HTTPException(404, "Province inconnue.")
        polygons = p["polygons"]
    elif body.polygons:
        polygons = body.polygons
    else:
        raise HTTPException(422, "Fournissez la géométrie de la zone.")
    f = common_filters(start_date=body.start_date, end_date=body.end_date, bbox=None, sensor_family=body.sensor,
                       sensor=None, satellite=body.satellite, confidence=body.confidence,
                       vegetation_only=body.vegetation_only)
    params = dict(f.params)
    inside, (w, s, e, n) = polygon_sql(polygons, params)
    params.update(bw=w, bs=s, be=e, bn=n)
    where = f"{f.where} AND h.longitude BETWEEN :bw AND :be AND h.latitude BETWEEN :bs AND :bn AND {inside}"
    if body.kind == "country" and not ({body.name.lower(), (body.name_en or "").lower()} & await _archive_countries(db)):
        where += " AND h.quality_level = 'NRT'"
    return await _compact_points(db, where, params)


@router.get("/all-points")
async def all_points(
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Literal["world", "africa", "gabon"] = "world",
    start_date: date | None = None, end_date: date | None = None,
    sensor: Literal["MODIS", "VIIRS"] | None = None,
    satellite: str | None = None, confidence: str | None = None, vegetation_only: bool = True,
) -> dict:
    """« Afficher tous les points » : toutes les détections de la vue (Monde, Afrique, Gabon), une seule fois,
    indépendamment des déplacements de la carte. Au-delà de 60 000, les plus intenses."""
    region = {"gabon": "8.5,-4.1,14.6,2.4", "africa": "-20,-36,53,38"}.get(scope)
    f = common_filters(start_date=start_date, end_date=end_date, bbox=region, sensor_family=sensor, sensor=None,
                       satellite=satellite, confidence=confidence, vegetation_only=vegetation_only)
    return await _compact_points(db, f.where, dict(f.params))


@router.get("/provinces")
async def provinces_geojson() -> dict:
    """Contours des provinces chargées, pour l'affichage sur la carte (source geoBoundaries, CC BY-SA 3.0)."""
    features = []
    for iso, provinces in load_provinces().items():
        for p in provinces:
            coords = [[ring] for ring in p["polygons"]]
            features.append({"type": "Feature", "properties": {"iso": iso, "name": p["name"]},
                             "geometry": {"type": "MultiPolygon", "coordinates": coords}})
    return {"type": "FeatureCollection", "features": features,
            "attribution": "geoBoundaries (gbOpen), CC BY-SA 3.0"}
