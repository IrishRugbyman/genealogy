"""Family sign-in: GET/POST/DELETE /api/session.

One shared password unlocks the living for the browser that typed it, through a
signed cookie (see `app/privacy.py`). There are no accounts: this is the same
kind of gate as the depot's, and the two share a password unless
`$GENEALOGY_VIEW_PASSWORD` sets a separate one.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app import privacy
from app.limiter import limiter

router = APIRouter(prefix="/api", tags=["session"])


class SessionState(BaseModel):
    """Whether this browser is signed in, and whether signing in is possible at all."""

    family: bool
    available: bool


class SignIn(BaseModel):
    """The family password."""

    password: str


def _state(family: bool) -> SessionState:
    return SessionState(family=family, available=bool(privacy.PASSWORD))


@router.get("/session", response_model=SessionState)
def get_session(request: Request, response: Response):
    """Whether this browser sees the living."""
    response.headers["Cache-Control"] = "no-store"
    return _state(privacy.is_family(request))


@router.post("/session", response_model=SessionState)
@limiter.limit("20/hour")
def sign_in(request: Request, body: SignIn, response: Response):
    """Check the family password and set the cookie."""
    if not privacy.PASSWORD:
        raise HTTPException(status_code=503, detail="L'accès famille n'est pas ouvert")
    if not privacy.password_matches(body.password):
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    response.set_cookie(
        privacy.COOKIE_NAME,
        privacy.make_cookie_value(),
        max_age=privacy.COOKIE_MAX_AGE,
        path=privacy.COOKIE_PATH,
        secure=True,
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return _state(True)


@router.delete("/session", response_model=SessionState)
def sign_out(response: Response):
    """Forget the cookie."""
    response.delete_cookie(
        privacy.COOKIE_NAME, path=privacy.COOKIE_PATH, secure=True, httponly=True, samesite="lax"
    )
    response.headers["Cache-Control"] = "no-store"
    return _state(False)
