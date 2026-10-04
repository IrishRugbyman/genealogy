"""Geo choropleth endpoints.

Only `countries` and `regions` are exercised here: they build from local GeoJSON
files plus the DB. `departments` and `communes` make live calls to
geo.api.gouv.fr, so they are intentionally not hit in the test suite (network +
slow). Their builders are covered indirectly by the route wiring.
"""

from __future__ import annotations


def _assert_feature_collection(body):
    assert body["type"] == "FeatureCollection"
    assert isinstance(body["features"], list)
    for feat in body["features"][:10]:
        assert feat["type"] == "Feature"
        assert "geometry" in feat
        props = feat["properties"]
        assert "total_events" in props
        assert props["total_events"] == (
            props["birth_count"] + props["death_count"] + props["marriage_count"]
        )


def test_geo_countries(client):
    r = client.get("/api/geo/countries")
    assert r.status_code == 200
    _assert_feature_collection(r.json())


def test_geo_regions(client):
    r = client.get("/api/geo/regions")
    assert r.status_code == 200
    _assert_feature_collection(r.json())


def test_geo_cache_header(client):
    r = client.get("/api/geo/countries")
    assert "max-age" in r.headers.get("cache-control", "")
