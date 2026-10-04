"""Families endpoints: list, count, detail."""

from __future__ import annotations


def test_families_list(client):
    r = client.get("/api/families", params={"limit": 5})
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) <= 5
    for row in rows:
        assert row["id"].startswith("F")
        assert isinstance(row["child_count"], int)


def test_families_count(client):
    n = client.get("/api/families/count").json()["count"]
    assert isinstance(n, int) and n > 0


def test_families_min_children_filter(client):
    rows = client.get("/api/families", params={"min_children": 5, "limit": 50}).json()
    assert all(row["child_count"] >= 5 for row in rows)


def test_family_detail(client, sample_family_id):
    r = client.get(f"/api/families/{sample_family_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == sample_family_id
    assert "children" in body


def test_family_not_found(client):
    assert client.get("/api/families/F99999999").status_code == 404


def test_families_pagination_disjoint(client):
    a = {r["id"] for r in client.get("/api/families", params={"limit": 5, "offset": 0}).json()}
    b = {r["id"] for r in client.get("/api/families", params={"limit": 5, "offset": 5}).json()}
    assert not (a & b)
