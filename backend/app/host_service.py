"""Métricas del host (CPU, RAM, discos) con psutil.

Dentro de Docker, ``/proc/stat`` y ``/proc/meminfo`` ya reflejan el host (no están
aislados por namespace), así que CPU y RAM salen bien sin privilegios extra. Los
discos sí dependen del mount namespace: montamos la raíz del host en
``DIS_HOST_ROOT`` (``/hostfs``) y medimos ``<host_root><mountpoint>``.

El histórico de 5 minutos vive en un buffer circular en memoria que rellena una
tarea asyncio del propio proceso (sin workers ni Redis). Se pierde al reiniciar,
que para un sparkline de 5 min es irrelevante.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
from collections import deque

import psutil

from .config import Settings
from .models import DiskUsage, Resources, ResourceSample

log = logging.getLogger(__name__)

SAMPLE_INTERVAL_S = 10
HISTORY_WINDOW_S = 5 * 60
GB = 1024**3


class HostSampler:
    """Muestrea CPU y RAM cada ``interval`` segundos y guarda los últimos 5 min."""

    def __init__(self, interval: float = SAMPLE_INTERVAL_S, window: float = HISTORY_WINDOW_S):
        self.interval = interval
        self.history: deque[ResourceSample] = deque(maxlen=int(window // interval))
        self._task: asyncio.Task | None = None

    def sample(self, cpu_interval: float | None = None) -> ResourceSample:
        # interval=None → % desde la llamada anterior (no bloquea). La primera vez
        # se mide durante un intervalo corto para no devolver 0.0.
        cpu = psutil.cpu_percent(interval=cpu_interval)
        mem = psutil.virtual_memory()
        s = ResourceSample(
            ts=time.time(),
            cpu_pct=round(cpu, 1),
            ram_used_gb=round((mem.total - mem.available) / GB, 2),
        )
        self.history.append(s)
        return s

    def latest(self) -> ResourceSample:
        if not self.history:
            return self.sample(cpu_interval=0.3)
        return self.history[-1]

    async def _run(self) -> None:
        await asyncio.to_thread(self.sample, 0.3)
        while True:
            await asyncio.sleep(self.interval)
            try:
                self.sample()
            except Exception:  # pragma: no cover - no queremos matar el bucle
                log.exception("Error muestreando recursos del host")

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="dis-host-sampler")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None


def _disk_usage(settings: Settings) -> list[DiskUsage]:
    disks: list[DiskUsage] = []
    root = settings.host_root.rstrip("/")
    for mountpoint in settings.disks:
        path = f"{root}{mountpoint}" if root else mountpoint
        try:
            du = psutil.disk_usage(path or "/")
        except OSError as exc:
            log.warning("No se pudo leer el disco %s (%s): %s", mountpoint, path, exc)
            continue
        disks.append(
            DiskUsage(
                mountpoint=mountpoint,
                used_gb=round(du.used / GB, 1),
                total_gb=round(du.total / GB, 1),
                pct=round(du.percent, 1),
            )
        )
    return disks


def get_resources(sampler: HostSampler, settings: Settings) -> Resources:
    latest = sampler.latest()
    mem = psutil.virtual_memory()
    used = mem.total - mem.available
    return Resources(
        cpu_pct=latest.cpu_pct,
        cpu_count=psutil.cpu_count() or os.cpu_count() or 1,
        ram_used_gb=round(used / GB, 2),
        ram_total_gb=round(mem.total / GB, 2),
        ram_pct=round(used / mem.total * 100, 1) if mem.total else 0.0,
        disks=_disk_usage(settings),
        history_5m=list(sampler.history),
    )
