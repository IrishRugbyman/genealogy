"""
Genealogy API - public read-only family tree.

Every endpoint is a GET and needs no auth (public tree, read-only), but people who
may still be alive are masked unless the browser signed in with the family
password; see `privacy.py` and `routers/session.py`. The one write route is
`POST /api/uploads`, which writes files - never the database - into the depot
behind a shared password; see `routers/uploads.py`.
Rate-limited to 120 req/min per IP.
"""

from __future__ import annotations

import datetime
import os
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app import db, privacy
from app.limiter import limiter
from app.routers import (
    bans,
    distinctions,
    families,
    geo,
    military_ranks,
    people,
    places,
    professions,
    search,
    session,
    stats,
    uploads,
)
from app.schemas import Health

VERSION = "1.0.0"


def _branch_labels() -> dict[str, str]:
    """Labels for branch 1 (father's side) and 2 (mother's), from $GENEALOGY_BRANCH_LABELS."""
    labels = [x.strip() for x in os.environ.get("GENEALOGY_BRANCH_LABELS", "").split(",")]
    paternal = labels[0] if labels and labels[0] else "Paternelle"
    maternal = labels[1] if len(labels) > 1 and labels[1] else "Maternelle"
    return {"1": paternal, "2": maternal}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open the connection pool, build the Sosa map and the living set, then tear down.

    The Sosa root is deployment config (`$GENEALOGY_SOSA_ROOT`, an individual id),
    not code: unset, or pointing at nobody, the tree simply has no numbering. The
    branch labels are config for the same reason: they are the family's names.
    """
    db.init_pool(minconn=1, maxconn=10)
    _sosa_gen = db.get_cursor()
    _cur = next(_sosa_gen)
    try:
        root = db.queries.get_individual(_cur, os.environ.get("GENEALOGY_SOSA_ROOT") or "")
        app.state.tree = {
            "sosa_root": (
                {"id": root["id"], "given_name": root["given_name"], "surname": root["surname"]}
                if root
                else None
            ),
            "branches": _branch_labels(),
        }
        app.state.sosa_map = db.queries.build_sosa_map(_cur, root["id"] if root else None)
        born_after = datetime.date.today().year - privacy.LIVING_HORIZON_YEARS
        app.state.living = frozenset(db.queries.living_individual_ids(_cur, born_after))
    finally:
        with suppress(StopIteration):
            next(_sosa_gen)
    yield
    db.close_pool()


app = FastAPI(
    title="Genealogy API",
    description=(
        "Public read-only REST API for a family tree database. "
        "Supports ancestor/descendant traversal, search, and geocoded place data."
    ),
    version=VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Innermost first: the privacy filter must see the JSON before GZip compresses it.
app.add_middleware(privacy.PrivacyMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=2048)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://genealogy.lbzgiu.xyz",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# Routers carry their own /api/* prefix
app.include_router(search.router)
app.include_router(people.router)
app.include_router(families.router)
app.include_router(stats.router)
app.include_router(geo.router)
app.include_router(bans.router)
app.include_router(professions.router)
app.include_router(distinctions.router)
app.include_router(military_ranks.router)
app.include_router(places.router)
app.include_router(uploads.router)
app.include_router(session.router)


@app.get("/api/health", response_model=Health, tags=["health"])
def health():
    """Liveness check."""
    return Health(status="ok", version=VERSION)
