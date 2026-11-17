"""Assistant IA de FireWatch Africa.

Deux modes, mêmes données :
- local (toujours disponible) : la question en français est analysée (zone, période, capteur, intention),
  puis les fonctions analytiques du serveur répondent avec des chiffres vérifiés ;
- Claude (si ANTHROPIC_API_KEY est défini dans backend/.env et le SDK `anthropic` installé) :
  Claude Opus 5.5 interroge ces mêmes fonctions par outils et rédige la réponse.
Aucun chiffre n'est inventé : chaque valeur vient d'une requête sur la couche harmonisée.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import hotspots as _hotspots, satellites as _satellites, summary as _summary, timeline as _timeline
from app.database import get_db
from app.filters import common_filters
from app.history_api import anomaly as _anomaly
from app.services.boundaries import load_provinces
from app.settings import settings
from app.zone_api import polygon_sql

try:  # le mode Claude est optionnel
    import anthropic
except ImportError:  # pragma: no cover - dépend de l'installation
    anthropic = None

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

ZONES = {
    "monde": (None, "le monde"),
    "afrique": ("-20,-36,53,38", "l'Afrique"),
    "gabon": ("8.5,-4.1,14.6,2.4", "le Gabon"),
}
MONTHS_FR = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]
MONTHS_LABEL = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
SAT_LABEL = {"TERRA": "MODIS Terra", "AQUA": "MODIS Aqua", "SNPP": "VIIRS Suomi-NPP", "NOAA20": "VIIRS NOAA-20", "NOAA21": "VIIRS NOAA-21"}


def fold(s: str) -> str:
    """Minuscules sans accents, pour comparer des mots français."""
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def fr_num(v: Any, d: int = 0) -> str:
    if v is None:
        return "—"
    try:
        x = float(v)
    except (TypeError, ValueError):
        return str(v)
    s = f"{x:,.{d}f}".replace(",", " ").replace(".", ",")
    return s


def fr_date(d: date | str | None) -> str:
    if d is None:
        return "—"
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    return f"{d.day} {MONTHS_LABEL[d.month - 1]} {d.year}"


def province_names() -> dict[str, str]:
    return {fold(p["name"]): p["name"] for p in load_provinces().get("GAB", [])}


# ---------------------------------------------------------------------------------------------
# Données : chaque fonction renvoie un dict JSON-sérialisable, prêt pour un outil Claude.
# ---------------------------------------------------------------------------------------------

def _filters(zone: str, start: date | None, end: date | None, sensor: str | None):
    bbox = ZONES.get(zone, (None, ""))[0]
    return common_filters(start_date=start, end_date=end, bbox=bbox, sensor_family=sensor, sensor=None,
                          satellite=None, confidence=None, vegetation_only=True)


async def _province_where(db: AsyncSession, name: str, f) -> tuple[str, dict]:
    p = next((p for p in load_provinces().get("GAB", []) if p["name"] == name), None)
    params = dict(f.params)
    inside, (w, s, e, n) = polygon_sql(p["polygons"], params)
    params.update(bw=w, bs=s, be=e, bn=n)
    return f"{f.where} AND h.longitude BETWEEN :bw AND :be AND h.latitude BETWEEN :bs AND :bn AND {inside}", params


def _clean(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_clean(x) for x in v]
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if v.__class__.__name__ == "Decimal":
        return float(v)
    return v


async def tool_zone_summary(db, zone="monde", start=None, end=None, sensor=None) -> dict:
    """Totaux d'une zone sur une période : détections, cellules actives, MODIS/VIIRS, puissance, jours."""
    if zone in province_names().values():
        f = _filters("monde", start, end, sensor)
        where, params = await _province_where(db, zone, f)
        row = (await db.execute(text(f"""
            SELECT COUNT(*) AS total_detections, COUNT(DISTINCT h.grid_cell_id) AS active_cells,
                   COUNT(*) FILTER (WHERE h.sensor_family='MODIS') AS modis, COUNT(*) FILTER (WHERE h.sensor_family='VIIRS') AS viirs,
                   COUNT(DISTINCT h.acquired_at::date) AS active_days, MAX(h.frp_mw) AS max_frp,
                   MIN(h.acquired_at) AS first_observation, MAX(h.acquired_at) AS last_observation
            FROM firewatch.harmonized_detections h WHERE {where}"""), params)).mappings().one()
        return _clean({"zone": zone, "type": "province du Gabon", **dict(row)})
    s = await _summary(db, _filters(zone, start, end, sensor))
    keep = ("total_detections", "active_cells", "modis", "viirs", "modis_cells", "viirs_cells", "active_days",
            "last_observation", "cross_sensor_groups", "non_vegetation_excluded")
    return _clean({"zone": zone, **{k: s.get(k) for k in keep}})


