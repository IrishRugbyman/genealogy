"""Living people: who they are, who may see them, and how they are hidden.

The tree names people who are alive. A visitor who is not signed in sees them as
"Personne vivante": the id stays (so links and the tree's shape still work), the
sex stays (it colours a node), and everything else - names, dates, places,
events, notes - is blanked. Listings (search, place pages, catalogs, "on this
day") leave them out entirely, so a search cannot even confirm that someone of
that name exists.

Who counts as living is decided once at startup by `queries.living_individual_ids`
(no recorded death, born or estimated born less than `LIVING_HORIZON_YEARS` ago)
and kept in `app.state.living`.

Signing in is one shared family password, `$GENEALOGY_VIEW_PASSWORD`, falling back
to the depot's `$GENEALOGY_UPLOAD_PASSWORD` so the family has a single password to
remember. It sets a signed cookie; the key is derived from the password, so
changing the password signs everyone out. With no password configured, nobody can
sign in and the living stay hidden: the default is private, never open.

The hiding itself is a response middleware rather than code in each router,
because person data reaches the client through some twenty response shapes and a
router-by-router approach would leak the first time someone added one. It walks
the JSON and recognises people by their keys (see `redact`). The two paginated
listings, `/api/search` and `/api/families`, also exclude the living in SQL
(`hidden_ids`), because dropping rows after a LIMIT would break their paging and
their counts.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from typing import Any

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

LIVING_HORIZON_YEARS = 100

COOKIE_NAME = "genealogy_family"
COOKIE_PATH = "/api"
COOKIE_MAX_AGE = 365 * 24 * 3600

LIVING_LABEL = "Personne vivante"

PASSWORD: str = (
    os.environ.get("GENEALOGY_VIEW_PASSWORD") or os.environ.get("GENEALOGY_UPLOAD_PASSWORD") or ""
)


# ---------------------------------------------------------------------------
# The family cookie
# ---------------------------------------------------------------------------


def _key() -> bytes:
    return hashlib.sha256(b"genealogy-family-view\0" + PASSWORD.encode()).digest()


def _sign(payload: str) -> str:
    return hmac.new(_key(), payload.encode(), hashlib.sha256).hexdigest()


def password_matches(candidate: str) -> bool:
    """True if sign-in is configured and `candidate` is the family password."""
    return bool(PASSWORD) and hmac.compare_digest(candidate.strip().encode(), PASSWORD.encode())


def make_cookie_value(now: float | None = None) -> str:
    """A signed token, valid `COOKIE_MAX_AGE` seconds from `now`."""
    expires = int((now if now is not None else time.time()) + COOKIE_MAX_AGE)
    payload = f"v1.{expires}"
    return f"{payload}.{_sign(payload)}"


def cookie_is_valid(value: str | None, now: float | None = None) -> bool:
    """True for an unexpired token signed with the current password's key."""
    if not PASSWORD or not value:
        return False
    version, _, rest = value.partition(".")
    expires, _, signature = rest.partition(".")
    if version != "v1" or not expires.isdigit():
        return False
    if not hmac.compare_digest(signature, _sign(f"v1.{expires}")):
        return False
    return int(expires) > (now if now is not None else time.time())


def is_family(request: Request) -> bool:
    """Whether this request carries a valid family cookie."""
    return cookie_is_valid(request.cookies.get(COOKIE_NAME))


def hidden_ids(request: Request) -> frozenset[str] | None:
    """The individuals a query must leave out for this viewer, None for family."""
    if is_family(request):
        return None
    return request.app.state.living


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

# On a hidden person's own record, the keys that survive. Everything else is
# blanked, so a field added to a response later is hidden by default.
_PERSON_KEEP = {
    "id",
    "child_id",
    "sex",
    "branch",
    "is_direct_line",
    "sosa",
    "depth",
    "depth_from_id1",
    "depth_from_id2",
    "total_depth",
    "family_id",
    "other_parent_id",
}
# Kept on a hidden person but walked like any other value: the relatives
# themselves are hidden or shown on their own merits.
_PERSON_STRUCTURE = {"parents", "spouses", "children"}

# A person referenced from someone else's record by prefixed keys
# (`father_id`, `father_name`, ...).
_ROLES = ("father", "mother", "spouse", "husband", "wife")
_ROLE_KEEP = {"id", "sex"}

# A union one of whose partners is hidden: its date, place, events and
# sources go too. `event_year` is how "on this day" dates a marriage.
_UNION_PREFIXES = ("marriage_",)
_UNION_KEYS = {"divorced", "divorce_note", "events", "sources", "event_year"}

# Listings, as opposed to structure: a hidden person is removed from these
# rather than shown masked.
_LISTING_KEYS = {"individuals", "born", "died", "married", "marriages"}


def _blank(value: Any) -> Any:
    if isinstance(value, list):
        return []
    return None


def _concerns(item: Any, living: frozenset[str]) -> bool:
    """Whether a listing entry is about a hidden person, as subject or partner."""
    if not isinstance(item, dict):
        return False
    ids = [item.get("id"), item.get("child_id")]
    ids += [item.get(f"{role}_id") for role in _ROLES]
    return any(isinstance(i, str) and i in living for i in ids)


def _mask_union(d: dict[str, Any]) -> None:
    for key in list(d):
        if key.startswith(_UNION_PREFIXES) or key in _UNION_KEYS:
            d[key] = _blank(d[key])


