from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app import db
from app.schemas import ProfessionDetail, ProfessionSummary

router = APIRouter(prefix="/api/professions", tags=["professions"])

_CACHE = 3600  # 1 hour


@router.get("", response_model=list[ProfessionSummary])
def list_professions(cur=Depends(db.get_cursor)):
    """All professions with how many people practised each."""
    rows = db.queries.get_profession_list(cur)
    return JSONResponse(
        content=[dict(r) for r in rows],
        headers={"Cache-Control": f"public, max-age={_CACHE}"},
    )


@router.get("/{profession_id}", response_model=ProfessionDetail)
def get_profession(profession_id: int, cur=Depends(db.get_cursor)):
    """One profession and the people who practised it."""
    data = db.queries.get_profession_detail(cur, profession_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Profession not found")
    return JSONResponse(
        content=data,
        headers={"Cache-Control": f"public, max-age={_CACHE}"},
    )