async def tool_daily_activity(db, zone="monde", start=None, end=None, sensor=None, top=5) -> dict:
    """Jours les plus actifs (détections par jour UTC) et nombre de jours couverts."""
    if zone in province_names().values():
        f = _filters("monde", start, end, sensor)
        where, params = await _province_where(db, zone, f)
        rows = (await db.execute(text(f"""
            SELECT h.acquired_at::date AS day, COUNT(*) AS detections, COUNT(DISTINCT h.grid_cell_id) AS active_cells, MAX(h.frp_mw) AS max_frp
            FROM firewatch.harmonized_detections h WHERE {where} GROUP BY 1"""), params)).mappings().all()
        days = [dict(r) for r in rows]
    else:
        t = await _timeline(db, _filters(zone, start, end, sensor))
        agg: dict = {}
        for r in t["items"]:
            a = agg.setdefault(r["day"], {"day": r["day"], "detections": 0, "active_cells": 0})
            a["detections"] += r["detections"]
            a["active_cells"] += r["active_cells"]
        days = list(agg.values())
    days.sort(key=lambda r: r["detections"], reverse=True)
    return _clean({"zone": zone, "days_with_data": len(days), "top_days": days[:max(1, min(int(top), 15))],
                   "first_day": min((d["day"] for d in days), default=None), "last_day": max((d["day"] for d in days), default=None)})


async def tool_hotspots(db, zone="monde", start=None, end=None, sensor=None, limit=5) -> dict:
    """Carreaux de 1° les plus actifs (cellules actives de 0,01°)."""
    r = await _hotspots(db, _filters(zone, start, end, sensor), grid_size=1.0, limit=max(1, min(int(limit), 20)))
    return _clean({"zone": zone, "items": r["items"]})


async def tool_provinces_ranking(db, start=None, end=None, sensor=None) -> dict:
    """Classement des 9 provinces du Gabon par détections de végétation (une seule lecture de la table)."""
    f = _filters("gabon", start, end, sensor)
    params = dict(f.params)
    values = []
    for i, p in enumerate(load_provinces().get("GAB", [])):
        for j, ring in enumerate(p["polygons"]):
            params[f"pn{i}_{j}"] = p["name"]
            params[f"pg{i}_{j}"] = "(" + ",".join(f"({x},{y})" for x, y, *_ in ring) + ")"
            values.append(f"(CAST(:pn{i}_{j} AS text), CAST(CAST(:pg{i}_{j} AS text) AS polygon))")
    rows = (await db.execute(text(f"""
        WITH p(name, poly) AS (VALUES {", ".join(values)})
        SELECT p.name AS province, COUNT(*) AS detections, COUNT(DISTINCT h.grid_cell_id) AS active_cells, MAX(h.frp_mw) AS max_frp
        FROM firewatch.harmonized_detections h JOIN p ON p.poly @> point(h.longitude, h.latitude)
        WHERE {f.where} GROUP BY 1"""), params)).mappings().all()
    found = {r["province"]: dict(r) for r in rows}
    out = [found.get(n, {"province": n, "detections": 0, "active_cells": 0, "max_frp": None}) for n in province_names().values()]
    out.sort(key=lambda r: r["detections"], reverse=True)
    return _clean({"items": out})


async def tool_compare_sensors(db, zone="monde", start=None, end=None) -> dict:
    """MODIS face à VIIRS par satellite ; le ratio des cellules actives est la mesure comparable."""
    r = await _satellites(db, _filters(zone, start, end, None))
    return _clean({"zone": zone, "satellites": r["items"], "ratio_viirs_modis_cells": r["ratio_viirs_modis_cells"]})


async def tool_anomaly(db, zone="gabon", family="VIIRS") -> dict:
    """Mois en cours comparé à la médiane historique de la même famille de capteur."""
    bbox = ZONES.get(zone, ZONES["gabon"])[0]
    r = await _anomaly(db, sensor_family=family, metric="active_cells", month=None, reference_start=None,
                       reference_end=None, bbox=bbox, confidence=None, vegetation_only=True)
    keep = ("position", "anomaly_pct", "current_value", "reference", "period", "sensor_family", "zone")
    return _clean({k: r.get(k) for k in keep if k in r})


