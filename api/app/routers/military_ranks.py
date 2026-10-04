"""Military ranks endpoints: /api/military-ranks/*"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app import db
from app.schemas import MilitaryRankDetail, MilitaryRankSummary

router = APIRouter(prefix="/api/military-ranks", tags=["military-ranks"])

_CACHE = 3600


@router.get("", response_model=list[MilitaryRankSummary])
def list_military_ranks(cur=Depends(db.get_cursor)):
    """All canonical military ranks ordered by grade, with individual count."""
    rows = db.queries.get_military_rank_list(cur)
    return JSONResponse(
        content=[dict(r) for r in rows],
        headers={"Cache-Control": f"public, max-age={_CACHE}"},
    )


@router.get("/{rank_id}", response_model=MilitaryRankDetail)
def get_military_rank(rank_id: int, cur=Depends(db.get_cursor)):
    """Military rank detail with all individuals who hold it."""
    data = db.queries.get_military_rank_detail(cur, rank_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Military rank not found")
    return JSONResponse(
        content=data,
        headers={"Cache-Control": f"public, max-age={_CACHE}"},
    )
