"""Ban endpoints: /api/bans, /api/bans/{id}"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import app.db as _db
from app.db import get_cursor
from app.schemas import BanDetail, BanSummary

router = APIRouter(prefix="/api", tags=["bans"])

_CACHE = "public, max-age=86400, stale-while-revalidate=3600"


@router.get("/bans", response_model=list[BanSummary])
def list_bans(cur=Depends(get_cursor)):
    """
    List all historical seigneurial bans with their mapped modern communes.

    Bans were pre-Revolution territorial units in Lorraine/Vosges, held under
    the suzerainty of the Abbey of Remiremont or the Duke of Lorraine.
    Abolished in 1789 and replaced by communes.
    """
    from fastapi.responses import JSONResponse

    data = _db.queries.get_bans(cur)
    return JSONResponse(content=data, headers={"Cache-Control": _CACHE})


@router.get("/bans/{ban_id}", response_model=BanDetail)
def get_ban(ban_id: int, cur=Depends(get_cursor)):
    """
    Full detail for one ban: all descriptive fields, mapped communes, and
    historical localities (with place_id links where geocoded).
    """
    from fastapi.responses import JSONResponse

    data = _db.queries.get_ban_detail(cur, ban_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Ban not found")
    return JSONResponse(content=data, headers={"Cache-Control": _CACHE})
