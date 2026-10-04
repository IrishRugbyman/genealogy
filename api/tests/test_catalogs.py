"""Catalog endpoints: professions, distinctions, military ranks, bans.

Each follows the same list + detail pattern, so the detail tests discover a real
id from the list rather than hardcoding one.
"""

from __future__ import annotations

import pytest

CATALOGS = [
    ("professions", "/api/professions", "/api/professions/{id}"),
    ("distinctions", "/api/distinctions", "/api/distinctions/{id}"),
    ("military_ranks", "/api/military-ranks", "/api/military-ranks/{id}"),
    ("bans", "/api/bans", "/api/bans/{id}"),
]


@pytest.mark.parametrize("name,list_url,_detail", CATALOGS)
def test_catalog_list(client, name, list_url, _detail):
    r = client.get(list_url)
    assert r.status_code == 200, name
    rows = r.json()
    assert isinstance(rows, list), name
    for row in rows[:5]:
        assert "id" in row


@pytest.mark.parametrize("name,list_url,detail_url", CATALOGS)
def test_catalog_detail(client, name, list_url, detail_url):
    rows = client.get(list_url).json()
    if not rows:
        pytest.skip(f"no {name} rows to detail")
    first_id = rows[0]["id"]
    r = client.get(detail_url.format(id=first_id))
    assert r.status_code == 200, name
    assert r.json()["id"] == first_id


@pytest.mark.parametrize("name,_list,detail_url", CATALOGS)
def test_catalog_detail_404(client, name, _list, detail_url):
    r = client.get(detail_url.format(id=999999))
    assert r.status_code == 404, name


def test_search_by_profession(client):
    """A profession id from the catalog filters the people search."""
    profs = client.get("/api/professions").json()
    if not profs:
        pytest.skip("no professions")
    pid = profs[0]["id"]
    r = client.get("/api/search", params={"profession_id": pid, "limit": 10})
    assert r.status_code == 200
