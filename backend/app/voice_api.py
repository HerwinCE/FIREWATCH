"""Assistant vocal de FIREWATCH AFRICA : comprendre, décider, agir, vérifier.

Boucle d'agent (Gemini, appels de fonctions) répartie entre serveur et interface :
- outils de DONNÉES : exécutés ici, sur la couche harmonisée (mêmes fonctions que l'assistant écrit) ;
- outils d'INTERFACE : liste fermée, renvoyés à l'application qui les exécute réellement, vérifie le
  résultat et le renvoie au tour suivant. Le modèle ne voit donc que des résultats constatés.
Les actions sensibles (harmonisation, téléchargement) sont marquées `confirm` : l'application demande
l'accord de l'utilisateur avant de les exécuter ; un refus est renvoyé tel quel au modèle.
La conversation (avec les thoughtSignature de Gemini) fait l'aller-retour avec l'interface : le
serveur ne garde aucun état, et la clé API ne quitte jamais le serveur.
"""

from __future__ import annotations

import json
import re
from typing import Any, Literal

import base64
import struct

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts_api import alerts as _alerts
from app.assistant import CLAUDE_TOOLS, GEMINI_FALLBACKS, GEMINI_URL, TOOLS, _coerce, _gemini_schema, _last_day
from app.database import get_db
from app.settings import settings

router = APIRouter(prefix="/api/voice", tags=["voice"])

PAGES = ["dashboard", "carte", "gabon", "historique", "evenements", "zones", "comparaison", "methodologie", "assistant", "parametres"]
PANELS = ["layers", "alerts", "stats", "harmo", "calendar", "zones", "export", "method", "timeline"]

# --- Outils d'interface (exécutés par l'application) --------------------------------------------
UI_TOOLS: list[dict] = [
    {"name": "navigate", "description": "Ouvre une page de l'application : dashboard (tableau de bord), carte (carte opérationnelle), gabon (tableau de bord du Gabon), historique, evenements, zones (zones sensibles), comparaison (MODIS face à VIIRS), methodologie, assistant, parametres.",
     "parameters": {"type": "object", "properties": {"page": {"type": "string", "enum": PAGES}}, "required": ["page"]}},
    {"name": "set_sensors", "description": "Choisit les capteurs affichés partout : MODIS seul, VIIRS seul, ou les deux (comparaison).",
     "parameters": {"type": "object", "properties": {"selection": {"type": "string", "enum": ["MODIS", "VIIRS", "both"]}}, "required": ["selection"]}},
    {"name": "set_region", "description": "Change l'emprise analysée par les statistiques : world (monde), africa (Afrique), gabon.",
     "parameters": {"type": "object", "properties": {"region": {"type": "string", "enum": ["world", "africa", "gabon"]}}, "required": ["region"]}},
    {"name": "set_period", "description": "Filtre la période. Donner last_days (ex. 7) OU start/end (AAAA-MM-JJ, UTC). Sans argument : toute la période.",
     "parameters": {"type": "object", "properties": {"last_days": {"type": "integer"}, "start": {"type": "string"}, "end": {"type": "string"}}}},
    {"name": "locate_place", "description": "Sur la carte : vole vers un pays (nom en français, ex. « Gabon », « Soudan du Sud ») ou une province du Gabon (ex. « Estuaire ») et ouvre sa fenêtre de données.",
     "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "show_alert", "description": "Sur la carte : localise l'alerte la plus forte d'un niveau (critique, eleve, modere, faible ; par défaut la plus grave) et ouvre le centre d'alertes. rank=1 pour la première, 2 pour la suivante…",
     "parameters": {"type": "object", "properties": {"level": {"type": "string", "enum": ["critique", "eleve", "modere", "faible"]}, "rank": {"type": "integer"}}}},
    {"name": "open_map_panel", "description": "Sur la carte : ouvre un panneau d'outil (layers, alerts, stats, harmo, calendar, zones, export, method) ou la chronologie (timeline).",
     "parameters": {"type": "object", "properties": {"panel": {"type": "string", "enum": PANELS}}, "required": ["panel"]}},
    {"name": "set_map_display", "description": "Sur la carte : fond (satellite, dark, light, relief), représentation (points, heat, sensors) et/ou affichage de tous les points (all_points vrai/faux).",
     "parameters": {"type": "object", "properties": {"basemap": {"type": "string", "enum": ["satellite", "dark", "light", "relief"]}, "display": {"type": "string", "enum": ["points", "heat", "sensors"]}, "all_points": {"type": "boolean"}}}},
    {"name": "play_timeline", "description": "Sur la carte : ouvre la chronologie et lance la lecture jour après jour, avec une fenêtre de N jours (1 à 30).",
     "parameters": {"type": "object", "properties": {"window_days": {"type": "integer"}}}},
    {"name": "set_theme", "description": "Passe l'application en mode nuit ou en mode jour.",
     "parameters": {"type": "object", "properties": {"mode": {"type": "string", "enum": ["nuit", "jour"]}}, "required": ["mode"]}},
    {"name": "run_harmonization", "description": "Lance l'harmonisation des données MODIS et VIIRS (modifie la base). L'application demande confirmation à l'utilisateur.",
     "parameters": {"type": "object", "properties": {"mode": {"type": "string", "enum": ["incremental", "full"]}}}},
    {"name": "export_data", "description": "Télécharge un fichier : csv (détections harmonisées de la sélection), image (PNG de la carte) ou geojson (points affichés). L'application demande confirmation.",
     "parameters": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["csv", "image", "geojson"]}}, "required": ["kind"]}},
]
CONFIRM = {"run_harmonization", "export_data"}
UI_NAMES = {t["name"] for t in UI_TOOLS}

