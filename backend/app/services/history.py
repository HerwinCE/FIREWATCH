"""Historique : couverture des données, médiane, anomalie et calendrier de feu (cahier des charges §3.3.6, §3.4).

Principes :
- une période hors des dates de disponibilité d'un capteur est « indisponible », jamais « zéro » ;
- un jour sans fichier reçu est un « trou » (valeur nulle), distinct d'un jour à zéro détection ;
- chaque famille de capteur est comparée à sa propre référence (jamais VIIRS contre une médiane MODIS).
"""

from __future__ import annotations

import calendar
import re
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Début des données FIRMS par famille (§3.3.7) : MODIS Terra nov. 2000, VIIRS Suomi-NPP janv. 2012.
FAMILY_START = {"MODIS": date(2000, 11, 1), "VIIRS": date(2012, 1, 20)}
REFERENCE_YEARS = {"MODIS": (2001, 2025), "VIIRS": (2012, 2025)}
MAX_GAP_SHARE = 0.20
ARCHIVE_FILE = re.compile(r"(modis|viirs-snpp|viirs-jpss1)_(\d{4})_")
ARCHIVE_FAMILY = {"modis": "MODIS", "viirs-snpp": "VIIRS", "viirs-jpss1": "VIIRS"}


def quantile(values: list[float], q: float) -> float | None:
    """Quantile avec interpolation linéaire (même convention que numpy / percentile_cont)."""
    if not values:
        return None
    s = sorted(values)
    pos = (len(s) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def position(value: float, p25: float | None, p75: float | None) -> str:
    if p25 is None or p75 is None:
        return "unknown"
    if value > p75:
        return "above_normal"
    if value < p25:
        return "below_normal"
    return "normal"


async def covered_days(db: AsyncSession, family: str) -> set[date]:
    """Jours pour lesquels des données de la famille ont été reçues (archives annuelles + fenêtre temps réel)."""
    days: set[date] = set()
    runs = await db.execute(text(
        """SELECT r.request_parameters->>'file' AS file
           FROM firewatch.ingestion_runs r JOIN firewatch.sources s ON s.id = r.source_id
           WHERE r.status IN ('SUCCEEDED', 'PARTIAL') AND s.data_type = 'ARCHIVE'"""))
    for (file,) in runs.all():
        m = ARCHIVE_FILE.search(file or "")
        if m and ARCHIVE_FAMILY[m.group(1)] == family:
            year = int(m.group(2))
            d = max(date(year, 1, 1), FAMILY_START[family])
            while d.year == year:
                days.add(d)
                d += timedelta(days=1)
    nrt = (await db.execute(text(
        """SELECT MIN(acquired_at)::date, MAX(acquired_at)::date FROM firewatch.harmonized_detections
           WHERE sensor_family = :f AND quality_level = 'NRT'"""), {"f": family})).one()
    if nrt[0]:
        d = nrt[0]
        while d <= nrt[1]:
            days.add(d)
            d += timedelta(days=1)
    return days


def month_coverage(year: int, month: int, family: str, covered: set[date], today: date) -> tuple[str, float]:
    """(statut, part de jours couverts) d'un mois : unavailable / gap / partial / full."""
    return period_coverage(date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1]),
                           family, covered, today)


def period_coverage(first: date, last: date, family: str, covered: set[date], today: date) -> tuple[str, float]:
    """(statut, part de jours couverts) d'une période quelconque : unavailable / gap / partial / full."""
    if last < FAMILY_START[family] or first > today:
        return "unavailable", 0.0
    start, end = max(first, FAMILY_START[family]), min(last, today)
    total = (end - start).days + 1
    ok = sum(1 for i in range(total) if start + timedelta(days=i) in covered)
    if ok == 0:
        return "gap", 0.0
    return ("full" if ok == total else "partial"), ok / total


# Restreint au territoire couvert par les archives (voir migrations/005_reference_domain.sql).
DOMAIN_CLAUSE = ("(floor(h.latitude * 10)::int || '_' || floor(h.longitude * 10)::int) "
                 "IN (SELECT tile FROM firewatch.reference_domain)")
DOMAIN_LABEL = "territoire couvert par les archives par pays (carreaux de 0,1°)"


def _metric_sql(metric: str) -> str:
    return "COUNT(DISTINCT h.grid_cell_id)" if metric == "active_cells" else "COUNT(*)"
