"""Export CSV des détections harmonisées filtrées (cahier des charges EF-28, §7.3)."""

import csv
import io
import re
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal, get_db
from app.filters import Filters, common_filters

router = APIRouter(prefix="/api/export", tags=["export"])

MAX_ROWS = 200_000
GABON_BBOX = (8.5, -4.1, 14.6, 2.4)
COLUMNS = [
    "id", "latitude", "longitude", "acquired_at_utc", "satellite", "instrument", "native_resolution_m",
    "quality_level", "confidence_raw", "confidence_level", "frp_mw", "daynight", "detection_type",
    "type_basis", "is_vegetation", "grid_cell_id", "group_id", "source_product", "harmonization_version",
]
QUERY = """
    SELECT h.detection_id AS id, h.latitude, h.longitude,
           to_char(h.acquired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS acquired_at_utc,
           h.satellite_code AS satellite, h.sensor_family AS instrument, h.native_resolution_m,
           h.quality_level, h.confidence_raw, h.confidence_level, h.frp_mw, h.daynight, h.detection_type,
           h.type_basis, h.is_vegetation, h.grid_cell_id, h.group_id, h.source_product,
           r.version AS harmonization_version
    FROM firewatch.harmonized_detections h
    JOIN firewatch.harmonization_runs r ON r.id = h.harmonization_run_id
    WHERE {where}
    ORDER BY h.acquired_at, h.detection_id
"""


def _zone_name(bbox: str | None) -> str:
    if not bbox:
        return "monde"
    values = tuple(float(v) for v in bbox.split(","))
    if values == GABON_BBOX:
        return "gabon"
    return "zone_" + re.sub(r"[^0-9.-]+", "_", bbox)


def _line(row: list) -> str:
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator="\r\n").writerow(
        ["" if v is None else ("true" if v is True else "false" if v is False else v) for v in row])
    return buffer.getvalue()


async def _stream(f: Filters) -> AsyncIterator[bytes]:
    # BOM UTF-8 : les accents s'ouvrent correctement dans Excel ; séparateur virgule, une ligne d'en-tête.
    yield ("﻿" + _line(COLUMNS)).encode("utf-8")
    async with SessionLocal() as session:
        result = await session.stream(text(QUERY.format(where=f.where)), f.params)
        batch: list[str] = []
        async for row in result:
            batch.append(_line(list(row)))
            if len(batch) >= 2000:
                yield "".join(batch).encode("utf-8")
                batch = []
        if batch:
            yield "".join(batch).encode("utf-8")


@router.get("/csv")
async def export_csv(db: Annotated[AsyncSession, Depends(get_db)], f: Annotated[Filters, Depends(common_filters)]):
    count = (await db.execute(
        text(f"SELECT COUNT(*) FROM firewatch.harmonized_detections h WHERE {f.where}"), f.params)).scalar_one()
    if count > MAX_ROWS:
        fr = lambda v: f"{v:,}".replace(",", " ")  # espace fine insécable
        raise HTTPException(413, f"{fr(count)} lignes : l'export est limité à {fr(MAX_ROWS)} lignes. "
                                 "Réduisez la zone, la période ou les capteurs.")
    start = f.description["start_date"] or "debut"
    end = f.description["end_date"] or "fin"
    filename = f"firewatch_{_zone_name(f.description['bbox'])}_{start}_{end}.csv"
    return StreamingResponse(
        _stream(f), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "X-Total-Count": str(count)},
    )
