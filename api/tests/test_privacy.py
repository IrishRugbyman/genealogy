"""Living people are hidden from visitors who are not signed in, and only from them.

The expectations here never come from the code under test: who is living is
checked against a direct SQL reading of the rule, the inference against
hand-built rows, and a hidden person's real name and dates are read straight
from the database and then looked for in the API's raw responses.
"""

from __future__ import annotations

import datetime
import json
import os

import psycopg2
import psycopg2.extras
import pytest
from app import privacy
from app.db import queries

DSN = os.environ.get("GENEALOGY_DSN", "dbname=genealogy")
BORN_AFTER = datetime.date.today().year - privacy.LIVING_HORIZON_YEARS


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def db():
    conn = psycopg2.connect(DSN)
    conn.set_session(readonly=True)
    yield conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    conn.close()


@pytest.fixture(scope="session")
def living(client) -> frozenset[str]:
    ids = client.app.state.living
    assert ids, "no living people found: the privacy tests would prove nothing"
    return ids


@pytest.fixture(scope="session")
def family_headers(client) -> dict[str, str]:
    """A Cookie header for a signed-in browser, obtained through the real sign-in."""
    if not privacy.PASSWORD:
        pytest.skip("no family password configured")
    r = client.post("/api/session", json={"password": privacy.PASSWORD})
    assert r.status_code == 200, r.text
    value = r.cookies.get(privacy.COOKIE_NAME)
    # The shared client must stay anonymous for every other test.
    client.cookies.clear()
    assert value
    return {"cookie": f"{privacy.COOKIE_NAME}={value}"}


@pytest.fixture(scope="session")
def subjects(db, living) -> list[dict]:
    """Living people with a dated birth, a birth place and known parents.

    Their real name, read here from the database, must appear nowhere in an
    anonymous response; only names unique in the tree are kept, so a dead
    namesake cannot make the check fail for the wrong reason.
    """
    db.execute(
        """
        SELECT i.id, i.name, i.birth_year, i.birth_month, i.birth_day, i.birth_place_id,
               pc.father_id, pc.mother_id, pc.family_id AS parents_family
        FROM individuals i
        JOIN parent_child pc ON pc.child_id = i.id
        WHERE i.id = ANY(%s) AND i.birth_year IS NOT NULL AND i.birth_place_id IS NOT NULL
          AND (SELECT count(*) FROM individuals o WHERE o.name = i.name) = 1
        ORDER BY i.birth_year, i.id
        LIMIT 6
        """,
        [list(living)],
    )
    rows = db.fetchall()
    if not rows:
        pytest.skip("no living person with dated birth, place and parents")
    return rows


def _walk(value):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from _walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from _walk(v)


def assert_nothing_shown(body, living: frozenset[str], subjects: list[dict]) -> None:
    """No living person's name or date in `body`, however the response is shaped."""
    raw = json.dumps(body, ensure_ascii=False)
    for s in subjects:
        # As a whole JSON string: "Lucie X" inside a dead "Marie Lucie X" is no leak.
        assert json.dumps(s["name"], ensure_ascii=False) not in raw, f"{s['id']} leaked"
    for d in _walk(body):
        for key, val in d.items():
            if not (isinstance(val, str) and val in living):
                continue
            if key in ("id", "child_id"):
                assert d.get("name") in (None, privacy.LIVING_LABEL), (key, d)
                for k in ("given_name", "surname", "birth_year", "birth_day", "death_year"):
                    assert d.get(k) is None, (k, d)
            elif key.endswith("_id"):
                role = key[: -len("_id")]
                assert d.get(f"{role}_name") in (None, privacy.LIVING_LABEL), (key, d)
                assert d.get(f"{role}_birth_year") is None, (key, d)


# ---------------------------------------------------------------------------
# Who is living
# ---------------------------------------------------------------------------


