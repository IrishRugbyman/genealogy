"""Families endpoints: /api/families (list/search) and /api/families/{id} (detail)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Query

import app.db as _db
from app.db import get_cursor
from app.schemas import FamilyDetail, FamilySummary

router = APIRouter(prefix="/api/families", tags=["families"])


@router.get("", response_model=list[FamilySummary])
def list_families(
    name: str | None = Query(None, description="Filter by husband or wife name"),
    place: str | None = Query(None, description="Filter by marriage place locality"),
    year_from: int | None = Query(None, description="Min marriage year"),
    year_to: int | None = Query(None, description="Max marriage year"),
    min_children: int | None = Query(None, description="Minimum number of children"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    cur=Depends(get_cursor),
):
    """Searchable, paginated family list with child counts."""
    return _db.queries.search_families(
        cur,
        name=name,
        place=place,
        year_from=year_from,
        year_to=year_to,
        min_children=min_children,
        limit=limit,
        offset=offset,
    )


@router.get("/count")
def count_families(
    name: str | None = Query(None),
    place: str | None = Query(None),
    year_from: int | None = Query(None),
    year_to: int | None = Query(None),
    min_children: int | None = Query(None),
    cur=Depends(get_cursor),
):
    """Count families matching the same filters as GET /api/families."""
    n = _db.queries.count_families(
        cur,
        name=name,
        place=place,
        year_from=year_from,
        year_to=year_to,
        min_children=min_children,
    )
    return {"count": n}


@router.get("/{id}", response_model=FamilyDetail)
def get_family(
    id: str = Path(description="Family id, e.g. F13"),
    cur=Depends(get_cursor),
):
    """Full record for one family unit: husband, wife, marriage, children, events."""
    result = _db.queries.get_family(cur, id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Family {id!r} not found")
    return result