async def tool_data_coverage(db) -> dict:
    """Ce que contient la base : période couverte par satellite et par version (archive SP ou temps réel NRT)."""
    rows = (await db.execute(text("""
        SELECT h.satellite_code, h.quality_level, MIN(h.acquired_at)::date AS first_day,
               MAX(h.acquired_at)::date AS last_day, COUNT(*) AS rows
        FROM firewatch.harmonized_detections h WHERE NOT h.is_superseded GROUP BY 1, 2 ORDER BY 2 DESC, 3"""))).mappings().all()
    return _clean({"products": [dict(r) | {"satellite": SAT_LABEL.get(r["satellite_code"], r["satellite_code"]),
                                           "version": "archive scientifique (SP)" if r["quality_level"] == "SP" else "temps réel (NRT)"} for r in rows]})


TOOLS = {
    "zone_summary": tool_zone_summary, "daily_activity": tool_daily_activity, "hotspots": tool_hotspots,
    "provinces_ranking": tool_provinces_ranking, "compare_sensors": tool_compare_sensors,
    "anomaly": tool_anomaly, "data_coverage": tool_data_coverage,
}


# ---------------------------------------------------------------------------------------------
# Compréhension de la question (mode local)
# ---------------------------------------------------------------------------------------------

class Context(BaseModel):
    zone: str | None = None
    start: date | None = None
    end: date | None = None
    sensor: str | None = None


class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=800)
    history: list[dict] = Field(default_factory=list, max_length=20)
    context: Context = Field(default_factory=Context)


async def _last_day(db) -> date:
    v = (await db.execute(text("SELECT MAX(acquired_at)::date FROM firewatch.harmonized_detections WHERE NOT is_superseded"))).scalar()
    return v or date.today()


async def parse(db, q: str, ctx: Context) -> dict:
    t = fold(q)
    last = await _last_day(db)
    provs = province_names()
    zone = next((real for key, real in provs.items() if key in t or key.replace("-", " ") in t), None)
    if not zone:
        zone = "gabon" if "gabon" in t else "afrique" if "afrique" in t else "monde" if re.search(r"\bmonde\b|mondial|planete", t) else (ctx.zone or "monde")
    sensor = "MODIS" if "modis" in t and "viirs" not in t else "VIIRS" if "viirs" in t and "modis" not in t else ctx.sensor
    start, end, label = ctx.start, ctx.end, None
    m = re.search(r"(\d+)\s*(derniers?|dernieres?)\s*jours", t) or re.search(r"derniers?\s*(\d+)\s*jours", t)
    if m:
        n = int(m.group(1)); start, end, label = last - timedelta(days=n - 1), last, f"sur les {n} derniers jours de données"
    elif "aujourd" in t or "dernier jour" in t:
        start = end = last; label = f"le {fr_date(last)}, dernier jour de données"
    elif "hier" in t:
        start = end = last - timedelta(days=1); label = f"le {fr_date(start)}"
    elif "semaine" in t:
        start, end, label = last - timedelta(days=6), last, "sur les 7 derniers jours de données"
    else:
        mm = re.search(r"\b(" + "|".join(MONTHS_FR) + r")\b(?:\s+(\d{4}))?", t)
        yy = re.search(r"\b(20\d{2})\b", t)
        if mm:
            mo = MONTHS_FR.index(mm.group(1)) + 1
            y = int(mm.group(2) or (yy.group(1) if yy else last.year))
            start = date(y, mo, 1)
            end = (date(y + (mo == 12), mo % 12 + 1, 1) - timedelta(days=1))
            label = f"en {MONTHS_LABEL[mo - 1]} {y}"
        elif yy:
            y = int(yy.group(1)); start, end, label = date(y, 1, 1), date(y, 12, 31), f"en {y}"
        elif "ce mois" in t:
            start, end, label = last.replace(day=1), last, f"en {MONTHS_LABEL[last.month - 1]} {last.year}"
        elif re.search(r"tout|total|depuis le debut|historique complet", t):
            start = end = None; label = "sur toute la période disponible"
    if label is None:
        label = f"du {fr_date(start)} au {fr_date(end)}" if start and end else "sur toute la période disponible"
    if re.search(r"anomal|normal|inhabituel|habituel|median|exceptionnel", t):
        intent = "anomaly"
    elif re.search(r"province|region", t) and not (zone in provs.values()):
        intent = "provinces"
    elif re.search(r"compar|ratio|versus|\bvs\b|difference|modis et viirs|viirs et modis", t):
        intent = "compare"
    elif re.search(r"harmonis|methode|comment (ca|cela) marche|pourquoi|confiance|grille", t):
        intent = "method"
    elif re.search(r"donnees|source|a jour|derniere (collecte|mise)|couvert|disponible|archive", t):
        intent = "coverage"
    elif re.search(r"quel jour|quels jours|jours? les plus|jour le plus|quand|\bpic\b|chronolog|evolution|tendance|par jour", t) and not t.startswith("combien"):
        intent = "daily"
    elif re.search(r"\bou\b|zone|endroit|carreau|foyer|localis|plus actif|plus touche", t):
        intent = "hotspots"
    elif re.search(r"bonjour|salut|aide|que (peux|sais)|qui es", t):
        intent = "help"
    else:
        intent = "summary"
    zl = zone if zone in provs.values() else ZONES.get(zone, (None, zone))[1]
    where = f"dans la province {zone}" if zone in provs.values() else {"monde": "dans le monde", "afrique": "en Afrique", "gabon": "au Gabon"}.get(zone, zone)
    return {"intent": intent, "zone": zone, "zone_label": zl, "sensor": sensor, "start": start, "end": end, "period_label": label, "where": where, "last_day": last}


