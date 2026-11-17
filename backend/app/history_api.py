"""Séries historiques, calendrier de feu et anomalie vs médiane (cahier des charges EF-23, EF-26, EF-27, §7.3)."""

import calendar
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.filters import common_filters
from app.services.history import (
    DOMAIN_CLAUSE, DOMAIN_LABEL, FAMILY_START, MAX_GAP_SHARE, REFERENCE_YEARS, _metric_sql, covered_days, period_coverage, position, quantile,
)

router = APIRouter(prefix="/api", tags=["history"])
DbSession = Annotated[AsyncSession, Depends(get_db)]
Family = Literal["MODIS", "VIIRS"]
Metric = Literal["active_cells", "detections"]


async def _domain_where(db: AsyncSession, where: str) -> tuple[str, bool]:
    """Ajoute le domaine de référence si des archives ont été importées."""
    has_domain = bool((await db.execute(text("SELECT EXISTS (SELECT 1 FROM firewatch.reference_domain)"))).scalar())
    return (f"{where} AND {DOMAIN_CLAUSE}" if has_domain else where), has_domain


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _periods(start: date, end: date, granularity: str):
    """Découpe [start, end] en (début, fin) de jour, semaine ISO ou mois civil."""
    if granularity == "day":
        d = start
        while d <= end:
            yield d, d
            d += timedelta(days=1)
    elif granularity == "week":
        d = start - timedelta(days=start.weekday())
        while d <= end:
            yield d, d + timedelta(days=6)
            d += timedelta(days=7)
    else:
        d = date(start.year, start.month, 1)
        while d <= end:
            last = date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])
            yield d, last
            d = last + timedelta(days=1)


@router.get("/detections/timeline")
async def detections_timeline(
    db: DbSession,
    granularity: Literal["day", "week", "month"] = "month",
    metric: Metric = "active_cells",
    sensor_family: Family | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    bbox: str | None = None,
    satellite: str | None = None,
    confidence: str | None = None,
    vegetation_only: bool = True,
) -> dict:
    """Agrégation temporelle (EF-23) ; avec granularity=month sur 2000–aujourd'hui, alimente le calendrier de feu.

    Chaque point : period, sensor_family, value (null si trou ou capteur indisponible), coverage.
    """
    today = _today()
    start = start_date or (date(2000, 1, 1) if granularity == "month" else today - timedelta(days=29))
    end = min(end_date or today, today)
    if end < start:
        raise HTTPException(422, "La date de fin doit suivre la date de début.")
    if granularity == "day" and (end - start).days > 1100:
        raise HTTPException(422, "Granularité quotidienne limitée à 3 ans.")
    f = common_filters(start_date=start, end_date=end, bbox=bbox, sensor_family=None, sensor=None,
                       satellite=satellite, confidence=confidence, vegetation_only=vegetation_only)
    where, has_domain = await _domain_where(db, f.where)
    trunc = {"day": "day", "week": "week", "month": "month"}[granularity]
    rows = await db.execute(text(f"""
        SELECT date_trunc('{trunc}', h.acquired_at)::date AS period, h.sensor_family, {_metric_sql(metric)} AS value
        FROM firewatch.harmonized_detections h WHERE {where}
        GROUP BY 1, 2"""), f.params)
    values = {(r.period, r.sensor_family): int(r.value) for r in rows}
    families = [sensor_family] if sensor_family else ["MODIS", "VIIRS"]
    items = []
    for family in families:
        covered = await covered_days(db, family)
        for first, last in _periods(start, end, granularity):
            status, share = period_coverage(first, last, family, covered, today)
            value = None if status in ("unavailable", "gap") else values.get((first, family), 0)
            items.append({"period": first.isoformat(), "period_end": last.isoformat(), "sensor_family": family,
                          "value": value, "coverage": status, "coverage_share": round(share, 3)})
    return {"granularity": granularity, "metric": metric, "items": items, "filters": f.description,
            "domain": DOMAIN_LABEL if has_domain else None,
            "sensor_start": {k: v.isoformat() for k, v in FAMILY_START.items()}}


