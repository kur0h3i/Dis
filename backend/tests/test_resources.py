from fastapi.testclient import TestClient

from app.config import Settings
from app.host_service import HostSampler, get_resources


def test_sampler_keeps_5_minutes() -> None:
    sampler = HostSampler(interval=10, window=300)
    for _ in range(40):
        sampler.sample()
    assert len(sampler.history) == 30


def test_get_resources_skips_missing_disks() -> None:
    settings = Settings(disks=["/", "/definitely-not-mounted"], host_root="/")
    res = get_resources(HostSampler(), settings)
    assert [d.mountpoint for d in res.disks] == ["/"]
    assert res.ram_total_gb > 0
    assert 0 <= res.ram_pct <= 100
    assert len(res.history_5m) == 1


def test_resources_endpoint(client: TestClient) -> None:
    r = client.get("/api/resources")
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"cpu_pct", "ram_used_gb", "ram_total_gb", "disks", "history_5m"}
    assert body["disks"][0]["mountpoint"] == "/"
