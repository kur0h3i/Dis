import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app import cerbero, docker_service
from app.config import EdgeConfig, Settings, ToolConfig
from app.docker_service import DockerUnavailableError
from app.ecosystem import build_tools
from app.models import ContainerSummary

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


def test_graph_edges_from_container_labels(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    items = [
        *default_containers(),
        FakeContainer("caronte", labels={"dis.depends_on": "minos-db"}),
        FakeContainer("grafana", labels={"dis.depends_on": "prometheus"}),
    ]
    fake = FakeClient(items)
    monkeypatch.setattr(docker_service, "get_client", lambda: fake)
    g = client.get("/api/graph").json()
    edges = {(e["source"], e["target"]) for e in g["edges"]}
    # caronte es la herramienta (misma arista que su depends_on: no se duplica).
    assert [e for e in g["edges"] if e["source"] == "caronte"] == [
        {"source": "caronte", "target": "minos-db"}
    ]
    assert ("grafana", "prometheus") in edges
    nodes = {n["id"]: n for n in g["nodes"]}
    assert nodes["prometheus"]["status"] == "stopped"  # aún no existe: fantasma


def test_tool_links_container_with_same_name(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Caronte no declara `container`, pero hay un contenedor "caronte": son lo
    # mismo. Antes el contenedor pisaba al nodo de la herramienta en el grafo.
    items = [*default_containers(), FakeContainer("caronte", state="exited")]
    client_ = FakeClient(items)
    monkeypatch.setattr(docker_service, "get_client", lambda: client_)

    tools = {t["id"]: t for t in client.get("/api/tools").json()}
    assert tools["caronte"]["container"] == "caronte"
    assert tools["caronte"]["status"] == "stopped"  # hereda del contenedor

    g = client.get("/api/graph").json()
    caronte = [n for n in g["nodes"] if n["id"] == "caronte"]
    assert len(caronte) == 1
    assert caronte[0]["type"] == "tool" and caronte[0]["label"] == "Caronte"
    assert caronte[0]["container"] == "caronte" and caronte[0]["status"] == "stopped"
    assert {"source": "caronte", "target": "minos-db"} in g["edges"]


def test_same_name_container_claimed_by_other_tool() -> None:
    settings = Settings(
        tools=[
            ToolConfig(id="caronte", name="Caronte"),
            ToolConfig(id="caronte-v2", name="Caronte v2", container="caronte"),
        ]
    )
    containers = [
        ContainerSummary(
            id="c1", name="caronte", image="x", status="running", state="running", ports=[]
        )
    ]
    tools = {t.id: t for t in build_tools(settings, containers, None)}
    # Quien lo declara explícitamente se lo queda.
    assert tools["caronte"].container is None
    assert tools["caronte-v2"].container == "caronte"


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
