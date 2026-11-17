"""Règles d'harmonisation MODIS / VIIRS (cahier des charges §3.3.1 à §3.3.5).

Fonctions pures, sans base de données : elles sont couvertes par tests/test_normalization.py.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

HARMONIZATION_VERSION = "1.0.0"
GRID_SIZE_DEG = 0.01
DEFAULT_CLUSTER_MAX_KM = 2.0
DEFAULT_CLUSTER_MAX_HOURS = 3.0
SUPERSESSION_MAX_DEG = 0.01
SUPERSESSION_MAX_MINUTES = 10.0

# Étape 1 — normalisation des satellites (valeurs FIRMS brutes et libellés déjà normalisés).
_SATELLITES = {
    "TERRA": "TERRA", "T": "TERRA",
    "AQUA": "AQUA", "A": "AQUA",
    "N": "SNPP", "NPP": "SNPP", "SUOMI NPP": "SNPP", "SUOMI-NPP": "SNPP", "SNPP": "SNPP",
    "N20": "NOAA20", "1": "NOAA20", "NOAA-20": "NOAA20", "NOAA20": "NOAA20",
    "N21": "NOAA21", "2": "NOAA21", "NOAA-21": "NOAA21", "NOAA21": "NOAA21",
}
SENSOR_FAMILY = {"TERRA": "MODIS", "AQUA": "MODIS", "SNPP": "VIIRS", "NOAA20": "VIIRS", "NOAA21": "VIIRS"}
NATIVE_RESOLUTION_M = {"MODIS": 1000, "VIIRS": 375}


def normalize_satellite(value: str | None) -> str:
    code = _SATELLITES.get((value or "").strip().upper())
    if code is None:
        raise ValueError(f"satellite inconnu : {value!r}")
    return code


def quality_level(version: str | None) -> str:
    """Temps réel si la version FIRMS se termine par RT (« 6.1NRT », « 2.0NRT », et « 2.1URT » = Ultra
    Real-Time, Amérique du Nord), sinon qualité scientifique (SP, ex. « 6.03 », « 2 »)."""
    return "NRT" if (version or "").strip().upper().endswith("RT") else "SP"


# Étape 2 — confiance unifiée (§3.3.3).
def unified_confidence(raw: str | None, sensor_family: str) -> str:
    value = (raw or "").strip().lower()
    if sensor_family == "MODIS":
        try:
            pct = float(value)
        except ValueError as exc:
            raise ValueError(f"confiance MODIS invalide : {raw!r}") from exc
        if not 0 <= pct <= 100:
            raise ValueError(f"confiance MODIS hors bornes : {raw!r}")
        if pct < 30:
            return "low"
        if pct < 80:
            return "nominal"
        return "high"
    levels = {"l": "low", "low": "low", "n": "nominal", "nominal": "nominal", "h": "high", "high": "high"}
    if value not in levels:
        raise ValueError(f"confiance VIIRS invalide : {raw!r}")
    return levels[value]


# Étape 4 — grille commune de 0,01°.
def grid_cell_id(latitude: float, longitude: float) -> str:
    # L'arrondi évite qu'une erreur flottante (ex. 9011,999999) fasse changer de cellule.
    row = math.floor(round((latitude + 90) / GRID_SIZE_DEG, 6))
    col = math.floor(round((longitude + 180) / GRID_SIZE_DEG, 6))
    return f"{row}_{col}"


# Étape 3 — qualification du type de source (§3.3.4).
def classify_source(firms_type: str | None, cell_id: str, static_mask: dict[str, int]) -> tuple[int | None, bool, str]:
    """Retourne (detection_type, is_vegetation, type_basis)."""
    if firms_type not in (None, ""):
        detection_type = int(firms_type)
        if detection_type not in (0, 1, 2, 3):
            raise ValueError(f"type FIRMS invalide : {firms_type!r}")
        return detection_type, detection_type == 0, "firms_type"
    if cell_id in static_mask:
        return static_mask[cell_id], False, "static_mask"
    return None, True, "presumed_outside_mask"


@dataclass(frozen=True)
class HarmonizedRow:
    detection_id: object
    acquired_at: datetime
    latitude: float
    longitude: float
    satellite_code: str
    sensor_family: str
    native_resolution_m: int
    quality_level: str
    confidence_raw: str | None
    confidence_level: str
    detection_type: int | None
    is_vegetation: bool
    type_basis: str
    grid_cell_id: str
    frp_mw: float | None
    daynight: str | None
    source_product: str


def harmonize_row(raw: dict, static_mask: dict[str, int]) -> HarmonizedRow:
    """Applique les étapes 1 à 4 à une détection brute (clés : colonnes de firewatch.detections + firms_type, version)."""
    satellite = normalize_satellite(raw["satellite"])
    family = SENSOR_FAMILY[satellite]
    lat, lon = float(raw["latitude"]), float(raw["longitude"])
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("coordonnées hors bornes")
    cell = grid_cell_id(lat, lon)
    detection_type, is_vegetation, basis = classify_source(raw.get("firms_type"), cell, static_mask)
    confidence_raw = raw.get("confidence")
    return HarmonizedRow(
        detection_id=raw["id"],
        acquired_at=raw["acquisition_time"],
        latitude=lat,
        longitude=lon,
        satellite_code=satellite,
        sensor_family=family,
        native_resolution_m=NATIVE_RESOLUTION_M[family],
        quality_level=quality_level(raw.get("version") or raw.get("source_product")),
        confidence_raw=(str(confidence_raw)[:8] if confidence_raw is not None else None),
        confidence_level=unified_confidence(confidence_raw, family),
        detection_type=detection_type,
        is_vegetation=is_vegetation,
        type_basis=basis,
        grid_cell_id=cell,
        frp_mw=raw.get("frp"),
        daynight=raw.get("daynight"),
        source_product=raw.get("source_product") or "",
    )


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(a)))


@dataclass(frozen=True)
class Point:
    key: object
    latitude: float
    longitude: float
    timestamp: float  # secondes UTC
    satellite_code: str
    quality_level: str = "NRT"


# Étape 5 — supersession NRT -> SP.
def superseded_keys(points: list[Point]) -> set:
    """Clés des détections NRT pour lesquelles une SP du même satellite existe à ≤ 0,01° et ≤ 10 min."""
    max_seconds = SUPERSESSION_MAX_MINUTES * 60
    sp_index: dict[tuple, list[Point]] = defaultdict(list)
    for p in points:
        if p.quality_level == "SP":
            sp_index[(p.satellite_code, math.floor(p.latitude / SUPERSESSION_MAX_DEG),
                      math.floor(p.longitude / SUPERSESSION_MAX_DEG), math.floor(p.timestamp / max_seconds))].append(p)
    if not sp_index:
        return set()
    result = set()
    for p in points:
        if p.quality_level != "NRT":
            continue
        i, j, t = (math.floor(p.latitude / SUPERSESSION_MAX_DEG), math.floor(p.longitude / SUPERSESSION_MAX_DEG),
                   math.floor(p.timestamp / max_seconds))
        found = False
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for dt in (-1, 0, 1):
                    for sp in sp_index.get((p.satellite_code, i + di, j + dj, t + dt), ()):
                        if (abs(sp.latitude - p.latitude) <= SUPERSESSION_MAX_DEG
                                and abs(sp.longitude - p.longitude) <= SUPERSESSION_MAX_DEG
                                and abs(sp.timestamp - p.timestamp) <= max_seconds):
                            found = True
                            break
                    if found:
                        break
                if found:
                    break
            if found:
                break
        if found:
            result.add(p.key)
    return result


# Étape 6 — rapprochements spatio-temporels inter-capteurs (§3.3.5).
def cross_sensor_groups(points: list[Point], max_km: float = DEFAULT_CLUSTER_MAX_KM,
                        max_hours: float = DEFAULT_CLUSTER_MAX_HOURS) -> dict:
    """Relie deux détections de satellites différents à ≤ max_km et ≤ max_hours.

    Les groupes sont les composantes connexes de ces liens : chaque groupe contient donc
    au moins deux satellites. Retourne {clé: numéro de groupe (1..n)} pour les seules
    détections rattachées. Libellé UI : « rapprochement possible », jamais « même incendie ».
    """
    if max_km <= 0 or max_hours <= 0:
        raise ValueError("max_km et max_hours doivent être positifs")
    max_seconds = max_hours * 3600
    cell_deg = max_km / 111.0
    ordered = sorted(range(len(points)), key=lambda k: points[k].timestamp)
    parent = list(range(len(points)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    buckets: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for idx in ordered:
        p = points[idx]
        i = math.floor(p.latitude / cell_deg)
        j = math.floor(p.longitude / cell_deg)
        t = math.floor(p.timestamp / max_seconds)
        # Un degré de longitude raccourcit avec la latitude : on élargit la recherche en longitude.
        cos_lat = max(math.cos(math.radians(min(abs(p.latitude) + cell_deg, 90.0))), 0.01)
        lon_span = math.ceil(1 / cos_lat)
        for di in (-1, 0, 1):
            for dj in range(-lon_span, lon_span + 1):
                for dt in (-1, 0):  # points triés par date : seuls les créneaux passés sont remplis
                    for other in buckets.get((i + di, j + dj, t + dt), ()):
                        q = points[other]
                        if q.satellite_code == p.satellite_code:
                            continue
                        if p.timestamp - q.timestamp > max_seconds:
                            continue
                        if haversine_km(p.latitude, p.longitude, q.latitude, q.longitude) <= max_km:
                            ra, rb = find(idx), find(other)
                            if ra != rb:
                                parent[rb] = ra
        buckets[(i, j, t)].append(idx)

    members: dict[int, list[int]] = defaultdict(list)
    for idx in range(len(points)):
        members[find(idx)].append(idx)
    groups: dict = {}
    number = 0
    for root in sorted(members, key=lambda r: min(points[m].timestamp for m in members[r])):
        component = members[root]
        if len(component) < 2:
            continue
        number += 1
        for idx in component:
            groups[points[idx].key] = number
    return groups
