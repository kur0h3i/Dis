"""Dis — API FastAPI + frontend compilado servido como estáticos."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .host_service import HostSampler, get_resources
from .models import Resources

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


def get_sampler(request: Request) -> HostSampler:
    return request.app.state.sampler


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/resources", response_model=Resources)
def resources(
    settings: SettingsDep, sampler: Annotated[HostSampler, Depends(get_sampler)]
) -> Resources:
    return get_resources(sampler, settings)


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