def test_infer_living_from_hand_made_rows():
    people = [
        {"id": "dated_recent", "born": 1990, "dead": False},
        {"id": "dated_recent_dead", "born": 1990, "dead": True},
        {"id": "dated_old", "born": 1900, "dead": False},
        {"id": "spouse_of_recent", "born": None, "dead": False},
        {"id": "parent_a", "born": 1950, "dead": True},
        {"id": "parent_b", "born": 1952, "dead": True},
        {"id": "child_of_1950s", "born": None, "dead": False},
        {"id": "spouse_of_child", "born": None, "dead": False},
        {"id": "isolated", "born": None, "dead": False},
        {"id": "married_1960", "born": None, "dead": False},
        {"id": "married_1900", "born": None, "dead": False},
        {"id": "parent_of_1880", "born": None, "dead": False},
        {"id": "born_1880", "born": 1880, "dead": True},
    ]
    families = [
        {"husband_id": "dated_recent", "wife_id": "spouse_of_recent", "marriage_year": None},
        {"husband_id": "parent_a", "wife_id": "parent_b", "marriage_year": 1975},
        {"husband_id": "child_of_1950s", "wife_id": "spouse_of_child", "marriage_year": None},
        {"husband_id": "married_1960", "wife_id": None, "marriage_year": 1960},
        {"husband_id": "married_1900", "wife_id": None, "marriage_year": 1900},
    ]
    parent_child = [
        {"child_id": "child_of_1950s", "father_id": "parent_a", "mother_id": "parent_b"},
        {"child_id": "born_1880", "father_id": "parent_of_1880", "mother_id": None},
    ]
    got = queries.infer_living(people, families, parent_child, born_after=1926)
    assert got == {
        "dated_recent",
        "spouse_of_recent",  # takes the spouse's 1990
        "child_of_1950s",  # parents born 1950-52, plus a generation
        "spouse_of_child",  # two steps away from any date
        "married_1960",  # married at 25: born 1935
    }


def test_living_set_matches_the_rule_on_dated_people(db, living):
    """Everyone dated and undead within the horizon is living; nobody dead is."""
    db.execute(
        """
        SELECT id FROM individuals
        WHERE coalesce(birth_year, baptism_year) >= %s
          AND death_year IS NULL AND death_raw IS NULL
          AND burial_year IS NULL AND burial_raw IS NULL
        """,
        [BORN_AFTER],
    )
    dated = {r["id"] for r in db.fetchall()}
    assert dated <= living
    db.execute(
        """
        SELECT id FROM individuals
        WHERE death_year IS NOT NULL OR death_raw IS NOT NULL
           OR burial_year IS NOT NULL OR burial_raw IS NOT NULL
           OR coalesce(birth_year, baptism_year) < %s
        """,
        [BORN_AFTER],
    )
    assert not ({r["id"] for r in db.fetchall()} & living)


# ---------------------------------------------------------------------------
# Anonymous visitor
# ---------------------------------------------------------------------------


