"""
Geo endpoints: choropleth GeoJSON at four granularities.

  GET /api/geo/countries   - world countries coloured by event count
  GET /api/geo/regions     - French new regions (2016+) coloured by event count
  GET /api/geo/departments - French departments coloured by event count
  GET /api/geo/communes    - French commune polygons for places in our DB

All responses are built once on first request and held in memory.  Dept/commune
endpoints do live calls to geo.api.gouv.fr for reverse-geocoding; results are
cached forever for the lifetime of the process.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

import app.db as _db
from app.db import get_cursor

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
_DEPT_FILE = os.path.join(_DATA_DIR, "departements-fr.geojson")
_REGION_FILE = os.path.join(_DATA_DIR, "regions-fr.geojson")
_COUNTRY_FILE = os.path.join(_DATA_DIR, "countries-ne110m.geojson")

router = APIRouter(prefix="/api/geo", tags=["geo"])

_COMMUNE_RG_URL = (
    "https://geo.api.gouv.fr/communes?lat={lat}&lon={lon}&fields=nom,code,codeDepartement,contour"
)

# Lookup a single commune polygon by its INSEE code (French places store
# commune_insee but have null lat/lon, so we fetch the contour by code).
_COMMUNE_CODE_URL = "https://geo.api.gouv.fr/communes/{code}?fields=nom,code,contour"

# ---------------------------------------------------------------------------
# Per-layer caches
# ---------------------------------------------------------------------------

_DEPT_CACHE: dict | None = None
_REGION_CACHE: dict | None = None
_COUNTRY_CACHE: dict | None = None
_COMMUNE_CACHE: dict | None = None


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _norm(name: str) -> str:
    """Lowercase, accent-strip, collapse hyphens/spaces/apostrophes."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_ = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    return re.sub(r"[-\s']+", " ", ascii_).strip().lower()


def _cc_headers() -> dict:
    return {"Cache-Control": "public, max-age=86400, stale-while-revalidate=3600"}


def _events_popup_props(
    name: str,
    birth_count: int,
    death_count: int,
    marriage_count: int,
) -> dict:
    return {
        "display_name": name,
        "birth_count": birth_count,
        "death_count": death_count,
        "marriage_count": marriage_count,
        "total_events": birth_count + death_count + marriage_count,
    }


# ---------------------------------------------------------------------------
# Country layer
# ---------------------------------------------------------------------------

# Natural Earth uses ISO_A2_EH as the reliable 2-letter code field.
_NE_ISO_FIELD = "ISO_A2_EH"


def _build_country_cache(cur) -> dict:
    with open(_COUNTRY_FILE, encoding="utf-8") as f:
        geojson = json.load(f)

    rows: list[dict] = _db.queries.get_counts_by_country(cur)
    counts: dict[str, dict] = {r["country_iso"]: r for r in rows if r["country_iso"]}

    features: list[dict] = []
    for feat in geojson["features"]:
        iso = feat["properties"].get(_NE_ISO_FIELD) or feat["properties"].get("ISO_A2", "")
        if iso not in counts:
            continue
        c = counts[iso]
        feat["properties"] = _events_popup_props(
            feat["properties"].get("NAME_EN") or feat["properties"].get("NAME", iso),
            c["birth_count"],
            c["death_count"],
            c["marriage_count"],
        )
        feat["properties"]["iso_a2"] = iso
        features.append(feat)

    return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# Region layer (new 2016 French regions)
# ---------------------------------------------------------------------------

# Maps normalized old region name -> normalized new region name.
# New region names resolve to themselves after _norm(); only old ones need entries.
_OLD_TO_NEW: dict[str, str] = {
    "lorraine": "grand est",
    "alsace": "grand est",
    "champagne ardenne": "grand est",
    "franche comte": "bourgogne franche comte",
    "bourgogne": "bourgogne franche comte",
    "picardie": "hauts de france",
    "nord pas de calais": "hauts de france",
    "midi pyrenees": "occitanie",
    "languedoc roussillon": "occitanie",
    "rhone alpes": "auvergne rhone alpes",
    "auvergne": "auvergne rhone alpes",
    "haute normandie": "normandie",
    "basse normandie": "normandie",
    "poitou charentes": "nouvelle aquitaine",
    "limousin": "nouvelle aquitaine",
    "aquitaine": "nouvelle aquitaine",
    "paca": "provence alpes cote d azur",
    "centre": "centre val de loire",
}


def _build_region_cache(cur) -> dict:
    with open(_REGION_FILE, encoding="utf-8") as f:
        geojson = json.load(f)

    # Build lookup: norm(nom) -> feature
    feat_by_norm: dict[str, Any] = {}
    for feat in geojson["features"]:
        nom = feat["properties"]["nom"]
        feat["properties"]["birth_count"] = 0
        feat["properties"]["death_count"] = 0
        feat["properties"]["marriage_count"] = 0
        feat_by_norm[_norm(nom)] = feat

    rows = _db.queries.get_counts_by_region(cur)
    for row in rows:
        state = row.get("state") or ""
        n = _norm(state)
        # Try direct match first, then old→new mapping
        target_norm = feat_by_norm[n]["properties"]["nom"] if n in feat_by_norm else None
        if target_norm is None:
            mapped = _OLD_TO_NEW.get(n)
            if mapped and mapped in feat_by_norm:
                target_norm = feat_by_norm[mapped]["properties"]["nom"]
        if target_norm is None:
            continue
        p = feat_by_norm[_norm(target_norm)]["properties"]
        p["birth_count"] += row["birth_count"]
        p["death_count"] += row["death_count"]
        p["marriage_count"] += row["marriage_count"]

    # Finalize: replace properties with display-ready dict
    for feat in geojson["features"]:
        p = feat["properties"]
        feat["properties"] = _events_popup_props(
            p["nom"],
            p["birth_count"],
            p["death_count"],
            p["marriage_count"],
        )

    return geojson


# ---------------------------------------------------------------------------
# Department layer
# ---------------------------------------------------------------------------


def _reverse_geocode_dept(lat: float, lon: float) -> str | None:
    """Return dept code for a lat/lon (no contour, fast)."""
    url = (
        f"https://geo.api.gouv.fr/communes"
        f"?lat={round(lat, 6)}&lon={round(lon, 6)}&fields=codeDepartement"
    )
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read())
            return data[0].get("codeDepartement") if data else None
    except Exception:
        return None


