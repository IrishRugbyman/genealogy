"""Place and commune detail endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import app.db as _db
from app.db import get_cursor
from app.schemas import CommuneDetail, PlaceDetail

router = APIRouter(prefix="/api", tags=["places"])


@router.get("/places/{place_id}", response_model=PlaceDetail)
def get_place(place_id: int, cur=Depends(get_cursor)):
    """Locality detail: events recorded there + commune context + sibling localities."""
    row = _db.queries.get_place_detail(cur, place_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Place not found")
    return row


@router.get("/communes/{insee}", response_model=CommuneDetail)
def get_commune(insee: str, cur=Depends(get_cursor)):
    """Commune detail: events aggregated across all its localities."""
    row = _db.queries.get_commune_detail(cur, insee)
    if row is None:
        raise HTTPException(status_code=404, detail="Commune not found")
    return row
