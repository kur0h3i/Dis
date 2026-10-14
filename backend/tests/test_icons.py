from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import docker_service, icons
from app.config import AutodetectConfig, ContainerConfig, Settings, ToolConfig
from app.icons import (
    CDN,
    container_names,
    declared_icon,
    favicon_urls,
    guess_icons,
    image_names,
)

from .fakes import FakeClient, FakeContainer

TREE = {
    "svg": ["postgres.svg", "adminer.svg", "immich.svg", "nextcloud.svg"],
    "png": ["postgres.png", "adminer.png", "immich.png", "nextcloud.png", "romm.png"],
    "webp": ["postgres.webp", "adminer.webp", "immich.webp", "nextcloud.webp", "romm.webp"],
}


def cdn(name: str, fmt: str = "svg") -> str:
    return f"{CDN}/{fmt}/{name}.{fmt}"


@pytest.mark.parametrize(
    ("image", "expected"),
    [
        ("postgres:16-alpine", ["postgres"]),
        ("adminer", ["adminer"]),
        ("ghcr.io/immich-app/immich-server:release", ["immich-server", "immich", "immich-app"]),
        ("lscr.io/linuxserver/nextcloud:latest", ["nextcloud"]),
        ("rommapp/romm@sha256:abc", ["romm", "rommapp"]),
        # Alias: el logo tiene otro nombre en el catálogo.
        ("mongo:7", ["mongodb"]),
        ("tensorchord/pgvecto-rs:pg14-v0.2.0", ["postgres", "pgvecto", "tensorchord"]),
        # Nombres genéricos (hay logos que se llaman así): manda el namespace.
        ("vaultwarden/server:latest", ["vaultwarden"]),
        # Registro con puerto, sin namespace.
        ("localhost:5000/myapp:1", ["myapp"]),
        ("localhost/myapp", ["myapp"]),
        ("sha256:0123456789abcdef", []),
        ("", []),
    ],
)
def test_image_names(image: str, expected: list[str]) -> None:
    assert image_names(image) == expected


def test_container_names_and_favicons() -> None:
    assert container_names("gathers-web-1") == ["gathers-web", "gathers"]
    assert container_names("immich_server") == ["immich-server", "immich"]
    assert favicon_urls("http://{host}:8081") == [
        "http://{host}:8081/favicon.svg",
        "http://{host}:8081/favicon.ico",
    ]
    # Detrás de un proxy con ruta: relativo a ella.
    assert favicon_urls("https://h/nextcloud/")[0] == "https://h/nextcloud/favicon.svg"
    assert favicon_urls(None) == []


def test_declared_icon() -> None:
    assert declared_icon("Nextcloud") == [cdn("nextcloud")]
    assert declared_icon("nextcloud.png") == [cdn("nextcloud", "png")]
    assert declared_icon("http://{host}:8081/logo.svg") == ["http://{host}:8081/logo.svg"]
    assert declared_icon("/dis.svg") == ["/dis.svg"]
    assert declared_icon("  ") == [] and declared_icon(None) == []
    # Con índice, el formato en que existe.
    icons.set_catalog(TREE)
    assert declared_icon("romm") == [cdn("romm", "webp")]


def test_guess_icons_without_catalog_tries_everything_as_svg() -> None:
    assert guess_icons(
        "ghcr.io/immich-app/immich-server", "http://{host}:2283", "immich_server"
    ) == [
        cdn("immich-server"),
        cdn("immich"),
        cdn("immich-app"),
        "http://{host}:2283/favicon.svg",
        "http://{host}:2283/favicon.ico",
    ]


def test_guess_icons_with_catalog() -> None:
    icons.set_catalog(TREE)
    # Solo el primero que existe, en su formato más ligero.
    assert guess_icons("ghcr.io/immich-app/immich-server", None, "immich_server") == [cdn("immich")]
    assert guess_icons("rommapp/romm", None, "romm") == [cdn("romm", "webp")]
    # Imagen propia: favicon de su web y, por último, el nombre del contenedor.
    assert guess_icons("gathers-web:latest", "http://{host}:3000", "nextcloud-gathers") == [
        "http://{host}:3000/favicon.svg",
        "http://{host}:3000/favicon.ico",
        cdn("nextcloud"),
    ]
    assert guess_icons("caronte:latest", None, "caronte") == []


class _SyncThread:
    """Ejecuta la descarga en el acto para poder comprobar el resultado."""

    started = 0

    def __init__(self, target: Any, **_: Any) -> None:
        self._target = target

    def start(self) -> None:
        type(self).started += 1
        self._target()


