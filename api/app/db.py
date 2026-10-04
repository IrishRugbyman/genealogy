"""
Database pool for the genealogy API.

Uses psycopg2 ThreadedConnectionPool so sync FastAPI routes (run in the default
threadpool) can borrow and return connections safely.

The query layer lives in ../../db/queries.py (same repo, one directory up from api/).
Import it here so all routers can do:  from app.db import get_cursor, queries
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

# Make the sibling db/ directory importable
_DB_DIR = str(Path(__file__).resolve().parents[2] / "db")
if _DB_DIR not in sys.path:
    sys.path.insert(0, _DB_DIR)

import queries  # noqa: E402, F401  (after the sys.path patch; re-exported as db.queries)

DSN: str = os.environ.get("GENEALOGY_DSN", "dbname=genealogy")

_pool: ThreadedConnectionPool | None = None


def init_pool(minconn: int = 1, maxconn: int = 10) -> None:
    """Open the connection pool. Called once at application startup."""
    global _pool
    _pool = ThreadedConnectionPool(minconn, maxconn, dsn=DSN)


def close_pool() -> None:
    """Close all pool connections. Called at application shutdown."""
    if _pool is not None:
        _pool.closeall()


def get_cursor():
    """
    FastAPI dependency that yields a RealDictCursor and returns the connection to
    the pool when the request is done.

    Usage in a route:
        from app.db import get_cursor
        def my_route(cur = Depends(get_cursor)): ...
    """
    assert _pool is not None, "Pool not initialised - was init_pool() called?"
    conn = _pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        yield cur
        cur.close()
    finally:
        _pool.putconn(conn)
