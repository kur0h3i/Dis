import pytest
from fastapi.testclient import TestClient

from app import docker_service
from app.autodetect import compose_dependencies, guess_description, guess_url
from app.config import AutodetectConfig, ContainerConfig, Settings, ToolConfig
from app.models import PortMapping

from .fakes import FakeClient, FakeContainer


def port(container: int, host: int | None, ip: str | None = "0.0.0.0", proto: str = "tcp"):
    return PortMapping(container_port=container, protocol=proto, host_ip=ip, host_port=host)


@pytest.mark.parametrize(
    ("ports", "expected"),
    [
        ([port(8080, 9080)], "http://{host}:9080"),
        ([port(80, 80)], "http://{host}"),
        ([port(443, 443)], "https://{host}"),
        ([port(8443, 8443)], "https://{host}:8443"),
        # Bases de datos, UDP, sin publicar o solo en localhost: sin enlace.
        ([port(5432, 5432)], None),
        ([port(53, 53, proto="udp")], None),
        ([port(8080, None, ip=None)], None),
        ([port(8080, 9080, ip="127.0.0.1")], None),
        # Varios candidatos: primero los puertos de UI habituales.
        ([port(9090, 9090), port(3000, 3000), port(5432, 5432)], "http://{host}:3000"),
        ([port(9443, 9443), port(9000, 9000)], "http://{host}:9000"),
        ([port(9999, 9999), port(8081, 8081)], "http://{host}:8081"),
        # Publicado en una IP concreta: el enlace va a esa IP.
        ([port(8080, 9080, ip="192.168.1.10")], "http://192.168.1.10:9080"),
    ],
)
def test_guess_url(ports: list[PortMapping], expected: str | None) -> None:
    assert guess_url(ports) == expected


def test_guess_description_and_compose_dependencies() -> None:
    assert guess_description({"org.opencontainers.image.title": "Grafana"}) == "Grafana"
    assert (
        guess_description(
            {
                "org.opencontainers.image.title": "Grafana",
                "org.opencontainers.image.description": "Paneles",
            }
        )
        == "Paneles"
    )
    assert guess_description({}) is None
    assert compose_dependencies(
        {"com.docker.compose.depends_on": "web:service_started:false,db:service_healthy:true"}
    ) == ["web", "db"]
    assert compose_dependencies({"com.docker.compose.depends_on": ""}) == []


def compose(project: str, service: str, depends_on: str = "") -> dict[str, str]:
    return {
        "com.docker.compose.project": project,
        "com.docker.compose.service": service,
        "com.docker.compose.depends_on": depends_on,
    }


def published(container_port: int, host_port: int) -> dict:
    return {f"{container_port}/tcp": [{"HostIp": "0.0.0.0", "HostPort": str(host_port)}]}


@pytest.fixture
def stack(monkeypatch: pytest.MonkeyPatch) -> FakeClient:
    """Un proyecto de Compose (grafana → prometheus → nodeexp) y un contenedor suelto."""
    items = [
        FakeContainer(
            "mon-grafana",
            ports=published(3000, 3000),
            labels={
                **compose("mon", "grafana", "prometheus:service_started:false"),
                "org.opencontainers.image.title": "Grafana",
            },
        ),
        FakeContainer(
            "mon-prometheus",
            ports=published(9090, 9090),
            labels=compose("mon", "prometheus", "nodeexp:service_started:false,gone:x:y"),
        ),
        FakeContainer("mon-nodeexp", labels=compose("mon", "nodeexp")),
        # Mismo nombre de servicio en otro proyecto: no debe confundirse.
        FakeContainer("other-prometheus", labels=compose("other", "prometheus")),
        FakeContainer(
            "pg",
            image="postgres:16",
            ports={"5432/tcp": [{"HostIp": "0.0.0.0", "HostPort": "5432"}]},
        ),
    ]
    fake = FakeClient(items)
    monkeypatch.setattr(docker_service, "get_client", lambda: fake)
    return fake


def test_containers_autodetected(client: TestClient, stack: FakeClient) -> None:
    body = {c["name"]: c for c in client.get("/api/containers", headers={"host": "kuro"}).json()}
    grafana = body["mon-grafana"]
    assert grafana["url"] == "http://kuro:3000"
    assert grafana["description"] == "Grafana"
    assert grafana["depends_on"] == ["mon-prometheus"]
    assert sorted(grafana["detected"]) == ["depends_on", "description", "url"]
    # "gone" no existe: se ignora en vez de inventar un nodo.
    assert body["mon-prometheus"]["depends_on"] == ["mon-nodeexp"]
    assert body["pg"]["url"] is None and body["pg"]["detected"] == []

    detail = client.get("/api/containers/mon-grafana").json()
    assert detail["depends_on"] == ["mon-prometheus"]

    g = client.get("/api/graph").json()
    edges = {(e["source"], e["target"]) for e in g["edges"]}
    assert edges == {("mon-grafana", "mon-prometheus"), ("mon-prometheus", "mon-nodeexp")}


def test_declared_values_win_and_can_disable(
    client: TestClient, settings: Settings, stack: FakeClient
) -> None:
    grafana = stack.containers.get("mon-grafana")
    # Label vacío: sin enlace, tampoco el automático.
    grafana.attrs["Config"]["Labels"]["dis.url"] = ""
    grafana.attrs["Config"]["Labels"]["dis.depends_on"] = "pg"
    # En dis.yaml, `url: null` explícito también lo desactiva.
    settings.containers["mon-prometheus"] = ContainerConfig.model_validate({"url": None})

    body = {c["name"]: c for c in client.get("/api/containers").json()}
    assert body["mon-grafana"]["url"] is None
    # Lo declarado se conserva y Compose suma lo suyo.
    assert body["mon-grafana"]["depends_on"] == ["pg", "mon-prometheus"]
    assert body["mon-prometheus"]["url"] is None

    settings.autodetect = AutodetectConfig(urls=False, descriptions=False, dependencies=False)
    body = {c["name"]: c for c in client.get("/api/containers").json()}
    assert body["mon-grafana"]["depends_on"] == ["pg"]
    assert body["mon-grafana"]["description"] is None
    assert all(c["detected"] == [] for c in body.values())


def test_autodetect_shorthand() -> None:
    off = Settings.model_validate({"autodetect": False})
    assert off.autodetect == AutodetectConfig(urls=False, descriptions=False, dependencies=False)
    assert Settings.model_validate({"autodetect": None}).autodetect == AutodetectConfig()
    partial = Settings.model_validate({"autodetect": {"urls": False}})
    assert not partial.autodetect.urls and partial.autodetect.dependencies


def test_tool_inherits_container_url(
    client: TestClient, settings: Settings, stack: FakeClient
) -> None:
    settings.tools = [
        ToolConfig(id="grafana", name="Grafana", container="mon-grafana"),
        ToolConfig(id="own", name="Propia", container="mon-grafana", url="http://{host}:1"),
    ]
    tools = {t["id"]: t for t in client.get("/api/tools", headers={"host": "kuro"}).json()}
    assert tools["grafana"]["url"] == "http://kuro:3000"
    assert tools["own"]["url"] == "http://kuro:1"
