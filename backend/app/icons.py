"""Logos de los servicios.

Cada contenedor lleva una lista de URLs candidatas (``icons``), de la más a la
menos probable; el navegador se queda con la primera que carga y, si ninguna lo
hace, pinta un monograma con la inicial. Orden:

1. Lo declarado a mano: label ``dis.icon`` o ``icon:`` en ``dis.yaml``. Vale un
   nombre del catálogo (``nextcloud``, ``nextcloud.png``) o una URL; vacío = sin
   logo. Si se declara, no se deduce nada más.
2. El catálogo `dashboard-icons <https://github.com/homarr-labs/dashboard-icons>`_
   (el de Homepage, con más de 2.000 servicios self-hosted), buscando por el
   nombre de la imagen: ``ghcr.io/immich-app/immich-server`` → ``immich-server``,
   ``immich``...
3. El favicon de su web, si tiene enlace (tus herramientas propias).
4. El catálogo otra vez, ahora por el nombre del contenedor o herramienta.

El índice del catálogo (``tree.json``, ~200 KB) se descarga en segundo plano la
primera vez que hace falta y se refresca cada día. Mientras no está (sin
Internet, por ejemplo) los nombres se proponen a ciegas en SVG, y el navegador
descarta los que no existan.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from collections.abc import Iterable, Mapping
from urllib.parse import urljoin

import httpx

log = logging.getLogger(__name__)

CDN = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons"
# ``None`` desactiva la descarga del índice (tests).
CATALOG_URL: str | None = f"{CDN}/tree.json"
CATALOG_TIMEOUT_S = 10.0
REFRESH_S = 24 * 3600
RETRY_S = 600
# Del más ligero y nítido al más pesado; el catálogo tiene PNG y WebP de todo.
FORMATS = ("svg", "webp", "png")

# Imágenes cuyo logo tiene otro nombre en el catálogo.
ALIASES = {
    "actualbudget": "actual-budget",
    "adguardhome": "adguard-home",
    "collabora": "collabora-online",
    "eclipse-mosquitto": "mosquitto",
    "fireflyiii": "firefly-iii",
    "goauthentik": "authentik",
    "homeassistant": "home-assistant",
    "mongo": "mongodb",
    "mssql": "microsoft-sql-server",
    "pgadmin4": "pgadmin",
    "pgvecto-rs": "postgres",
    "pgvector": "postgres",
    "pihole": "pi-hole",
    "pms-docker": "plex",
    "postgis": "postgres",
    "stirling-tools": "stirling-pdf",
    "wg-easy": "wireguard",
}
# Namespaces que no dicen nada del servicio (``linuxserver/nextcloud``).
GENERIC_NAMESPACES = frozenset(
    {"library", "linuxserver", "lscr", "bitnami", "hotio", "_", "docker", "ghcr"}
)
# Nombres demasiado genéricos para fiarse de ellos (``vaultwarden/server``,
# ``collabora/code``): el catálogo tiene logos con esos nombres que no son el servicio.
GENERIC_NAMES = frozenset({"api", "app", "base", "code", "core", "node", "python", "server", "web"})
# Candidatos por nombre de imagen y por nombre de contenedor.
MAX_NAMES = 4
FAVICONS = ("favicon.svg", "favicon.ico")

_SEPARATORS = re.compile(r"[-_.]+")
_REPLICA = re.compile(r"-\d+$")
_HEX = re.compile(r"^[0-9a-f]{12,}$")


# --- Índice del catálogo ----------------------------------------------------

# Nombre → formato más ligero en que existe. ``None`` hasta la primera descarga.
_catalog: dict[str, str] | None = None
_last_attempt: float | None = None
_fetching = False
_lock = threading.Lock()


def set_catalog(tree: Mapping[str, Iterable[str]] | None) -> None:
    """Carga el índice (``{"svg": ["nextcloud.svg", ...], "png": [...]}``)."""
    global _catalog
    if tree is None:
        _catalog = None
        return
    catalog: dict[str, str] = {}
    # Del formato menos preferido al más: el último que se escribe gana.
    for fmt in reversed(FORMATS):
        files = tree.get(fmt)
        suffix = f".{fmt}"
        for file in files if isinstance(files, list) else []:
            if isinstance(file, str) and file.endswith(suffix):
                catalog[file[: -len(suffix)]] = fmt
    if not catalog:
        # Mejor seguir a ciegas que quedarse sin ningún logo.
        raise ValueError("índice de logos vacío o con otro formato")
    _catalog = catalog


def reset_catalog() -> None:
    """Olvida el índice y los intentos de descarga (tests)."""
    global _last_attempt, _fetching
    set_catalog(None)
    with _lock:
        _last_attempt, _fetching = None, False


def _download() -> dict:
    assert CATALOG_URL is not None
    resp = httpx.get(CATALOG_URL, timeout=CATALOG_TIMEOUT_S, follow_redirects=True)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        raise ValueError("tree.json no es un objeto")
    return data


def _refresh() -> None:
    global _fetching
    try:
        set_catalog(_download())
        log.info("Catálogo de logos cargado: %d iconos", len(_catalog or {}))
    except (httpx.HTTPError, ValueError) as exc:
        log.info("Catálogo de logos no disponible (%s); se reintentará", exc)
    finally:
        with _lock:
            _fetching = False


def _ensure_catalog() -> None:
    """Lanza la descarga en segundo plano si toca; nunca bloquea la petición."""
    global _last_attempt, _fetching
    if CATALOG_URL is None:
        return
    now = time.monotonic()
    with _lock:
        wait = REFRESH_S if _catalog is not None else RETRY_S
        if _fetching or (_last_attempt is not None and now - _last_attempt < wait):
            return
        _last_attempt, _fetching = now, True
    threading.Thread(target=_refresh, name="dis-icons", daemon=True).start()


def catalog_url(name: str, fmt: str | None = None) -> str | None:
    """URL del logo ``name`` en el catálogo, o ``None`` si no está.

    Sin índice todavía, la URL del SVG a ciegas (el navegador descarta la que
    no exista)."""
    _ensure_catalog()
    catalog = _catalog
    if catalog is not None:
        if name not in catalog:
            return None
        fmt = fmt or catalog[name]
    fmt = fmt or FORMATS[0]
    return f"{CDN}/{fmt}/{name}.{fmt}"


# --- Candidatos -------------------------------------------------------------


def declared_icon(value: str | None) -> list[str]:
    """``dis.icon`` / ``icon:`` → URL. Un nombre del catálogo, con o sin extensión
    (``nextcloud``, ``nextcloud.png``), o una URL o ruta, tal cual."""
    value = (value or "").strip()
    if not value:
        return []
    if "/" in value or ":" in value:
        return [value]
    name, _, ext = value.lower().rpartition(".")
    if name and ext in FORMATS:
        return [f"{CDN}/{ext}/{name}.{ext}"]
    return [catalog_url(value.lower()) or f"{CDN}/{FORMATS[0]}/{value.lower()}.{FORMATS[0]}"]


def _variants(name: str) -> list[str]:
    """``immich_server`` → ``[immich-server, immich]`` (con alias aplicados)."""
    name = _SEPARATORS.sub("-", name.lower()).strip("-")
    if not name or _HEX.match(name):
        return []
    out = [name]
    first = name.split("-", 1)[0]
    if first != name and len(first) >= 3:
        out.append(first)
    return [a for a in (ALIASES.get(n, n) for n in out) if a not in GENERIC_NAMES]


def image_names(image: str | None) -> list[str]:
    """Nombres del catálogo que puede tener una imagen, del más al menos probable.

    ``ghcr.io/immich-app/immich-server:v1@sha256:…`` → ``[immich-server, immich,
    immich-app]``; ``postgres:16`` → ``[postgres]``.
    """
    ref = (image or "").split("@", 1)[0]
    if ref.startswith("sha256:"):  # imagen sin etiqueta: solo queda el id
        return []
    parts = [p for p in ref.split("/") if p]
    if not parts:
        return []
    repo = parts[-1].split(":", 1)[0]
    names = _variants(repo)
    if len(parts) >= 2:
        namespace = parts[-2].lower()
        # El primer tramo puede ser el registro (``ghcr.io``, ``registry:5000``),
        # con la misma regla que Docker.
        is_registry = len(parts) == 2 and (
            "." in namespace or ":" in namespace or namespace == "localhost"
        )
        if not is_registry and namespace not in GENERIC_NAMESPACES:
            names += _variants(namespace)
    return _dedupe(names)[:MAX_NAMES]


def container_names(name: str) -> list[str]:
    """``gathers-web-1`` (réplica de Compose) → ``[gathers-web, gathers]``."""
    return _variants(_REPLICA.sub("", name))[:MAX_NAMES]


def favicon_urls(url: str | None) -> list[str]:
    """Favicons de la web del servicio (``http://{host}:8081`` → ``…/favicon.svg``)."""
    # Relativo a la ruta del enlace: ``http://h/nextcloud/`` → ``…/nextcloud/favicon.svg``.
    return [urljoin(url, f) for f in FAVICONS] if url else []


def _catalog_candidates(names: list[str]) -> list[str]:
    urls = [catalog_url(n) for n in names]
    found = [u for u in urls if u]
    # Con índice, basta la primera que existe: las demás no se llegarían a pedir.
    return found[:1] if _catalog is not None else found


def guess_icons(image: str | None, url: str | None, name: str) -> list[str]:
    """Candidatos deducidos: imagen en el catálogo, favicon y nombre en el catálogo."""
    by_image = image_names(image)
    by_name = [n for n in container_names(name) if n not in by_image]
    return _dedupe(
        [
            *_catalog_candidates(by_image),
            *favicon_urls(url),
            *_catalog_candidates(by_name),
        ]
    )


def _dedupe(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))
