"""Sources, their citations, and the act images the signed-in family may see.

An act's transcription is public (it is in the source detail). Its images are scans
of archives or of an online gallery, other people's photographs: they are served to
the family only, from `$GENEALOGY_ACTES_DIR`, the research repo's `data/actes/` on
this server. Unset, the images are off (503), never open.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from app import db, privacy
from app.schemas import SourceDetail, SourceSummary

router = APIRouter(prefix="/api/sources", tags=["sources"])
images_router = APIRouter(prefix="/api/citations", tags=["sources"])

_ACTES_ENV = os.environ.get("GENEALOGY_ACTES_DIR")
ACTES_DIR: Path | None = Path(_ACTES_ENV).resolve() if _ACTES_ENV else None
_MEDIA = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

# Revalidate every time: the registry changes with each finding, and an hour-old
# answer showed a page without the act text added since (2026-10-08).
_CACHE_HEADERS = {"Cache-Control": "no-cache"}


@router.get("", response_model=list[SourceSummary])
def list_sources(cur=Depends(db.get_cursor)):
    """Every source (the export's and the research's) with its citation and link counts."""
    rows = db.queries.get_source_list(cur)
    return JSONResponse(
        content=[dict(r) for r in rows],
        headers=_CACHE_HEADERS,
    )


@router.get("/{source_id}", response_model=SourceDetail)
def get_source(source_id: str, cur=Depends(db.get_cursor)):
    """One source, its citations and the records each backs."""
    data = db.queries.get_source_detail(cur, source_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Source not found")
    return JSONResponse(
        content=data,
        headers=_CACHE_HEADERS,
    )


@images_router.get("/{citation_id}/images/{ord_}")
def get_citation_image(citation_id: str, ord_: int, request: Request, cur=Depends(db.get_cursor)):
    """One image of a citation's act, for the signed-in family only."""
    if ACTES_DIR is None:
        raise HTTPException(status_code=503, detail="Act images are not configured")
    if not privacy.is_family(request):
        raise HTTPException(status_code=403, detail="Family access required")
    rel = db.queries.get_citation_image_file(cur, citation_id, ord_)
    if rel is None:
        raise HTTPException(status_code=404, detail="Image not found")
    path = (ACTES_DIR / rel).resolve()
    if (
        not path.is_relative_to(ACTES_DIR)
        or not path.is_file()
        or path.suffix.lower() not in _MEDIA
    ):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(
        path,
        media_type=_MEDIA[path.suffix.lower()],
        headers={"Cache-Control": "private, max-age=86400", "Vary": "Cookie"},
    )
