import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import config
from app.config import Settings, get_settings, load_settings, resolve_url
from app.main import app

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


@pytest.fixture
def live_config(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[Path]:
    """YAML temporal servido por el ``get_settings`` real (con recarga)."""
    for var in ("CERBERO_URL", "DIS_PUBLIC_HOST", "DIS_HOST_ROOT", "DIS_DISKS"):
        monkeypatch.delenv(var, raising=False)
    cfg = tmp_path / "dis.yaml"
    cfg.write_text("tools:\n  - {id: caronte, name: Caronte}\n", encoding="utf-8")
    monkeypatch.setenv("DIS_CONFIG", str(cfg))
    config.reset_settings_cache()
    yield cfg
    config.reset_settings_cache()


def _rewrite(cfg: Path, text: str) -> None:
    cfg.write_text(text, encoding="utf-8")
    # Garantiza un mtime distinto aunque la escritura caiga en el mismo tick.
    st = cfg.stat()
    os.utime(cfg, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))


def test_settings_reload_when_yaml_changes(live_config: Path) -> None:
    first = get_settings()
    assert [t.id for t in first.tools] == ["caronte"]
    assert get_settings() is first  # sin cambios: misma instancia, sin releer

    _rewrite(live_config, "tools:\n  - {id: caronte, name: Caronte}\n  - {id: vergil, name: V}\n")
    assert [t.id for t in get_settings().tools] == ["caronte", "vergil"]


def test_invalid_yaml_keeps_last_good_config(live_config: Path) -> None:
    get_settings()
    _rewrite(live_config, "tools: [ {id: roto\n")
    assert [t.id for t in get_settings().tools] == ["caronte"]
    path, loaded_at, error = config.config_status()
    assert path == str(live_config) and loaded_at is not None and error

    _rewrite(live_config, "tools:\n  - {id: minos, name: Minos, stage: nope}\n")
    assert [t.id for t in get_settings().tools] == ["caronte"]  # stage inválido
    assert "stage" in (config.config_status()[2] or "")

    _rewrite(live_config, "tools:\n  - {id: minos, name: Minos}\n")
    assert [t.id for t in get_settings().tools] == ["minos"]
    assert config.config_status()[2] is None


def test_config_endpoint_reports_error(live_config: Path) -> None:
    with TestClient(app) as client:
        assert client.get("/api/config").json()["error"] is None
        _rewrite(live_config, "- solo\n- una lista\n")
        body = client.get("/api/config").json()
        assert body["path"] == str(live_config)
        assert "mapa de claves" in body["error"]