SUGGESTIONS = [
    "Combien de détections au Gabon les 7 derniers jours ?",
    "Quelle province du Gabon est la plus active ?",
    "Le mois en cours est-il normal au Gabon ?",
    "Compare MODIS et VIIRS en Afrique",
    "Quels sont les jours les plus actifs dans le monde ?",
    "Quelles données sont disponibles ?",
]


async def answer_local(db, q: str, ctx: Context) -> dict:
    p = await parse(db, q, ctx)
    z, s, e, sen = p["zone"], p["start"], p["end"], p["sensor"]
    cap = f"{p['where']}, {p['period_label']}{' (' + sen + ' seulement)' if sen else ''}"
    Cap = cap[:1].upper() + cap[1:]
    per = p["period_label"]; Per = per[:1].upper() + per[1:]
    facts, table, actions = [], None, []
    if s or e:
        actions.append({"kind": "period", "label": "Appliquer cette période", "start": s.isoformat() if s else "", "end": e.isoformat() if e else ""})
    if z in ("gabon", "afrique", "monde"):
        actions.append({"kind": "zone", "label": f"Voir {p['zone_label']} sur la carte", "zone": {"gabon": "gabon", "afrique": "africa", "monde": "world"}[z]})

    if p["intent"] == "help":
        text_ = ("Je réponds à partir des données harmonisées MODIS et VIIRS de la base (NASA FIRMS). Demandez-moi un total, "
                 "les jours les plus actifs, les zones les plus touchées, le classement des provinces du Gabon, "
                 "la comparaison MODIS / VIIRS ou si le mois en cours sort de la normale.")
    elif p["intent"] == "method":
        text_ = ("**L'harmonisation rend MODIS et VIIRS comparables en cinq règles :**\n"
                 "1. une confiance unifiée (faible, nominale, haute) ;\n2. une grille commune de 0,01°, soit environ 1 km ;\n"
                 "3. les sources fixes (torchères, volcans, industrie) écartées : on garde la végétation présumée ;\n"
                 "4. la donnée scientifique (SP) remplace le temps réel (NRT) dès qu'elle existe ;\n"
                 "5. deux capteurs à moins de 2 km et 3 h forment un groupe possible, pas un « même feu ».\n\n"
                 "Pour comparer les capteurs, on compte des **cellules actives**, pas des détections : VIIRS (375 m) détecte mécaniquement plus de points que MODIS (1 km).")
    elif p["intent"] == "coverage":
        d = await tool_data_coverage(db)
        table = {"columns": ["Satellite", "Version", "Du", "Au", "Détections"],
                 "rows": [[r["satellite"], r["version"], fr_date(r["first_day"]), fr_date(r["last_day"]), fr_num(r["rows"])] for r in d["products"]]}
        text_ = (f"La base réunit {len({r['satellite'] for r in d['products']})} satellites NASA FIRMS. Les archives scientifiques couvrent le Gabon sur le long terme ; "
                 f"le temps réel couvre le monde entier jusqu'au **{fr_date(p['last_day'])}**.")
    elif p["intent"] == "anomaly":
        fam = sen or "VIIRS"
        zz = z if z in ZONES else "gabon"
        a = await tool_anomaly(db, zz, fam)
        if a.get("position") in (None, "unknown") or a.get("anomaly_pct") is None:
            text_ = f"Impossible de calculer l'anomalie pour {ZONES[zz][1]} : l'historique {fam} est insuffisant sur cette zone."
        else:
            pos = {"above_normal": "**au-dessus de la normale**", "below_normal": "**en dessous de la normale**", "normal": "**dans la normale**"}[a["position"]]
            pct = a["anomaly_pct"]
            ref = a.get("reference") or {}
            per = a.get("period") or {}
            text_ = (f"Pour {ZONES[zz][1]}, le mois en cours est {pos} : {('+' if pct > 0 else '')}{fr_num(pct, 1)} % de cellules actives {fam} "
                     f"par rapport à la médiane {ref.get('years', '')}, en comparant les mêmes jours du mois"
                     f"{' (jours ' + str(per.get('days_compared')) + ')' if per.get('days_compared') else ''}.")
            facts = [{"label": "Anomalie", "value": f"{('+' if pct > 0 else '')}{fr_num(pct, 1)} %"},
                     {"label": "Valeur actuelle", "value": fr_num(a.get("current_value"))},
                     {"label": "Référence", "value": f"médiane {ref.get('years', '—')}"}]
            if zz != z:
                text_ += " (L'historique n'existe que pour le Gabon.)"
        actions.append({"kind": "route", "label": "Ouvrir l'historique", "route": "historique"})
    elif p["intent"] == "provinces":
        r = await tool_provinces_ranking(db, s, e, sen)
        items = r["items"]
        top = items[0] if items else None
        table = {"columns": ["Province", "Détections", "Cellules actives", "Pic (MW)"],
                 "rows": [[i["province"], fr_num(i["detections"]), fr_num(i["active_cells"]), fr_num(i["max_frp"], 1)] for i in items]}
        text_ = (f"{Per}, la province la plus active du Gabon est **{top['province']}** avec {fr_num(top['detections'])} détections "
                 f"({fr_num(top['active_cells'])} cellules actives)." if top and top["detections"] else
                 f"Aucune détection de végétation dans les provinces du Gabon {per}.")
    elif p["intent"] == "compare":
        r = await tool_compare_sensors(db, z if z in ZONES else "gabon", s, e)
        table = {"columns": ["Satellite", "Famille", "Détections", "Cellules actives"],
                 "rows": [[i["satellite"], i["sensor"], fr_num(i["detections"]), fr_num(i["active_cells"])] for i in r["satellites"]]}
        ratio = r["ratio_viirs_modis_cells"]
        text_ = (f"{Cap}, VIIRS couvre **{fr_num(ratio, 2)} fois** plus de cellules actives que MODIS. "
                 "C'est attendu : VIIRS voit des feux plus petits grâce à son pixel de 375 m. Comparez donc les tendances de chaque capteur, pas leurs totaux bruts."
                 if ratio else f"Comparaison impossible {cap} : l'un des deux capteurs n'a aucune détection.")
        actions.append({"kind": "route", "label": "Ouvrir la comparaison", "route": "comparaison"})
    elif p["intent"] == "hotspots":
        r = await tool_hotspots(db, z if z in ZONES else "gabon", s, e, sen, 5)
        items = r["items"]
        table = {"columns": ["Carreau (lat · lon)", "Cellules actives", "Détections", "Jours"],
                 "rows": [[f"{fr_num(i['grid_lat'])}° · {fr_num(i['grid_lon'])}°", fr_num(i["active_cells"]), fr_num(i["detections"]), fr_num(i["active_days"])] for i in items]}
        text_ = (f"{Cap}, la zone la plus active est le carreau de 1° situé à **{fr_num(items[0]['grid_lat'])}° de latitude, {fr_num(items[0]['grid_lon'])}° de longitude** "
                 f"({fr_num(items[0]['active_cells'])} cellules actives)." if items else f"Aucune zone active {cap}.")
        actions.append({"kind": "route", "label": "Ouvrir les zones sensibles", "route": "zones"})
    elif p["intent"] == "daily":
        r = await tool_daily_activity(db, z, s, e, sen, 5)
        top = r["top_days"]
        table = {"columns": ["Jour (UTC)", "Détections", "Cellules actives"],
                 "rows": [[fr_date(d["day"]), fr_num(d["detections"]), fr_num(d["active_cells"])] for d in top]}
        text_ = (f"{Cap}, le jour le plus actif est le **{fr_date(top[0]['day'])}** avec {fr_num(top[0]['detections'])} détections. "
                 f"{r['days_with_data']} jours ont des données, du {fr_date(r['first_day'])} au {fr_date(r['last_day'])}." if top else f"Aucune détection {cap}.")
    else:
        r = await tool_zone_summary(db, z, s, e, sen)
        n = r.get("total_detections") or 0
        facts = [{"label": "Détections", "value": fr_num(n)}, {"label": "Cellules actives", "value": fr_num(r.get("active_cells"))},
                 {"label": "MODIS", "value": fr_num(r.get("modis"))}, {"label": "VIIRS", "value": fr_num(r.get("viirs"))},
                 {"label": "Jours avec données", "value": fr_num(r.get("active_days"))}]
        text_ = (f"{Cap}, la base compte **{fr_num(n)} détections** de végétation présumée, réparties sur "
                 f"{fr_num(r.get('active_cells'))} cellules d'environ 1 km ({fr_num(r.get('modis'))} MODIS, {fr_num(r.get('viirs'))} VIIRS)."
                 if n else f"Aucune détection de végétation {cap}.")
    text_ += "\n\n_Une détection thermique n'est pas un incendie confirmé. Dates en UTC._"
    return {"answer": text_, "mode": "local", "facts": facts, "table": table, "actions": actions,
            "understood": {"intent": p["intent"], "zone": p["zone_label"], "period": p["period_label"], "sensor": sen or "MODIS + VIIRS"},
            "suggestions": SUGGESTIONS[:4]}


