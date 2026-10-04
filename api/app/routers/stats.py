"""Statistics endpoints: /api/stats, /api/tree, /api/stats/pedigree, /api/places."""

from __future__ import annotations

import datetime
from math import floor, log2

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

import app.db as _db
from app.db import get_cursor
from app.schemas import PedigreeGeneration, PlaceGap, PlaceGeo, Statistics, TreeConfig

router = APIRouter(prefix="/api", tags=["statistics"])

_STATS_CACHE = "public, max-age=3600, stale-while-revalidate=300"
_PLACES_CACHE = "public, max-age=3600, stale-while-revalidate=300"


@router.get("/stats", response_model=Statistics)
def get_statistics(cur=Depends(get_cursor)):
    """
    Aggregate statistics: totals, sex breakdown, birth centuries, top surnames,
    top birth localities, country distribution, and data coverage metrics.
    """
    data = _db.queries.get_statistics(cur)
    return JSONResponse(content=data, headers={"Cache-Control": _STATS_CACHE})


@router.get("/tree", response_model=TreeConfig)
def get_tree(request: Request):
    """The deployment's Sosa root (null when none is set) and its branch labels."""
    return JSONResponse(content=request.app.state.tree, headers={"Cache-Control": _STATS_CACHE})


@router.get("/stats/pedigree", response_model=list[PedigreeGeneration])
def get_pedigree(request: Request):
    """
    Pedigree collapse chart data for the Sosa root ($GENEALOGY_SOSA_ROOT).

    For each generation G (1..max), returns the number of potential ancestors
    (2^G) and how many are actually known in the tree.
    """
    sosa_map: dict[str, int] = request.app.state.sosa_map
    gen_counts: dict[int, int] = {}
    for num in sosa_map.values():
        if num < 1:
            continue
        g = floor(log2(num))
        gen_counts[g] = gen_counts.get(g, 0) + 1

    max_gen = max(gen_counts.keys()) if gen_counts else 0
    result = [
        {"generation": g, "potential": 2**g, "known": gen_counts.get(g, 0)}
        for g in range(1, max_gen + 1)
    ]
    return JSONResponse(content=result, headers={"Cache-Control": _STATS_CACHE})


@router.get("/places", response_model=list[PlaceGeo])
def get_places(cur=Depends(get_cursor)):
    """
    All geocoded places with birth, death, and marriage event counts.
    Intended for map rendering - only places with lat/lon are returned.
    """
    data = _db.queries.get_places_geo(cur)
    return JSONResponse(content=data, headers={"Cache-Control": _PLACES_CACHE})


@router.get("/onthisday")
def get_on_this_day(
    month: int = Query(default=None, ge=1, le=12),
    day: int = Query(default=None, ge=1, le=31),
    cur=Depends(get_cursor),
):
    """People born, died, or married on a given month+day (default: today)."""
    today = datetime.date.today()
    m = month if month is not None else today.month
    d = day if day is not None else today.day
    data = _db.queries.get_on_this_day(cur, m, d)
    # Short cache: data is date-sensitive
    return JSONResponse(content=data, headers={"Cache-Control": "public, max-age=3600"})


@router.get("/places/gaps", response_model=list[PlaceGap])
def get_place_gaps(cur=Depends(get_cursor)):
    """
    Places with at least one event but incomplete geographic data.
    Flags: no_country, no_coords, fr_no_insee. Ordered by event count desc.
    """
    data = _db.queries.get_place_gaps(cur)
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})
