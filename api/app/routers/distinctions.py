from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app import db
from app.schemas import DistinctionDetail, DistinctionSummary

router = APIRouter(prefix="/api/distinctions", tags=["distinctions"])

_CACHE = 3600


@router.get("", response_model=list[DistinctionSummary])
def list_distinctions(cur=Depends(db.get_cursor)):
    """All distinctions with how many people hold each."""
    rows = db.queries.get_distinction_list(cur)
    return JSONResponse(
        content=[dict(r) for r in rows],
        headers={"Cache-Control": f"public, max-age={_CACHE}"},
    )


@router.get("/{distinction_id}", response_model=DistinctionDetail)
def get_distinction(distinction_id: int, cur=Depends(db.get_cursor)):
    """One distinction and the people who hold it."""
    data = db.queries.get_distinction_detail(cur, distinction_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Distinction not found")
    return JSONResponse(
        content=data,
        headers={"Cache-Control": f"public, max-age={_CACHE}"},
    )
