"""
Shared fixtures for the genealogy API test suite.

The tests run against the real read-only `genealogy` PostgreSQL database (the API
is read-only, so exercising live data is safe). A single TestClient is created per
session: entering its context manager runs the app lifespan, which opens the
connection pool and builds the Sosa map.

If the database is unreachable, the whole suite is skipped rather than failing, so
the tests stay runnable in environments without the DB.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg2
import pytest

# Make the `app` package importable when pytest is invoked from anywhere.
_API_DIR = Path(__file__).resolve().parents[1]
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))


def _load_env_file(path: Path) -> None:
    """Read the deployment's `api/.env` (KEY=VALUE lines) without overriding the shell.

    The suite runs against the deployment's own database, so it takes the
    deployment's config too - the Sosa root above all, which is not in the code.
    """
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() and not key.lstrip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip())


_load_env_file(_API_DIR / ".env")

DSN = os.environ.get("GENEALOGY_DSN", "dbname=genealogy")

# Name placeholders in the source: unknown first/last names, never a real surname.
_PLACEHOLDER_NAMES = {"n", "?", "x"}


def _db_available() -> bool:
    try:
        psycopg2.connect(DSN).close()
        return True
    except Exception:
        return False


_DB_UP = _db_available()
_skip_no_db = pytest.mark.skipif(not _DB_UP, reason="genealogy DB unreachable")


@pytest.fixture(scope="session")
def client():
    """Session-scoped TestClient with the app lifespan active."""
    if not _DB_UP:
        pytest.skip("genealogy DB unreachable")
    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Dynamically discovered sample IDs (avoid brittle hardcoded fixtures).
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def sample_person_id(client) -> str:
    """An individual id that exists, taken from the first search result."""
    r = client.get("/api/search", params={"limit": 1})
    r.raise_for_status()
    rows = r.json()
    assert rows, "search returned no people - is the DB loaded?"
    return rows[0]["id"]


@pytest.fixture(scope="session")
def sample_family_id(client) -> str:
    r = client.get("/api/families", params={"limit": 1})
    r.raise_for_status()
    rows = r.json()
    assert rows, "families list returned nothing"
    return rows[0]["id"]


@pytest.fixture(scope="session")
def sample_place_id(client) -> int:
    """A place id with events, from /api/places (geocoded places)."""
    r = client.get("/api/places")
    r.raise_for_status()
    rows = r.json()
    assert rows, "no geocoded places"
    return rows[0]["id"]


@pytest.fixture(scope="session")
def sosa_root_id(client) -> str:
    """The configured Sosa root; Sosa tests skip on a deployment without one."""
    r = client.get("/api/tree")
    r.raise_for_status()
    root = r.json()["sosa_root"]
    if root is None:
        pytest.skip("no Sosa root configured (GENEALOGY_SOSA_ROOT)")
    return root["id"]


@pytest.fixture(scope="session")
def sample_surname(client) -> str:
    """The most frequent real surname in the tree, placeholders excluded."""
    r = client.get("/api/stats")
    r.raise_for_status()
    for row in r.json()["top_surnames"]:
        if row["surname"] and row["surname"].strip().lower() not in _PLACEHOLDER_NAMES:
            return row["surname"]
    pytest.fail("no real surname among the top surnames")
