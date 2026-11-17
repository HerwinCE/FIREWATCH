"""Paramètres communs de filtrage sur la couche harmonisée (cahier des charges §7.1).

Toutes les requêtes portent sur firewatch.harmonized_detections (alias h), meilleure version
disponible uniquement (NRT remplacées par une SP exclues), végétation présumée par défaut.
"""

from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException, Query

SATELLITES = ("TERRA", "AQUA", "SNPP", "NOAA20", "NOAA21")
CONFIDENCES = ("low", "nominal", "high")


def parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    try:
        west, south, east, north = (float(v.strip()) for v in bbox.split(","))
        if not (-180 <= west <= east <= 180 and -90 <= south <= north <= 90):
            raise ValueError
    except ValueError as exc:
        raise HTTPException(422, "bbox doit respecter lon_min,lat_min,lon_max,lat_max avec des coordonnées valides.") from exc
    return west, south, east, north


def _closed_list(value: str | None, allowed: tuple[str, ...], name: str) -> list[str]:
    if not value:
        return []
    items = [v.strip() for v in value.split(",") if v.strip()]
    wrong = [v for v in items if v not in allowed]
    if wrong:
        raise HTTPException(422, f"{name} invalide : {', '.join(wrong)}. Valeurs possibles : {', '.join(allowed)}.")
    return items


@dataclass
class Filters:
    where: str
    params: dict
    description: dict

    def with_vegetation(self, value: bool) -> "Filters":
        """Mêmes filtres, mais avec un filtre de source imposé (pour compter les exclusions)."""
        clauses = [c for c in self.where.split(" AND ") if c != "h.is_vegetation"]
        clauses.append("h.is_vegetation" if value else "NOT h.is_vegetation")
        return Filters(" AND ".join(clauses), self.params, self.description)


def common_filters(
    start_date: date | None = None,
    end_date: date | None = None,
    bbox: str | None = Query(default=None, description="lon_min,lat_min,lon_max,lat_max"),
    sensor_family: str | None = Query(default=None, pattern="^(MODIS|VIIRS)$"),
    sensor: str | None = Query(default=None, pattern="^(MODIS|VIIRS)$", include_in_schema=False),
    satellite: str | None = Query(default=None, description="ex. NOAA20,NOAA21"),
    confidence: str | None = Query(default=None, description="ex. nominal,high"),
    vegetation_only: bool = True,
) -> Filters:
    if start_date and end_date and end_date < start_date:
        raise HTTPException(422, "La date de fin doit suivre la date de début.")
    clauses = ["NOT h.is_superseded"]
    params: dict = {}
    if vegetation_only:
        clauses.append("h.is_vegetation")
    if start_date:
        clauses.append("h.acquired_at >= :start_date")
        params["start_date"] = start_date
    if end_date:
        clauses.append("h.acquired_at < (CAST(:end_date AS date) + INTERVAL '1 day')")
        params["end_date"] = end_date
    family = sensor_family or sensor  # « sensor » : ancien nom conservé pour compatibilité
    if family:
        clauses.append("h.sensor_family = :family")
        params["family"] = family
    satellites = _closed_list(satellite, SATELLITES, "satellite")
    if satellites:
        clauses.append("h.satellite_code = ANY(:satellites)")
        params["satellites"] = satellites
    levels = _closed_list(confidence, CONFIDENCES, "confidence")
    if levels:
        clauses.append("h.confidence_level = ANY(:levels)")
        params["levels"] = levels
    if bbox:
        west, south, east, north = parse_bbox(bbox)
        clauses.append("h.longitude BETWEEN :west AND :east AND h.latitude BETWEEN :south AND :north")
        params.update(west=west, south=south, east=east, north=north)
    description = {
        "start_date": start_date, "end_date": end_date, "bbox": bbox, "sensor_family": family,
        "satellite": satellites, "confidence": levels, "vegetation_only": vegetation_only,
        "quality": "best",
    }
    return Filters(" AND ".join(clauses), params, description)
