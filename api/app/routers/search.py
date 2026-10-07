"""Search endpoint: /api/search"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

import app.db as _db
from app.db import get_cursor
from app.privacy import hidden_ids
from app.schemas import PersonSummary

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search", response_model=list[PersonSummary])
def search_individuals(
    request: Request,
    name: str | None = Query(None, description="Free-text name query"),
    place: str | None = Query(None, description="Birth or death place locality substring"),
    year_from: int | None = Query(None, description="Min birth or death year (inclusive)"),
    year_to: int | None = Query(None, description="Max birth or death year (inclusive)"),
    sex: str | None = Query(None, pattern="^[MFU]$", description="Sex: M, F, or U"),
    branch: int | None = Query(
        None, description="Branch: 1=father's side of the Sosa root, 2=mother's, 3=both"
    ),
    profession_category: str | None = Query(None, description="Filter by profession category slug"),
    profession_id: int | None = Query(None, description="Filter by specific profession ID"),
    distinction_id: int | None = Query(None, description="Filter by distinction ID"),
    limit: int = Query(50, ge=1, le=200, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    sort: str = Query(
        "name", description="Sort: name, birth_year, -birth_year, death_year, -death_year"
    ),
    cur=Depends(get_cursor),
):
    """Search individuals by name, place, year range, sex, branch, profession, or distinction."""
    results = _db.queries.search_individuals(
        cur,
        name=name,
        place=place,
        year_from=year_from,
        year_to=year_to,
        sex=sex,
        branch=branch,
        profession_category=profession_category,
        profession_id=profession_id,
        distinction_id=distinction_id,
        limit=limit,
        offset=offset,
        sort=sort,
        exclude_ids=hidden_ids(request),
    )
    sosa_map: dict[str, int] = request.app.state.sosa_map
    for row in results:
        row["sosa"] = sosa_map.get(row["id"])
    return results


@router.get("/search/count")
def count_individuals(
    request: Request,
    name: str | None = Query(None),
    place: str | None = Query(None),
    year_from: int | None = Query(None),
    year_to: int | None = Query(None),
    sex: str | None = Query(None, pattern="^[MFU]$"),
    branch: int | None = Query(None),
    profession_category: str | None = Query(None),
    profession_id: int | None = Query(None),
    distinction_id: int | None = Query(None),
    cur=Depends(get_cursor),
):
    """Return total count matching the same filters as /api/search (no pagination)."""
    n = _db.queries.count_individuals(
        cur,
        name=name,
        place=place,
        year_from=year_from,
        year_to=year_to,
        sex=sex,
        branch=branch,
        profession_category=profession_category,
        profession_id=profession_id,
        distinction_id=distinction_id,
        exclude_ids=hidden_ids(request),
    )
    return {"count": n}