# --- Outils de données (exécutés ici) ------------------------------------------------------------
async def tool_alerts(db, scope: str = "world") -> dict:
    """Synthèse des alertes thermiques automatiques (24 dernières heures de données)."""
    scope = scope if scope in ("world", "africa", "gabon") else "world"
    r = await _alerts(db, scope=scope, hours=24, sensor=None, limit=5, max_points=0)
    return {"scope": scope, "window": r["window"], "counts": r["counts"], "total": r["total"],
            "top": [{k: a[k] for k in ("level", "lat", "lon", "cells", "max_frp", "detections", "province")} for a in r["alerts"]],
            "rules": r["rules"]}


DATA_TOOLS = {**TOOLS, "alerts": tool_alerts}
DATA_DECLS = [{"name": t["name"], "description": t["description"], **({"parameters": s} if (s := _gemini_schema(t["input_schema"])) else {})} for t in CLAUDE_TOOLS]
DATA_DECLS.append({"name": "alerts", "description": "Alertes thermiques automatiques des 24 dernières heures (nombre par niveau, alertes les plus fortes, seuils). Pour expliquer ou résumer les alertes.",
                   "parameters": {"type": "object", "properties": {"scope": {"type": "string", "enum": ["world", "africa", "gabon"]}}}})
DECLARATIONS = [{"functionDeclarations": DATA_DECLS + UI_TOOLS}]

