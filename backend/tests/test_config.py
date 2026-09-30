from pathlib import Path

import pytest

from app.config import Settings, load_settings, resolve_url

REPO_CONFIG = Path(__file__).resolve().parents[2] / "dis.yaml"


def test_repo_config_is_valid(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("CERBERO_URL", "DIS_PUBLIC_HOST", "DIS_HOST_ROOT", "DIS_DISKS"):
        monkeypatch.delenv(var, raising=False)
    settings = load_settings(REPO_CONFIG)
    ids = [t.id for t in settings.tools]
    assert ids[:3] == ["dis", "caronte", "minos"]
    dis = settings.tools[0]
    assert dis.self is True
    assert settings.cerbero_url is None


def test_env_overrides(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    cfg = tmp_path / "dis.yaml"
    cfg.write_text("cerbero_url: http://nope\ndisks: [/]\n", encoding="utf-8")
    monkeypatch.setenv("CERBERO_URL", "http://cerbero:9000/")
    monkeypatch.setenv("DIS_DISKS", "/, /home")
    monkeypatch.setenv("DIS_HOST_ROOT", "/hostfs")
    settings = load_settings(cfg)
    assert settings.cerbero_url == "http://cerbero:9000"
    assert settings.disks == ["/", "/home"]
    assert settings.host_root == "/hostfs"


def test_resolve_url_uses_request_host_or_public_host() -> None:
    settings = Settings()
    assert resolve_url("http://{host}:9080", "192.168.1.10", settings) == "http://192.168.1.10:9080"
    assert resolve_url(None, "x", settings) is None
    settings.public_host = "server-kuro"
    assert resolve_url("http://{host}:9080", "192.168.1.10", settings) == "http://server-kuro:9080"
