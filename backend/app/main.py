import asyncio

from fastapi import FastAPI

from app import cache

from app.database import check_database
from app.settings import settings
from app.api import router as fire_router
from app.map_api import router as map_router
from app.harmonization_api import router as harmonization_router
from app.export_api import router as export_router
from app.history_api import router as history_router
from app.zone_api import router as zone_router
from app.assistant import router as assistant_router
from app.alerts_api import router as alerts_router
from app.voice_api import router as voice_router

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Backend FireWatch Africa : données de feux MODIS/VIIRS.",
)
# Avant fire_router : /api/detections/timeline doit passer avant /api/detections/{detection_id}.
app.include_router(history_router)
app.include_router(fire_router)
app.include_router(map_router)
app.include_router(harmonization_router)
app.include_router(export_router)
app.include_router(zone_router)
app.include_router(assistant_router)
app.include_router(alerts_router)
app.include_router(voice_router)
# Cache des statistiques (voir app/cache.py) et préchauffage du tableau de bord au démarrage.
app.middleware("http")(cache.response_cache)


@app.on_event("startup")
async def _warm_cache() -> None:
    app.state.warm_task = asyncio.create_task(cache.warm(app))


@app.get("/api/health", tags=["system"])
async def health() -> dict[str, str]:
    await check_database()
    return {"status": "ok", "database": "ok", "service": settings.app_name}