# ---------------------------------------------------------------------------------------------
# Mode Claude : mêmes fonctions exposées comme outils
# ---------------------------------------------------------------------------------------------

ZONE_PROP = {"type": "string", "description": "« monde », « afrique », « gabon » ou le nom exact d'une province du Gabon (ex. « Estuaire », « Haut-Ogooué »)."}
DATE_PROP = {"type": "string", "description": "Date AAAA-MM-JJ (UTC), facultative."}
SENSOR_PROP = {"type": "string", "enum": ["MODIS", "VIIRS"], "description": "Famille de capteur ; omettre pour les deux."}
CLAUDE_TOOLS = [
    {"name": "zone_summary", "description": "Totaux harmonisés d'une zone sur une période : détections, cellules actives de 0,01°, répartition MODIS/VIIRS, jours couverts, dernière observation.",
     "input_schema": {"type": "object", "properties": {"zone": ZONE_PROP, "start": DATE_PROP, "end": DATE_PROP, "sensor": SENSOR_PROP}, "required": ["zone"]}},
    {"name": "daily_activity", "description": "Jours les plus actifs (détections par jour UTC) d'une zone, avec le premier et le dernier jour de données.",
     "input_schema": {"type": "object", "properties": {"zone": ZONE_PROP, "start": DATE_PROP, "end": DATE_PROP, "sensor": SENSOR_PROP, "top": {"type": "integer", "minimum": 1, "maximum": 15}}, "required": ["zone"]}},
    {"name": "hotspots", "description": "Carreaux de 1° les plus actifs (classés par cellules actives) dans « monde », « afrique » ou « gabon ».",
     "input_schema": {"type": "object", "properties": {"zone": {"type": "string", "enum": ["monde", "afrique", "gabon"]}, "start": DATE_PROP, "end": DATE_PROP, "sensor": SENSOR_PROP, "limit": {"type": "integer", "minimum": 1, "maximum": 20}}, "required": ["zone"]}},
    {"name": "provinces_ranking", "description": "Classement des 9 provinces du Gabon par détections de végétation sur une période.",
     "input_schema": {"type": "object", "properties": {"start": DATE_PROP, "end": DATE_PROP, "sensor": SENSOR_PROP}}},
    {"name": "compare_sensors", "description": "Comparaison par satellite (MODIS Terra/Aqua, VIIRS NOAA-20/21/Suomi-NPP) et ratio VIIRS/MODIS en cellules actives.",
     "input_schema": {"type": "object", "properties": {"zone": {"type": "string", "enum": ["monde", "afrique", "gabon"]}, "start": DATE_PROP, "end": DATE_PROP}, "required": ["zone"]}},
    {"name": "anomaly", "description": "Mois en cours comparé à la médiane historique (même famille de capteur, mêmes jours). L'historique existe pour le Gabon.",
     "input_schema": {"type": "object", "properties": {"zone": {"type": "string", "enum": ["gabon", "afrique", "monde"]}, "family": SENSOR_PROP}, "required": ["zone"]}},
    {"name": "data_coverage", "description": "Produits NASA FIRMS présents dans la base, avec leur période couverte et leur nombre de lignes.",
     "input_schema": {"type": "object", "properties": {}}},
]

