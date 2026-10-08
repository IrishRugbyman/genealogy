"""Sources, citations and citation links: the list, the detail, and the record pages.

The oracle is the database itself, read here with plain SQL on the three tables:
the counts and ids the API returns must be the ones the tables hold, never values
derived from the API's own output.
"""

from __future__ import annotations

import os

import psycopg2
import psycopg2.extras
import pytest
from app import privacy

DSN = os.environ.get("GENEALOGY_DSN", "dbname=genealogy")


@pytest.fixture(scope="module")
def db():
    conn = psycopg2.connect(DSN)
    conn.set_session(readonly=True)
    yield conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    conn.close()


def test_list_counts_match_the_tables(client, db):
    db.execute(
        """SELECT s.id,
                  (SELECT count(*) FROM citations c WHERE c.source_id = s.id) AS citations,
                  (SELECT count(*) FROM citation_links l JOIN citations c ON c.id = l.citation_id
                   WHERE c.source_id = s.id) AS links
           FROM sources s"""
    )
    expected = {r["id"]: (r["citations"], r["links"]) for r in db.fetchall()}
    if not expected:
        pytest.skip("no sources")
    rows = client.get("/api/sources").json()
    got = {r["id"]: (r["citation_count"], r["link_count"]) for r in rows}
    assert got == expected


def test_list_includes_uncited_research_sources(client, db):
    """The registry is also the bibliography: a work nothing cites yet is listed."""
    db.execute(
        """SELECT id FROM sources s WHERE origin = 'research'
           AND NOT EXISTS (SELECT 1 FROM citations c WHERE c.source_id = s.id)"""
    )
    uncited = {r["id"] for r in db.fetchall()}
    if not uncited:
        pytest.skip("every research source has a citation")
    listed = {r["id"] for r in client.get("/api/sources").json()}
    assert uncited <= listed


def test_detail_lists_every_link(client, db):
    """Each citation's records on the source page: its links, plus the records it corrected.

    A research correction names its act (`raw_corrections.citation_id`); the page lists
    each corrected person or family once per citation, however many columns changed.
    """
    db.execute(
        """SELECT c.source_id, c.id,
                  (SELECT count(*) FROM citation_links l WHERE l.citation_id = c.id)
                  + (SELECT count(DISTINCT rc.record_id) FROM raw_corrections rc
                     WHERE rc.citation_id = c.id
                       AND (EXISTS (SELECT 1 FROM individuals i WHERE i.id = rc.record_id)
                            OR EXISTS (SELECT 1 FROM families f WHERE f.id = rc.record_id)))
                  AS n
           FROM citations c"""
    )
    expected: dict[str, dict[str, int]] = {}
    for r in db.fetchall():
        expected.setdefault(r["source_id"], {})[r["id"]] = r["n"]
    if not expected:
        pytest.skip("no citations")
    # Signed-in view: the anonymous one legitimately drops the living.
    for source_id, citations in expected.items():
        body = client.get(
            f"/api/sources/{source_id}", headers={"cookie": _family_cookie(client)}
        ).json()
        got = {c["id"]: len(c["individuals"]) + len(c["families"]) for c in body["citations"]}
        assert got == citations, source_id


def test_detail_404(client):
    assert client.get("/api/sources/no-such-source").status_code == 404


def test_second_hand_citation_points_back(client, db):
    db.execute(
        "SELECT id, source_id, cites_source_id FROM citations WHERE cites_source_id IS NOT NULL"
    )
    rows = db.fetchall()
    if not rows:
        pytest.skip("no second-hand citation")
    r = rows[0]
    cited = client.get(f"/api/sources/{r['cites_source_id']}").json()
    assert r["id"] in {c["id"] for c in cited["cited_by"]}


def test_person_page_carries_its_citations(client, db):
    db.execute(
        """SELECT l.individual_id, array_agg(c.source_id ORDER BY l.id) AS sources
           FROM citation_links l JOIN citations c ON c.id = l.citation_id
           WHERE l.individual_id IS NOT NULL
           GROUP BY 1 ORDER BY count(*) DESC LIMIT 3"""
    )
    rows = db.fetchall()
    if not rows:
        pytest.skip("no person with a citation")
    for r in rows:
        if r["individual_id"] in client.app.state.living:
            continue
        body = client.get(f"/api/people/{r['individual_id']}").json()
        assert [s["source_id"] for s in body["sources"]] == r["sources"]
        for s in body["sources"]:
            assert s["source_title"]


