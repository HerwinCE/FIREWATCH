"""API de consultation, branchée sur la couche harmonisée (cahier des charges §7)."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.filters import Filters, common_filters, parse_bbox

router = APIRouter(prefix="/api", tags=["fire data"])
DbSession = Annotated[AsyncSession, Depends(get_db)]
CommonFilters = Annotated[Filters, Depends(common_filters)]

POINT_CENTROID = (
    "json_build_object('type', 'Point', 'coordinates', "
    "json_build_array(e.centroid_longitude, e.centroid_latitude))"
)
SATELLITE_LABELS = {
    "TERRA": "MODIS Terra", "AQUA": "MODIS Aqua", "SNPP": "VIIRS Suomi-NPP",
    "NOAA20": "VIIRS NOAA-20", "NOAA21": "VIIRS NOAA-21",
}
HD_FIELDS = """
    h.detection_id AS id, h.acquired_at AS acquisition_time, h.latitude, h.longitude,
    h.satellite_code, h.sensor_family AS sensor, h.native_resolution_m, h.quality_level,
    h.confidence_raw, h.confidence_level, h.frp_mw AS frp, h.daynight, h.detection_type,
    h.is_vegetation, h.type_basis, h.grid_cell_id, h.group_id, h.source_product
"""


async def _harmonization_info(db: AsyncSession) -> dict | None:
    row = (await db.execute(text(
        """SELECT id AS run_id, version, finished_at FROM firewatch.harmonization_runs
           WHERE status = 'success' ORDER BY id DESC LIMIT 1"""))).mappings().first()
    return dict(row) if row else None


@router.get("/metadata")
async def metadata(db: DbSession) -> dict:
    result = await db.execute(text(
        """SELECT name, sensor, satellite, product_name, resolution_meters, data_type
           FROM firewatch.sources WHERE active = TRUE ORDER BY sensor, satellite"""))
    return {"sources": [dict(row) for row in result.mappings().all()]}


@router.get("/detections")
async def detections(
    db: DbSession,
    f: CommonFilters,
    limit: int = Query(default=100, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
) -> dict:
    result = await db.execute(
        text(f"""SELECT {HD_FIELDS} FROM firewatch.harmonized_detections h WHERE {f.where}
                 ORDER BY h.acquired_at DESC, h.detection_id LIMIT :limit OFFSET :offset"""),
        {**f.params, "limit": limit, "offset": offset},
    )
    return {"items": [dict(r) for r in result.mappings().all()], "limit": limit, "offset": offset,
            "filters": f.description}


@router.get("/detections/clusters")
async def clusters(
    db: DbSession,
    f: CommonFilters,
    min_sensors: int = Query(default=2, ge=2, le=5),
    limit: int = Query(default=100, ge=1, le=1000),
) -> dict:
    """Groupes de rapprochement inter-capteurs (EF-20) : « rapprochement possible », jamais « même incendie »."""
    result = await db.execute(text(f"""
        SELECT h.group_id, AVG(h.latitude) AS latitude, AVG(h.longitude) AS longitude,
               COUNT(*) AS detection_count, COUNT(DISTINCT h.satellite_code) AS sensor_count,
               array_agg(DISTINCT h.satellite_code) AS satellites,
               MIN(h.acquired_at) AS start_time, MAX(h.acquired_at) AS end_time,
               ROUND(EXTRACT(EPOCH FROM MAX(h.acquired_at) - MIN(h.acquired_at)) / 60) AS max_delta_minutes,
               json_agg(json_build_object('id', h.detection_id, 'satellite', h.satellite_code,
                                          'acquired_at', h.acquired_at) ORDER BY h.acquired_at) AS members
        FROM firewatch.harmonized_detections h
        WHERE h.group_id IS NOT NULL AND {f.where}
        GROUP BY h.group_id
        HAVING COUNT(DISTINCT h.satellite_code) >= :min_sensors
        ORDER BY MIN(h.acquired_at) DESC
        LIMIT :limit"""), {**f.params, "min_sensors": min_sensors, "limit": limit})
    items = [dict(r) | {"label": "rapprochement possible"} for r in result.mappings().all()]
    return {"items": items, "filters": f.description}


@router.get("/detections/{detection_id}")
async def detection(detection_id: UUID, db: DbSession) -> dict:
    result = await db.execute(text(f"""
        SELECT {HD_FIELDS}, d.external_id, d.satellite AS satellite_raw, d.instrument,
               h.is_superseded, h.harmonization_run_id, r.version AS harmonization_version,
               raw.payload AS original_data
        FROM firewatch.harmonized_detections h
        LEFT JOIN firewatch.detections d ON d.id = h.detection_id
        LEFT JOIN firewatch.harmonization_runs r ON r.id = h.harmonization_run_id
        LEFT JOIN firewatch.raw_detections raw ON raw.id = d.raw_detection_id
        WHERE h.detection_id = :detection_id"""), {"detection_id": detection_id})
    item = result.mappings().first()
    if item is None:
        raise HTTPException(status_code=404, detail="Détection introuvable.")
    item = dict(item)
    item["satellite_label"] = SATELLITE_LABELS.get(item["satellite_code"], item["satellite_code"])
    if item["group_id"] is not None:
        others = await db.execute(text(
            """SELECT detection_id AS id, satellite_code, acquired_at FROM firewatch.harmonized_detections
               WHERE group_id = :g AND detection_id <> :id ORDER BY acquired_at LIMIT 50"""),
            {"g": item["group_id"], "id": detection_id})
        item["group_members"] = [dict(r) for r in others.mappings().all()]
    return item


@router.get("/statistics/summary")
@router.get("/statistics")
async def summary(db: DbSession, f: CommonFilters) -> dict:
    """Totaux harmonisés (EF-01) : détections, cellules actives de 0,01°, répartition par capteur, fraîcheur."""
    totals = (await db.execute(text(f"""
        SELECT COUNT(*) AS total_detections,
               COUNT(DISTINCT h.grid_cell_id) AS active_cells,
               COUNT(*) FILTER (WHERE h.sensor_family = 'MODIS') AS modis,
               COUNT(*) FILTER (WHERE h.sensor_family = 'VIIRS') AS viirs,
               COUNT(DISTINCT h.grid_cell_id) FILTER (WHERE h.sensor_family = 'MODIS') AS modis_cells,
               COUNT(DISTINCT h.grid_cell_id) FILTER (WHERE h.sensor_family = 'VIIRS') AS viirs_cells,
               COUNT(DISTINCT h.satellite_code) AS satellites,
               COUNT(DISTINCT h.acquired_at::date) AS active_days,
               COALESCE(SUM(h.frp_mw), 0) AS total_frp,
               MAX(h.acquired_at) AS last_observation,
               COUNT(DISTINCT h.group_id) AS cross_sensor_groups
        FROM firewatch.harmonized_detections h WHERE {f.where}"""), f.params)).mappings().one()
    by_satellite = (await db.execute(text(f"""
        SELECT h.satellite_code, h.sensor_family, COUNT(*) AS detections,
               COUNT(DISTINCT h.grid_cell_id) AS active_cells
        FROM firewatch.harmonized_detections h WHERE {f.where}
        GROUP BY 1, 2 ORDER BY 2, 1"""), f.params)).mappings().all()
    non_veg = f.with_vegetation(False)
    excluded = (await db.execute(text(
        f"SELECT COUNT(*) FROM firewatch.harmonized_detections h WHERE {non_veg.where}"),
        non_veg.params)).scalar_one()
    mask_cells = (await db.execute(text("SELECT COUNT(*) FROM firewatch.static_source_mask"))).scalar_one()
    freshness = (await db.execute(text("""
        SELECT s.product_name AS product, s.name AS source, MAX(r.finished_at) AS last_success
        FROM firewatch.ingestion_runs r JOIN firewatch.sources s ON s.id = r.source_id
        WHERE r.status IN ('SUCCEEDED', 'PARTIAL') AND r.records_received > 0
        GROUP BY 1, 2 ORDER BY 1"""))).mappings().all()
    return {
        **dict(totals),
        "by_satellite": [dict(r) | {"label": SATELLITE_LABELS.get(r["satellite_code"])} for r in by_satellite],
        "non_vegetation_excluded": excluded,
        "static_mask_cells": mask_cells,
        "freshness": [dict(r) for r in freshness],
        "harmonization": await _harmonization_info(db),
        "filters": f.description,
    }


@router.get("/statistics/timeline")
async def timeline(db: DbSession, f: CommonFilters) -> dict:
    """Série quotidienne (UTC) par famille de capteur : détections et cellules actives."""
    result = await db.execute(text(f"""
        SELECT h.acquired_at::date AS day, h.sensor_family AS sensor,
               COUNT(*) AS detections, COUNT(DISTINCT h.grid_cell_id) AS active_cells,
               COALESCE(SUM(h.frp_mw), 0) AS total_frp
        FROM firewatch.harmonized_detections h WHERE {f.where}
        GROUP BY 1, 2 ORDER BY 1, 2"""), f.params)
    return {"items": [dict(r) for r in result.mappings().all()], "filters": f.description}


@router.get("/statistics/satellites")
async def satellites(db: DbSession, f: CommonFilters) -> dict:
    """Comparaison des capteurs (EF-25) : les cellules actives sont la métrique comparable."""
    rows = (await db.execute(text(f"""
        SELECT h.satellite_code, h.sensor_family AS sensor, COUNT(*) AS detections,
               COUNT(DISTINCT h.grid_cell_id) AS active_cells, COALESCE(SUM(h.frp_mw), 0) AS total_frp
        FROM firewatch.harmonized_detections h WHERE {f.where}
        GROUP BY 1, 2 ORDER BY 2, 1"""), f.params)).mappings().all()
    families = (await db.execute(text(f"""
        SELECT h.sensor_family, COUNT(*) AS detections, COUNT(DISTINCT h.grid_cell_id) AS active_cells
        FROM firewatch.harmonized_detections h WHERE {f.where} GROUP BY 1"""), f.params)).mappings().all()
    fam = {r["sensor_family"]: dict(r) for r in families}
    modis, viirs = fam.get("MODIS"), fam.get("VIIRS")
    ratio = (round(viirs["active_cells"] / modis["active_cells"], 2)
             if modis and viirs and modis["active_cells"] else None)
    return {
        "items": [dict(r) | {"satellite": SATELLITE_LABELS.get(r["satellite_code"], r["satellite_code"])}
                  for r in rows],
        "families": list(fam.values()),
        "ratio_viirs_modis_cells": ratio,
        "filters": f.description,
    }


@router.get("/analytics/hotspots")
async def hotspots(
    db: DbSession,
    f: CommonFilters,
    grid_size: float = Query(default=1.0, gt=0, le=10),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    """Zones de concentration (EF-29/30) : carreaux de grid_size degrés, classés par cellules actives."""
    result = await db.execute(text(f"""
        SELECT floor(h.longitude / :grid_size) * :grid_size AS grid_lon,
               floor(h.latitude / :grid_size) * :grid_size AS grid_lat,
               COUNT(DISTINCT h.grid_cell_id) AS active_cells,
               COUNT(*) AS detections,
               COUNT(DISTINCT h.acquired_at::date) AS active_days,
               COALESCE(SUM(h.frp_mw), 0) AS total_frp
        FROM firewatch.harmonized_detections h WHERE {f.where}
        GROUP BY 1, 2 ORDER BY active_cells DESC, detections DESC LIMIT :limit"""),
        {**f.params, "grid_size": grid_size, "limit": limit})
    return {"items": [dict(r) for r in result.mappings().all()], "filters": f.description}


# --- Événements (méthode expérimentale antérieure, fenêtres de 6 h) -----------------
@router.get("/events")
async def events(
    db: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
    bbox: str | None = None,
    method_version: str = "spatiotemporal-v1.0",
    limit: int = Query(default=100, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
) -> dict:
    clauses = ["1=1"]
    params: dict = {"limit": limit, "offset": offset, "method_version": method_version}
    if method_version != "all":
        clauses.append("e.method_version = :method_version")
    if start_date:
        clauses.append("e.end_time >= :start_date")
        params["start_date"] = start_date
    if end_date:
        clauses.append("e.start_time < (CAST(:end_date AS date) + INTERVAL '1 day')")
        params["end_date"] = end_date
    if bbox:
        west, south, east, north = parse_bbox(bbox)
        clauses.append("e.centroid_longitude BETWEEN :west AND :east AND e.centroid_latitude BETWEEN :south AND :north")
        params.update({"west": west, "south": south, "east": east, "north": north})
    result = await db.execute(text(f"""
        SELECT e.id, e.event_code, e.start_time, e.end_time, e.detection_count, e.sensor_count, e.max_frp,
               e.mean_confidence, e.harmonization_score, e.method_version, e.status, {POINT_CENTROID} AS centroid
        FROM firewatch.harmonized_events e
        WHERE {" AND ".join(clauses)}
        ORDER BY e.start_time DESC LIMIT :limit OFFSET :offset"""), params)
    return {"items": [dict(row) for row in result.mappings().all()], "limit": limit, "offset": offset}


@router.get("/events/{event_id}")
async def event(event_id: UUID, db: DbSession) -> dict:
    event_row = (await db.execute(text(f"""
        SELECT e.id, e.event_code, e.start_time, e.end_time, e.detection_count, e.sensor_count, e.max_frp,
               e.mean_confidence, e.harmonization_score, e.method_version, e.status, {POINT_CENTROID} AS centroid
        FROM firewatch.harmonized_events e WHERE e.id = :event_id"""), {"event_id": event_id})).mappings().first()
    if event_row is None:
        raise HTTPException(status_code=404, detail="Événement introuvable.")
    detections_result = await db.execute(text("""
        SELECT d.id, d.sensor, d.satellite, d.acquisition_time, d.latitude, d.longitude, d.confidence, d.frp,
               ed.distance_km, ed.time_difference_hours, ed.association_score
        FROM firewatch.event_detections ed JOIN firewatch.detections d ON d.id = ed.detection_id
        WHERE ed.event_id = :event_id ORDER BY d.acquisition_time"""), {"event_id": event_id})
    response = dict(event_row)
    response["detections"] = [dict(row) for row in detections_result.mappings().all()]
    return response
