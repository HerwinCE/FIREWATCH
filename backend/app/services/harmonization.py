"""Exécution du pipeline d'harmonisation sur la base (cahier des charges §3.3.1, EF-16 à EF-21).

Entrée : firewatch.detections (brut, jamais modifié).
Sortie : firewatch.harmonized_detections + une ligne dans firewatch.harmonization_runs.
"""

from __future__ import annotations

import asyncio
import json
import time

import asyncpg

from app.services.normalization import (
    DEFAULT_CLUSTER_MAX_HOURS,
    DEFAULT_CLUSTER_MAX_KM,
    GRID_SIZE_DEG,
    HARMONIZATION_VERSION,
    SUPERSESSION_MAX_DEG,
    SUPERSESSION_MAX_MINUTES,
    Point,
    cross_sensor_groups,
    harmonize_row,
    superseded_keys,
)
from app.settings import settings

HD_COLUMNS = [
    "detection_id", "harmonization_run_id", "acquired_at", "latitude", "longitude",
    "satellite_code", "sensor_family", "native_resolution_m", "quality_level",
    "confidence_raw", "confidence_level", "detection_type", "is_vegetation", "type_basis",
    "grid_cell_id", "frp_mw", "daynight", "source_product",
]


class HarmonizationBusy(RuntimeError):
    """Une exécution est déjà en cours."""


def connection_url() -> str:
    return settings.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


def build_parameters(cluster_max_km: float | None = None, cluster_max_hours: float | None = None) -> dict:
    return {
        "version": HARMONIZATION_VERSION,
        "grid_size_deg": GRID_SIZE_DEG,
        "confidence_modis": {"low": "0-29", "nominal": "30-79", "high": "80-100"},
        "confidence_viirs": {"low": "l", "nominal": "n", "high": "h"},
        "cluster_max_km": cluster_max_km or DEFAULT_CLUSTER_MAX_KM,
        "cluster_max_hours": cluster_max_hours or DEFAULT_CLUSTER_MAX_HOURS,
        "supersession": {"max_deg": SUPERSESSION_MAX_DEG, "max_minutes": SUPERSESSION_MAX_MINUTES},
    }


async def start_run(connection, mode: str, parameters: dict) -> int:
    """Crée la ligne d'exécution « running ». Lève HarmonizationBusy si une autre tourne."""
    # Une exécution « running » de plus d'une heure a été interrompue (arrêt du serveur…).
    await connection.execute(
        """
        UPDATE firewatch.harmonization_runs
        SET status = 'failed', finished_at = now(), error_message = 'Exécution interrompue'
        WHERE status = 'running' AND started_at < now() - INTERVAL '1 hour'
        """
    )
    try:
        return await connection.fetchval(
            """
            INSERT INTO firewatch.harmonization_runs (status, mode, version, parameters)
            VALUES ('running', $1, $2, $3::jsonb) RETURNING id
            """,
            mode, HARMONIZATION_VERSION, json.dumps(parameters),
        )
    except asyncpg.UniqueViolationError as exc:
        raise HarmonizationBusy("Une harmonisation est déjà en cours.") from exc


def _normalize(rows: list[dict], mask: dict[str, int], run_id: int) -> tuple[list[tuple], int]:
    records, rejected = [], 0
    for raw in rows:
        try:
            h = harmonize_row(raw, mask)
        except (KeyError, TypeError, ValueError):
            rejected += 1
            continue
        records.append((
            h.detection_id, run_id, h.acquired_at, h.latitude, h.longitude, h.satellite_code,
            h.sensor_family, h.native_resolution_m, h.quality_level, h.confidence_raw,
            h.confidence_level, h.detection_type, h.is_vegetation, h.type_basis, h.grid_cell_id,
            h.frp_mw, h.daynight, h.source_product,
        ))
    return records, rejected


def _link(rows: list[dict], max_km: float, max_hours: float) -> list[tuple]:
    points = [
        Point(r["detection_id"], r["latitude"], r["longitude"], r["acquired_at"].timestamp(),
              r["satellite_code"], r["quality_level"])
        for r in rows
    ]
    superseded = superseded_keys(points)
    # Les rapprochements portent sur la meilleure version disponible (NRT remplacées exclues).
    groups = cross_sensor_groups([p for p in points if p.key not in superseded], max_km, max_hours)
    return [(p.key, groups.get(p.key), p.key in superseded) for p in points]


