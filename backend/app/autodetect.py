"""Autodetección: lo que Dis deduce de Docker cuando un contenedor no lo declara.

- **URL**: el primer puerto web publicado (``http://{host}:PUERTO``).
- **Descripción**: las labels OCI de la imagen (``org.opencontainers.image.*``).
- **Dependencias**: el ``depends_on`` de Docker Compose, que Compose guarda en la
  label ``com.docker.compose.depends_on`` de cada contenedor.

Lo declarado a mano (labels ``dis.*`` o ``dis.yaml``) siempre tiene prioridad, y
cada deducción se puede desactivar en ``autodetect:`` de ``dis.yaml``.
"""

from __future__ import annotations

from collections.abc import Mapping

from .models import PortMapping

# Puertos del contenedor que casi nunca son una web: bases de datos, colas,
# SSH, correo, DNS... Un contenedor que solo publica estos no tiene enlace.
NON_WEB_PORTS = frozenset(
    {
        21, 22, 23, 25, 53, 110, 143, 389, 445, 465, 587, 636, 993, 995, 1433, 1521,
        1883, 2375, 2376, 3306, 3389, 4222, 5432, 5672, 5900, 6379, 6380, 8883, 9042,
        9092, 11211, 25565, 27017, 27018, 28015,
    }
)  # fmt: skip
HTTPS_PORTS = frozenset({443, 8443, 9443})
# Puertos de UI más habituales: si hay varios candidatos, van primero.
PREFERRED_PORTS = (80, 443, 8080, 3000, 8000, 9000)
# Publicado solo en la máquina: desde otro equipo no se puede abrir.
LOCAL_IPS = frozenset({"127.0.0.1", "::1", "localhost"})
WILDCARD_IPS = frozenset({"0.0.0.0", "::", ""})

OCI_DESCRIPTION = "org.opencontainers.image.description"
OCI_TITLE = "org.opencontainers.image.title"

COMPOSE_PROJECT = "com.docker.compose.project"
COMPOSE_SERVICE = "com.docker.compose.service"
COMPOSE_DEPENDS_ON = "com.docker.compose.depends_on"


def guess_url(ports: list[PortMapping]) -> str | None:
    """URL de la UI a partir de los puertos publicados, o ``None``."""
    candidates = [
        p
        for p in ports
        if p.host_port
        and p.protocol == "tcp"
        and (p.host_ip or "") not in LOCAL_IPS
        and p.container_port not in NON_WEB_PORTS
    ]
    if not candidates:
        return None

    def rank(p: PortMapping) -> tuple[int, int]:
        preferred = p.container_port in PREFERRED_PORTS
        order = PREFERRED_PORTS.index(p.container_port) if preferred else p.container_port
        return (0 if preferred else 1, order)

    best = min(candidates, key=rank)
    scheme = "https" if best.container_port in HTTPS_PORTS else "http"
    # Publicado en una IP concreta: el enlace tiene que ir a esa IP.
    host = "{host}" if (best.host_ip or "") in WILDCARD_IPS else best.host_ip
    default_port = 443 if scheme == "https" else 80
    port = "" if best.host_port == default_port else f":{best.host_port}"
    return f"{scheme}://{host}{port}"


def guess_description(labels: Mapping[str, str]) -> str | None:
    """Descripción (o título) que la imagen declara con labels OCI."""
    for key in (OCI_DESCRIPTION, OCI_TITLE):
        value = (labels.get(key) or "").strip()
        if value:
            return value
    return None


def compose_service(labels: Mapping[str, str]) -> tuple[str, str] | None:
    """``(proyecto, servicio)`` de Compose, o ``None`` si no es de Compose."""
    project, service = labels.get(COMPOSE_PROJECT), labels.get(COMPOSE_SERVICE)
    return (project, service) if project and service else None


def compose_dependencies(labels: Mapping[str, str]) -> list[str]:
    """Servicios de los que depende: ``"db:service_healthy:false,web:..."`` → ``[db, web]``."""
    raw = labels.get(COMPOSE_DEPENDS_ON) or ""
    services = [entry.split(":", 1)[0].strip() for entry in raw.split(",")]
    return [s for s in services if s]
