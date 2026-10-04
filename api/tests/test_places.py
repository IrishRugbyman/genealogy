"""Place and commune detail endpoints."""

from __future__ import annotations


def test_place_detail(client, sample_place_id):
    r = client.get(f"/api/places/{sample_place_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == sample_place_id
    for key in ("born", "died", "married", "siblings"):
        assert isinstance(body[key], list)


def test_place_not_found(client):
    assert client.get("/api/places/999999999").status_code == 404


def test_commune_detail(client):
    """Pick a real INSEE from a French place, then fetch its commune page."""
    places = client.get("/api/places").json()
    insee = next(
        (p["commune_insee"] for p in places if p.get("commune_insee")),
        None,
    )
    assert insee, "no French place with a commune_insee found"
    r = client.get(f"/api/communes/{insee}")
    assert r.status_code == 200
    body = r.json()
    assert body["insee"] == insee
    for key in ("born", "died", "married", "localities", "top_surnames"):
        assert isinstance(body[key], list)
    # Wikipedia description fields are present (may be null for foreign communes).
    for key in ("description", "description_source", "description_url"):
        assert key in body


def test_commune_has_wikipedia_description(client):
    """French communes are enriched with a Wikipedia blurb + attribution link."""
    r = client.get("/api/communes/70489")  # Servance-Miellin
    assert r.status_code == 200
    body = r.json()
    assert body["description"]
    assert body["description_source"] == "Wikipédia"
    assert body["description_url"].startswith("https://fr.wikipedia.org/")


def test_commune_not_found(client):
    assert client.get("/api/communes/99999").status_code == 404