def redact(value: Any, living: frozenset[str], *, union_of_hidden: bool = False) -> Any:
    """Return `value` (decoded JSON) with every hidden person masked or removed.

    People are recognised by key, whatever the response:

    - a dict whose `id` or `child_id` is hidden is that person's own record:
      only `_PERSON_KEEP` survives, `name` becomes `LIVING_LABEL`, `living` is set;
    - `<role>_id` hidden, for the roles in `_ROLES`, masks the other
      `<role>_*` keys of that dict and sets `<role>_living`;
    - a dict where any partner is hidden is a union of a living person: its
      marriage keys go too (`_mask_union`);
    - lists under `_LISTING_KEYS` drop their hidden entries instead.

    `union_of_hidden` marks the spouse entries of a hidden person's own record,
    whose marriages are that person's even though no `<role>_id` says so.
    """
    if isinstance(value, list):
        return [redact(v, living) for v in value]
    if not isinstance(value, dict):
        return value

    d = dict(value)
    person_id = d.get("id") if isinstance(d.get("id"), str) else d.get("child_id")
    hidden_person = isinstance(person_id, str) and person_id in living

    if hidden_person:
        for key in list(d):
            if key in _PERSON_KEEP or key in _PERSON_STRUCTURE:
                continue
            d[key] = LIVING_LABEL if key == "name" else _blank(d[key])
        d["living"] = True

    hidden_partner = False
    for role in _ROLES:
        role_id = d.get(f"{role}_id")
        if not (isinstance(role_id, str) and role_id in living):
            continue
        prefix = f"{role}_"
        for key in list(d):
            if key.startswith(prefix) and key[len(prefix) :] not in _ROLE_KEEP:
                d[key] = LIVING_LABEL if key == f"{role}_name" else _blank(d[key])
        d[f"{role}_living"] = True
        if role in ("spouse", "husband", "wife"):
            hidden_partner = True

    if hidden_partner or union_of_hidden:
        _mask_union(d)

    for key, child in d.items():
        if key in _LISTING_KEYS and isinstance(child, list):
            d[key] = [redact(v, living) for v in child if not _concerns(v, living)]
        elif key == "spouses" and hidden_person and isinstance(child, list):
            d[key] = [redact(v, living, union_of_hidden=True) for v in child]
        elif isinstance(child, (dict, list)):
            d[key] = redact(child, living)
    return d


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# Endpoints that never carry a person: skipped, because the GeoJSON ones are
# large and walking them would cost for nothing. Exact paths only - most of
# their neighbours (`/api/places/{id}`) do carry people.
_PERSON_FREE_PATHS = {"/api/health", "/api/places", "/api/places/gaps", "/api/stats/pedigree"}
_PERSON_FREE_PREFIXES = ("/api/geo/", "/api/bans", "/api/session", "/api/uploads")


def _person_free(path: str) -> bool:
    return path in _PERSON_FREE_PATHS or path.startswith(_PERSON_FREE_PREFIXES)


def _cookie_from_scope(scope: Scope) -> str | None:
    for name, raw in scope.get("headers", []):
        if name != b"cookie":
            continue
        for part in raw.decode("latin-1").split(";"):
            key, _, val = part.strip().partition("=")
            if key == COOKIE_NAME:
                return val
    return None


class PrivacyMiddleware:
    """Mask the living in every person-bearing `/api` JSON response.

    Must sit inside the GZip middleware (added before it), so it sees plain JSON.
    Every response it handles is marked `private` and `Vary: Cookie` (keeping a
    route's own `max-age`, else `no-cache`): the same URL answers differently once
    signed in, so no shared cache may hold it and no browser may reuse one
    viewer's answer for the other.
    """

    def __init__(self, app: ASGIApp) -> None:
        """Wrap `app`."""
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Pass through, buffering and rewriting the response when it may carry people."""
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/api/") or _person_free(path):
            await self.app(scope, receive, send)
            return

        family = cookie_is_valid(_cookie_from_scope(scope))
        living: frozenset[str] = getattr(scope["app"].state, "living", frozenset())
        start: Message | None = None
        chunks: list[bytes] = []

        async def wrapped_send(message: Message) -> None:
            nonlocal start
            if message["type"] == "http.response.start":
                start = message
                return
            if message["type"] != "http.response.body":
                await send(message)
                return
            chunks.append(message.get("body", b""))
            if message.get("more_body", False):
                return
            assert start is not None
            body = b"".join(chunks)
            cache_control = b"private, no-cache"
            headers = []
            for k, v in start["headers"]:
                if k.lower() == b"cache-control":
                    cache_control = v.replace(b"public", b"private")
                elif k.lower() not in (b"content-length", b"vary"):
                    headers.append((k, v))
            content_type = dict(start["headers"]).get(b"content-type", b"")
            if (
                not family
                and living
                and body
                and start["status"] == 200
                and b"json" in content_type
            ):
                body = json.dumps(
                    redact(json.loads(body), living), ensure_ascii=False, separators=(",", ":")
                ).encode()
            headers += [
                (b"content-length", str(len(body)).encode()),
                (b"cache-control", cache_control),
                (b"vary", b"Cookie"),
            ]
            await send({**start, "headers": headers})
            await send({"type": "http.response.body", "body": body})

        await self.app(scope, receive, wrapped_send)