SYSTEM = """Tu es l'assistant VOCAL de FIREWATCH AFRICA (surveillance des points chauds satellitaires NASA FIRMS, MODIS et VIIRS harmonisés, focus Gabon). Tu parles en français à voix haute.

Tu peux AGIR dans l'application grâce aux outils d'interface (navigate, set_sensors, set_region, set_period, locate_place, show_alert, open_map_panel, set_map_display, play_timeline, set_theme, run_harmonization, export_data) et CONSULTER les données grâce aux outils de données.

Règles :
- Comprends l'intention même si l'utilisateur n'emploie pas le nom exact d'un bouton. Enchaîne plusieurs outils si la demande l'exige (ex. : « montre-moi les feux VIIRS au Gabon cette semaine » = set_sensors VIIRS, set_period 7 jours, locate_place Gabon).
- Chaque outil d'interface renvoie le résultat CONSTATÉ dans l'application (ok, ou une erreur). N'affirme jamais qu'une action est faite si son résultat n'est pas « ok » ; si une action échoue ou est refusée, dis-le simplement.
- Les actions sensibles (harmonisation, téléchargement) sont soumises par l'application à la confirmation de l'utilisateur : appelle l'outil, l'application s'occupe de demander.
- Les outils de données N'UTILISENT PAS les filtres de l'interface : passe-leur toujours explicitement la zone, la période (start/end en AAAA-MM-JJ, calculées depuis le dernier jour de données) et le capteur voulus. Ne donne jamais un total « toutes périodes » comme s'il portait sur une période précise.
- Chaque chiffre que tu donnes doit venir d'un outil de données appelé dans cette conversation. Une détection thermique n'est pas un incendie confirmé.
- Réponse finale : 1 à 3 phrases courtes, naturelles à l'oral, SANS Markdown, sans liste, sans emoji ; nombres arrondis et lisibles (« environ 10 700 détections »). Dis ce que tu as fait puis l'essentiel.
- Si une action a échoué ou a été refusée, commence ta réponse par « Je n'ai pas pu » suivi de ce qui n'a pas marché et pourquoi (d'après le résultat de l'outil).
- Vouvoie toujours l'utilisateur (« vous »), jamais de tutoiement.
- Si tu ne comprends pas la demande, commence par « Je n'ai pas compris » et propose deux exemples de demandes possibles.
- Si la demande est hors sujet ou impossible, dis-le en une phrase et propose ce que tu sais faire."""


class Turn(BaseModel):
    message: str | None = Field(default=None, max_length=1000)
    results: list[dict] = Field(default_factory=list, max_length=20)   # résultats des actions d'interface
    server_results: list[dict] = Field(default_factory=list, max_length=20)  # résultats de données en attente
    conversation: list[dict] = Field(default_factory=list, max_length=60)
    model: str | None = None
    state: dict[str, Any] = Field(default_factory=dict)


def _spoken(text: str) -> str:
    """Nettoie une réponse pour la voix : pas de Markdown ni de symboles lus à voix haute."""
    t = re.sub(r"[*_`#>|]", "", text)
    t = re.sub(r"\s*\n+\s*", " ", t)
    return t.strip()


def _ui_args(name: str, args: dict) -> dict:
    """Validation stricte des arguments d'interface (liste fermée, types contrôlés)."""
    spec = next(t for t in UI_TOOLS if t["name"] == name)["parameters"].get("properties", {})
    out: dict[str, Any] = {}
    for k, v in (args or {}).items():
        p = spec.get(k)
        if not p:
            continue
        if "enum" in p and v not in p["enum"]:
            continue
        if p["type"] == "integer" and isinstance(v, (int, float)):
            out[k] = max(1, min(int(v), 3650))
        elif p["type"] == "boolean" and isinstance(v, bool):
            out[k] = v
        elif p["type"] == "string" and isinstance(v, str) and len(v) <= 80:
            out[k] = v.strip()
    return out


@router.get("/status")
async def status() -> dict:
    return {"engine": "gemini" if settings.gemini_api_key else "local", "model": settings.gemini_model if settings.gemini_api_key else None,
            "actions": [t["name"] for t in UI_TOOLS], "confirm": sorted(CONFIRM)}


@router.post("/turn")
async def turn(body: Turn, db: AsyncSession = Depends(get_db)) -> dict:
    """Un pas d'agent : renvoie soit des actions à exécuter, soit la réponse finale à dire."""
    if not settings.gemini_api_key:
        return {"engine": "local", "error": "Aucune clé Gemini : compréhension locale."}
    import httpx

    contents = list(body.conversation)
    if body.message:
        last = await _last_day(db)
        st = body.state or {}
        note = (f"[État de l'application : page={st.get('route')}, capteurs={st.get('sensor') or 'MODIS + VIIRS'}, "
                f"emprise={st.get('region')}, période={st.get('start') or 'début'}→{st.get('end') or 'fin'}, "
                f"zone ouverte={st.get('zone') or 'aucune'}, alertes={st.get('alerts') or 'inconnues'} ; dernier jour de données {last.isoformat()}]")
        contents.append({"role": "user", "parts": [{"text": f"{note}\n{body.message}"}]})
    elif body.results or body.server_results:
        parts = []
        # Réponses dans l'ordre exact des appels du dernier tour du modèle.
        calls = [p["functionCall"] for p in (contents[-1].get("parts", []) if contents else []) if "functionCall" in p]
        order = {(c.get("id") or c.get("name")): i for i, c in enumerate(calls)}
        merged = sorted(body.server_results + body.results, key=lambda r: order.get(r.get("id") or r.get("name"), 99))
        for r in merged:
            fr = {"name": r.get("name"), "response": {"result": r.get("result")}}
            if r.get("id"):
                fr["id"] = r["id"]
            parts.append({"functionResponse": fr})
        contents.append({"role": "user", "parts": parts})
    else:
        return {"error": "Tour vide."}

    # À l'oral la rapidité prime : le modèle léger d'abord, le modèle principal en secours.
    order = [settings.voice_model, settings.gemini_model, *GEMINI_FALLBACKS]
    models = [body.model] if body.model else list(dict.fromkeys(m for m in order if m))
    headers = {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(18.0, connect=6.0)) as http:
        for model in models:
            out = await _step(db, http, model, headers, list(contents), first=body.model is None)
            if out.get("retry"):
                continue
            return out
    return {"error": "Gemini est saturé pour le moment.", "engine": "gemini"}


