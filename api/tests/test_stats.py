"""Statistics endpoints: stats, pedigree, places, onthisday, gaps."""

from __future__ import annotations


def test_stats_totals(client):
    r = client.get("/api/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["total_individuals"] > 0
    assert body["total_families"] > 0
    assert body["total_places"] > 0
    assert body["geocoded_places"] <= body["total_places"]
    # Aggregate lists are present.
    for key in ("top_surnames", "top_given_names", "top_birth_places", "by_birth_century"):
        assert isinstance(body[key], list)
    # by_sex sums to no more than the total population.
    assert sum(body["by_sex"].values()) <= body["total_individuals"]


def test_stats_cache_header(client):
    r = client.get("/api/stats")
    assert "max-age" in r.headers.get("cache-control", "")


def test_pedigree(client):
    r = client.get("/api/stats/pedigree")
    assert r.status_code == 200
    gens = r.json()
    assert gens, "expected pedigree generations"
    for g in gens:
        assert g["potential"] == 2 ** g["generation"]
        # Known ancestors can never exceed the theoretical maximum.
        assert g["known"] <= g["potential"]


def test_places_geo(client):
    r = client.get("/api/places")
    assert r.status_code == 200
    rows = r.json()
    assert rows, "expected places"
    for row in rows[:30]:
        # A row is either a point (lat/lon set) or a French commune polygon
        # (lat/lon null, commune_insee set) - never neither.
        assert row["lat"] is not None or row["commune_insee"] is not None
        if row["lat"] is not None:
            assert -90 <= row["lat"] <= 90 and -180 <= row["lon"] <= 180


def test_onthisday_default(client):
    r = client.get("/api/onthisday")
    assert r.status_code == 200
    body = r.json()
    # Returns a structured object keyed by event type.
    assert isinstance(body, (dict, list))


def test_onthisday_explicit_date(client):
    r = client.get("/api/onthisday", params={"month": 1, "day": 1})
    assert r.status_code == 200


def test_onthisday_validation(client):
    assert client.get("/api/onthisday", params={"month": 13, "day": 1}).status_code == 422
    assert client.get("/api/onthisday", params={"month": 1, "day": 32}).status_code == 422


def test_place_gaps(client):
    r = client.get("/api/places/gaps")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_tree_config(client):
    """Root and branch labels are deployment config, served whole or as nulls."""
    r = client.get("/api/tree")
    assert r.status_code == 200
    body = r.json()
    assert set(body["branches"]) == {"1", "2"}
    assert all(isinstance(v, str) and v for v in body["branches"].values())
    root = body["sosa_root"]
    if root is not None:
        sosa = client.get(f"/api/people/{root['id']}/sosa").json()["sosa"]
        assert sosa == 1