def test_living_person_page_is_masked(client, living, subjects):
    s = subjects[0]
    r = client.get(f"/api/people/{s['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == s["id"]
    assert body["living"] is True
    assert body["name"] == privacy.LIVING_LABEL
    assert body["birth_year"] is None and body["birth_place"] is None
    assert body["events"] == [] and body["notes"] == []
    assert_nothing_shown(body, living, subjects)


def test_search_does_not_find_the_living(client, living, subjects):
    for s in subjects:
        r = client.get("/api/search", params={"name": s["name"], "limit": 200})
        assert r.status_code == 200
        assert s["id"] not in {p["id"] for p in r.json()}


def test_search_counts_leave_the_living_out(client, family_headers, subjects):
    surname = subjects[0]["name"].split()[-1]
    params = {"name": surname}
    anonymous = client.get("/api/search/count", params=params).json()["count"]
    family = client.get("/api/search/count", params=params, headers=family_headers).json()["count"]
    assert anonymous < family


def test_family_list_leaves_out_unions_of_the_living(client, db, living):
    db.execute(
        "SELECT count(*) AS n FROM families WHERE husband_id = ANY(%s) OR wife_id = ANY(%s)",
        [list(living), list(living)],
    )
    with_living = db.fetchone()["n"]
    db.execute("SELECT count(*) AS n FROM families")
    total = db.fetchone()["n"]
    assert client.get("/api/families/count").json()["count"] == total - with_living


def test_no_endpoint_shows_a_living_person(client, living, subjects):
    """Every response that reaches a subject from elsewhere stays silent about them."""
    urls = {"/api/tree", "/api/stats"}
    for s in subjects:
        urls |= {
            f"/api/people/{s['id']}",
            f"/api/people/{s['id']}/ancestors?depth=2",
            f"/api/people/{s['id']}/descendants?depth=2",
            f"/api/places/{s['birth_place_id']}",
            f"/api/families/{s['parents_family']}",
            f"/api/search?name={s['name'].split()[-1]}&limit=200",
            f"/api/families?name={s['name'].split()[-1]}&limit=200",
        }
        for parent in (s["father_id"], s["mother_id"]):
            if parent:
                urls |= {
                    f"/api/people/{parent}",
                    f"/api/people/{parent}/descendants?depth=3",
                }
        if s["birth_month"] and s["birth_day"]:
            urls.add(f"/api/onthisday?month={s['birth_month']}&day={s['birth_day']}")
    for url in sorted(urls):
        r = client.get(url)
        assert r.status_code == 200, url
        assert_nothing_shown(r.json(), living, subjects)


def test_responses_are_private_and_vary_on_cookie(client, subjects):
    for url in (f"/api/people/{subjects[0]['id']}", "/api/stats", "/api/onthisday"):
        r = client.get(url)
        assert "private" in r.headers["cache-control"]
        assert "public" not in r.headers["cache-control"]
        assert "Cookie" in r.headers["vary"]


# ---------------------------------------------------------------------------
# Signing in
# ---------------------------------------------------------------------------


def test_family_sees_the_living(client, family_headers, subjects):
    s = subjects[0]
    body = client.get(f"/api/people/{s['id']}", headers=family_headers).json()
    assert body["name"] == s["name"]
    assert body["birth_year"] == s["birth_year"]
    assert "living" not in body
    found = client.get("/api/search", params={"name": s["name"]}, headers=family_headers).json()
    assert s["id"] in {p["id"] for p in found}


def test_session_state(client, family_headers):
    anonymous = client.get("/api/session").json()
    assert anonymous == {"family": False, "available": True}
    assert client.get("/api/session", headers=family_headers).json()["family"] is True


def test_wrong_password_is_refused(client):
    if not privacy.PASSWORD:
        pytest.skip("no family password configured")
    r = client.post("/api/session", json={"password": privacy.PASSWORD + "x"})
    assert r.status_code == 401
    assert privacy.COOKIE_NAME not in r.cookies


def test_forged_or_expired_cookie_is_ignored(client, family_headers, subjects):
    good = family_headers["cookie"].split("=", 1)[1]
    version, expires, signature = good.split(".")
    forged = [
        f"{version}.{int(expires) + 1}.{signature}",  # extended without re-signing
        f"{version}.{expires}.{'0' * len(signature)}",
        "v1.9999999999.",
        "garbage",
    ]
    for value in forged:
        body = client.get(
            f"/api/people/{subjects[0]['id']}",
            headers={"cookie": f"{privacy.COOKIE_NAME}={value}"},
        ).json()
        assert body["name"] == privacy.LIVING_LABEL, value
    past = privacy.make_cookie_value(now=0)
    assert not privacy.cookie_is_valid(past)


def test_sign_out_clears_the_cookie(client):
    r = client.delete("/api/session")
    assert r.status_code == 200
    assert privacy.COOKIE_NAME in r.headers.get("set-cookie", "")
    assert "Max-Age=0" in r.headers["set-cookie"] or "expires=" in r.headers["set-cookie"].lower()