@router.get("/statistics/anomaly")
async def anomaly(
    db: DbSession,
    sensor_family: Family = "VIIRS",
    metric: Metric = "active_cells",
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="AAAA-MM, défaut : mois en cours"),
    reference_start: int | None = Query(default=None, ge=2000, le=2100),
    reference_end: int | None = Query(default=None, ge=2000, le=2100),
    bbox: str | None = None,
    confidence: str | None = None,
    vegetation_only: bool = True,
) -> dict:
    """Anomalie du mois vs médiane historique de la même famille de capteur (EF-26, §3.4.2)."""
    today = _today()
    year, mon = (int(month[:4]), int(month[5:])) if month else (today.year, today.month)
    ref_start, ref_end = REFERENCE_YEARS[sensor_family]
    ref_start, ref_end = reference_start or ref_start, reference_end or ref_end
    if ref_end < ref_start or ref_end >= year:
        raise HTTPException(422, "Période de référence invalide : elle doit précéder l'année analysée.")
    f = common_filters(start_date=None, end_date=None, bbox=bbox, sensor_family=sensor_family, sensor=None,
                       satellite=None, confidence=confidence, vegetation_only=vegetation_only)
    covered = await covered_days(db, sensor_family)
    where, has_domain = await _domain_where(db, f.where)

    # Mois en cours partiel : on ne compare que les jours effectivement couverts, aux mêmes jours des années de référence.
    month_last = calendar.monthrange(year, mon)[1]
    current_days = [d for d in range(1, month_last + 1)
                    if date(year, mon, d) <= today and date(year, mon, d) in covered]
    base = {"zone": {"bbox": bbox, "domain": DOMAIN_LABEL if has_domain else None} if bbox
            else {"scope": "monde", "domain": DOMAIN_LABEL if has_domain else None}, "sensor_family": sensor_family, "metric": metric,
            "vegetation_only": vegetation_only, "computed_at": datetime.now(timezone.utc).isoformat()}
    if not current_days:
        return {**base, "period": {"month": f"{year}-{mon:02d}"}, "position": "unknown",
                "message": "Aucune donnée reçue pour ce mois : anomalie non calculable."}
    d1, d2 = current_days[0], current_days[-1]
    partial = (d2 - d1 + 1) < month_last

    per_year = await db.execute(text(f"""
        SELECT EXTRACT(YEAR FROM h.acquired_at)::int AS y, {_metric_sql(metric)} AS v
        FROM firewatch.harmonized_detections h
        WHERE {where} AND EXTRACT(MONTH FROM h.acquired_at) = :m
          AND EXTRACT(DAY FROM h.acquired_at) BETWEEN :d1 AND :d2
          AND EXTRACT(YEAR FROM h.acquired_at) BETWEEN :y0 AND :y1
        GROUP BY 1"""), {**f.params, "m": mon, "d1": d1, "d2": d2, "y0": ref_start, "y1": year})
    by_year = {r.y: int(r.v) for r in per_year}

    reference, excluded = [], []
    for y in range(ref_start, ref_end + 1):
        last = min(d2, calendar.monthrange(y, mon)[1])
        status, share = period_coverage(date(y, mon, min(d1, last)), date(y, mon, last), sensor_family, covered, today)
        if status == "unavailable" or 1 - share > MAX_GAP_SHARE:
            excluded.append(y)
            continue
        reference.append((y, by_year.get(y, 0)))
    values = [v for _, v in reference]
    current = by_year.get(year, 0)
    med, p25, p75 = quantile(values, .5), quantile(values, .25), quantile(values, .75)

    # Courbe médiane mensuelle (mois complets) sur 12 mois pour le graphique.
    monthly = await db.execute(text(f"""
        SELECT EXTRACT(YEAR FROM h.acquired_at)::int AS y, EXTRACT(MONTH FROM h.acquired_at)::int AS m,
               {_metric_sql(metric)} AS v
        FROM firewatch.harmonized_detections h
        WHERE {where} AND EXTRACT(YEAR FROM h.acquired_at) BETWEEN :y0 AND :y1
        GROUP BY 1, 2"""), {**f.params, "y0": ref_start, "y1": ref_end})
    monthly_values = {(r.y, r.m): int(r.v) for r in monthly}
    curve = []
    for m in range(1, 13):
        vals = []
        for y in range(ref_start, ref_end + 1):
            status, share = period_coverage(date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1]),
                                            sensor_family, covered, today)
            if status != "unavailable" and 1 - share <= MAX_GAP_SHARE:
                vals.append(monthly_values.get((y, m), 0))
        curve.append({"month": m, "median": quantile(vals, .5), "p25": quantile(vals, .25),
                      "p75": quantile(vals, .75), "n_years": len(vals)})

    # Biais inter-satellites VIIRS (§3.4.2) : ratio NOAA-20 / Suomi-NPP sur la période de recouvrement.
    correction = None
    if sensor_family == "VIIRS":
        r = (await db.execute(text(f"""
            SELECT h.satellite_code, {_metric_sql(metric)} AS v FROM firewatch.harmonized_detections h
            WHERE {where} AND h.satellite_code IN ('NOAA20', 'SNPP') AND h.quality_level = 'SP'
              AND EXTRACT(YEAR FROM h.acquired_at) BETWEEN 2019 AND 2025
            GROUP BY 1"""), f.params)).all()
        sat = {row.satellite_code: int(row.v) for row in r}
        ratio = round(sat["NOAA20"] / sat["SNPP"], 2) if sat.get("SNPP") and sat.get("NOAA20") else None
        correction = {"applied": False, "ratio_noaa20_snpp": ratio, "period": "2019-2025",
                      "note": "Ratio mesuré et affiché ; correction non appliquée tant qu'elle n'est pas validée."}

    anomaly_abs = current - med if med is not None else None
    return {
        **base,
        "period": {"month": f"{year}-{mon:02d}", "days_compared": f"{d1:02d}-{d2:02d}", "partial": partial},
        "current_value": current,
        "reference": {"years": f"{ref_start}-{ref_end}", "n_years": len(values), "excluded_years": excluded,
                      "median": med, "p25": p25, "p75": p75,
                      "values": [{"year": y, "value": v} for y, v in reference]},
        "anomaly_abs": anomaly_abs,
        "anomaly_pct": round((current - med) / med * 100, 1) if med else None,
        "median_is_zero": med == 0,
        "position": position(current, p25, p75) if values else "unknown",
        "inter_satellite_correction": correction,
        "monthly_reference": curve,
    }