def test_event_citations_ride_on_their_event(client, db):
    db.execute(
        """SELECT e.individual_id, e.type, l.citation_id
           FROM citation_links l JOIN events e ON e.id = l.event_id
           WHERE e.individual_id IS NOT NULL LIMIT 5"""
    )
    rows = db.fetchall()
    if not rows:
        pytest.skip("no event citation")
    for r in rows:
        if r["individual_id"] in client.app.state.living:
            continue
        events = client.get(f"/api/people/{r['individual_id']}").json()["events"]
        cited = {(e["type"], s["citation_id"]) for e in events for s in e["sources"]}
        assert (r["type"], r["citation_id"]) in cited


def test_source_pages_hide_the_living(client, db):
    living = client.app.state.living
    db.execute(
        """SELECT DISTINCT c.source_id FROM citation_links l
           JOIN citations c ON c.id = l.citation_id
           LEFT JOIN events e ON e.id = l.event_id
           LEFT JOIN families f ON f.id = COALESCE(l.family_id, e.family_id)
           WHERE COALESCE(l.individual_id, e.individual_id) = ANY(%(ids)s)
              OR f.husband_id = ANY(%(ids)s) OR f.wife_id = ANY(%(ids)s)""",
        {"ids": list(living)},
    )
    sources = [r["source_id"] for r in db.fetchall()]
    if not sources:
        pytest.skip("no source cites a living person")
    for sid in sources:
        body = client.get(f"/api/sources/{sid}").json()
        for c in body["citations"]:
            assert not {p["id"] for p in c["individuals"]} & living, sid
            for f in c["families"]:
                for role in ("husband", "wife"):
                    if f[f"{role}_id"] in living:
                        assert f[f"{role}_name"] == privacy.LIVING_LABEL, (sid, f)


_COOKIE: dict[str, str] = {}


def _family_cookie(client) -> str:
    if not privacy.PASSWORD:
        pytest.skip("no family password configured")
    if "v" not in _COOKIE:
        r = client.post("/api/session", json={"password": privacy.PASSWORD})
        assert r.status_code == 200, r.text
        _COOKIE["v"] = f"{privacy.COOKIE_NAME}={r.cookies.get(privacy.COOKIE_NAME)}"
        client.cookies.clear()
    return _COOKIE["v"]


def test_redact_shapes_a_source_page():
    """The privacy layer, on a hand-made source page: no database needed.

    `individuals` is a listing, so a living person is dropped from it; a family is a
    union, so a living partner is masked and the union's marriage keys go.
    """
    page = {
        "id": "x",
        "title": "Registre",
        "citations": [
            {
                "id": "c",
                "individuals": [
                    {"id": "I1", "name": "Vivant", "birth_year": 1990, "scope": "record"},
                    {"id": "I2", "name": "Mort", "birth_year": 1700, "scope": "record"},
                ],
                "families": [
                    {
                        "family_id": "F1",
                        "husband_id": "I1",
                        "husband_name": "Vivant",
                        "wife_id": "I2",
                        "wife_name": "Mort",
                        "marriage_year": 2015,
                        "scope": "marriage",
                    }
                ],
            }
        ],
    }
    out = privacy.redact(page, frozenset({"I1"}))
    c = out["citations"][0]
    assert [p["id"] for p in c["individuals"]] == ["I2"]
    fam = c["families"][0]
    assert fam["husband_name"] == privacy.LIVING_LABEL
    assert fam["husband_living"] is True
    assert fam["wife_name"] == "Mort"
    assert fam["marriage_year"] is None


def test_transcripts_are_public(client, db):
    """The act's own words reach every visitor, as the table holds them."""
    db.execute("SELECT source_id, id, transcript FROM citations WHERE transcript IS NOT NULL")
    rows = db.fetchall()
    if not rows:
        pytest.skip("no transcript")
    for r in rows[:5]:
        body = client.get(f"/api/sources/{r['source_id']}").json()
        got = {c["id"]: c["transcript"] for c in body["citations"]}
        assert got[r["id"]] == r["transcript"]


def test_act_images_are_family_only(client, db):
    db.execute("SELECT citation_id, ord FROM citation_images ORDER BY citation_id, ord LIMIT 1")
    row = db.fetchone()
    if row is None:
        pytest.skip("no act image")
    url = f"/api/citations/{row['citation_id']}/images/{row['ord']}"
    anonymous = client.get(url)
    assert anonymous.status_code in (403, 503)
    assert not anonymous.headers.get("content-type", "").startswith("image/")
    family = client.get(url, headers={"cookie": _family_cookie(client)})
    if family.status_code == 503:
        pytest.skip("GENEALOGY_ACTES_DIR not set")
    assert family.status_code == 200
    assert family.headers["content-type"].startswith("image/")
    assert "private" in family.headers["cache-control"]


def test_act_image_unknown_is_404(client):
    r = client.get("/api/citations/no-such/images/1", headers={"cookie": _family_cookie(client)})
    assert r.status_code in (404, 503)
