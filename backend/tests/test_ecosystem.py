import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app import cerbero, docker_service
from app.config import EdgeConfig, Settings, ToolConfig
from app.docker_service import DockerUnavailableError

from .fakes import FakeClient, FakeContainer, default_containers


@pytest.fixture
def settings() -> Settings:
    return Settings(
        disks=["/"],
        tools=[
            ToolConfig(id="dis", name="Dis", container="dis", self=True, url="http://{host}:1"),
            ToolConfig(
                id="caronte", name="Caronte", url="http://{host}:8081", depends_on=["minos-db"]
            ),
            ToolConfig(id="minos", name="Minos", container="minos-app", depends_on=["minos-db"]),
            ToolConfig(id="cerbero", name="Cerbero", stage="development"),
            ToolConfig(id="gerion", name="Gerión", stage="idea", depends_on=["ghost"]),
        ],
        edges=[
            EdgeConfig(source="minos-adminer", target="minos-db"),
            EdgeConfig(source="minos-app", target="minos-db"),  # duplicada vía alias
        ],
    )


@pytest.fixture
def fake_docker(monkeypatch: pytest.MonkeyPatch) -> FakeClient:
    items = [*default_containers(), FakeContainer("minos-app", state="restarting")]
    client = FakeClient(items)
    monkeypatch.setattr(docker_service, "get_client", lambda: client)
    return client


def test_tools(client: TestClient, fake_docker: FakeClient) -> None:
    body = {t["id"]: t for t in client.get("/api/tools", headers={"host": "kuro"}).json()}
    assert body["dis"]["status"] == "running"
    assert body["dis"]["url"] is None and body["dis"]["is_self"] is True
    assert body["caronte"]["status"] == "running"
    assert body["caronte"]["url"] == "http://kuro:8081"
    assert body["minos"]["status"] == "restarting"  # hereda del contenedor
    assert body["cerbero"]["status"] == "development"
    assert body["gerion"]["status"] == "idea"


def test_graph(client: TestClient, fake_docker: FakeClient) -> None:
    g = client.get("/api/graph").json()
    nodes = {n["id"]: n for n in g["nodes"]}
    # minos-app queda absorbido por la herramienta minos.
    assert "minos-app" not in nodes
    assert nodes["minos"]["type"] == "tool" and nodes["minos"]["container"] == "minos-app"
    assert nodes["minos-db"]["type"] == "container"
    # Dependencia inexistente → nodo fantasma parado.
    assert nodes["ghost"]["status"] == "stopped"
    # dis sin contenedor "dis" en Docker: sigue siendo "running" (self).
    assert nodes["dis"]["status"] == "running"
    edges = {(e["source"], e["target"]) for e in g["edges"]}
    assert edges == {
        ("caronte", "minos-db"),
        ("minos", "minos-db"),
        ("gerion", "ghost"),
        ("minos-adminer", "minos-db"),
    }
    assert g["docker_available"] is True


def test_graph_without_docker(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> None:
        raise DockerUnavailableError("no socket")

    monkeypatch.setattr(docker_service, "get_client", boom)
    g = client.get("/api/graph").json()
    assert g["docker_available"] is False
    assert {n["id"] for n in g["nodes"]} >= {"dis", "caronte", "minos-db"}
    assert client.get("/api/tools").status_code == 200


def test_alerts_not_configured(client: TestClient) -> None:
    assert client.get("/api/alerts").json() == {"connected": False, "alerts": [], "error": None}


def test_alerts_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/alerts"
        return httpx.Response(200, json={"alerts": [{"level": "warn", "msg": "RAM > 90%"}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        cerbero.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    res = asyncio.run(cerbero.fetch_alerts(Settings(cerbero_url="http://cerbero:9000")))
    assert res.connected and res.alerts == [{"level": "warn", "msg": "RAM > 90%"}]


def test_alerts_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        cerbero.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    res = asyncio.run(cerbero.fetch_alerts(Settings(cerbero_url="http://cerbero:9000")))
    assert res.connected is False and "refused" in (res.error or "")
