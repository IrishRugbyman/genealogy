"""People endpoints: /api/people/*"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel

import app.db as _db
from app.db import get_cursor
from app.schemas import CommonAncestor, PersonDetail, TreeNode, TreePerson

router = APIRouter(prefix="/api/people", tags=["people"])


# Bound on one batch: the tree asks for what a click reveals, a few dozen at most.
MAX_TREE_BATCH = 300


@router.get("", response_model=list[TreePerson])
def get_tree_people(
    ids: str = Query(description="Comma-separated individual ids, e.g. I5,I6"),
    cur=Depends(get_cursor),
):
    """Lean tree records for a batch of people: what expanding a box needs to draw."""
    wanted = list(dict.fromkeys(i.strip() for i in ids.split(",") if i.strip()))
    if len(wanted) > MAX_TREE_BATCH:
        raise HTTPException(status_code=400, detail=f"{MAX_TREE_BATCH} ids au maximum")
    return _db.queries.get_tree_people(cur, wanted)


@router.get("/{id}/tree", response_model=list[TreePerson])
def get_tree(
    id: str = Path(description="Individual id at the centre of the tree"),
    up: int = Query(3, ge=0, le=8, description="Generations of ancestors"),
    down: int = Query(1, ge=0, le=4, description="Generations of descendants"),
    cur=Depends(get_cursor),
):
    """Everyone the tree shows when it opens on `id`, in one request."""
    cur.execute("SELECT 1 FROM individuals WHERE id = %s", [id])
    if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail=f"Individual {id!r} not found")
    return _db.queries.get_tree_neighbourhood(cur, id, up, down)


@router.get("/{id}", response_model=PersonDetail)
def get_person(
    id: str = Path(description="Individual id, e.g. I5"),
    cur=Depends(get_cursor),
):
    """Full record for one individual: vital events, parents, spouses, children, notes."""
    result = _db.queries.get_individual(cur, id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Individual {id!r} not found")
    return result


@router.get("/{id}/ancestors", response_model=list[TreeNode])
def get_ancestors(
    id: str = Path(description="Individual id"),
    depth: int = Query(12, ge=1, le=30, description="Max generations to traverse"),
    cur=Depends(get_cursor),
):
    """Recursive ancestor tree for an individual, up to `depth` generations."""
    # Verify the individual exists first for a clean 404
    cur.execute("SELECT 1 FROM individuals WHERE id = %s", [id])
    if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail=f"Individual {id!r} not found")
    return _db.queries.get_ancestors(cur, id, max_depth=depth)


@router.get("/{id}/descendants", response_model=list[TreeNode])
def get_descendants(
    id: str = Path(description="Individual id"),
    depth: int = Query(6, ge=1, le=20, description="Max generations to traverse"),
    cur=Depends(get_cursor),
):
    """Recursive descendant tree for an individual, up to `depth` generations."""
    cur.execute("SELECT 1 FROM individuals WHERE id = %s", [id])
    if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail=f"Individual {id!r} not found")
    return _db.queries.get_descendants(cur, id, max_depth=depth)


class SosaResponse(BaseModel):
    """Sosa number of one individual, None when it is not an ancestor of the root."""

    sosa: int | None


@router.get("/{id}/sosa", response_model=SosaResponse)
def get_sosa(
    request: Request,
    id: str = Path(description="Individual id, e.g. I5"),
    cur=Depends(get_cursor),
):
    """Sosa-Stradonitz number of this individual relative to the tree root ($GENEALOGY_SOSA_ROOT)."""
    cur.execute("SELECT 1 FROM individuals WHERE id = %s", [id])
    if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail=f"Individual {id!r} not found")
    sosa_map: dict[str, int] = request.app.state.sosa_map
    return {"sosa": sosa_map.get(id)}


@router.get("/{id}/common-ancestors", response_model=list[CommonAncestor])
def get_common_ancestors(
    id: str = Path(description="First individual id"),
    other: str = Query(description="Second individual id"),
    cur=Depends(get_cursor),
):
    """
    Shared (most-recent-common) ancestors of two individuals.

    Results are ordered by total genealogical distance (nearest common ancestor first),
    making it easy to see how closely two people are related.
    """
    # Verify both exist
    for check_id in (id, other):
        cur.execute("SELECT 1 FROM individuals WHERE id = %s", [check_id])
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail=f"Individual {check_id!r} not found")
    return _db.queries.get_common_ancestors(cur, id, other)
