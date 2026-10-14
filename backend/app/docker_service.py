"""Acceso de solo lectura a Docker a través del socket.

Todas las funciones son síncronas (el SDK de Docker es bloqueante); FastAPI las
ejecuta en su threadpool al declarar los endpoints con ``def``.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any

import docker
from docker.errors import DockerException, NotFound
from docker.models.containers import Container

from .autodetect import (
    compose_dependencies,
    compose_service,
    guess_description,
    guess_url,
)
from .config import Settings
from .icons import declared_icon, guess_icons
from .models import (
    ContainerDetail,
    ContainerStats,
    ContainerStatus,
    ContainerSummary,
    EnvVar,
    PortMapping,
)

log = logging.getLogger(__name__)

LOG_TAIL = 100
MB = 1024**2
SENSITIVE_MARKERS = ("PASSWORD", "SECRET", "KEY", "TOKEN")
MASK = "***"
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")

# Labels opcionales en los contenedores (tienen prioridad sobre dis.yaml).
LABEL_URL = "dis.url"
LABEL_DESCRIPTION = "dis.description"
# Dependencias separadas por comas: ``dis.depends_on: "minos-db,caronte"``.
LABEL_DEPENDS_ON = "dis.depends_on"
# Nombre del catálogo dashboard-icons o URL; vacío = sin logo.
LABEL_ICON = "dis.icon"


class DockerUnavailableError(RuntimeError):
    """No hay acceso al daemon de Docker (socket ausente o sin permisos)."""


class ContainerNotFoundError(LookupError):
    pass


_client: docker.DockerClient | None = None


def get_client() -> docker.DockerClient:
    global _client
    if _client is None:
        try:
            _client = docker.from_env(timeout=10)
            _client.ping()
        except DockerException as exc:
            _client = None
            raise DockerUnavailableError(str(exc)) from exc
    return _client


def _get_container(client: docker.DockerClient, id_or_name: str) -> Container:
    try:
        return client.containers.get(id_or_name)
    except NotFound as exc:
        raise ContainerNotFoundError(id_or_name) from exc


# --- Normalización ----------------------------------------------------------


def normalize_status(state: str, health: str | None) -> ContainerStatus:
    if state == "running":
        return "unhealthy" if health == "unhealthy" else "running"
    if state == "restarting":
        return "restarting"
    if state == "paused":
        return "paused"
    if state == "dead":
        return "unhealthy"
    return "stopped"  # created, exited, removing


def parse_ports(raw: dict[str, list[dict[str, str]] | None] | None) -> list[PortMapping]:
    """``{"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "9080"}]}`` → PortMapping."""
    ports: list[PortMapping] = []
    seen: set[tuple[int, str, int | None]] = set()
    for key, bindings in (raw or {}).items():
        port_s, _, proto = key.partition("/")
        container_port = int(port_s)
        proto = proto or "tcp"
        if not bindings:
            ports.append(PortMapping(container_port=container_port, protocol=proto))
            continue
        for b in bindings:
            host_port = int(b["HostPort"]) if b.get("HostPort") else None
            # Docker duplica cada binding para IPv4 (0.0.0.0) e IPv6 (::).
            dedup = (container_port, proto, host_port)
            if dedup in seen:
                continue
            seen.add(dedup)
            ports.append(
                PortMapping(
                    container_port=container_port,
                    protocol=proto,
                    host_ip=b.get("HostIp") or None,
                    host_port=host_port,
                )
            )
    ports.sort(key=lambda p: (p.host_port is None, p.host_port or 0, p.container_port))
    return ports


def _parse_ts(value: str | None) -> datetime | None:
    if not value or value.startswith("0001-"):
        return None
    # Docker usa nanosegundos (…:00.123456789Z); fromisoformat admite hasta µs.
    value = value.rstrip("Z")
    if "." in value:
        head, frac = value.split(".", 1)
        value = f"{head}.{frac[:6]}"
    try:
        return datetime.fromisoformat(value).replace(tzinfo=UTC)
    except ValueError:
        return None


def mask_env(raw_env: list[str] | None) -> list[EnvVar]:
    env: list[EnvVar] = []
    for item in raw_env or []:
        key, _, value = item.partition("=")
        sensitive = any(marker in key.upper() for marker in SENSITIVE_MARKERS)
        env.append(EnvVar(key=key, value=MASK if sensitive else value, masked=sensitive))
    return env


def _image_name(container: Container) -> str:
    # Config.Image es lo que se pidió al crear (``postgres:16``); evitamos
    # ``container.image``, que hace otra llamada a la API.
    return container.attrs.get("Config", {}).get("Image") or ""


def _labels(container: Container) -> dict[str, str]:
    return container.attrs.get("Config", {}).get("Labels") or {}


def _summary(container: Container, settings: Settings) -> dict[str, Any]:
    attrs = container.attrs
    state = attrs.get("State", {})
    raw_state = state.get("Status", container.status)
    health = (state.get("Health") or {}).get("Status")
    started = _parse_ts(state.get("StartedAt"))
    uptime = None
    if raw_state == "running" and started:
        uptime = max(0, int((datetime.now(UTC) - started).total_seconds()))

    labels = _labels(container)
    meta = settings.containers.get(container.name)
    auto = settings.autodetect
    ports = parse_ports(attrs.get("NetworkSettings", {}).get("Ports"))
    detected: list[str] = []

    # URL: label > dis.yaml > puerto publicado. Un ``dis.url: ""`` (o ``url: null``
    # en dis.yaml) deja el contenedor sin enlace, también sin el automático.
    if LABEL_URL in labels:
        url = labels[LABEL_URL].strip() or None
    elif meta is not None and "url" in meta.model_fields_set:
        url = meta.url or None
    else:
        url = guess_url(ports) if auto.urls else None
        if url:
            detected.append("url")

    description = labels.get(LABEL_DESCRIPTION) or (meta.description if meta else None)
    if not description and auto.descriptions:
        description = guess_description(labels)
        if description:
            detected.append("description")

    if LABEL_DEPENDS_ON in labels:
        depends_on = [d.strip() for d in labels[LABEL_DEPENDS_ON].split(",") if d.strip()]
    else:
        depends_on = list(meta.depends_on) if meta else []

    # Logo: label > dis.yaml > deducido de la imagen, el favicon o el nombre.
    image = _image_name(container)
    if LABEL_ICON in labels:
        icons = declared_icon(labels[LABEL_ICON])
    elif meta is not None and "icon" in meta.model_fields_set:
        icons = declared_icon(meta.icon)
    else:
        icons = guess_icons(image, url, container.name) if auto.icons else []

    return {
        "id": container.short_id,
        "name": container.name,
        "image": image,
        "status": normalize_status(raw_state, health),
        "state": raw_state,
        "health": health,
        "ports": ports,
        "uptime_s": uptime,
        "url": url,
        "description": description,
        "depends_on": depends_on,
        "icons": icons,
        "detected": detected,
    }


def _compose_names(containers: list[Container]) -> dict[tuple[str, str], str]:
    """(proyecto, servicio) de Compose → nombre del contenedor (la 1.ª réplica)."""
    names: dict[tuple[str, str], str] = {}
    for c in containers:
        key = compose_service(_labels(c))
        if key:
            names.setdefault(key, c.name)
    return names


def _add_compose_dependencies(
    summary: dict[str, Any], container: Container, names: dict[tuple[str, str], str]
) -> None:
    """Suma a ``depends_on`` el ``depends_on`` de Compose, traducido de nombre de
    servicio a nombre de contenedor (``db`` → ``minos-db``)."""
    labels = _labels(container)
    key = compose_service(labels)
    if key is None:
        return
    found = [names[(key[0], svc)] for svc in compose_dependencies(labels) if (key[0], svc) in names]
    new = [name for name in found if name not in summary["depends_on"]]
    if new:
        summary["depends_on"] = [*summary["depends_on"], *new]
        summary["detected"].append("depends_on")


# --- Stats ------------------------------------------------------------------


def compute_stats(raw: dict[str, Any]) -> ContainerStats:
    """Mismo cálculo que ``docker stats`` (compatible con cgroup v1 y v2)."""
    cpu = raw.get("cpu_stats") or {}
    precpu = raw.get("precpu_stats") or {}
    cpu_delta = (cpu.get("cpu_usage", {}).get("total_usage") or 0) - (
        precpu.get("cpu_usage", {}).get("total_usage") or 0
    )
    system_delta = (cpu.get("system_cpu_usage") or 0) - (precpu.get("system_cpu_usage") or 0)
    online = cpu.get("online_cpus") or len(cpu.get("cpu_usage", {}).get("percpu_usage") or []) or 1
    cpu_pct = (cpu_delta / system_delta) * online * 100 if cpu_delta > 0 and system_delta > 0 else 0

    mem = raw.get("memory_stats") or {}
    mem_stats = mem.get("stats") or {}
    usage = mem.get("usage") or 0
    # cgroup v1: total_inactive_file; cgroup v2: inactive_file.
    cache = mem_stats.get("total_inactive_file", mem_stats.get("inactive_file", 0))
    if cache < usage:
        usage -= cache
    limit = mem.get("limit") or 0

    rx = tx = 0
    for net in (raw.get("networks") or {}).values():
        rx += net.get("rx_bytes", 0)
        tx += net.get("tx_bytes", 0)

    return ContainerStats(
        cpu_pct=round(cpu_pct, 2),
        mem_mb=round(usage / MB, 1),
        mem_limit_mb=round(limit / MB, 1),
        net_rx_b=rx,
        net_tx_b=tx,
    )


def _raw_stats(container: Container) -> dict[str, Any]:
    # stream=False espera a tener dos muestras (≈1-2 s) para que precpu sea válido.
    return container.stats(stream=False)


# --- API pública ------------------------------------------------------------


def list_containers(settings: Settings, with_stats: bool = True) -> list[ContainerSummary]:
    client = get_client()
    try:
        containers = client.containers.list(all=True)
    except DockerException as exc:
        raise DockerUnavailableError(str(exc)) from exc

    summaries = [_summary(c, settings) for c in containers]
    if settings.autodetect.dependencies:
        names = _compose_names(containers)
        for summary, c in zip(summaries, containers, strict=True):
            _add_compose_dependencies(summary, c, names)

    if with_stats:
        running = [(i, c) for i, c in enumerate(containers) if c.status == "running"]
        if running:
            # Las stats tardan ~1-2 s cada una: en paralelo para no sumar latencias.
            with ThreadPoolExecutor(max_workers=min(8, len(running))) as pool:
                futures = {i: pool.submit(_raw_stats, c) for i, c in running}
            for i, fut in futures.items():
                try:
                    stats = compute_stats(fut.result())
                except Exception as exc:  # contenedor parado entre medias, etc.
                    log.debug("Sin stats para %s: %s", containers[i].name, exc)
                    continue
                summaries[i]["cpu_pct"] = stats.cpu_pct
                summaries[i]["mem_mb"] = stats.mem_mb

    result = [ContainerSummary(**s) for s in summaries]
    result.sort(key=lambda c: (c.status != "running", c.name))
    return result


def get_container(id_or_name: str, settings: Settings) -> ContainerDetail:
    container = _get_container(get_client(), id_or_name)
    attrs = container.attrs
    config = attrs.get("Config", {})
    cmd = config.get("Cmd")
    summary = _summary(container, settings)
    compose = compose_service(_labels(container))
    if compose and settings.autodetect.dependencies:
        # Solo hacen falta los contenedores del mismo proyecto de Compose.
        siblings = get_client().containers.list(
            all=True, filters={"label": f"com.docker.compose.project={compose[0]}"}
        )
        _add_compose_dependencies(summary, container, _compose_names(siblings))
    return ContainerDetail(
        **summary,
        created=attrs.get("Created"),
        started_at=attrs.get("State", {}).get("StartedAt"),
        command=" ".join(cmd) if isinstance(cmd, list) else cmd,
        env=mask_env(config.get("Env")),
        labels=config.get("Labels") or {},
    )


def get_stats(id_or_name: str) -> ContainerStats:
    container = _get_container(get_client(), id_or_name)
    if container.status != "running":
        return ContainerStats(cpu_pct=0, mem_mb=0, mem_limit_mb=0, net_rx_b=0, net_tx_b=0)
    return compute_stats(_raw_stats(container))


def get_logs(id_or_name: str, tail: int = LOG_TAIL) -> list[str]:
    container = _get_container(get_client(), id_or_name)
    raw: bytes = container.logs(tail=tail, stdout=True, stderr=True, timestamps=False)
    text = ANSI_RE.sub("", raw.decode("utf-8", errors="replace"))
    return text.splitlines()[-tail:]


# TODO: acciones de escritura (start / stop / restart). Requieren quitar el :ro
# conceptual del socket y, sobre todo, autenticación en Dis antes de exponerlas:
#
# def restart_container(id_or_name: str) -> None:
#     _get_container(get_client(), id_or_name).restart(timeout=10)