SYSTEM = """Tu es l'assistant de FIREWATCH AFRICA, plateforme de surveillance des points chauds satellitaires (NASA FIRMS) en Afrique, avec un focus sur le Gabon.
Les données sont harmonisées : MODIS (Terra, Aqua, pixel ≈ 1 km) et VIIRS (NOAA-20, NOAA-21, Suomi-NPP, pixel 375 m) partagent une confiance unifiée et une grille de 0,01° (≈ 1 km). Par défaut, seules les détections de végétation présumée sont comptées.

Règles :
- Chaque chiffre de ta réponse doit venir d'un outil appelé dans cette conversation. Si un outil ne renvoie rien, dis-le ; ne devine jamais une valeur.
- Une détection thermique n'est pas un incendie confirmé. Les dates sont en UTC.
- Pour comparer MODIS et VIIRS, appuie-toi sur les cellules actives, pas sur le nombre de détections.
- L'historique long (archives) ne couvre que le Gabon ; le monde entier n'a que les derniers jours en temps réel.
- Réponds en français clair, en 2 à 6 phrases, avec les chiffres clés en gras. Pas de titre. Si un tableau aide, fais-en un court en Markdown.
- Si la question sort du sujet (feux, données, application), réponds poliment que tu es spécialisé sur ces données."""


