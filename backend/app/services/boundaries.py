"""Limites administratives de niveau 1 (provinces), lues depuis data/boundaries/<ISO3>_ADM1.geojson.

Source : geoBoundaries (gbOpen, CC BY-SA 3.0). Sans PostGIS, les tests « point dans la province »
utilisent le type polygon natif de PostgreSQL ; on ne garde que les anneaux extérieurs.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

BOUNDARIES_DIR = Path(__file__).resolve().parents[3] / "data" / "boundaries"


def _outer_rings(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    if geometry["type"] == "MultiPolygon":
        return [poly[0] for poly in geometry["coordinates"]]
    return []


@lru_cache
def load_provinces() -> dict[str, list[dict]]:
    """{ISO3: [{name, polygons, bbox}]} pour chaque fichier présent."""
    result: dict[str, list[dict]] = {}
    for path in sorted(BOUNDARIES_DIR.glob("*_ADM1.geojson")):
        iso = path.name.split("_")[0].upper()
        data = json.loads(path.read_text(encoding="utf-8"))
        provinces = []
        for feature in data.get("features", []):
            rings = _outer_rings(feature["geometry"])
            if not rings:
                continue
            xs = [p[0] for r in rings for p in r]
            ys = [p[1] for r in rings for p in r]
            provinces.append({
                "name": feature["properties"].get("shapeName") or feature["properties"].get("name") or "?",
                "polygons": [[[round(x, 5), round(y, 5)] for x, y, *_ in r] for r in rings],
                "bbox": (min(xs), min(ys), max(xs), max(ys)),
            })
        result[iso] = provinces
    return result


def provinces_intersecting(bbox: tuple[float, float, float, float]) -> list[tuple[str, dict]]:
    """Provinces (tous pays chargés) dont l'emprise recoupe bbox."""
    w, s, e, n = bbox
    out = []
    for iso, provinces in load_provinces().items():
        for p in provinces:
            pw, ps, pe, pn = p["bbox"]
            if pw <= e and pe >= w and ps <= n and pn >= s:
                out.append((iso, p))
    return out


def province(iso: str, name: str) -> dict | None:
    for p in load_provinces().get(iso.upper(), []):
        if p["name"] == name:
            return p
    return None
