"""Endpoints d'harmonisation (cahier des charges §7.3, EF-21, ENF-08)."""

import asyncio
import logging
import secrets
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import harmonization as pipeline
from app.settings import settings

router = APIRouter(prefix="/api/harmonization", tags=["harmonization"])
log = logging.getLogger("firewatch.harmonization")


class RunParameters(BaseModel):
    cluster_max_km: float = Field(default=2.0, gt=0, le=50)
    cluster_max_hours: float = Field(default=3.0, gt=0, le=48)


class RunRequest(BaseModel):
    mode: Literal["incremental", "full"] = "incremental"
    parameters: RunParameters = RunParameters()


LOOPBACK = {"127.0.0.1", "::1", "localhost"}


def local_dev(request: Request) -> bool:
    """En développement, une demande venant de cette machine (interface locale) n'exige pas le jeton."""
    return settings.environment == "development" and bool(request.client) and request.client.host in LOOPBACK


def require_admin(token: str | None) -> None:
    expected = settings.admin_token
    if not expected or not token or not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Jeton d'administration absent ou invalide.")


async def _execute(run_id: int, mode: str, parameters: dict, app=None) -> None:
    from app import cache
    changed = True
    try:
        result = await pipeline.execute_run(run_id, mode, parameters)
        changed = mode == "full" or bool(result.get("rows_processed"))
    except Exception:  # l'échec est enregistré dans harmonization_runs
        log.exception("Harmonisation %s en échec", run_id)
    finally:
        # Les statistiques en cache ne reflètent plus la base : on les recalcule tout de suite,
        # pour que les pages suivantes restent rapides. Base inchangée : le cache reste valable.
        if changed:
            cache.clear()
            if app is not None:
                app.state.warm_task = asyncio.create_task(cache.warm(app))


@router.post("/run", status_code=202)
async def run(
    background: BackgroundTasks,
    request: Request,
    body: RunRequest | None = None,
    x_admin_token: Annotated[str | None, Header()] = None,
) -> dict:
    if settings.read_only:
        raise HTTPException(status_code=403, detail="Démo en ligne : l'harmonisation se lance sur l'installation locale.")
    if not local_dev(request):
        require_admin(x_admin_token)
    body = body or RunRequest()
    parameters = pipeline.build_parameters(body.parameters.cluster_max_km, body.parameters.cluster_max_hours)
    connection = await asyncpg.connect(pipeline.connection_url())
    try:
        run_id = await pipeline.start_run(connection, body.mode, parameters)
    except pipeline.HarmonizationBusy as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    finally:
        await connection.close()
    background.add_task(_execute, run_id, body.mode, parameters, request.app)
    return {"run_id": run_id, "status": "running", "mode": body.mode, "parameters": parameters}


@router.get("/status")
async def status() -> dict:
    connection = await asyncpg.connect(pipeline.connection_url())
    try:
        result = await pipeline.latest_status(connection)
    finally:
        await connection.close()
    if result is None:
        return {"status": "never_run"}
    return result