def _build_dept_cache(cur) -> dict:
    with open(_DEPT_FILE, encoding="utf-8") as f:
        geojson = json.load(f)

    norm_to_code: dict[str, str] = {}
    code_to_feat: dict[str, Any] = {}
    for feat in geojson["features"]:
        code = feat["properties"]["code"]
        nom = feat["properties"]["nom"]
        norm_to_code[_norm(nom)] = code
        code_to_feat[code] = feat
        feat["properties"]["birth_count"] = 0
        feat["properties"]["death_count"] = 0
        feat["properties"]["marriage_count"] = 0

    # County-name rows
    for row in _db.queries.get_counts_by_department(cur):
        code = norm_to_code.get(_norm(row.get("county") or ""))
        if code and code in code_to_feat:
            p = code_to_feat[code]["properties"]
            p["birth_count"] += row["birth_count"]
            p["death_count"] += row["death_count"]
            p["marriage_count"] += row["marriage_count"]

    # Reverse-geocode French places that have no county
    cur.execute("""
        WITH bc AS (SELECT birth_place_id AS pid, COUNT(*) AS n FROM individuals
                    WHERE birth_place_id IS NOT NULL GROUP BY 1),
             dc AS (SELECT death_place_id AS pid, COUNT(*) AS n FROM individuals
                    WHERE death_place_id IS NOT NULL GROUP BY 1),
             mc AS (SELECT marriage_place_id AS pid, COUNT(*) AS n FROM families
                    WHERE marriage_place_id IS NOT NULL GROUP BY 1)
        SELECT p.lat, p.lon,
               COALESCE(bc.n,0) AS birth_count,
               COALESCE(dc.n,0) AS death_count,
               COALESCE(mc.n,0) AS marriage_count
        FROM places p
        LEFT JOIN bc ON bc.pid = p.id
        LEFT JOIN dc ON dc.pid = p.id
        LEFT JOIN mc ON mc.pid = p.id
        WHERE p.lat IS NOT NULL AND p.county IS NULL AND p.country_iso = 'FR'
          AND (COALESCE(bc.n,0)+COALESCE(dc.n,0)+COALESCE(mc.n,0)) > 0
    """)
    no_county = [dict(r) for r in cur.fetchall()]

    extras: dict[str, dict] = {}
    if no_county:
        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = {pool.submit(_reverse_geocode_dept, p["lat"], p["lon"]): p for p in no_county}
            for future in as_completed(futures):
                place = futures[future]
                code = future.result()
                if code:
                    acc = extras.setdefault(
                        code, {"birth_count": 0, "death_count": 0, "marriage_count": 0}
                    )
                    acc["birth_count"] += place["birth_count"]
                    acc["death_count"] += place["death_count"]
                    acc["marriage_count"] += place["marriage_count"]

    for code, counts in extras.items():
        if code in code_to_feat:
            p = code_to_feat[code]["properties"]
            p["birth_count"] += counts["birth_count"]
            p["death_count"] += counts["death_count"]
            p["marriage_count"] += counts["marriage_count"]

    # Finalize
    for feat in geojson["features"]:
        p = feat["properties"]
        feat["properties"] = _events_popup_props(
            p["nom"],
            p["birth_count"],
            p["death_count"],
            p["marriage_count"],
        )

    return geojson


# ---------------------------------------------------------------------------
# Commune layer
# ---------------------------------------------------------------------------


