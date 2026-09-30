"""Dis — API FastAPI + frontend compilado servido como estáticos."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import docker_service
from .cerbero import fetch_alerts
from .config import Settings, config_status, get_settings, resolve_url
from .docker_service import ContainerNotFoundError, DockerUnavailableError
from .ecosystem import build_graph, build_tools
from .host_service import HostSampler, get_resources
from .models import (
    Alerts,
    ConfigStatus,
    ContainerDetail,
    ContainerLogs,
    ContainerStats,
    ContainerSummary,
    Graph,
    Resources,
    Tool,
)

logging.basicConfig(level=os.environ.get("DIS_LOG_LEVEL", "INFO"))

SettingsDep = Annotated[Settings, Depends(get_settings)]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    sampler = HostSampler()
    app.state.sampler = sampler
    sampler.start()
    try:
        yield
    finally:
        await sampler.stop()


app = FastAPI(title="Dis", version="0.1.0", lifespan=lifespan)


@app.exception_handler(DockerUnavailableError)
def _docker_unavailable(_: Request, exc: DockerUnavailableError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": f"Docker no disponible: {exc}"})


@app.exception_handler(ContainerNotFoundError)
def _container_not_found(_: Request, exc: ContainerNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": f"Contenedor no encontrado: {exc}"})


def get_sampler(request: Request) -> HostSampler:
    return request.app.state.sampler


def _request_host(request: Request) -> str | None:
    return request.url.hostname


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config", response_model=ConfigStatus)
def config(_: SettingsDep) -> ConfigStatus:
    # Depender de los settings fuerza la comprobación (y recarga) del YAML.
    path, loaded_at, error = config_status()
    return ConfigStatus(path=path, loaded_at=loaded_at, error=error)


@app.get("/api/resources", response_model=Resources)
def resources(
    settings: SettingsDep, sampler: Annotated[HostSampler, Depends(get_sampler)]
) -> Resources:
    return get_resources(sampler, settings)


# --- Docker -----------------------------------------------------------------


@app.get("/api/containers", response_model=list[ContainerSummary])
def containers(request: Request, settings: SettingsDep) -> list[ContainerSummary]:
    items = docker_service.list_containers(settings)
    host = _request_host(request)
    for c in items:
        c.url = resolve_url(c.url, host, settings)
    return items


@app.get("/api/containers/{container_id}", response_model=ContainerDetail)
def container_detail(container_id: str, request: Request, settings: SettingsDep) -> ContainerDetail:
    detail = docker_service.get_container(container_id, settings)
    detail.url = resolve_url(detail.url, _request_host(request), settings)
    return detail


@app.get("/api/containers/{container_id}/stats", response_model=ContainerStats)
def container_stats(container_id: str) -> ContainerStats:
    return docker_service.get_stats(container_id)


@app.get("/api/containers/{container_id}/logs", response_model=ContainerLogs)
def container_logs(container_id: str) -> ContainerLogs:
    return ContainerLogs(lines=docker_service.get_logs(container_id))


# TODO: POST /api/containers/{id}/{start|stop|restart} — fuera del MVP; necesita
# autenticación antes de exponer acciones de escritura (ver docker_service.py).
# TODO: autenticación de Dis (hoy se confía en la LAN/tailnet).


# --- Ecosistema -------------------------------------------------------------


def _containers_or_none(settings: Settings) -> list[ContainerSummary] | None:
    """Lista sin stats (rápida). ``None`` si Docker no está disponible."""
    try:
        return docker_service.list_containers(settings, with_stats=False)
    except DockerUnavailableError:
        return None


@app.get("/api/tools", response_model=list[Tool])
def tools(request: Request, settings: SettingsDep) -> list[Tool]:
    return build_tools(settings, _containers_or_none(settings), _request_host(request))


@app.get("/api/graph", response_model=Graph)
def graph(request: Request, settings: SettingsDep) -> Graph:
    return build_graph(settings, _containers_or_none(settings), _request_host(request))


@app.get("/api/alerts", response_model=Alerts)
async def alerts(settings: SettingsDep) -> Alerts:
    return await fetch_alerts(settings)


# --- Frontend compilado -----------------------------------------------------
# En producción el Dockerfile copia frontend/dist a /app/static. En desarrollo
# el frontend lo sirve Vite (con proxy a /api), así que esto no se monta.
STATIC_DIR = Path(
    os.environ.get("DIS_STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist")
)

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        # Ficheros sueltos de /public (favicon...) o, si no, index.html (SPA).
        candidate = (STATIC_DIR / path).resolve()
        if path and candidate.is_file() and STATIC_DIR.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
