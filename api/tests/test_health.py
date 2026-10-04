"""Health and meta endpoints."""

from __future__ import annotations


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str) and body["version"]


def test_openapi_schema(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert r.json()["info"]["title"] == "Genealogy API"


def test_cors_only_get(client):
    """The API is read-only: a POST to any route must not be allowed."""
    r = client.post("/api/search")
    assert r.status_code in (404, 405)
