"""Le bouton « Harmoniser » de l'interface locale n'exige pas le jeton, mais seulement en développement et depuis cette machine."""

from types import SimpleNamespace

from app import harmonization_api as h


def req(host):
    return SimpleNamespace(client=SimpleNamespace(host=host))


def test_local_dev_only_from_loopback(monkeypatch):
    monkeypatch.setattr(h.settings, "environment", "development")
    assert h.local_dev(req("127.0.0.1")) and h.local_dev(req("::1"))
    assert not h.local_dev(req("192.168.1.20"))
    monkeypatch.setattr(h.settings, "environment", "production")
    assert not h.local_dev(req("127.0.0.1"))