def _coerce(name: str, args: dict) -> dict:
    out = {}
    for k, v in (args or {}).items():
        if k in ("start", "end") and isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            out[k] = date.fromisoformat(v)
        elif k in ("top", "limit") and isinstance(v, (int, float)):
            out[k] = int(v)
        elif k in ("zone", "sensor", "family") and isinstance(v, str):
            out[k] = v
    if "zone" in out and out["zone"] not in ZONES and out["zone"] not in province_names().values():
        hit = province_names().get(fold(out["zone"]))
        out["zone"] = hit or ZONES.get(fold(out["zone"]), None) and fold(out["zone"]) or "gabon"
    return out


async def answer_claude(db, ask: Ask) -> dict | None:
    if anthropic is None or not settings.anthropic_api_key:
        return None
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=90.0)
    last = await _last_day(db)
    ctx = ask.context
    note = (f"Contexte de l'interface : zone affichée = {ctx.zone or 'monde'} ; période = {ctx.start or 'début'} → {ctx.end or 'fin'} ; "
            f"capteur = {ctx.sensor or 'MODIS + VIIRS'}. Dernier jour de données : {last.isoformat()}.")
    messages: list = [m for m in ask.history if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str)][-10:]
    messages.append({"role": "user", "content": f"{note}\n\nQuestion : {ask.question}"})
    used: list[str] = []
    for _ in range(6):
        try:
            resp = await client.beta.messages.create(
                model=settings.assistant_model, max_tokens=4000, system=SYSTEM, tools=CLAUDE_TOOLS, messages=messages,
                output_config={"effort": "medium"}, betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        except anthropic.APIStatusError as exc:
            return {"error": f"Claude indisponible ({exc.status_code})."}
        except anthropic.APIConnectionError:
            return {"error": "Claude injoignable (réseau)."}
        if resp.stop_reason == "refusal":
            return None
        messages.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason != "tool_use":
            textual = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
            return {"answer": textual, "mode": "claude", "facts": [], "table": None, "actions": [],
                    "understood": {"tools": used}, "suggestions": SUGGESTIONS[:4]}
        results = []
        for block in resp.content:
            if getattr(block, "type", "") != "tool_use":
                continue
            fn = TOOLS.get(block.name)
            try:
                data = await fn(db, **_coerce(block.name, block.input)) if fn else {"erreur": "outil inconnu"}
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(data, ensure_ascii=False, default=str)[:20000]})
                used.append(block.name)
            except Exception as exc:  # renvoyé à Claude, jamais masqué
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": f"Erreur : {exc}", "is_error": True})
        messages.append({"role": "user", "content": results})
    return None


# ---------------------------------------------------------------------------------------------
# Mode Gemini (API gratuite de Google) : mêmes outils, appel REST generateContent via httpx
# ---------------------------------------------------------------------------------------------

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _gemini_schema(schema: dict) -> dict | None:
    """Schéma JSON des outils -> sous-ensemble accepté par Gemini (sans bornes numériques)."""
    props = {}
    for k, v in (schema.get("properties") or {}).items():
        props[k] = {key: val for key, val in v.items() if key in ("type", "description", "enum")}
    if not props:
        return None
    out = {"type": "object", "properties": props}
    if schema.get("required"):
        out["required"] = schema["required"]
    return out


GEMINI_TOOLS = [{"functionDeclarations": [
    {"name": t["name"], "description": t["description"], **({"parameters": sch} if (sch := _gemini_schema(t["input_schema"])) else {})}
    for t in CLAUDE_TOOLS]}]


def _context_note(ctx: Context, last: date) -> str:
    return (f"Contexte de l'interface : zone affichée = {ctx.zone or 'monde'} ; période = {ctx.start or 'début'} → {ctx.end or 'fin'} ; "
            f"capteur = {ctx.sensor or 'MODIS + VIIRS'}. Dernier jour de données : {last.isoformat()}.")


