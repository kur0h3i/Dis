"""Modelos de respuesta de la API (Pydantic v2)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Estado normalizado que usa el frontend para colorear:
# running → verde, stopped → gris, restarting/paused → amarillo, unhealthy → rojo.
ContainerStatus = Literal["running", "stopped", "restarting", "paused", "unhealthy"]

# Las herramientas añaden los estadios de desarrollo (se pintan en gris).
ToolStatus = Literal[
    "running", "stopped", "restarting", "paused", "unhealthy", "development", "idea"
]


class PortMapping(BaseModel):
    container_port: int
    protocol: str = "tcp"
    host_ip: str | None = None
    host_port: int | None = None


class ContainerSummary(BaseModel):
    id: str
    name: str
    image: str
    status: ContainerStatus
    state: str = Field(description="Estado crudo de Docker (running, exited, ...)")
    health: str | None = None
    ports: list[PortMapping]
    uptime_s: int | None = None
    cpu_pct: float | None = None
    mem_mb: float | None = None
    url: str | None = None
    description: str | None = None


class EnvVar(BaseModel):
    key: str
    value: str
    masked: bool = False


class ContainerDetail(ContainerSummary):
    created: str | None = None
    started_at: str | None = None
    command: str | None = None
    env: list[EnvVar] = Field(default_factory=list)
    labels: dict[str, str] = Field(default_factory=dict)


class ContainerStats(BaseModel):
    cpu_pct: float
    mem_mb: float
    mem_limit_mb: float
    net_rx_b: int
    net_tx_b: int


class ContainerLogs(BaseModel):
    lines: list[str]


class DiskUsage(BaseModel):
    mountpoint: str
    used_gb: float
    total_gb: float
    pct: float


class ResourceSample(BaseModel):
    ts: float
    cpu_pct: float
    ram_used_gb: float


class Resources(BaseModel):
    cpu_pct: float
    cpu_count: int
    ram_used_gb: float
    ram_total_gb: float
    ram_pct: float
    disks: list[DiskUsage]
    history_5m: list[ResourceSample]


class Tool(BaseModel):
    id: str
    name: str
    description: str
    url: str | None
    status: ToolStatus
    stage: Literal["operational", "development", "idea"]
    depends_on: list[str]
    container: str | None = None
    is_self: bool = False


class GraphNode(BaseModel):
    id: str
    label: str
    type: Literal["container", "tool"]
    status: ToolStatus
    url: str | None = None
    description: str | None = None
    # Nombre del contenedor asociado (para cruzar métricas y abrir el panel).
    container: str | None = None
    is_self: bool = False


class GraphEdge(BaseModel):
    source: str
    target: str


class Graph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    docker_available: bool = True


class Alerts(BaseModel):
    connected: bool
    alerts: list[dict] = Field(default_factory=list)
    error: str | None = None