async def execute_run(run_id: int, mode: str, parameters: dict) -> dict:
    """Exécute le pipeline pour une ligne harmonization_runs déjà créée."""
    started = time.monotonic()
    connection = await asyncpg.connect(connection_url())
    try:
        try:
            async with connection.transaction():
                await connection.execute("SET LOCAL statement_timeout = '15min'")
                if mode == "full":
                    await connection.execute("DELETE FROM firewatch.harmonized_detections")
                rows = await connection.fetch(
                    """
                    SELECT d.id, d.satellite, d.instrument, d.acquisition_time, d.latitude, d.longitude,
                           d.confidence, d.frp, d.daynight, d.source_product,
                           r.payload->>'type' AS firms_type, r.payload->>'version' AS version
                    FROM firewatch.detections d
                    LEFT JOIN firewatch.raw_detections r ON r.id = d.raw_detection_id
                    WHERE NOT EXISTS (
                        SELECT 1 FROM firewatch.harmonized_detections h WHERE h.detection_id = d.id
                    )
                    """
                )
                mask = {r["grid_cell_id"]: r["detection_type"] for r in await connection.fetch(
                    "SELECT grid_cell_id, detection_type FROM firewatch.static_source_mask")}
                records, rejected = await asyncio.to_thread(_normalize, [dict(r) for r in rows], mask, run_id)
                if records:
                    await connection.copy_records_to_table(
                        "harmonized_detections", schema_name="firewatch", records=records, columns=HD_COLUMNS)

                # Étapes 5 et 6 : recalculées sur toute la couche (un nouveau point peut relier d'anciens groupes).
                all_rows = await connection.fetch(
                    """SELECT detection_id, latitude, longitude, acquired_at, satellite_code, quality_level
                       FROM firewatch.harmonized_detections"""
                )
                links = await asyncio.to_thread(
                    _link, [dict(r) for r in all_rows],
                    parameters["cluster_max_km"], parameters["cluster_max_hours"],
                )
                await connection.execute(
                    "CREATE TEMP TABLE tmp_links (detection_id UUID, group_id BIGINT, is_superseded BOOLEAN) ON COMMIT DROP")
                await connection.copy_records_to_table("tmp_links", records=links)
                await connection.execute(
                    """
                    UPDATE firewatch.harmonized_detections h
                    SET group_id = t.group_id, is_superseded = t.is_superseded, harmonization_run_id = $1
                    FROM tmp_links t
                    WHERE h.detection_id = t.detection_id
                      AND (h.group_id IS DISTINCT FROM t.group_id OR h.is_superseded <> t.is_superseded)
                    """,
                    run_id,
                )
                stats = await connection.fetchrow(
                    """
                    SELECT COUNT(*) FILTER (WHERE is_vegetation AND NOT is_superseded) AS vegetation,
                           COUNT(*) FILTER (WHERE is_superseded) AS superseded,
                           COUNT(DISTINCT group_id) AS groups
                    FROM firewatch.harmonized_detections
                    """
                )
        except Exception as exc:  # journalise l'échec sans exposer de pile d'appels au client
            await connection.execute(
                """UPDATE firewatch.harmonization_runs
                   SET status = 'failed', finished_at = now(), duration_seconds = $2, error_message = $3
                   WHERE id = $1""",
                run_id, round(time.monotonic() - started, 2), f"{type(exc).__name__}: {exc}"[:500],
            )
            raise
        result = {
            "run_id": run_id,
            "status": "success",
            "rows_processed": len(rows),
            "rows_rejected": rejected,
            "rows_vegetation": stats["vegetation"],
            "rows_superseded": stats["superseded"],
            "groups_created": stats["groups"],
            "duration_seconds": round(time.monotonic() - started, 2),
        }
        await connection.execute(
            """UPDATE firewatch.harmonization_runs
               SET status = 'success', finished_at = now(), rows_processed = $2, rows_rejected = $3,
                   rows_vegetation = $4, rows_superseded = $5, groups_created = $6, duration_seconds = $7
               WHERE id = $1""",
            run_id, result["rows_processed"], rejected, result["rows_vegetation"],
            result["rows_superseded"], result["groups_created"], result["duration_seconds"],
        )
        return result
    finally:
        await connection.close()


async def run_harmonization(mode: str = "incremental", cluster_max_km: float | None = None,
                            cluster_max_hours: float | None = None) -> dict:
    """Crée l'exécution puis la lance (utilisé par le script en ligne de commande et après une collecte)."""
    if mode not in ("incremental", "full"):
        raise ValueError("mode doit valoir 'incremental' ou 'full'")
    parameters = build_parameters(cluster_max_km, cluster_max_hours)
    connection = await asyncpg.connect(connection_url())
    try:
        run_id = await start_run(connection, mode, parameters)
    finally:
        await connection.close()
    return await execute_run(run_id, mode, parameters)


async def latest_status(connection) -> dict | None:
    row = await connection.fetchrow(
        """SELECT id AS run_id, status, mode, version, started_at, finished_at, duration_seconds,
                  rows_processed, rows_rejected, rows_vegetation, rows_superseded, groups_created,
                  parameters, error_message
           FROM firewatch.harmonization_runs ORDER BY id DESC LIMIT 1"""
    )
    if row is None:
        return None
    result = dict(row)
    result["parameters"] = json.loads(result["parameters"]) if isinstance(result["parameters"], str) else result["parameters"]
    return result
