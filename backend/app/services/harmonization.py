"""Exécution du pipeline d'harmonisation sur la base (cahier des charges §3.3.1, EF-16 à EF-21).

Entrée : firewatch.detections (brut, jamais modifié).
Sortie : firewatch.harmonized_detections + une ligne dans firewatch.harmonization_runs.
"""

from __future__ import annotations

import asyncio
import json
import math
import time
from datetime import datetime, timedelta, timezone

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

LINK_COLUMNS = "detection_id, latitude, longitude, acquired_at, satellite_code, quality_level"
HD_COLUMNS = [
    "detection_id", "harmonization_run_id", "acquired_at", "latitude", "longitude",
    "satellite_code", "sensor_family", "native_resolution_m", "quality_level",
    "confidence_raw", "confidence_level", "detection_type", "is_vegetation", "type_basis",
    "grid_cell_id", "frp_mw", "daynight", "source_product", "group_id", "is_superseded",
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


def _day_ranges(times, pad_days: int) -> list[tuple]:
    """Jours touchés (± pad_days), fusionnés en plages contiguës [début, fin)."""
    days = sorted({t.date() for t in times})
    ranges: list[list] = []
    for d in days:
        a, b = d - timedelta(days=pad_days), d + timedelta(days=pad_days + 1)
        if ranges and a <= ranges[-1][1]:
            ranges[-1][1] = max(ranges[-1][1], b)
        else:
            ranges.append([a, b])
    return [(a, b) for a, b in ranges]


async def _window_rows(connection, parameters: dict, new_times: list) -> tuple[list[dict], int]:
    """Détections existantes qu'une nouvelle détection peut affecter : les jours touchés (± la fenêtre
    de rapprochement) et tous les membres des groupes qui y passent (un groupe peut s'y scinder ou s'y relier)."""
    pad = max(parameters["cluster_max_hours"] / 24, SUPERSESSION_MAX_MINUTES / 1440)
    ranges = _day_ranges(new_times, math.ceil(pad))
    starts = [datetime(a.year, a.month, a.day, tzinfo=timezone.utc) for a, _ in ranges]
    ends = [datetime(b.year, b.month, b.day, tzinfo=timezone.utc) for _, b in ranges]
    rows = await connection.fetch(
        f"""
        WITH win AS (
            SELECT h.* FROM firewatch.harmonized_detections h
            JOIN unnest($1::timestamptz[], $2::timestamptz[]) AS r(a, b) ON h.acquired_at >= r.a AND h.acquired_at < r.b
        )
        SELECT {LINK_COLUMNS}, group_id, is_superseded FROM win
        UNION
        SELECT {LINK_COLUMNS}, group_id, is_superseded FROM firewatch.harmonized_detections
        WHERE group_id IN (SELECT DISTINCT group_id FROM win WHERE group_id IS NOT NULL)
        """,
        starts, ends,
    )
    offset = await connection.fetchval("SELECT COALESCE(MAX(group_id), 0) FROM firewatch.harmonized_detections")
    return [dict(r) for r in rows], offset


def _numbering(links: list[tuple], existing: list[dict], offset: int) -> dict:
    """Numéros de groupe stables : un groupe recalculé garde le plus petit numéro qu'avaient ses membres
    (s'il n'est pas déjà repris par un autre morceau d'un groupe scindé) ; sinon il reçoit un numéro neuf
    au-delà des existants. Ainsi, seules les lignes dont le groupe change réellement sont réécrites."""
    old = {p["detection_id"]: p.get("group_id") for p in existing}
    members: dict[int, list] = {}
    for key, g, _ in links:
        if g is not None:
            members.setdefault(g, []).append(key)
    taken: set = set()
    fresh = offset
    number: dict[int, int] = {}
    for g in sorted(members):
        candidates = sorted({old[k] for k in members[g] if old.get(k) is not None} - taken)
        if candidates:
            number[g] = candidates[0]
        else:
            fresh += 1
            number[g] = fresh
        taken.add(number[g])
    return {k: (number[g] if g is not None else None, sup) for k, g, sup in links}


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

                # Étapes 5 et 6 (supersession NRT -> SP, rapprochements inter-capteurs), calculées AVANT
                # l'insertion : les nouvelles lignes entrent déjà reliées, seules les anciennes qui changent
                # sont mises à jour. Mode complet : toute la couche ; incrémental : la seule partie qu'une
                # nouvelle détection peut modifier ; sans nouvelle détection, rien ne peut changer.
                new_points = [{"detection_id": r[0], "latitude": r[3], "longitude": r[4], "acquired_at": r[2],
                               "satellite_code": r[5], "quality_level": r[8]} for r in records]
                existing, offset = ([], 0) if mode == "full" or not records else                     await _window_rows(connection, parameters, [r[2] for r in records])
                links = await asyncio.to_thread(
                    _link, new_points + existing, parameters["cluster_max_km"], parameters["cluster_max_hours"])                     if records else []
                state = _numbering(links, existing, offset)
                if records:
                    await connection.copy_records_to_table(
                        "harmonized_detections", schema_name="firewatch", columns=HD_COLUMNS,
                        records=[r + state[r[0]] for r in records])
                if existing:
                    await connection.execute(
                        "CREATE TEMP TABLE tmp_links (detection_id UUID PRIMARY KEY, group_id BIGINT, is_superseded BOOLEAN) ON COMMIT DROP")
                    await connection.copy_records_to_table(
                        "tmp_links", records=[(p["detection_id"],) + state[p["detection_id"]] for p in existing])
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