async def _step(db, http, model: str, headers: dict, contents: list[dict], first: bool) -> dict:
    import httpx

    url = GEMINI_URL.format(model=model)
    for _ in range(6):  # appels de données enchaînés côté serveur, sans aller-retour
        try:
            r = await http.post(url, headers=headers, json={"systemInstruction": {"parts": [{"text": SYSTEM}]}, "contents": contents,
                                                           "tools": DECLARATIONS, "generationConfig": {"maxOutputTokens": 1024}})
        except httpx.TimeoutException:
            return {"retry": True} if first else {"error": "Gemini trop lent à répondre."}
        except httpx.HTTPError:
            return {"error": "Gemini injoignable (réseau)."}
        if r.status_code in (429, 500, 503, 404) and first:
            return {"retry": True}
        if r.status_code != 200:
            return {"error": f"Gemini indisponible ({r.status_code})."}
        first = False
        cand = (r.json().get("candidates") or [None])[0]
        if not cand or not cand.get("content"):
            return {"error": "Réponse vide de Gemini."}
        content = cand["content"]
        content.setdefault("role", "model")
        contents.append(content)
        calls = [p["functionCall"] for p in content.get("parts", []) if "functionCall" in p]
        if not calls:
            text = "".join(p.get("text", "") for p in content.get("parts", []) if not p.get("thought")).strip()
            return {"done": True, "say": _spoken(text) or "C'est fait.", "text": text, "conversation": contents, "model": model, "engine": "gemini"}
        server_results, actions = [], []
        for c in calls:
            name, args = c.get("name", ""), c.get("args") or {}
            if name in UI_NAMES:
                actions.append({"id": c.get("id"), "name": name, "args": _ui_args(name, args), "confirm": name in CONFIRM})
            elif name in DATA_TOOLS:
                try:
                    res = await DATA_TOOLS[name](db, **(_coerce(name, args) if name in TOOLS else {k: v for k, v in args.items() if k == "scope"}))
                except Exception as exc:  # renvoyé au modèle, jamais masqué
                    res = {"erreur": str(exc)}
                server_results.append({"id": c.get("id"), "name": name, "result": json.loads(json.dumps(res, default=str))})
            else:
                server_results.append({"id": c.get("id"), "name": name, "result": {"erreur": "outil inconnu"}})
        if actions:  # l'application doit agir : on lui rend la main
            return {"done": False, "actions": actions, "server_results": server_results, "conversation": contents, "model": model, "engine": "gemini"}
        contents.append({"role": "user", "parts": [{"functionResponse": {**({"id": s["id"]} if s.get("id") else {}), "name": s["name"], "response": {"result": s["result"]}}} for s in server_results]})
    return {"error": "Trop d'étapes pour cette demande.", "conversation": contents, "model": model}


# --- Oreille et voix : transcription et synthèse par Gemini (la clé reste sur le serveur) ---------
MALE_VOICES = {"Charon": "Charon — posée, informative", "Orus": "Orus — ferme", "Fenrir": "Fenrir — énergique",
               "Iapetus": "Iapetus — claire", "Algenib": "Algenib — grave", "Puck": "Puck — enjouée"}
TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"]
VOCAB = ("Vocabulaire possible : FireWatch Africa, MODIS, VIIRS, NASA FIRMS, Suomi-NPP, NOAA-20, NOAA-21, Terra, Aqua, "
         "harmonisation, chronologie, alerte critique, Gabon, Estuaire, Haut-Ogooué, Moyen-Ogooué, Ngounié, Nyanga, "
         "Ogooué-Ivindo, Ogooué-Lolo, Ogooué-Maritime, Woleu-Ntem, Libreville, Franceville, Afrique, Congo, Cameroun.")


class Audio(BaseModel):
    audio: str = Field(min_length=100, max_length=8_000_000)  # base64, ≈ 6 Mo
    mime: Literal["audio/wav", "audio/webm", "audio/ogg", "audio/mp3", "audio/mpeg"] = "audio/wav"


class Speech(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    voice: str = "Charon"


def _wav(pcm: bytes, rate: int = 24000) -> bytes:
    """Ajoute un en-tête WAV à un flux PCM 16 bits mono."""
    return b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(pcm)) + pcm


@router.get("/voices")
async def voices() -> dict:
    return {"engine": "gemini" if settings.gemini_api_key else None, "default": "Charon", "voices": MALE_VOICES}


@router.post("/transcribe")
async def transcribe(body: Audio) -> dict:
    """Transcription française d'un enregistrement du micro (indépendante du navigateur)."""
    if not settings.gemini_api_key:
        raise HTTPException(503, "Transcription indisponible : aucune clé Gemini.")
    import httpx

    prompt = ("Transcris exactement, en français, ce que dit la personne dans cet enregistrement. "
              "Réponds uniquement par la transcription, sans guillemets ni commentaire. "
              "S'il n'y a aucune parole intelligible, réponds exactement : [silence]. " + VOCAB)
    headers = {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=6.0)) as http:
        for model in dict.fromkeys([settings.voice_model, *GEMINI_FALLBACKS, settings.gemini_model]):
            try:
                r = await http.post(GEMINI_URL.format(model=model), headers=headers, json={
                    "contents": [{"role": "user", "parts": [{"inlineData": {"mimeType": body.mime, "data": body.audio}}, {"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": 256, "temperature": 0}})
            except httpx.HTTPError:
                continue
            if r.status_code != 200:
                continue
            parts = ((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
            text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip().strip('"«» ')
            return {"text": "" if text.lower().startswith("[silence") else text, "model": model}
    raise HTTPException(503, "Transcription indisponible pour le moment (Gemini saturé).")


@router.post("/speak")
async def speak(body: Speech) -> Response:
    """Voix IA masculine : texte -> audio WAV (Gemini TTS)."""
    if not settings.gemini_api_key:
        raise HTTPException(503, "Synthèse vocale indisponible : aucune clé Gemini.")
    import httpx

    voice = body.voice if body.voice in MALE_VOICES else "Charon"
    text = _spoken(body.text)
    headers = {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=6.0)) as http:
        for model in TTS_MODELS:
            try:
                r = await http.post(GEMINI_URL.format(model=model), headers=headers, json={
                    "contents": [{"parts": [{"text": text}]}],  # uniquement la réponse : aucune consigne ne doit être lue à voix haute
                    "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}})
            except httpx.HTTPError:
                continue
            if r.status_code != 200:
                continue
            part = (((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}])[0]
            data = (part.get("inlineData") or {}).get("data")
            if not data:
                continue
            raw = base64.b64decode(data)
            mime = (part.get("inlineData") or {}).get("mimeType", "")
            if not raw.startswith(b"RIFF"):  # PCM brut (audio/L16) : on l'emballe en WAV
                rate = int(m.group(1)) if (m := re.search(r"rate=(\d+)", mime)) else 24000
                raw = _wav(raw, rate)
            return Response(content=raw, media_type="audio/wav", headers={"Cache-Control": "no-store", "X-Voice-Model": model})
    raise HTTPException(503, "Synthèse vocale indisponible pour le moment.")
