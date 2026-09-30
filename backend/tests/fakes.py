"""Dobles de prueba para el SDK de Docker."""

from __future__ import annotations

from typing import Any

from docker.errors import NotFound


def make_stats(
    total: int = 2_000_000,
    pre_total: int = 1_000_000,
    system: int = 20_000_000,
    pre_system: int = 10_000_000,
    cpus: int = 4,
    usage: int = 300 * 1024**2,
    inactive: int = 100 * 1024**2,
    limit: int = 1024 * 1024**2,
) -> dict[str, Any]:
    return {
        "cpu_stats": {
            "cpu_usage": {"total_usage": total},
            "system_cpu_usage": system,
            "online_cpus": cpus,
        },
        "precpu_stats": {
            "cpu_usage": {"total_usage": pre_total},
            "system_cpu_usage": pre_system,
        },
        "memory_stats": {"usage": usage, "limit": limit, "stats": {"inactive_file": inactive}},
        "networks": {
            "eth0": {"rx_bytes": 1000, "tx_bytes": 500},
            "eth1": {"rx_bytes": 1, "tx_bytes": 2},
        },
    }


class FakeContainer:
    def __init__(
        self,
        name: str,
        image: str = "img:latest",
        state: str = "running",
        health: str | None = None,
        ports: dict | None = None,
        env: list[str] | None = None,
        labels: dict[str, str] | None = None,
        logs: bytes = b"",
        started_at: str = "2026-01-01T00:00:00.123456789Z",
    ) -> None:
        self.name = name
        self.short_id = f"{name[:4]}123456"
        self.id = self.short_id * 4
        self.status = state
        self._logs = logs
        state_obj: dict[str, Any] = {"Status": state, "StartedAt": started_at}
        if health:
            state_obj["Health"] = {"Status": health}
        self.attrs = {
            "Created": "2026-01-01T00:00:00Z",
            "State": state_obj,
            "Config": {"Image": image, "Env": env or [], "Labels": labels or {}, "Cmd": ["run"]},
            "NetworkSettings": {"Ports": ports or {}},
        }

    def stats(self, stream: bool = False) -> dict[str, Any]:
        return make_stats()

    def logs(self, **kwargs: Any) -> bytes:
        return self._logs


class _Containers:
    def __init__(self, items: list[FakeContainer]) -> None:
        self._items = items

    def list(self, all: bool = False, filters: dict | None = None) -> list[FakeContainer]:
        items = list(self._items) if all else [c for c in self._items if c.status == "running"]
        if filters and "label" in filters:
            key, _, value = filters["label"].partition("=")
            items = [c for c in items if c.attrs["Config"]["Labels"].get(key) == value]
        return items

    def get(self, key: str) -> FakeContainer:
        for c in self._items:
            if key in (c.name, c.short_id, c.id):
                return c
        raise NotFound(key)


class FakeClient:
    def __init__(self, items: list[FakeContainer]) -> None:
        self.containers = _Containers(items)


def default_containers() -> list[FakeContainer]:
    return [
        FakeContainer(
            "minos-db",
            image="postgres:16",
            ports={"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "5432"}]},
            env=["POSTGRES_PASSWORD=hunter2", "POSTGRES_DB=minos", "API_KEY=x", "PGDATA=/data"],
        ),
        FakeContainer(
            "minos-adminer",
            image="adminer",
            ports={
                "8080/tcp": [
                    {"HostIp": "0.0.0.0", "HostPort": "9080"},
                    {"HostIp": "::", "HostPort": "9080"},
                ]
            },
            logs=b"\x1b[32mlistening\x1b[0m on 8080\nrequest GET /\n",
        ),
        FakeContainer("old-job", state="exited"),
    ]
