"""Proxy mínimo hacia Cerbero (monitor de recursos, Docker y accesos).

Cerbero está en desarrollo: si ``CERBERO_URL`` no está configurada devolvemos
``{connected: false}`` y el frontend muestra "Cerbero no conectado".
"""

from __future__ import annotations

import logging

import httpx

from .config import Settings
from .models import Alerts

log = logging.getLogger(__name__)

TIMEOUT_S = 3.0


async def fetch_alerts(settings: Settings) -> Alerts:
    if not settings.cerbero_url:
        return Alerts(connected=False)
    # TODO: fijar el contrato real cuando exista la API de Cerbero (y auth si la tiene).
    url = f"{settings.cerbero_url}/api/alerts"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.info("Cerbero no responde en %s: %s", url, exc)
        return Alerts(connected=False, error=str(exc) or type(exc).__name__)

    alerts = data.get("alerts", []) if isinstance(data, dict) else data
    if not isinstance(alerts, list):
        alerts = []
    return Alerts(connected=True, alerts=[a for a in alerts if isinstance(a, dict)])
