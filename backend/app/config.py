"""Configuración de Dis.

La fuente principal es un fichero YAML (``dis.yaml``) con las herramientas del
ecosistema, las URLs de los contenedores y las aristas del grafo. Algunas claves
se pueden sobrescribir con variables de entorno:

- ``DIS_CONFIG``       ruta al YAML (por defecto ``./dis.yaml``, luego ``../dis.yaml``)
- ``CERBERO_URL``      URL base de la API de Cerbero
- ``DIS_HOST_ROOT``    dónde está montada la raíz del host (``/hostfs`` en Docker)
- ``DIS_PUBLIC_HOST``  host con el que construir los enlaces (``{host}`` en las URLs)
- ``DIS_DISKS``        puntos de montaje a mostrar, separados por comas (``/,/home``)
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, field_validator

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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()


def resolve_url(url: str | None, request_host: str | None, settings: Settings) -> str | None:
    """Sustituye ``{host}`` por el host público configurado o el de la petición.

    Así el mismo enlace funciona desde la LAN (192.168.x.x) y desde Tailscale
    (server-kuro.tailnet) sin tocar la config.
    """
    if not url:
        return None
    host = settings.public_host or request_host or "localhost"
    return url.replace("{host}", host)
