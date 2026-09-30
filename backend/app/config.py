"""Configuración de Dis.

La fuente principal es un fichero YAML (``dis.yaml``) con las herramientas del
ecosistema, las URLs de los contenedores y las aristas del grafo. Algunas claves
se pueden sobrescribir con variables de entorno:

- ``DIS_CONFIG``       ruta al YAML (por defecto ``./dis.yaml``, luego ``../dis.yaml``)
- ``CERBERO_URL``      URL base de la API de Cerbero
- ``DIS_HOST_ROOT``    dónde está montada la raíz del host (``/hostfs`` en Docker)
- ``DIS_PUBLIC_HOST``  host con el que construir los enlaces (``{host}`` en las URLs)
- ``DIS_DISKS``        puntos de montaje a mostrar, separados por comas (``/,/home``)

El YAML se recarga solo cuando cambia (ver ``get_settings``): añadir un servicio
no requiere reiniciar Dis.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, field_validator

log = logging.getLogger(__name__)

ToolStage = Literal["operational", "development", "idea"]


class ToolConfig(BaseModel):
    """Una herramienta propia del ecosistema (Caronte, Minos, Cerbero...)."""

    id: str
    name: str
    description: str = ""
    # Puede contener ``{host}``; se sustituye por el host de la petición.
    url: str | None = None
    stage: ToolStage = "operational"
    # Contenedor Docker que implementa la herramienta (opcional). Si existe, la
    # herramienta hereda su estado y métricas y en el grafo son un único nodo.
    container: str | None = None
    depends_on: list[str] = Field(default_factory=list)
    # ``True`` solo para Dis: siempre "running" y sin enlace externo ("estás aquí").
    self: bool = False

    @field_validator("id")
    @classmethod
    def _id_lower(cls, v: str) -> str:
        return v.strip().lower()


class ContainerConfig(BaseModel):
    """Metadatos opcionales de un contenedor que Docker no conoce."""

    url: str | None = None
    description: str | None = None
    # Contenedores o herramientas de los que depende (aristas del grafo).
    depends_on: list[str] = Field(default_factory=list)


class EdgeConfig(BaseModel):
    source: str
    target: str


class Settings(BaseModel):
    cerbero_url: str | None = None
    host_root: str = "/"
    public_host: str | None = None
    disks: list[str] = Field(default_factory=lambda: ["/"])
    containers: dict[str, ContainerConfig] = Field(default_factory=dict)
    tools: list[ToolConfig] = Field(default_factory=list)
    edges: list[EdgeConfig] = Field(default_factory=list)
    # Ruta del YAML cargado (informativo).
    config_path: str | None = None

    def tool_for_container(self, container_name: str) -> ToolConfig | None:
        for tool in self.tools:
            if tool.container == container_name:
                return tool
        return None


def _find_config_file() -> Path | None:
    env_path = os.environ.get("DIS_CONFIG")
    if env_path:
        path = Path(env_path)
        if not path.is_file():
            raise FileNotFoundError(f"DIS_CONFIG apunta a un fichero inexistente: {path}")
        return path
    for candidate in (Path("dis.yaml"), Path("../dis.yaml")):
        if candidate.is_file():
            return candidate
    return None


def load_settings(path: Path | None = None) -> Settings:
    """Carga el YAML y aplica los overrides de entorno."""
    path = path or _find_config_file()
    data: dict = {}
    if path is not None:
        with path.open(encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        if not isinstance(data, dict):
            raise ValueError(f"{path}: se esperaba un mapa de claves (cerbero_url, tools...)")
        data["config_path"] = str(path)

    env_overrides = {
        "cerbero_url": os.environ.get("CERBERO_URL"),
        "host_root": os.environ.get("DIS_HOST_ROOT"),
        "public_host": os.environ.get("DIS_PUBLIC_HOST"),
    }
    for key, value in env_overrides.items():
        if value:
            data[key] = value
    if disks := os.environ.get("DIS_DISKS"):
        data["disks"] = [d.strip() for d in disks.split(",") if d.strip()]

    settings = Settings.model_validate(data)
    if settings.cerbero_url:
        settings.cerbero_url = settings.cerbero_url.rstrip("/")
    return settings


@dataclass
class _Loaded:
    # (ruta, mtime en ns) del YAML con el que se cargó; None si no hay fichero.
    key: tuple[str | None, int | None]
    settings: Settings
    loaded_at: float
    # Último intento fallido de recarga (se sigue sirviendo ``settings``).
    error: str | None = None


_loaded: _Loaded | None = None
_lock = threading.Lock()


def get_settings() -> Settings:
    """Config actual, recargada si el YAML ha cambiado desde la última lectura.

    En cada petición solo se hace un ``stat`` del fichero. Si el YAML nuevo no es
    válido se mantiene la última config buena y el error queda en
    ``config_status()`` para mostrarlo en la UI. La primera carga sí falla.
    """
    global _loaded
    with _lock:
        try:
            path = _find_config_file()
            key = (str(path), path.stat().st_mtime_ns) if path else (None, None)
        except OSError:
            # El editor puede estar sustituyendo el fichero justo ahora.
            if _loaded is None:
                raise
            return _loaded.settings
        if _loaded is not None and _loaded.key == key:
            return _loaded.settings
        try:
            settings = load_settings(path)
        except (OSError, ValueError, yaml.YAMLError) as exc:
            if _loaded is None:
                raise
            log.warning("Config no recargada (%s); se mantiene la anterior: %s", path, exc)
            _loaded.key, _loaded.error = key, str(exc)
            return _loaded.settings
        if _loaded is not None:
            log.info("Config recargada desde %s", path)
        _loaded = _Loaded(key=key, settings=settings, loaded_at=time.time())
        return settings


def config_status() -> tuple[str | None, float | None, str | None]:
    """(ruta, momento de la última carga buena, error de la última recarga)."""
    with _lock:
        if _loaded is None:
            return None, None, None
        return _loaded.key[0], _loaded.loaded_at, _loaded.error


def reset_settings_cache() -> None:
    """Olvida la config cargada (tests)."""
    global _loaded
    with _lock:
        _loaded = None


def resolve_url(url: str | None, request_host: str | None, settings: Settings) -> str | None:
    """Sustituye ``{host}`` por el host público configurado o el de la petición.

    Así el mismo enlace funciona desde la LAN (192.168.x.x) y desde Tailscale
    (server-kuro.tailnet) sin tocar la config.
    """
    if not url:
        return None
    host = settings.public_host or request_host or "localhost"
    return url.replace("{host}", host)
