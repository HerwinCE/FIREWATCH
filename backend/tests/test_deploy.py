"""Déploiement en ligne : URL de base Neon/Vercel et limite des appels IA."""

from app.database import async_url


def test_neon_url_is_converted_for_asyncpg():
    url, args = async_url("postgres://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")
    assert url == "postgresql+asyncpg://u:p@ep-x.eu-central-1.aws.neon.tech/neondb"
    assert args["ssl"] == "require"


def test_local_url_unchanged():
    url, args = async_url("postgresql+asyncpg://u:p@127.0.0.1:5433/firewatch_africa")
    assert url == "postgresql+asyncpg://u:p@127.0.0.1:5433/firewatch_africa"
    assert "ssl" not in args


def test_ai_rate_limit(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    from app.settings import settings
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "ai_requests_per_10min", 2)
    main._ai_calls.clear()
    c = TestClient(main.app)
    codes = [c.post("/api/voice/turn", json={}).status_code for _ in range(3)]
    assert codes[-1] == 429 and 429 not in codes[:2]
    main._ai_calls.clear()


def test_read_only_blocks_harmonization(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    from app.settings import settings
    monkeypatch.setattr(settings, "read_only", True)
    r = TestClient(main.app).post("/api/harmonization/run", json={})
    assert r.status_code == 403
