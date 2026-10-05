import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_explicit_origins_and_download_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "FRONTEND_ORIGINS", "http://localhost:3000,http://localhost:3101"
    )
    client = TestClient(create_app())
    for origin in ["http://localhost:3000", "http://localhost:3101"]:
        response = client.options(
            "/api/pdf/process",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        health = client.get("/health", headers={"Origin": origin})
        assert health.json() == {"status": "ok"}
        assert "Content-Disposition" in health.headers["access-control-expose-headers"]
        assert "access-control-allow-credentials" not in health.headers
    denied = client.options(
        "/api/pdf/process",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_wildcard_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRONTEND_ORIGINS", "*")
    with pytest.raises(ValueError, match="wildcard"):
        create_app()
