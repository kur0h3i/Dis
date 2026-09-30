import pytest
from fastapi.testclient import TestClient

from app import docker_service
from app.config import ContainerConfig, Settings
from app.docker_service import (
    DockerUnavailableError,
    compute_stats,
    mask_env,
    normalize_status,
    parse_ports,
)

from .fakes import FakeClient, default_containers, make_stats


@pytest.fixture
def fake_docker(monkeypatch: pytest.MonkeyPatch) -> FakeClient:
    client = FakeClient(default_containers())
    monkeypatch.setattr(docker_service, "get_client", lambda: client)
    return client


@pytest.fixture
def settings() -> Settings:
    return Settings(
        disks=["/"],
        containers={"minos-adminer": ContainerConfig(url="http://{host}:9080")},
    )


@pytest.mark.parametrize(
    ("state", "health", "expected"),
    [
        ("running", None, "running"),
        ("running", "healthy", "running"),
        ("running", "unhealthy", "unhealthy"),
        ("restarting", None, "restarting"),
        ("paused", None, "paused"),
        ("exited", None, "stopped"),
        ("created", None, "stopped"),
        ("dead", None, "unhealthy"),
    ],
)
def test_normalize_status(state: str, health: str | None, expected: str) -> None:
    assert normalize_status(state, health) == expected


def test_parse_ports_dedups_ipv6_and_keeps_unpublished() -> None:
    ports = parse_ports(
        {
            "8080/tcp": [
                {"HostIp": "0.0.0.0", "HostPort": "9080"},
                {"HostIp": "::", "HostPort": "9080"},
            ],
            "53/udp": None,
        }
    )
    assert [(p.host_port, p.container_port, p.protocol) for p in ports] == [
        (9080, 8080, "tcp"),
        (None, 53, "udp"),
    ]


def test_mask_env() -> None:
    env = {e.key: e for e in mask_env(["DB_PASSWORD=x", "my_token=y", "A=b=c", "MONKEY=1"])}
    assert env["DB_PASSWORD"].value == "***" and env["DB_PASSWORD"].masked
    assert env["my_token"].value == "***"
    assert env["A"].value == "b=c" and not env["A"].masked
    assert env["MONKEY"].value == "***"  # sobre-enmascarar es aceptable


def test_compute_stats() -> None:
    stats = compute_stats(make_stats())
    # (1M / 10M) * 4 cpus * 100
    assert stats.cpu_pct == 40.0
    assert stats.mem_mb == 200.0
    assert stats.mem_limit_mb == 1024.0
    assert (stats.net_rx_b, stats.net_tx_b) == (1001, 502)


def test_compute_stats_without_precpu() -> None:
    raw = make_stats(pre_total=0, pre_system=0)
    raw["precpu_stats"] = {}
    assert compute_stats(raw).cpu_pct >= 0


def test_list_containers_endpoint(client: TestClient, fake_docker: FakeClient) -> None:
    r = client.get("/api/containers", headers={"host": "server-kuro:8088"})
    assert r.status_code == 200
    body = r.json()
    names = [c["name"] for c in body]
    assert names == ["minos-adminer", "minos-db", "old-job"]  # running primero
    adminer = body[0]
    assert adminer["url"] == "http://server-kuro:9080"
    assert adminer["cpu_pct"] == 40.0 and adminer["mem_mb"] == 200.0
    assert adminer["ports"] == [
        {"container_port": 8080, "protocol": "tcp", "host_ip": "0.0.0.0", "host_port": 9080}
    ]
    assert adminer["uptime_s"] > 0
    old = body[2]
    assert old["status"] == "stopped" and old["cpu_pct"] is None and old["uptime_s"] is None


def test_depends_on_from_label_or_config(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings.containers["minos-db"] = ContainerConfig(depends_on=["backups"])
    settings.containers["minos-adminer"].depends_on = ["ignorado"]
    items = default_containers()
    # El label tiene prioridad sobre dis.yaml.
    items[1].attrs["Config"]["Labels"] = {"dis.depends_on": "minos-db, cache ,"}
    fake = FakeClient(items)
    monkeypatch.setattr(docker_service, "get_client", lambda: fake)

    body = {c["name"]: c for c in client.get("/api/containers").json()}
    assert body["minos-adminer"]["depends_on"] == ["minos-db", "cache"]
    assert body["minos-db"]["depends_on"] == ["backups"]
    assert body["old-job"]["depends_on"] == []


def test_container_detail_masks_env(client: TestClient, fake_docker: FakeClient) -> None:
    r = client.get("/api/containers/minos-db")
    assert r.status_code == 200
    env = {e["key"]: e["value"] for e in r.json()["env"]}
    assert env == {
        "POSTGRES_PASSWORD": "***",
        "POSTGRES_DB": "minos",
        "API_KEY": "***",
        "PGDATA": "/data",
    }


def test_stats_and_logs(client: TestClient, fake_docker: FakeClient) -> None:
    stats = client.get("/api/containers/minos-adminer/stats").json()
    assert stats["cpu_pct"] == 40.0
    logs = client.get("/api/containers/minos-adminer/logs").json()
    assert logs == {"lines": ["listening on 8080", "request GET /"]}
    stopped = client.get("/api/containers/old-job/stats").json()
    assert stopped["cpu_pct"] == 0


def test_not_found(client: TestClient, fake_docker: FakeClient) -> None:
    assert client.get("/api/containers/nope/logs").status_code == 404


def test_docker_unavailable(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> None:
        raise DockerUnavailableError("no socket")

    monkeypatch.setattr(docker_service, "get_client", boom)
    r = client.get("/api/containers")
    assert r.status_code == 503
    assert "Docker no disponible" in r.json()["detail"]