def test_catalog_download_in_background(monkeypatch: pytest.MonkeyPatch) -> None:
    now = [1000.0]
    responses: list[Any] = [ValueError("sin red"), TREE]

    def download() -> dict:
        r = responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(icons, "CATALOG_URL", "http://catalogo/tree.json")
    monkeypatch.setattr(icons, "_download", download)
    monkeypatch.setattr(icons.threading, "Thread", _SyncThread)
    monkeypatch.setattr(icons.time, "monotonic", lambda: now[0])
    _SyncThread.started = 0

    # Falla: se sigue a ciegas y no se reintenta hasta pasados RETRY_S.
    assert icons.catalog_url("romm") == cdn("romm")
    assert icons.catalog_url("romm") == cdn("romm")
    assert _SyncThread.started == 1

    now[0] += icons.RETRY_S + 1
    icons.catalog_url("romm")
    assert _SyncThread.started == 2
    assert icons.catalog_url("romm") == cdn("romm", "webp")
    assert icons.catalog_url("nope") is None


# --- API ---------------------------------------------------------------------


@pytest.fixture
def docker_icons(monkeypatch: pytest.MonkeyPatch) -> FakeClient:
    icons.set_catalog(TREE)
    fake = FakeClient(
        [
            FakeContainer("minos-db", image="postgres:16"),
            FakeContainer(
                "minos-adminer",
                image="adminer",
                ports={"8080/tcp": [{"HostIp": "0.0.0.0", "HostPort": "9080"}]},
            ),
            FakeContainer(
                "caronte",
                image="caronte:latest",
                ports={"8081/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8081"}]},
            ),
            FakeContainer("custom", image="postgres:16", labels={"dis.icon": "romm"}),
            FakeContainer("hidden", image="postgres:16", labels={"dis.icon": ""}),
            FakeContainer("dis", image="dis:latest"),
        ]
    )
    monkeypatch.setattr(docker_service, "get_client", lambda: fake)
    return fake


def test_container_icons(client: TestClient, settings: Settings, docker_icons: FakeClient) -> None:
    settings.containers["minos-adminer"] = ContainerConfig(icon="https://img/adminer.png")
    body = {c["name"]: c for c in client.get("/api/containers", headers={"host": "kuro"}).json()}
    assert body["minos-db"]["icons"] == [cdn("postgres")]
    # dis.yaml manda sobre lo deducido; la label, sobre todo lo demás.
    assert body["minos-adminer"]["icons"] == ["https://img/adminer.png"]
    assert body["custom"]["icons"] == [cdn("romm", "webp")]
    assert body["hidden"]["icons"] == []
    assert body["dis"]["icons"] == []  # sin herramienta "dis" con self: true
    # Imagen propia: el favicon de su web, ya con el host resuelto.
    assert body["caronte"]["icons"] == [
        "http://kuro:8081/favicon.svg",
        "http://kuro:8081/favicon.ico",
    ]
    detail = client.get("/api/containers/caronte", headers={"host": "kuro"}).json()
    assert detail["icons"][0] == "http://kuro:8081/favicon.svg"

    settings.autodetect = AutodetectConfig(icons=False)
    body = {c["name"]: c for c in client.get("/api/containers").json()}
    assert body["minos-db"]["icons"] == []
    assert body["custom"]["icons"] == [cdn("romm", "webp")]


def test_tool_and_graph_icons(
    client: TestClient, settings: Settings, docker_icons: FakeClient
) -> None:
    settings.tools = [
        ToolConfig(id="dis", name="Dis", container="dis", self=True),
        ToolConfig(id="caronte", name="Caronte"),  # su contenedor se llama igual
        ToolConfig(id="minos", name="Minos", url="http://{host}:8082"),
        ToolConfig(id="db", name="BD", container="minos-db", icon="nextcloud"),
        ToolConfig(id="gerion", name="Gerión", stage="idea"),
    ]
    tools = {t["id"]: t for t in client.get("/api/tools", headers={"host": "kuro"}).json()}
    assert tools["dis"]["icons"] == ["/dis.svg"]
    assert tools["dis"]["container"] == "dis"
    assert tools["caronte"]["icons"][0] == "http://kuro:8081/favicon.svg"
    assert tools["minos"]["icons"] == [
        "http://kuro:8082/favicon.svg",
        "http://kuro:8082/favicon.ico",
    ]
    assert tools["db"]["icons"] == [cdn("nextcloud")]
    assert tools["gerion"]["icons"] == []

    # El contenedor comparte el logo declarado en su herramienta.
    body = {c["name"]: c for c in client.get("/api/containers", headers={"host": "kuro"}).json()}
    assert body["minos-db"]["icons"] == [cdn("nextcloud")]
    assert body["caronte"]["icons"] == tools["caronte"]["icons"]
    assert body["dis"]["icons"] == ["/dis.svg"]

    nodes = {n["id"]: n for n in client.get("/api/graph", headers={"host": "kuro"}).json()["nodes"]}
    # El favicon queda detrás, por si el navegador no llega al CDN.
    assert nodes["minos-adminer"]["icons"] == [
        cdn("adminer"),
        "http://kuro:9080/favicon.svg",
        "http://kuro:9080/favicon.ico",
    ]
    assert nodes["caronte"]["icons"] == tools["caronte"]["icons"]
    assert nodes["db"]["icons"] == [cdn("nextcloud")]
