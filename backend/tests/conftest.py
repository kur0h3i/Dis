from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import icons
from app.config import Settings, get_settings
from app.main import app


@pytest.fixture(autouse=True)
def _no_icon_downloads(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Sin salir a Internet: sin índice de logos, salvo que el test cargue uno."""
    monkeypatch.setattr(icons, "CATALOG_URL", None)
    icons.reset_catalog()
    yield
    icons.reset_catalog()


@pytest.fixture
def settings() -> Settings:
    return Settings(disks=["/"])


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