async def answer_gemini(db, ask: Ask) -> dict | None:
    if not settings.gemini_api_key:
        return None
    import httpx  # déjà installé avec FastAPI ; import local pour garder le module léger

    last = await _last_day(db)
    contents: list[dict] = []
    for m in ask.history[-10:]:
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str) and m["content"].strip():
            contents.append({"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]})
    contents.append({"role": "user", "parts": [{"text": f"{_context_note(ask.context, last)}\n\nQuestion : {ask.question}"}]})
    base = list(contents)
    headers = {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}
    # Modèle principal, puis modèle de secours si Google est saturé (503) ou le quota de la minute atteint (429).
    models = [settings.gemini_model] + [m for m in GEMINI_FALLBACKS if m != settings.gemini_model]
    error = None
    async with httpx.AsyncClient(timeout=httpx.Timeout(28.0, connect=8.0)) as http:
        for model in models:
            out = await _gemini_loop(db, http, model, headers, list(base))
            if out.get("retry"):
                error = out["error"]
                continue
            return out if out.get("answer") or out.get("error") else None
    return {"error": error} if error else None


GEMINI_FALLBACKS = ["gemini-3.5-flash-lite"]


async def _gemini_loop(db, http, model: str, headers: dict, contents: list[dict]) -> dict:
    """Boucle d'appels d'outils sur un modèle. {retry: True} = essayer le modèle suivant."""
    import httpx

    used: list[str] = []
    url = GEMINI_URL.format(model=model)
    for _ in range(6):
        body = {"systemInstruction": {"parts": [{"text": SYSTEM}]}, "contents": contents, "tools": GEMINI_TOOLS,
                "generationConfig": {"maxOutputTokens": 2048}}
        try:
            r = await http.post(url, headers=headers, json=body)
        except httpx.TimeoutException:
            if not used:  # modèle trop lent (souvent saturé) : on passe au modèle de secours
                return {"retry": True, "error": "Gemini trop lent à répondre."}
            return {"error": "Gemini trop lent à répondre."}
        except httpx.HTTPError:
            return {"error": "Gemini injoignable (réseau)."}
        if r.status_code in (429, 500, 503, 404) and not used:
            why = {429: "quota de la minute atteint", 503: "modèle saturé", 500: "erreur du service", 404: "modèle indisponible"}[r.status_code]
            return {"retry": True, "error": f"Gemini indisponible ({r.status_code} : {why})."}
        if r.status_code != 200:
            why = {400: "requête refusée", 401: "clé invalide", 403: "clé invalide ou API non activée",
                   404: f"modèle « {model} » introuvable", 429: "quota gratuit atteint, réessayez dans une minute"}
            return {"error": f"Gemini indisponible ({r.status_code} : {why.get(r.status_code, 'erreur du service')})."}
        data = r.json()
        cand = (data.get("candidates") or [None])[0]
        if not cand or not cand.get("content"):
            return {}  # réponse bloquée ou vide : le mode local prend le relais
        content = cand["content"]
        content.setdefault("role", "model")
        # Le tour du modèle est renvoyé tel quel : il porte les thoughtSignature exigées par Gemini 3.
        contents.append(content)
        calls = [part["functionCall"] for part in content.get("parts", []) if "functionCall" in part]
        if not calls:
            textual = "".join(part.get("text", "") for part in content.get("parts", []) if not part.get("thought")).strip()
            return {"answer": textual, "mode": "gemini", "model": model, "facts": [], "table": None, "actions": [],
                    "understood": {"tools": used, "model": model}, "suggestions": SUGGESTIONS[:4]} if textual else {}
        responses = []
        for call in calls:
            fn = TOOLS.get(call.get("name", ""))
            try:
                result = await fn(db, **_coerce(call["name"], call.get("args") or {})) if fn else {"erreur": "outil inconnu"}
                used.append(call["name"])
            except Exception as exc:  # renvoyé au modèle, jamais masqué
                result = {"erreur": str(exc)}
            fr = {"name": call.get("name"), "response": {"result": json.loads(json.dumps(result, default=str))}}
            if call.get("id"):
                fr["id"] = call["id"]
            responses.append({"functionResponse": fr})
        contents.append({"role": "user", "parts": responses})
    return {}


def _provider() -> tuple[str, str | None]:
    if settings.gemini_api_key:
        return "gemini", settings.gemini_model
    if anthropic is not None and settings.anthropic_api_key:
        return "claude", settings.assistant_model
    return "local", None


@router.get("/status")
async def status() -> dict:
    mode, model = _provider()
    return {"mode": mode, "model": model, "gemini_key": bool(settings.gemini_api_key),
            "claude_key": bool(settings.anthropic_api_key), "suggestions": SUGGESTIONS}


@router.post("/ask")
async def ask(body: Ask, db: AsyncSession = Depends(get_db)) -> dict:
    mode, _ = _provider()
    result = await (answer_gemini(db, body) if mode == "gemini" else answer_claude(db, body) if mode == "claude" else _none())
    if result and result.get("answer"):
        return result
    local = await answer_local(db, body.question, body.context)
    if result and "error" in result:
        local["notice"] = result["error"] + " Réponse calculée localement."
    return local


async def _none() -> None:
    return None