def _fetch_commune_polygon(lat: float, lon: float) -> dict | None:
    """
    Return a dict with keys: code, nom, geometry (GeoJSON polygon), or None.

    geo.api.gouv.fr returns `contour` as a nested GeoJSON object in plain-JSON
    mode; the `format=geojson` mode uses the centroid as geometry instead.
    """
    url = _COMMUNE_RG_URL.format(lat=round(lat, 6), lon=round(lon, 6))
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            items = json.loads(r.read())
        if not items:
            return None
        item = items[0]
        contour = item.get("contour")
        if not contour:
            return None
        return {
            "code": item.get("code"),
            "nom": item.get("nom", ""),
            "geometry": contour,
        }
    except Exception:
        return None


def _fetch_commune_polygon_by_code(code: str) -> dict | None:
    """
    Return {code, nom, geometry} for a commune INSEE code, or None.

    Used because our French places carry commune_insee but no lat/lon (they
    render via this choropleth, not point markers).
    """
    url = _COMMUNE_CODE_URL.format(code=code)
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            item = json.loads(r.read())
        if not item:
            return None
        contour = item.get("contour")
        if not contour:
            return None
        return {
            "code": item.get("code", code),
            "nom": item.get("nom", ""),
            "geometry": contour,
        }
    except Exception:
        return None


def _build_commune_cache(cur) -> dict:
    # One row per commune INSEE code (hamlets rolled up into their commune).
    # French places carry commune_insee but no lat/lon, so polygons are fetched
    # by code rather than reverse-geocoded.
    communes = _db.queries.get_fr_commune_counts(cur)

    code_to_events: dict[str, dict] = {
        c["insee"]: {
            "nom": c.get("commune_nom") or "",
            "place_id": c.get("place_id"),
            "birth_count": c["birth_count"],
            "death_count": c["death_count"],
            "marriage_count": c["marriage_count"],
        }
        for c in communes
        if c.get("insee")
    }
    code_to_polygon: dict[str, dict] = {}

    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = {
            pool.submit(_fetch_commune_polygon_by_code, code): code for code in code_to_events
        }
        for future in as_completed(futures):
            code = futures[future]
            result = future.result()
            if not result or not result.get("geometry"):
                continue
            code_to_polygon[code] = result["geometry"]
            # Prefer the official commune name from the API if we lacked one.
            if not code_to_events[code]["nom"] and result.get("nom"):
                code_to_events[code]["nom"] = result["nom"]

    features: list[dict] = []
    for code, evts in code_to_events.items():
        geometry = code_to_polygon.get(code)
        if not geometry:
            continue
        props = _events_popup_props(
            evts["nom"],
            evts["birth_count"],
            evts["death_count"],
            evts["marriage_count"],
        )
        props["insee"] = code
        if evts.get("place_id") is not None:
            props["place_id"] = evts["place_id"]
        feat = {
            "type": "Feature",
            "geometry": geometry,
            "properties": props,
        }
        features.append(feat)

    return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/countries")
def get_countries(cur=Depends(get_cursor)):
    """World countries coloured by event count."""
    global _COUNTRY_CACHE
    if _COUNTRY_CACHE is None:
        _COUNTRY_CACHE = _build_country_cache(cur)
    return JSONResponse(content=_COUNTRY_CACHE, headers=_cc_headers())


@router.get("/regions")
def get_regions(cur=Depends(get_cursor)):
    """French regions (2016 boundaries) coloured by event count."""
    global _REGION_CACHE
    if _REGION_CACHE is None:
        _REGION_CACHE = _build_region_cache(cur)
    return JSONResponse(content=_REGION_CACHE, headers=_cc_headers())


@router.get("/departments")
def get_departments(cur=Depends(get_cursor)):
    """
    French department GeoJSON enriched with genealogy event counts.

    Built once on first request (reverse-geocoding the ~80 French places that
    lack a county field), then served from memory.
    """
    global _DEPT_CACHE
    if _DEPT_CACHE is None:
        _DEPT_CACHE = _build_dept_cache(cur)
    return JSONResponse(content=_DEPT_CACHE, headers=_cc_headers())


@router.get("/communes")
def get_communes(cur=Depends(get_cursor)):
    """
    French commune polygons for all geocoded places in our DB with events.

    Fetches commune boundaries from geo.api.gouv.fr on first request (one call
    per place, ~20 concurrent), then caches forever.
    """
    global _COMMUNE_CACHE
    if _COMMUNE_CACHE is None:
        _COMMUNE_CACHE = _build_commune_cache(cur)
    return JSONResponse(content=_COMMUNE_CACHE, headers=_cc_headers())


def invalidate_cache() -> None:
    """Call this after a DB update that would change event counts."""
    global _DEPT_CACHE, _REGION_CACHE, _COUNTRY_CACHE, _COMMUNE_CACHE
    _DEPT_CACHE = _REGION_CACHE = _COUNTRY_CACHE = _COMMUNE_CACHE = None
