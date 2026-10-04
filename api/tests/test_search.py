"""Search endpoint: /api/search and /api/search/count."""

from __future__ import annotations


def test_search_default(client):
    r = client.get("/api/search", params={"limit": 5})
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    assert len(rows) <= 5
    for row in rows:
        assert "id" in row and row["id"].startswith("I")


def test_search_limit_bounds(client):
    # limit above the max (200) is rejected by the Query validator.
    assert client.get("/api/search", params={"limit": 0}).status_code == 422
    assert client.get("/api/search", params={"limit": 201}).status_code == 422


def test_search_sex_filter(client):
    r = client.get("/api/search", params={"sex": "F", "limit": 25})
    assert r.status_code == 200
    rows = r.json()
    assert all(row["sex"] == "F" for row in rows)


def test_search_invalid_sex_rejected(client):
    assert client.get("/api/search", params={"sex": "X"}).status_code == 422


def test_search_year_range(client):
    # The filter matches anyone whose birth OR death year falls inside the
    # window on each side: (birth>=from OR death>=from) AND (birth<=to OR death<=to).
    # This selects people *alive during* the window, not only those born/died in it.
    lo, hi = 1700, 1750
    r = client.get(
        "/api/search",
        params={"year_from": lo, "year_to": hi, "limit": 30},
    )
    assert r.status_code == 200
    for row in r.json():
        by, dy = row.get("birth_year"), row.get("death_year")
        ge = (by is not None and by >= lo) or (dy is not None and dy >= lo)
        le = (by is not None and by <= hi) or (dy is not None and dy <= hi)
        assert ge and le, row


def test_search_pagination_offset(client):
    first = client.get("/api/search", params={"limit": 5, "offset": 0}).json()
    second = client.get("/api/search", params={"limit": 5, "offset": 5}).json()
    first_ids = {r["id"] for r in first}
    second_ids = {r["id"] for r in second}
    # Disjoint pages (same sort order, no overlap).
    assert not (first_ids & second_ids)


def test_search_name_query(client, sample_surname):
    r = client.get("/api/search", params={"name": sample_surname, "limit": 10})
    assert r.status_code == 200
    rows = r.json()
    assert rows, f"expected at least one {sample_surname}"
    assert any(sample_surname.upper() in (row.get("name") or "").upper() for row in rows)


def test_search_count_matches_filter(client, sample_surname):
    params = {"name": sample_surname}
    count = client.get("/api/search/count", params=params).json()["count"]
    assert isinstance(count, int) and count > 0
    # The count must be at least the number of rows returned on the first page.
    page = client.get("/api/search", params={**params, "limit": 200}).json()
    assert count >= len(page)


def test_search_sosa_enriched(client):
    """Search rows carry a sosa field (may be null for non-ancestors)."""
    rows = client.get("/api/search", params={"limit": 10}).json()
    assert all("sosa" in row for row in rows)
