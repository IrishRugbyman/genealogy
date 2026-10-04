"""Shared slowapi limiter.

It lives in its own module rather than in `main.py` because routers need to
decorate their handlers with it, and `main.py` imports the routers - importing
it back from there would be a cycle.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def client_ip(request: Request) -> str:
    """
    The caller's own address, not the proxy's.

    The site sits behind Cloudflare and then nginx, so `request.client.host` is
    a Cloudflare edge IP: keying a rate limit on it would give every visitor one
    shared bucket. `CF-Connecting-IP` is set by Cloudflare and the leftmost
    `X-Forwarded-For` entry by nginx; both are only trustworthy because nothing
    reaches uvicorn except through them.
    """
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip, default_limits=["120/minute"])
