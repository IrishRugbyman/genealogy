"""
Genealogy query layer.

All functions are pure: they accept a psycopg2 cursor (RealDictCursor recommended)
and parameters, and return plain Python dicts / lists. No connection management,
no printing - callers own the connection lifecycle.

This makes every function usable from both the CLI (query_cli.py) and the FastAPI
thread-pool (api/app/db.py get_cursor dependency).

ID note: individuals.id and families.id are TEXT (GEDCOM @Ixxx@ / @Fxxx@ with @
stripped), e.g. 'I5', 'F13'. Always bind as %s (psycopg2 sends TEXT).
"""

from __future__ import annotations

from collections.abc import Collection, Iterable
from typing import Any

# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


def search_individuals(
    cur,
    *,
    name: str | None = None,
    place: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    sex: str | None = None,
    branch: int | None = None,
    profession_category: str | None = None,
    profession_id: int | None = None,
    distinction_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    sort: str = "name",
    # kept for backwards compat with any callers, merged into name scoring
    surname: str | None = None,
    exclude_ids: Collection[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Ranked search over individuals using token matching + trigram fuzzy scoring.

    name      - free-text query: tokens matched against surname/given_name independently
                (order-insensitive) plus trigram similarity for typo tolerance.
    place     - substring match on birth OR death place locality
    year_from/year_to - inclusive birth OR death year range
    sex       - 'M', 'F', or 'U'
    branch    - 1=father's side of the Sosa root, 2=mother's side, 3=both
    exclude_ids - individuals left out of the results entirely (the API passes the
                living for a visitor who is not signed in, see `living_individual_ids`)

    Requires pg_trgm extension and GIN indexes on name_normalized, surname, given_name.
    """
    # Hard filter conditions (applied in WHERE regardless of name query)
    hard_conds: list[str] = []
    hard_params: list[Any] = []

    if sex:
        hard_conds.append("i.sex = %s")
        hard_params.append(sex.upper())

    if branch is not None:
        if branch == 3:
            hard_conds.append("i.branch = 3")
        else:
            hard_conds.append("(i.branch = %s OR i.branch = 3)")
            hard_params.append(branch)

    if year_from is not None:
        hard_conds.append("(i.birth_year >= %s OR i.death_year >= %s)")
        hard_params.extend([year_from, year_from])

    if year_to is not None:
        hard_conds.append("(i.birth_year <= %s OR i.death_year <= %s)")
        hard_params.extend([year_to, year_to])

    if profession_category:
        hard_conds.append(
            "EXISTS (SELECT 1 FROM individual_professions ip_f"
            " JOIN professions p_f ON p_f.id = ip_f.profession_id"
            " WHERE ip_f.individual_id = i.id AND p_f.category = %s)"
        )
        hard_params.append(profession_category)

    if profession_id is not None:
        hard_conds.append(
            "EXISTS (SELECT 1 FROM individual_professions ip_f"
            " WHERE ip_f.individual_id = i.id AND ip_f.profession_id = %s)"
        )
        hard_params.append(profession_id)

    if distinction_id is not None:
        hard_conds.append(
            "EXISTS (SELECT 1 FROM individual_distinctions id_f"
            " WHERE id_f.individual_id = i.id AND id_f.distinction_id = %s)"
        )
        hard_params.append(distinction_id)

    if exclude_ids:
        hard_conds.append("NOT (i.id = ANY(%s))")
        hard_params.append(list(exclude_ids))

    place_join = ""
    if place:
        place_join = "LEFT JOIN places dp ON dp.id = i.death_place_id"
        hard_conds.append(
            "(unaccent_lower(bp.name) LIKE '%%' || unaccent_lower(%s) || '%%'"
            " OR unaccent_lower(dp.name) LIKE '%%' || unaccent_lower(%s) || '%%')"
        )
        hard_params.extend([place, place])

    hard_where = ("AND " + " AND ".join(hard_conds)) if hard_conds else ""

    # Effective name query: merge legacy surname param into name
    q = (name or "").strip() or (surname or "").strip()

    if q:
        # Normalise and split into tokens (collapse whitespace, strip empties)
        sql = f"""
            WITH q AS (
                SELECT
                    unaccent_lower(%s)                                          AS full_q,
                    array_remove(
                        string_to_array(
                            regexp_replace(unaccent_lower(%s), '\\s+', ' ', 'g'),
                            ' '
                        ),
                        ''
                    )                                                           AS tokens
            )
            SELECT
                i.id,
                i.name,
                i.given_name,
                i.surname,
                i.nickname,
                i.sex,
                i.birth_year,
                i.birth_month,
                i.birth_day,
                i.death_year,
                i.death_month,
                i.death_day,
                bp.id          AS birth_place_id,
                bp.name        AS birth_place,
                bp.country_iso AS birth_country_iso,
                i.branch,
                i.is_direct_line,
                (
                    -- Exact full-name match
                    CASE WHEN i.name_normalized = q.full_q THEN 200 ELSE 0 END
                    -- Per-token scoring against surname. surname_key() folds the
                    -- endings that are one sound (-ay/-ey/-ez), so searching
                    -- "Morey" also ranks MOREZ as exact: one family, two
                    -- spellings. Scored just under a literal hit so
                    -- the spelling actually typed still sorts first.
                    + (
                        SELECT COALESCE(SUM(
                            CASE WHEN unaccent_lower(i.surname) = t             THEN 60
                                 WHEN surname_key(i.surname) = surname_key(t)   THEN 55
                                 WHEN unaccent_lower(i.surname) LIKE t || '%%'  THEN 40
                                 WHEN unaccent_lower(i.surname) LIKE '%%' || t || '%%' THEN 20
                                 ELSE 0 END
                        ), 0)
                        FROM unnest(q.tokens) AS t
                      )
                    -- Per-token scoring against given_name
                    + (
                        SELECT COALESCE(SUM(
                            CASE WHEN unaccent_lower(i.given_name) = t              THEN 30
                                 WHEN unaccent_lower(i.given_name) LIKE t || '%%'   THEN 20
                                 WHEN unaccent_lower(i.given_name) LIKE '%%' || t || '%%' THEN 8
                                 ELSE 0 END
                        ), 0)
                        FROM unnest(q.tokens) AS t
                      )
                    -- Trigram similarity bonus (handles typos / alternate spellings)
                    + GREATEST(0, (similarity(i.name_normalized, q.full_q) - 0.1) * 80)::int
                ) AS _score
            FROM individuals i
            CROSS JOIN q
            LEFT JOIN places bp ON bp.id = i.birth_place_id
            {place_join}
            WHERE (
                -- At least one token appears in surname or given_name (uses trgm index)
                EXISTS (
                    SELECT 1 FROM unnest(q.tokens) AS t
                    WHERE unaccent_lower(i.surname)    %% t
                       OR unaccent_lower(i.given_name) %% t
                       OR unaccent_lower(i.surname)    LIKE '%%' || t || '%%'
                       OR unaccent_lower(i.given_name) LIKE '%%' || t || '%%'
                       -- Same surname, different written ending (-ay/-ey/-ez are
                       -- one sound). Trigram usually catches these, but it is a
                       -- threshold and this is a certainty. Must stay identical
                       -- in the count query below or totals disagree with rows.
                       OR surname_key(i.surname) = surname_key(t)
                )
                -- OR full-query trigram similarity (catches typos across the whole name)
                OR similarity(i.name_normalized, q.full_q) > 0.15
            )
            {hard_where}
            ORDER BY _score DESC, i.surname NULLS LAST, i.given_name NULLS LAST
            LIMIT %s OFFSET %s
        """
        params = [q, q] + hard_params + [limit, offset]
    else:
        # No name query - return all matching hard filters
        hard_where_kw = ("WHERE " + " AND ".join(hard_conds)) if hard_conds else ""
        order_by = {
            "birth_year": "i.birth_year  NULLS LAST, i.surname NULLS LAST, i.given_name NULLS LAST",
            "death_year": "i.death_year  NULLS LAST, i.surname NULLS LAST, i.given_name NULLS LAST",
            "-birth_year": "i.birth_year  DESC NULLS LAST, i.surname NULLS LAST, i.given_name NULLS LAST",
            "-death_year": "i.death_year  DESC NULLS LAST, i.surname NULLS LAST, i.given_name NULLS LAST",
        }.get(sort, "i.surname NULLS LAST, i.given_name NULLS LAST, i.id")
        sql = f"""
            SELECT
                i.id,
                i.name,
                i.given_name,
                i.surname,
                i.nickname,
                i.sex,
                i.birth_year,
                i.birth_month,
                i.birth_day,
                i.death_year,
                i.death_month,
                i.death_day,
                bp.id          AS birth_place_id,
                bp.name        AS birth_place,
                bp.country_iso AS birth_country_iso,
                i.branch,
                i.is_direct_line
            FROM individuals i
            LEFT JOIN places bp ON bp.id = i.birth_place_id
            {place_join}
            {hard_where_kw}
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
        """
        params = hard_params + [limit, offset]

    cur.execute(sql, params)
    return [dict(r) for r in cur.fetchall()]


def count_individuals(
    cur,
    *,
    name: str | None = None,
    place: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    sex: str | None = None,
    branch: int | None = None,
    profession_category: str | None = None,
    profession_id: int | None = None,
    distinction_id: int | None = None,
    surname: str | None = None,
    exclude_ids: Collection[str] | None = None,
) -> int:
    """Count individuals matching the same filters as search_individuals (no pagination)."""
    hard_conds: list[str] = []
    hard_params: list[Any] = []

    if sex:
        hard_conds.append("i.sex = %s")
        hard_params.append(sex.upper())

    if branch is not None:
        if branch == 3:
            hard_conds.append("i.branch = 3")
        else:
            hard_conds.append("(i.branch = %s OR i.branch = 3)")
            hard_params.append(branch)

    if year_from is not None:
        hard_conds.append("(i.birth_year >= %s OR i.death_year >= %s)")
        hard_params.extend([year_from, year_from])

    if year_to is not None:
        hard_conds.append("(i.birth_year <= %s OR i.death_year <= %s)")
        hard_params.extend([year_to, year_to])

    if profession_category:
        hard_conds.append(
            "EXISTS (SELECT 1 FROM individual_professions ip_f"
            " JOIN professions p_f ON p_f.id = ip_f.profession_id"
            " WHERE ip_f.individual_id = i.id AND p_f.category = %s)"
        )
        hard_params.append(profession_category)

    if profession_id is not None:
        hard_conds.append(
            "EXISTS (SELECT 1 FROM individual_professions ip_f"
            " WHERE ip_f.individual_id = i.id AND ip_f.profession_id = %s)"
        )
        hard_params.append(profession_id)

    if distinction_id is not None:
        hard_conds.append(
            "EXISTS (SELECT 1 FROM individual_distinctions id_f"
            " WHERE id_f.individual_id = i.id AND id_f.distinction_id = %s)"
        )
        hard_params.append(distinction_id)

    if exclude_ids:
        hard_conds.append("NOT (i.id = ANY(%s))")
        hard_params.append(list(exclude_ids))

    place_join = ""
    if place:
        place_join = "LEFT JOIN places dp ON dp.id = i.death_place_id"
        hard_conds.append(
            "(unaccent_lower(bp.name) LIKE '%%' || unaccent_lower(%s) || '%%'"
            " OR unaccent_lower(dp.name) LIKE '%%' || unaccent_lower(%s) || '%%')"
        )
        hard_params.extend([place, place])

    q = (name or "").strip() or (surname or "").strip()

    if q:
        hard_where = ("AND " + " AND ".join(hard_conds)) if hard_conds else ""
        sql = f"""
            WITH q AS (
                SELECT
                    unaccent_lower(%s) AS full_q,
                    array_remove(
                        string_to_array(regexp_replace(unaccent_lower(%s), '\\s+', ' ', 'g'), ' '),
                        ''
                    ) AS tokens
            )
            SELECT count(*) AS n
            FROM individuals i
            LEFT JOIN places bp ON bp.id = i.birth_place_id
            {place_join}
            CROSS JOIN q
            WHERE (
                EXISTS (
                    SELECT 1 FROM unnest(q.tokens) AS t
                    WHERE unaccent_lower(i.surname)    %% t
                       OR unaccent_lower(i.given_name) %% t
                       OR unaccent_lower(i.surname)    LIKE '%%' || t || '%%'
                       OR unaccent_lower(i.given_name) LIKE '%%' || t || '%%'
                       -- Same surname, different written ending (-ay/-ey/-ez are
                       -- one sound). Must stay identical to the filter in
                       -- search_individuals() or this total disagrees with the
                       -- rows that page shows.
                       OR surname_key(i.surname) = surname_key(t)
                )
                OR similarity(i.name_normalized, q.full_q) > 0.15
            )
            {hard_where}
        """
        params: list[Any] = [q, q] + hard_params
    else:
        hard_where_kw = ("WHERE " + " AND ".join(hard_conds)) if hard_conds else ""
        sql = f"""
            SELECT count(*) AS n
            FROM individuals i
            LEFT JOIN places bp ON bp.id = i.birth_place_id
            {place_join}
            {hard_where_kw}
        """
        params = hard_params

    cur.execute(sql, params)
    return cur.fetchone()["n"]


# ---------------------------------------------------------------------------
# Individual detail
# ---------------------------------------------------------------------------


def get_individual(cur, ind_id: str) -> dict[str, Any] | None:
    """
    Full record for one individual, or None if not found.

    Includes:
    - all vital event fields (birth/death/baptism/burial)
    - resolved birth/death place objects (locality, country, lat, lon)
    - parents (from parent_child view, joined to individuals for names)
    - spouses (from families, with marriage info)
    - children (from family_children, joined to individuals for names)
    - events, notes, titles
    """
    cur.execute(
        """
        SELECT
            i.*,
            bp.raw    AS birth_place_raw,
            dp.raw    AS death_place_raw,
            bapt.raw  AS baptism_place_raw,
            bur.raw   AS burial_place_raw,
            bp.name   AS birth_locality,
            bp.county     AS birth_county,
            bp.state      AS birth_state,
            bp.country    AS birth_country,
            bp.country_iso AS birth_country_iso,
            bp.lat        AS birth_lat,
            bp.lon        AS birth_lon,
            dp.name   AS death_locality,
            dp.county     AS death_county,
            dp.state      AS death_state,
            dp.country    AS death_country,
            dp.country_iso AS death_country_iso,
            dp.lat        AS death_lat,
            dp.lon        AS death_lon,
            bapt.name   AS baptism_locality,
            bapt.county     AS baptism_county,
            bapt.state      AS baptism_state,
            bapt.country    AS baptism_country,
            bapt.country_iso AS baptism_country_iso,
            bapt.lat        AS baptism_lat,
            bapt.lon        AS baptism_lon,
            bur.name    AS burial_locality,
            bur.county      AS burial_county,
            bur.state       AS burial_state,
            bur.country     AS burial_country,
            bur.country_iso AS burial_country_iso,
            bur.lat         AS burial_lat,
            bur.lon         AS burial_lon
        FROM individuals i
        LEFT JOIN places bp   ON bp.id   = i.birth_place_id
        LEFT JOIN places dp   ON dp.id   = i.death_place_id
        LEFT JOIN places bapt ON bapt.id = i.baptism_place_id
        LEFT JOIN places bur  ON bur.id  = i.burial_place_id
        WHERE i.id = %s
    """,
        [ind_id],
    )
    row = cur.fetchone()
    if row is None:
        return None

    person = dict(row)

    # Lift place fields into nested objects for clarity
    person["birth_place"] = _place_obj(person, "birth")
    person["death_place"] = _place_obj(person, "death")
    person["baptism_place"] = _place_obj(person, "baptism")
    person["burial_place"] = _place_obj(person, "burial")

    # Parents
    cur.execute(
        """
        SELECT
            pc.father_id, f.name AS father_name,
            f.birth_year AS father_birth_year, f.death_year AS father_death_year,
            pc.mother_id, m.name AS mother_name,
            m.birth_year AS mother_birth_year, m.death_year AS mother_death_year,
            pc.family_id
        FROM parent_child pc
        LEFT JOIN individuals f ON f.id = pc.father_id
        LEFT JOIN individuals m ON m.id = pc.mother_id
        WHERE pc.child_id = %s
        LIMIT 1
    """,
        [ind_id],
    )
    parent_row = cur.fetchone()
    person["parents"] = (
        dict(parent_row)
        if parent_row
        else {
            "father_id": None,
            "father_name": None,
            "father_birth_year": None,
            "father_death_year": None,
            "mother_id": None,
            "mother_name": None,
            "mother_birth_year": None,
            "mother_death_year": None,
            "family_id": None,
        }
    )

    # Spouses: families where this person is husband or wife
    cur.execute(
        """
        SELECT
            f.id              AS family_id,
            f.husband_id,
            ih.name           AS husband_name,
            ih.sex            AS husband_sex,
            ih.birth_year     AS husband_birth_year,
            ih.death_year     AS husband_death_year,
            f.wife_id,
            iw.name           AS wife_name,
            iw.sex            AS wife_sex,
            iw.birth_year     AS wife_birth_year,
            iw.death_year     AS wife_death_year,
            f.divorced,
            f.divorce_note,
            f.marriage_raw,
            f.marriage_qualifier,
            f.marriage_year,
            f.marriage_month,
            f.marriage_day,
            mp.raw AS marriage_place_raw,
            f.marriage_place_id,
            f.marriage_note,
            f.marriage_contract_qualifier,
            f.marriage_contract_year,
            f.marriage_contract_month,
            f.marriage_contract_day,
            f.marriage_contract_place_raw,
            cp.name           AS marriage_contract_locality,
            mp.name       AS marriage_locality,
            mp.country_iso    AS marriage_country_iso,
            COALESCE(
                (SELECT array_agg(s.citation ORDER BY s.id)
                 FROM sources s WHERE s.family_id = f.id),
                '{}'
            ) AS marriage_sources
        FROM families f
        LEFT JOIN individuals ih ON ih.id = f.husband_id
        LEFT JOIN individuals iw ON iw.id = f.wife_id
        LEFT JOIN places mp ON mp.id = f.marriage_place_id
        LEFT JOIN places cp ON cp.id = f.marriage_contract_place_id
        WHERE f.husband_id = %s OR f.wife_id = %s
        ORDER BY f.marriage_year NULLS LAST
    """,
        [ind_id, ind_id],
    )
    spouses = []
    for fam in cur.fetchall():
        fam = dict(fam)
        if fam["husband_id"] == ind_id:
            fam["spouse_id"] = fam["wife_id"]
            fam["spouse_name"] = fam["wife_name"]
            fam["spouse_sex"] = fam["wife_sex"]
            fam["spouse_birth_year"] = fam["wife_birth_year"]
            fam["spouse_death_year"] = fam["wife_death_year"]
        else:
            fam["spouse_id"] = fam["husband_id"]
            fam["spouse_name"] = fam["husband_name"]
            fam["spouse_sex"] = fam["husband_sex"]
            fam["spouse_birth_year"] = fam["husband_birth_year"]
            fam["spouse_death_year"] = fam["husband_death_year"]
        spouses.append(fam)
    person["spouses"] = spouses

    # Children: from all families this person belongs to
    cur.execute(
        """
        SELECT
            fc.child_id,
            ic.name         AS name,
            ic.given_name   AS given_name,
            ic.surname      AS surname,
            ic.sex          AS sex,
            ic.birth_year   AS child_birth_year,
            ic.death_year   AS child_death_year,
            bp.name     AS child_birth_locality,
            bp.county       AS child_birth_county,
            bp.country      AS child_birth_country,
            f.id            AS family_id,
            CASE WHEN f.husband_id = %s THEN f.wife_id ELSE f.husband_id END AS other_parent_id
        FROM families f
        JOIN family_children fc ON fc.family_id = f.id
        JOIN individuals ic ON ic.id = fc.child_id
        LEFT JOIN places bp ON bp.id = ic.birth_place_id
        WHERE f.husband_id = %s OR f.wife_id = %s
        ORDER BY ic.birth_year NULLS LAST, ic.given_name
    """,
        [ind_id, ind_id, ind_id],
    )
    person["children"] = [dict(r) for r in cur.fetchall()]

    # Non-vital custom events (BIRT/BAPM/DEAT/BURI come from flat individual columns)
    cur.execute(
        """
        SELECT e.type, e.date_raw, e.date_qualifier, e.date_year, e.date_month, e.date_day,
               e.date_year2, e.date_month2, e.date_day2, e.place_raw, e.note,
               e.place_id, ep.name AS place_locality
        FROM events e
        LEFT JOIN places ep ON ep.id = e.place_id
        WHERE e.individual_id = %s
        ORDER BY e.date_year NULLS LAST, e.type
    """,
        [ind_id],
    )
    person["events"] = [dict(r) for r in cur.fetchall()]

    # Notes
    cur.execute(
        """
        SELECT body FROM notes WHERE individual_id = %s ORDER BY id
    """,
        [ind_id],
    )
    person["notes"] = [r["body"] for r in cur.fetchall()]

    # Source citations (scope birth/death/baptism/burial/record)
    cur.execute(
        """
        SELECT scope, citation FROM sources WHERE individual_id = %s ORDER BY id
    """,
        [ind_id],
    )
    person["sources"] = [dict(r) for r in cur.fetchall()]

    # Titles (each may carry a NOTE sub-record)
    cur.execute(
        """
        SELECT title, note FROM titles WHERE individual_id = %s ORDER BY id
    """,
        [ind_id],
    )
    person["titles"] = [dict(r) for r in cur.fetchall()]

    # Professions (occupations only)
    cur.execute(
        """
        SELECT p.id, p.name, p.category, p.description, ip.note
        FROM individual_professions ip
        JOIN professions p ON p.id = ip.profession_id
        WHERE ip.individual_id = %s
        ORDER BY p.name
    """,
        [ind_id],
    )
    person["professions"] = [dict(r) for r in cur.fetchall()]

    # Distinctions (historical participatory distinctions)
    cur.execute(
        """
        SELECT d.id, d.name, d.category
        FROM individual_distinctions id_
        JOIN distinctions d ON d.id = id_.distinction_id
        WHERE id_.individual_id = %s
        ORDER BY d.category NULLS LAST, d.name
    """,
        [ind_id],
    )
    person["distinctions"] = [dict(r) for r in cur.fetchall()]

    # Military ranks (ordered by grade ascending so career reads chronologically)
    cur.execute(
        """
        SELECT mr.id, mr.name, mr.branch, mr.grade, mr.era,
               imr.year_start, imr.year_end, imr.regiment, imr.note
        FROM individual_military_ranks imr
        JOIN military_ranks mr ON mr.id = imr.rank_id
        WHERE imr.individual_id = %s
        ORDER BY mr.grade NULLS LAST, mr.name
    """,
        [ind_id],
    )
    person["military_ranks"] = [dict(r) for r in cur.fetchall()]

    return person


def _place_obj(person: dict, prefix: str) -> dict | None:
    """Extract a nested place dict from the flat joined individual row."""
    locality = person.pop(f"{prefix}_locality", None)
    county = person.pop(f"{prefix}_county", None)
    state = person.pop(f"{prefix}_state", None)
    country = person.pop(f"{prefix}_country", None)
    country_iso = person.pop(f"{prefix}_country_iso", None)
    lat = person.pop(f"{prefix}_lat", None)
    lon = person.pop(f"{prefix}_lon", None)
    place_id_key = f"{prefix}_place_id"
    if locality is None and person.get(place_id_key) is None:
        return None
    return {
        "id": person.get(place_id_key),
        "locality": locality,
        "county": county,
        "state": state,
        "country": country,
        "country_iso": country_iso,
        "lat": float(lat) if lat is not None else None,
        "lon": float(lon) if lon is not None else None,
    }


# ---------------------------------------------------------------------------
# Ancestry / descendants
# ---------------------------------------------------------------------------


def build_sosa_map(cur, root: str | None) -> dict[str, int]:
    """
    BFS from `root` assigning Sosa-Stradonitz numbers to all ancestors.
    Root = 1, father = 2n, mother = 2n+1.
    Uses a single flat parent_child query - no recursive SQL.
    Call once at startup and cache the result. No root configured means no
    numbering at all: an empty map, not an error.
    """
    if not root:
        return {}
    cur.execute("SELECT child_id, father_id, mother_id FROM parent_child")
    parents_of: dict[str, tuple[str | None, str | None]] = {
        r["child_id"]: (r["father_id"], r["mother_id"]) for r in cur.fetchall()
    }
    sosa_map: dict[str, int] = {}
    queue = [(root, 1)]
    while queue:
        person_id, num = queue.pop(0)
        if person_id in sosa_map:
            continue  # endogamy: keep first (lowest-numbered) assignment
        sosa_map[person_id] = num
        father, mother = parents_of.get(person_id, (None, None))
        if father:
            queue.append((father, num * 2))
        if mother:
            queue.append((mother, num * 2 + 1))
    return sosa_map


# A generation, in years: what separates a parent's birth from a child's. Also the
# age at which a marriage is assumed to happen, for someone with no birth date.
GENERATION_YEARS = 28
MARRIAGE_AGE = 25


def _offer_birth(
    offers: dict[str, int], born: dict[str, int], person_id: str | None, year: int | None
) -> None:
    """Record `year` as a candidate birth estimate for someone not dated yet.

    Several relatives may offer a year: the latest wins, which is the cautious
    choice when the question is "could this person still be alive".
    """
    if person_id and person_id not in born and year is not None:
        offers[person_id] = max(offers.get(person_id, year), year)


def infer_living(
    people: Iterable[dict[str, Any]],
    families: Iterable[dict[str, Any]],
    parent_child: Iterable[dict[str, Any]],
    born_after: int,
) -> set[str]:
    """Ids of the individuals who must be treated as possibly living.

    Someone is possibly living when nothing records their death (no death or
    burial, dated or not) and their birth, known or estimated, falls in or after
    `born_after`. A missing birth date is estimated from the nearest relatives:
    a spouse's birth, a marriage at `MARRIAGE_AGE`, a child born
    `GENERATION_YEARS` later or a parent born that much earlier. The estimate
    spreads a few steps through the tree, so the undated spouse of an undated
    child of a 1950s couple is still caught. Someone nothing can be estimated
    for is treated as dead: in this tree that is an old, isolated stub.

    Pure function, so it can be tested on hand-made rows. `people` rows carry
    `id`, `born` (birth or baptism year) and `dead` (bool); `families` rows
    `husband_id`, `wife_id`, `marriage_year`; `parent_child` rows `child_id`,
    `father_id`, `mother_id`.
    """
    people = list(people)
    families = list(families)
    parent_child = list(parent_child)
    born: dict[str, int] = {p["id"]: p["born"] for p in people if p["born"] is not None}

    for _ in range(4):  # a few steps is plenty: estimates of estimates get vague
        offers: dict[str, int] = {}
        for f in families:
            husband, wife, married = f["husband_id"], f["wife_id"], f["marriage_year"]
            if married is not None:
                _offer_birth(offers, born, husband, married - MARRIAGE_AGE)
                _offer_birth(offers, born, wife, married - MARRIAGE_AGE)
            _offer_birth(offers, born, husband, born.get(wife))
            _offer_birth(offers, born, wife, born.get(husband))
        for r in parent_child:
            child = born.get(r["child_id"])
            for parent in (r["father_id"], r["mother_id"]):
                if child is not None:
                    _offer_birth(offers, born, parent, child - GENERATION_YEARS)
                if parent in born:
                    _offer_birth(offers, born, r["child_id"], born[parent] + GENERATION_YEARS)
        if not offers:
            break
        born.update(offers)

    return {
        p["id"] for p in people if not p["dead"] and p["id"] in born and born[p["id"]] >= born_after
    }


def living_individual_ids(cur, born_after: int) -> set[str]:
    """Individuals who may be alive: no recorded death, born in or after `born_after`.

    The API calls this once at startup with the current year minus 100 and hides
    these people from visitors who are not signed in. See `infer_living` for how a
    missing birth date is estimated.
    """
    cur.execute(
        """
        SELECT id,
               coalesce(birth_year, baptism_year) AS born,
               (death_year IS NOT NULL OR death_raw IS NOT NULL
                OR burial_year IS NOT NULL OR burial_raw IS NOT NULL) AS dead
        FROM individuals
        """
    )
    people = cur.fetchall()
    cur.execute("SELECT husband_id, wife_id, marriage_year FROM families")
    families = cur.fetchall()
    cur.execute("SELECT child_id, father_id, mother_id FROM parent_child")
    parent_child = cur.fetchall()
    return infer_living(people, families, parent_child, born_after)


def get_ancestors(cur, ind_id: str, max_depth: int = 12) -> list[dict[str, Any]]:
    """
    Recursive CTE returning all ancestors up to max_depth generations.

    Uses the parent_child view (which joins family_children + families).
    UNION (not UNION ALL) deduplicates in endogamous trees.

    The sosa column is the positional Sosa-Stradonitz number relative to ind_id
    (ind_id itself = 1, father = 2, mother = 3, ...). This is free to compute
    by tracking it through the existing CTE.
    """
    cur.execute(
        """
        WITH RECURSIVE anc(id, depth, sosa) AS (
            SELECT %s::text, 0, 1::bigint
          UNION
            SELECT p.parent_id, anc.depth + 1,
                   CASE WHEN p.is_father THEN anc.sosa * 2 ELSE anc.sosa * 2 + 1 END
            FROM anc
            JOIN parent_child pc ON pc.child_id = anc.id
            CROSS JOIN LATERAL (VALUES (pc.father_id, true), (pc.mother_id, false)) p(parent_id, is_father)
            WHERE p.parent_id IS NOT NULL
              AND anc.depth < %s
        )
        SELECT
            a.depth,
            i.id,
            i.name,
            i.given_name,
            i.surname,
            i.sex,
            i.birth_year,
            i.birth_month,
            i.birth_day,
            i.death_year,
            i.death_month,
            i.death_day,
            bp.name    AS birth_place,
            bp.country_iso AS birth_country_iso,
            a.sosa
        FROM anc a
        JOIN individuals i ON i.id = a.id
        LEFT JOIN places bp ON bp.id = i.birth_place_id
        WHERE a.depth > 0
        ORDER BY a.depth, i.surname NULLS LAST, i.given_name NULLS LAST
    """,
        [ind_id, max_depth],
    )
    return [dict(r) for r in cur.fetchall()]


def get_tree_people(cur, ids: Collection[str]) -> list[dict[str, Any]]:
    """Lean records for the interactive tree: who, when, and the links to draw.

    One row per id found: name, sex, birth and death years, birth locality, the
    parents (one family, the lowest id, if someone is a child of several),
    every child across all unions, and the spouses in marriage order. Ids not
    in the database are simply absent from the result.
    """
    if not ids:
        return []
    cur.execute(
        """
        SELECT
            i.id, i.name, i.sex, i.birth_year, i.death_year,
            bp.name AS birth_locality,
            par.father_id, par.mother_id,
            coalesce(kids.child_ids, '{}') AS child_ids,
            coalesce(sp.spouses, '[]'::json) AS spouses
        FROM individuals i
        LEFT JOIN places bp ON bp.id = i.birth_place_id
        LEFT JOIN LATERAL (
            SELECT pc.father_id, pc.mother_id
            FROM parent_child pc
            WHERE pc.child_id = i.id
            ORDER BY pc.family_id
            LIMIT 1
        ) par ON true
        LEFT JOIN LATERAL (
            SELECT array_agg(fc.child_id ORDER BY c.birth_year NULLS LAST, fc.child_id)
                   AS child_ids
            FROM families f
            JOIN family_children fc ON fc.family_id = f.id
            JOIN individuals c ON c.id = fc.child_id
            WHERE i.id IN (f.husband_id, f.wife_id)
        ) kids ON true
        LEFT JOIN LATERAL (
            SELECT json_agg(
                       json_build_object('id', s.id, 'name', s.name)
                       ORDER BY f.marriage_year NULLS LAST, f.id
                   ) AS spouses
            FROM families f
            JOIN individuals s
              ON s.id = CASE WHEN f.husband_id = i.id THEN f.wife_id ELSE f.husband_id END
            WHERE i.id IN (f.husband_id, f.wife_id)
        ) sp ON true
        WHERE i.id = ANY(%s)
        """,
        [list(ids)],
    )
    return [dict(r) for r in cur.fetchall()]


def get_tree_neighbourhood(cur, ind_id: str, up: int, down: int) -> list[dict[str, Any]]:
    """`get_tree_people` for `ind_id` and everyone within `up` generations above
    and `down` below: what the tree needs to open in one request instead of one
    request per box. UNION (not UNION ALL) keeps the endogamous recursion finite.
    """
    cur.execute(
        """
        WITH RECURSIVE
        anc(id, depth) AS (
            SELECT %(id)s::text, 0
          UNION
            SELECT p.parent_id, anc.depth + 1
            FROM anc
            JOIN parent_child pc ON pc.child_id = anc.id
            CROSS JOIN LATERAL (VALUES (pc.father_id), (pc.mother_id)) p(parent_id)
            WHERE p.parent_id IS NOT NULL AND anc.depth < %(up)s
        ),
        des(id, depth) AS (
            SELECT %(id)s::text, 0
          UNION
            SELECT pc.child_id, des.depth + 1
            FROM des
            JOIN parent_child pc ON des.id IN (pc.father_id, pc.mother_id)
            WHERE des.depth < %(down)s
        )
        SELECT id FROM anc UNION SELECT id FROM des
        """,
        {"id": ind_id, "up": up, "down": down},
    )
    return get_tree_people(cur, [r["id"] for r in cur.fetchall()])


def get_descendants(cur, ind_id: str, max_depth: int = 12) -> list[dict[str, Any]]:
    """
    Recursive CTE returning all descendants up to max_depth generations.

    Returns list of {depth, id, name, given_name, surname, sex, birth_year, death_year},
    ordered by depth then birth_year.
    """
    cur.execute(
        """
        WITH RECURSIVE desc_tree(id, depth) AS (
            SELECT %s::text, 0
          UNION
            SELECT pc.child_id, desc_tree.depth + 1
            FROM desc_tree
            JOIN parent_child pc
              ON pc.father_id = desc_tree.id OR pc.mother_id = desc_tree.id
            WHERE desc_tree.depth < %s
        )
        SELECT
            dt.depth,
            i.id,
            i.name,
            i.given_name,
            i.surname,
            i.sex,
            i.birth_year,
            i.birth_month,
            i.birth_day,
            i.death_year,
            i.death_month,
            i.death_day,
            bp.name    AS birth_place,
            bp.country_iso AS birth_country_iso
        FROM desc_tree dt
        JOIN individuals i ON i.id = dt.id
        LEFT JOIN places bp ON bp.id = i.birth_place_id
        WHERE dt.depth > 0
        ORDER BY dt.depth, i.birth_year NULLS LAST, i.surname NULLS LAST
    """,
        [ind_id, max_depth],
    )
    return [dict(r) for r in cur.fetchall()]


def get_common_ancestors(cur, id1: str, id2: str) -> list[dict[str, Any]]:
    """
    Most-Recent-Common-Ancestors (MRCA) of two individuals.

    Builds full ancestor sets for both, intersects, returns each shared ancestor
    with the depth from each starting person. Ordered by total_depth ascending
    (nearest common ancestor first).

    Returns list of:
      {id, name, surname, sex, birth_year, depth_from_id1, depth_from_id2, total_depth}
    """
    cur.execute(
        """
        WITH RECURSIVE
        anc1(id, depth) AS (
            SELECT %s::text, 0
          UNION
            SELECT parent, a.depth + 1
            FROM anc1 a
            JOIN parent_child pc ON pc.child_id = a.id
            CROSS JOIN LATERAL (VALUES (pc.father_id), (pc.mother_id)) p(parent)
            WHERE p.parent IS NOT NULL AND a.depth < 30
        ),
        anc2(id, depth) AS (
            SELECT %s::text, 0
          UNION
            SELECT parent, a.depth + 1
            FROM anc2 a
            JOIN parent_child pc ON pc.child_id = a.id
            CROSS JOIN LATERAL (VALUES (pc.father_id), (pc.mother_id)) p(parent)
            WHERE p.parent IS NOT NULL AND a.depth < 30
        )
        SELECT
            i.id,
            i.name,
            i.given_name,
            i.surname,
            i.sex,
            i.birth_year,
            i.death_year,
            a1.depth AS depth_from_id1,
            a2.depth AS depth_from_id2,
            a1.depth + a2.depth AS total_depth
        FROM anc1 a1
        JOIN anc2 a2 ON a2.id = a1.id
        JOIN individuals i ON i.id = a1.id
        WHERE a1.depth > 0 AND a2.depth > 0
        ORDER BY total_depth, a1.depth, a2.depth
    """,
        [id1, id2],
    )
    return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Family
# ---------------------------------------------------------------------------


def search_families(
    cur,
    *,
    name: str | None = None,
    place: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    min_children: int | None = None,
    limit: int = 50,
    offset: int = 0,
    exclude_ids: Collection[str] | None = None,
) -> list[dict[str, Any]]:
    """Searchable family list with child counts.

    `exclude_ids` drops every family in which one of those individuals is a spouse.
    """
    conds: list[str] = []
    params: list[Any] = []

    if name:
        conds.append(
            "(unaccent_lower(h.name) LIKE '%%' || unaccent_lower(%s) || '%%'"
            " OR unaccent_lower(w.name) LIKE '%%' || unaccent_lower(%s) || '%%')"
        )
        params.extend([name, name])

    if place:
        conds.append("unaccent_lower(mp.name) LIKE '%%' || unaccent_lower(%s) || '%%'")
        params.append(place)

    if year_from is not None:
        conds.append("f.marriage_year >= %s")
        params.append(year_from)

    if year_to is not None:
        conds.append("f.marriage_year <= %s")
        params.append(year_to)

    if min_children is not None:
        conds.append("(SELECT count(*) FROM family_children fc WHERE fc.family_id = f.id) >= %s")
        params.append(min_children)

    if exclude_ids:
        conds.append(
            "NOT (coalesce(f.husband_id, '') = ANY(%s) OR coalesce(f.wife_id, '') = ANY(%s))"
        )
        params.extend([list(exclude_ids), list(exclude_ids)])

    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    params.extend([limit, offset])

    cur.execute(
        f"""
        SELECT
            f.id,
            f.husband_id,
            h.name AS husband_name,
            h.birth_year AS husband_birth_year,
            h.death_year AS husband_death_year,
            f.wife_id,
            w.name AS wife_name,
            w.birth_year AS wife_birth_year,
            w.death_year AS wife_death_year,
            f.marriage_year,
            f.marriage_qualifier,
            mp.name AS marriage_locality,
            mp.id AS marriage_place_id,
            (SELECT count(*)::int FROM family_children fc WHERE fc.family_id = f.id) AS child_count
        FROM families f
        LEFT JOIN individuals h ON h.id = f.husband_id
        LEFT JOIN individuals w ON w.id = f.wife_id
        LEFT JOIN places mp ON mp.id = f.marriage_place_id
        {where}
        ORDER BY f.marriage_year NULLS LAST, h.name NULLS LAST
        LIMIT %s OFFSET %s
    """,
        params,
    )
    return [dict(r) for r in cur.fetchall()]


def count_families(
    cur,
    *,
    name: str | None = None,
    place: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    min_children: int | None = None,
    exclude_ids: Collection[str] | None = None,
) -> int:
    """Count families matching the same filters as search_families."""
    conds: list[str] = []
    params: list[Any] = []

    if name:
        conds.append(
            "(unaccent_lower(h.name) LIKE '%%' || unaccent_lower(%s) || '%%'"
            " OR unaccent_lower(w.name) LIKE '%%' || unaccent_lower(%s) || '%%')"
        )
        params.extend([name, name])

    if place:
        conds.append("unaccent_lower(mp.name) LIKE '%%' || unaccent_lower(%s) || '%%'")
        params.append(place)

    if year_from is not None:
        conds.append("f.marriage_year >= %s")
        params.append(year_from)

    if year_to is not None:
        conds.append("f.marriage_year <= %s")
        params.append(year_to)

    if min_children is not None:
        conds.append("(SELECT count(*) FROM family_children fc WHERE fc.family_id = f.id) >= %s")
        params.append(min_children)

    if exclude_ids:
        conds.append(
            "NOT (coalesce(f.husband_id, '') = ANY(%s) OR coalesce(f.wife_id, '') = ANY(%s))"
        )
        params.extend([list(exclude_ids), list(exclude_ids)])

    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    place_join = "LEFT JOIN places mp ON mp.id = f.marriage_place_id" if place else ""

    cur.execute(
        f"""
        SELECT count(*)::int AS n
        FROM families f
        LEFT JOIN individuals h ON h.id = f.husband_id
        LEFT JOIN individuals w ON w.id = f.wife_id
        {place_join}
        {where}
    """,
        params,
    )
    return cur.fetchone()["n"]


def get_family(cur, fam_id: str) -> dict[str, Any] | None:
    """Full record for one family unit, or None if not found."""
    cur.execute(
        """
        SELECT
            f.id,
            f.husband_id,
            ih.name        AS husband_name,
            ih.birth_year  AS husband_birth_year,
            ih.death_year  AS husband_death_year,
            f.wife_id,
            iw.name        AS wife_name,
            iw.birth_year  AS wife_birth_year,
            iw.death_year  AS wife_death_year,
            f.divorced,
            f.divorce_note,
            f.marriage_raw,
            f.marriage_qualifier,
            f.marriage_year,
            f.marriage_month,
            f.marriage_day,
            mp.raw AS marriage_place_raw,
            f.marriage_place_id,
            mp.name    AS marriage_locality,
            mp.county      AS marriage_county,
            mp.state       AS marriage_state,
            mp.country     AS marriage_country,
            mp.country_iso AS marriage_country_iso,
            mp.lat         AS marriage_lat,
            mp.lon         AS marriage_lon,
            f.marriage_note,
            f.marriage_contract_raw,
            f.marriage_contract_qualifier,
            f.marriage_contract_year,
            f.marriage_contract_month,
            f.marriage_contract_day,
            f.marriage_contract_place_raw,
            f.marriage_contract_place_id,
            cp.name        AS marriage_contract_locality,
            cp.country_iso AS marriage_contract_country_iso
        FROM families f
        LEFT JOIN individuals ih ON ih.id = f.husband_id
        LEFT JOIN individuals iw ON iw.id = f.wife_id
        LEFT JOIN places mp ON mp.id = f.marriage_place_id
        LEFT JOIN places cp ON cp.id = f.marriage_contract_place_id
        WHERE f.id = %s
    """,
        [fam_id],
    )
    row = cur.fetchone()
    if row is None:
        return None
    fam = dict(row)

    # Children
    cur.execute(
        """
        SELECT
            fc.child_id,
            ic.name       AS name,
            ic.given_name,
            ic.surname,
            ic.sex,
            ic.birth_year,
            ic.death_year
        FROM family_children fc
        JOIN individuals ic ON ic.id = fc.child_id
        WHERE fc.family_id = %s
        ORDER BY ic.birth_year NULLS LAST, ic.given_name
    """,
        [fam_id],
    )
    fam["children"] = [dict(r) for r in cur.fetchall()]

    # Family events
    cur.execute(
        """
        SELECT e.type, e.date_raw, e.date_qualifier, e.date_year, e.date_month, e.date_day,
               e.place_raw, e.note, e.place_id, ep.name AS place_locality
        FROM events e
        LEFT JOIN places ep ON ep.id = e.place_id
        WHERE e.family_id = %s
        ORDER BY e.date_year NULLS LAST, e.type
    """,
        [fam_id],
    )
    fam["events"] = [dict(r) for r in cur.fetchall()]

    # Source citations (scope marriage/record)
    cur.execute(
        """
        SELECT scope, citation FROM sources WHERE family_id = %s ORDER BY id
    """,
        [fam_id],
    )
    fam["sources"] = [dict(r) for r in cur.fetchall()]

    return fam


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def get_statistics(cur) -> dict[str, Any]:
    """Aggregate statistics over the whole database."""
    stats: dict[str, Any] = {}

    # Totals
    cur.execute("SELECT count(*) AS n FROM individuals")
    stats["total_individuals"] = cur.fetchone()["n"]

    cur.execute("SELECT count(*) AS n FROM families")
    stats["total_families"] = cur.fetchone()["n"]

    cur.execute("SELECT count(*) AS n FROM places")
    stats["total_places"] = cur.fetchone()["n"]

    cur.execute("SELECT count(*) AS n FROM places WHERE lat IS NOT NULL")
    stats["geocoded_places"] = cur.fetchone()["n"]

    # Sex breakdown
    cur.execute("""
        SELECT sex, count(*) AS n
        FROM individuals
        GROUP BY sex
        ORDER BY n DESC
    """)
    stats["by_sex"] = {(r["sex"] or "unknown"): r["n"] for r in cur.fetchall()}

    # Birth centuries
    cur.execute("""
        SELECT
            (birth_year / 100) * 100 AS century,
            count(*) AS n
        FROM individuals
        WHERE birth_year IS NOT NULL
        GROUP BY century
        ORDER BY century
    """)
    stats["by_birth_century"] = [dict(r) for r in cur.fetchall()]

    # Top 20 surnames
    cur.execute("""
        SELECT surname, count(*) AS n
        FROM individuals
        WHERE surname IS NOT NULL AND surname != ''
        GROUP BY surname
        ORDER BY n DESC
        LIMIT 20
    """)
    stats["top_surnames"] = [dict(r) for r in cur.fetchall()]

    # Top 20 given names (exclude placeholder 'n')
    cur.execute("""
        SELECT given_name, count(*) AS n
        FROM individuals
        WHERE given_name IS NOT NULL AND lower(given_name) != 'n'
        GROUP BY given_name
        ORDER BY n DESC
        LIMIT 20
    """)
    stats["top_given_names"] = [dict(r) for r in cur.fetchall()]

    # Top 20 birth localities (with place_id for linking)
    cur.execute("""
        SELECT p.id AS place_id, p.name AS locality, p.commune_insee, p.country_iso, count(*) AS n
        FROM individuals i
        JOIN places p ON p.id = i.birth_place_id
        WHERE p.name IS NOT NULL
        GROUP BY p.id, p.name, p.commune_insee, p.country_iso
        ORDER BY n DESC
        LIMIT 20
    """)
    stats["top_birth_places"] = [dict(r) for r in cur.fetchall()]

    # Country breakdown (birth place)
    cur.execute("""
        SELECT p.country_iso, count(*) AS n
        FROM individuals i
        JOIN places p ON p.id = i.birth_place_id
        WHERE p.country_iso IS NOT NULL
        GROUP BY p.country_iso
        ORDER BY n DESC
    """)
    stats["by_birth_country"] = [dict(r) for r in cur.fetchall()]

    # Date / place coverage
    cur.execute("""
        SELECT
            min(birth_year) AS earliest_birth,
            max(birth_year) AS latest_birth,
            count(*) FILTER (WHERE birth_year IS NOT NULL)  AS with_birth_year,
            count(*) FILTER (WHERE death_year IS NOT NULL)  AS with_death_year,
            count(*) FILTER (WHERE birth_place_id IS NOT NULL) AS with_birth_place,
            count(*) FILTER (WHERE death_place_id IS NOT NULL) AS with_death_place
        FROM individuals
    """)
    stats["coverage"] = dict(cur.fetchone())

    # Marriage coverage
    cur.execute("""
        SELECT
            count(*) AS total_families,
            count(*) FILTER (WHERE marriage_year IS NOT NULL)  AS with_marriage_year,
            count(*) FILTER (WHERE marriage_place_id IS NOT NULL) AS with_marriage_place
        FROM families
    """)
    stats["marriage_coverage"] = dict(cur.fetchone())

    # Records / curiosités
    # Oldest individual (death_year - birth_year, simple non-null filter)
    cur.execute("""
        SELECT id, name, birth_year, death_year,
               death_year - birth_year AS age
        FROM individuals
        WHERE birth_year IS NOT NULL AND death_year IS NOT NULL
          AND birth_qualifier IS DISTINCT FROM 'BET'
          AND birth_qualifier IS DISTINCT FROM 'FROM'
          AND death_year > birth_year
          AND death_year - birth_year <= 120
        ORDER BY death_year - birth_year DESC
        LIMIT 1
    """)
    row = cur.fetchone()
    oldest = dict(row) if row else None

    # Person with the most children (using father_id / mother_id from parent_child view)
    cur.execute("""
        WITH parent_counts AS (
            SELECT father_id AS pid, count(*) AS n
            FROM parent_child WHERE father_id IS NOT NULL GROUP BY father_id
            UNION ALL
            SELECT mother_id AS pid, count(*) AS n
            FROM parent_child WHERE mother_id IS NOT NULL GROUP BY mother_id
        ),
        totals AS (
            SELECT pid, sum(n)::int AS n FROM parent_counts GROUP BY pid ORDER BY n DESC LIMIT 1
        )
        SELECT i.id, i.name, i.birth_year, i.death_year, t.n AS child_count
        FROM totals t
        JOIN individuals i ON i.id = t.pid
    """)
    row = cur.fetchone()
    most_children = dict(row) if row else None

    # Family with most children
    cur.execute("""
        WITH fc AS (
            SELECT family_id, count(*) AS n
            FROM family_children
            GROUP BY family_id
            ORDER BY n DESC
            LIMIT 1
        )
        SELECT f.id, h.name AS husband_name, w.name AS wife_name,
               f.marriage_year, fc.n AS child_count
        FROM fc
        JOIN families f ON f.id = fc.family_id
        LEFT JOIN individuals h ON h.id = f.husband_id
        LEFT JOIN individuals w ON w.id = f.wife_id
    """)
    row = cur.fetchone()
    largest_family = dict(row) if row else None

    # Earliest known birth (exclude obvious BC/legendary: year < 500)
    cur.execute("""
        SELECT id, name, birth_year, birth_qualifier
        FROM individuals
        WHERE birth_year IS NOT NULL AND birth_year >= 500
        ORDER BY birth_year ASC
        LIMIT 1
    """)
    row = cur.fetchone()
    earliest = dict(row) if row else None

    # Most sourced individual
    cur.execute("""
        SELECT i.id, i.name, i.birth_year, count(*) AS source_count
        FROM sources s
        JOIN individuals i ON i.id = s.individual_id
        GROUP BY i.id, i.name, i.birth_year
        ORDER BY count(*) DESC
        LIMIT 1
    """)
    row = cur.fetchone()
    most_sourced = dict(row) if row else None

    stats["records"] = {
        "oldest": oldest,
        "most_children": most_children,
        "largest_family": largest_family,
        "earliest": earliest,
        "most_sourced": most_sourced,
    }

    # Occupations by century (1600-1950, categorized only)
    cur.execute("""
        SELECT
            (floor(i.birth_year / 100) * 100)::int AS century,
            p.category,
            count(*)::int AS n
        FROM individual_professions ip
        JOIN professions p ON p.id = ip.profession_id
        JOIN individuals i ON i.id = ip.individual_id
        WHERE p.category IS NOT NULL
          AND i.birth_year BETWEEN 1600 AND 1950
        GROUP BY 1, 2
        ORDER BY 1, n DESC
    """)
    rows = cur.fetchall()
    by_century: dict[int, dict[str, int]] = {}
    for r in rows:
        c = r["century"]
        by_century.setdefault(c, {})[r["category"]] = r["n"]
    stats["professions_by_century"] = [
        {"century": c, **cats} for c, cats in sorted(by_century.items())
    ]

    # Lifespan distribution (individuals 1600-2000 with plausible ages)
    cur.execute("""
        SELECT
            (floor((death_year - birth_year) / 10) * 10)::int AS bucket,
            count(*)::int AS n
        FROM individuals
        WHERE birth_year BETWEEN 1600 AND 2000
          AND death_year IS NOT NULL
          AND death_year - birth_year BETWEEN 0 AND 109
        GROUP BY 1
        ORDER BY 1
    """)
    stats["lifespan_distribution"] = [dict(r) for r in cur.fetchall()]

    return stats


# ---------------------------------------------------------------------------
# Geo
# ---------------------------------------------------------------------------


def get_places_geo(cur) -> list[dict[str, Any]]:
    """
    All geocoded places with birth/death/marriage usage counts.
    Intended for the future map view.
    """
    # Pre-aggregate counts into CTEs, then join - avoids correlated subquery per row.
    cur.execute("""
        WITH bc AS (
            SELECT birth_place_id AS place_id, count(*) AS birth_count
            FROM individuals WHERE birth_place_id IS NOT NULL GROUP BY 1
        ),
        dc AS (
            SELECT death_place_id AS place_id, count(*) AS death_count
            FROM individuals WHERE death_place_id IS NOT NULL GROUP BY 1
        ),
        mc AS (
            SELECT marriage_place_id AS place_id, count(*) AS marriage_count
            FROM families WHERE marriage_place_id IS NOT NULL GROUP BY 1
        )
        SELECT
            p.id,
            p.name AS locality,
            -- French places take their admin hierarchy from the commune (the
            -- single source of truth); foreign places keep their own.
            COALESCE(c.county, p.county)           AS county,
            COALESCE(c.state, p.state)             AS state,
            COALESCE(c.country, p.country)         AS country,
            COALESCE(c.country_iso, p.country_iso) AS country_iso,
            p.lat,
            p.lon,
            p.commune_insee,
            c.nom AS commune_nom,
            p.kind,
            coalesce(bc.birth_count,   0) AS birth_count,
            coalesce(dc.death_count,   0) AS death_count,
            coalesce(mc.marriage_count, 0) AS marriage_count
        FROM places p
        LEFT JOIN communes c ON c.insee = p.commune_insee
        LEFT JOIN bc ON bc.place_id = p.id
        LEFT JOIN dc ON dc.place_id = p.id
        LEFT JOIN mc ON mc.place_id = p.id
        -- Points (non-French markers) need lat/lon; French places render via the
        -- commune GeoJSON choropleth and have null lat/lon but a commune_insee.
        WHERE p.lat IS NOT NULL OR p.commune_insee IS NOT NULL
        ORDER BY
            (coalesce(bc.birth_count, 0) + coalesce(dc.death_count, 0) + coalesce(mc.marriage_count, 0)) DESC,
            p.name
    """)
    return [dict(r) for r in cur.fetchall()]


def get_place_gaps(cur) -> list[dict[str, Any]]:
    """
    Places with at least one event but missing geographic data.
    Returns one row per place ordered by total event count descending.

    Under the post-2026-06-16 place model a French locality reaches its
    country/county/state through commune_insee -> communes, so its denormalized
    country/country_iso columns are legitimately NULL and renders via the commune
    choropleth (no lat/lon needed). A place is therefore only a gap when it has
    NO commune_insee AND its foreign/country data is incomplete. Gap types:
      - no_country: no commune_insee and no country at all (truly unknown location)
      - no_coords: foreign place with a sub-national locality but no lat/lon (can't map)
      - fr_no_insee: a place labelled French (country_iso=FR or country=France) that
        was never resolved to a commune_insee
    """
    cur.execute("""
        WITH bc AS (
            SELECT birth_place_id   AS place_id, count(*) AS n FROM individuals
            WHERE birth_place_id IS NOT NULL GROUP BY 1
        ),
        dc AS (
            SELECT death_place_id   AS place_id, count(*) AS n FROM individuals
            WHERE death_place_id IS NOT NULL GROUP BY 1
        ),
        mc AS (
            SELECT marriage_place_id AS place_id, count(*) AS n FROM families
            WHERE marriage_place_id IS NOT NULL GROUP BY 1
        ),
        ev AS (
            SELECT place_id,
                   coalesce(bc.n, 0) AS birth_count,
                   coalesce(dc.n, 0) AS death_count,
                   coalesce(mc.n, 0) AS marriage_count,
                   coalesce(bc.n, 0) + coalesce(dc.n, 0) + coalesce(mc.n, 0) AS total
            FROM (SELECT id AS place_id FROM places) all_p
            LEFT JOIN bc USING (place_id)
            LEFT JOIN dc USING (place_id)
            LEFT JOIN mc USING (place_id)
        )
        SELECT
            p.id,
            p.name AS locality,
            p.county,
            p.state,
            p.country,
            p.country_iso,
            p.commune_insee,
            p.lat,
            p.lon,
            ev.birth_count,
            ev.death_count,
            ev.marriage_count,
            ev.total AS event_count,
            (p.commune_insee IS NULL AND p.country_iso IS NULL
             AND p.country IS NULL)                                      AS no_country,
            (p.commune_insee IS NULL AND p.lat IS NULL
             AND p.country_iso IS DISTINCT FROM 'FR' AND p.country IS DISTINCT FROM 'France'
             AND (p.name IS NOT NULL OR p.county IS NOT NULL OR p.state IS NOT NULL)) AS no_coords,
            ((p.country_iso = 'FR' OR p.country = 'France')
             AND p.commune_insee IS NULL)                               AS fr_no_insee
        FROM places p
        JOIN ev ON ev.place_id = p.id
        WHERE ev.total > 0
          AND (
            (p.commune_insee IS NULL AND p.country_iso IS NULL AND p.country IS NULL)
            OR (p.commune_insee IS NULL AND p.lat IS NULL
                AND p.country_iso IS DISTINCT FROM 'FR' AND p.country IS DISTINCT FROM 'France'
                AND (p.name IS NOT NULL OR p.county IS NOT NULL OR p.state IS NOT NULL))
            OR ((p.country_iso = 'FR' OR p.country = 'France') AND p.commune_insee IS NULL)
          )
        ORDER BY ev.total DESC, p.name NULLS LAST
    """)
    return [dict(r) for r in cur.fetchall()]


def get_counts_by_region(cur) -> list[dict[str, Any]]:
    """Event counts grouped by the `state` field of French places."""
    cur.execute("""
        WITH bc AS (
            SELECT p.state, count(*) AS birth_count
            FROM individuals i
            JOIN places p ON p.id = i.birth_place_id
            WHERE p.state IS NOT NULL AND p.country_iso = 'FR'
            GROUP BY p.state
        ),
        dc AS (
            SELECT p.state, count(*) AS death_count
            FROM individuals i
            JOIN places p ON p.id = i.death_place_id
            WHERE p.state IS NOT NULL AND p.country_iso = 'FR'
            GROUP BY p.state
        ),
        mc AS (
            SELECT p.state, count(*) AS marriage_count
            FROM families f
            JOIN places p ON p.id = f.marriage_place_id
            WHERE p.state IS NOT NULL AND p.country_iso = 'FR'
            GROUP BY p.state
        )
        SELECT
            COALESCE(bc.state, dc.state, mc.state) AS state,
            COALESCE(bc.birth_count,    0) AS birth_count,
            COALESCE(dc.death_count,    0) AS death_count,
            COALESCE(mc.marriage_count, 0) AS marriage_count
        FROM bc
        FULL OUTER JOIN dc ON dc.state = bc.state
        FULL OUTER JOIN mc ON mc.state = COALESCE(bc.state, dc.state)
        ORDER BY state
    """)
    return [dict(r) for r in cur.fetchall()]


def get_counts_by_country(cur) -> list[dict[str, Any]]:
    """Event counts grouped by country_iso across all places."""
    cur.execute("""
        WITH bc AS (
            SELECT p.country_iso, count(*) AS birth_count
            FROM individuals i
            JOIN places p ON p.id = i.birth_place_id
            WHERE p.country_iso IS NOT NULL
            GROUP BY p.country_iso
        ),
        dc AS (
            SELECT p.country_iso, count(*) AS death_count
            FROM individuals i
            JOIN places p ON p.id = i.death_place_id
            WHERE p.country_iso IS NOT NULL
            GROUP BY p.country_iso
        ),
        mc AS (
            SELECT p.country_iso, count(*) AS marriage_count
            FROM families f
            JOIN places p ON p.id = f.marriage_place_id
            WHERE p.country_iso IS NOT NULL
            GROUP BY p.country_iso
        )
        SELECT
            COALESCE(bc.country_iso, dc.country_iso, mc.country_iso) AS country_iso,
            COALESCE(bc.birth_count,    0) AS birth_count,
            COALESCE(dc.death_count,    0) AS death_count,
            COALESCE(mc.marriage_count, 0) AS marriage_count
        FROM bc
        FULL OUTER JOIN dc ON dc.country_iso = bc.country_iso
        FULL OUTER JOIN mc ON mc.country_iso = COALESCE(bc.country_iso, dc.country_iso)
        ORDER BY country_iso
    """)
    return [dict(r) for r in cur.fetchall()]


def get_geocoded_places_fr(cur) -> list[dict[str, Any]]:
    """All geocoded French places with event counts, for commune-level enrichment."""
    cur.execute("""
        WITH bc AS (
            SELECT birth_place_id AS place_id, COUNT(*) AS n
            FROM individuals WHERE birth_place_id IS NOT NULL GROUP BY 1
        ),
        dc AS (
            SELECT death_place_id AS place_id, COUNT(*) AS n
            FROM individuals WHERE death_place_id IS NOT NULL GROUP BY 1
        ),
        mc AS (
            SELECT marriage_place_id AS place_id, COUNT(*) AS n
            FROM families WHERE marriage_place_id IS NOT NULL GROUP BY 1
        )
        SELECT p.id, p.name, p.lat, p.lon,
            COALESCE(bc.n, 0) AS birth_count,
            COALESCE(dc.n, 0) AS death_count,
            COALESCE(mc.n, 0) AS marriage_count
        FROM places p
        LEFT JOIN bc ON bc.place_id = p.id
        LEFT JOIN dc ON dc.place_id = p.id
        LEFT JOIN mc ON mc.place_id = p.id
        WHERE p.lat IS NOT NULL AND p.country_iso = 'FR'
          AND (COALESCE(bc.n, 0) + COALESCE(dc.n, 0) + COALESCE(mc.n, 0)) > 0
        ORDER BY (COALESCE(bc.n, 0) + COALESCE(dc.n, 0) + COALESCE(mc.n, 0)) DESC
    """)
    return [dict(r) for r in cur.fetchall()]


def get_fr_commune_counts(cur) -> list[dict[str, Any]]:
    """
    Event counts grouped by commune INSEE code for French places.

    Hamlets and the commune head share a commune_insee, so this rolls them up
    into one row per commune - the unit the commune choropleth renders. Returns
    insee, commune_nom, and birth/death/marriage counts. Polygons are fetched
    separately by INSEE code (French places carry commune_insee but no lat/lon).
    """
    cur.execute("""
        WITH bc AS (
            SELECT birth_place_id AS place_id, COUNT(*) AS n
            FROM individuals WHERE birth_place_id IS NOT NULL GROUP BY 1
        ),
        dc AS (
            SELECT death_place_id AS place_id, COUNT(*) AS n
            FROM individuals WHERE death_place_id IS NOT NULL GROUP BY 1
        ),
        mc AS (
            SELECT marriage_place_id AS place_id, COUNT(*) AS n
            FROM families WHERE marriage_place_id IS NOT NULL GROUP BY 1
        )
        SELECT
            p.commune_insee                          AS insee,
            max(c.nom)                               AS commune_nom,
            -- Representative place for the choropleth popup link: prefer the
            -- chef-lieu, else lowest-id row.
            (array_agg(p.id ORDER BY (p.kind = 'chef-lieu') DESC NULLS LAST, p.id))[1] AS place_id,
            SUM(COALESCE(bc.n, 0))::int              AS birth_count,
            SUM(COALESCE(dc.n, 0))::int              AS death_count,
            SUM(COALESCE(mc.n, 0))::int              AS marriage_count
        FROM places p
        JOIN communes c ON c.insee = p.commune_insee
        LEFT JOIN bc ON bc.place_id = p.id
        LEFT JOIN dc ON dc.place_id = p.id
        LEFT JOIN mc ON mc.place_id = p.id
        WHERE p.country_iso = 'FR' AND p.commune_insee IS NOT NULL
        GROUP BY p.commune_insee
        HAVING SUM(COALESCE(bc.n, 0) + COALESCE(dc.n, 0) + COALESCE(mc.n, 0)) > 0
        ORDER BY SUM(COALESCE(bc.n, 0) + COALESCE(dc.n, 0) + COALESCE(mc.n, 0)) DESC
    """)
    return [dict(r) for r in cur.fetchall()]


def get_counts_by_department(cur) -> list[dict[str, Any]]:
    """
    Event counts (births, deaths, marriages) grouped by department name for
    French places. Used to build the choropleth layer.

    Uses pre-aggregation CTEs to avoid 3-way join temp space pressure.
    """
    cur.execute("""
        WITH bc AS (
            SELECT p.county, count(*) AS birth_count
            FROM individuals i
            JOIN places p ON p.id = i.birth_place_id
            WHERE p.county IS NOT NULL AND p.country_iso = 'FR'
            GROUP BY p.county
        ),
        dc AS (
            SELECT p.county, count(*) AS death_count
            FROM individuals i
            JOIN places p ON p.id = i.death_place_id
            WHERE p.county IS NOT NULL AND p.country_iso = 'FR'
            GROUP BY p.county
        ),
        mc AS (
            SELECT p.county, count(*) AS marriage_count
            FROM families f
            JOIN places p ON p.id = f.marriage_place_id
            WHERE p.county IS NOT NULL AND p.country_iso = 'FR'
            GROUP BY p.county
        )
        SELECT
            COALESCE(bc.county, dc.county, mc.county) AS county,
            COALESCE(bc.birth_count,    0) AS birth_count,
            COALESCE(dc.death_count,    0) AS death_count,
            COALESCE(mc.marriage_count, 0) AS marriage_count
        FROM bc
        FULL OUTER JOIN dc ON dc.county = bc.county
        FULL OUTER JOIN mc ON mc.county = COALESCE(bc.county, dc.county)
        ORDER BY county
    """)
    return [dict(r) for r in cur.fetchall()]


def get_commune_localities(
    cur, commune_insee: str, exclude_place_id: int | None = None
) -> list[dict[str, Any]]:
    """
    All localities (places) belonging to a commune, with event counts and kind,
    ordered chef-lieu -> former-commune -> hameau -> lieu-dit then by activity.
    Used for a locality's siblings and a commune's locality list.

    The chef-lieu whose name equals the commune's own name IS the commune, so it
    is excluded: listing it just repeats the commune header (and de-dupes the case
    where two same-named chef-lieu rows exist for one commune). A chef-lieu with a
    *different* name (e.g. Servance, chef-lieu of merged Servance-Miellin) is kept.
    """
    cur.execute(
        """
        WITH bc AS (
            SELECT birth_place_id AS place_id, count(*) AS birth_count
            FROM individuals WHERE birth_place_id IS NOT NULL GROUP BY 1
        ),
        dc AS (
            SELECT death_place_id AS place_id, count(*) AS death_count
            FROM individuals WHERE death_place_id IS NOT NULL GROUP BY 1
        ),
        mc AS (
            SELECT marriage_place_id AS place_id, count(*) AS marriage_count
            FROM families WHERE marriage_place_id IS NOT NULL GROUP BY 1
        )
        SELECT
            p.id,
            p.name,
            p.kind,
            coalesce(bc.birth_count,    0) AS birth_count,
            coalesce(dc.death_count,    0) AS death_count,
            coalesce(mc.marriage_count, 0) AS marriage_count
        FROM places p
        LEFT JOIN communes c ON c.insee = p.commune_insee
        LEFT JOIN bc ON bc.place_id = p.id
        LEFT JOIN dc ON dc.place_id = p.id
        LEFT JOIN mc ON mc.place_id = p.id
        WHERE p.commune_insee = %s
          AND (%s::int IS NULL OR p.id <> %s)
          AND NOT (p.kind = 'chef-lieu' AND p.name IS NOT DISTINCT FROM c.nom)
        ORDER BY
            CASE p.kind WHEN 'chef-lieu' THEN 0 WHEN 'former-commune' THEN 1
                        WHEN 'hameau' THEN 2 ELSE 3 END,
            (coalesce(bc.birth_count, 0) + coalesce(dc.death_count, 0)) DESC,
            p.name
    """,
        (commune_insee, exclude_place_id, exclude_place_id),
    )
    return [dict(r) for r in cur.fetchall()]


def _events_at_place(cur, place_id: int) -> dict[str, list]:
    """born/died/married scoped to a single locality (no aggregation, hamlet=NULL)."""
    out: dict[str, list] = {}
    cur.execute(
        """
        SELECT i.id, i.name, i.given_name, i.surname, i.sex,
               i.birth_year, i.death_year, NULL::text AS hamlet
        FROM individuals i WHERE i.birth_place_id = %s
        ORDER BY i.birth_year NULLS LAST, i.name LIMIT 500
    """,
        (place_id,),
    )
    out["born"] = [dict(r) for r in cur.fetchall()]
    cur.execute(
        """
        SELECT i.id, i.name, i.given_name, i.surname, i.sex,
               i.birth_year, i.death_year, NULL::text AS hamlet
        FROM individuals i WHERE i.death_place_id = %s
        ORDER BY i.death_year NULLS LAST, i.name LIMIT 500
    """,
        (place_id,),
    )
    out["died"] = [dict(r) for r in cur.fetchall()]
    cur.execute(
        """
        SELECT f.id AS family_id, f.husband_id, h.name AS husband_name,
               f.wife_id, w.name AS wife_name, f.marriage_year, NULL::text AS hamlet
        FROM families f
        LEFT JOIN individuals h ON h.id = f.husband_id
        LEFT JOIN individuals w ON w.id = f.wife_id
        WHERE f.marriage_place_id = %s
        ORDER BY f.marriage_year NULLS LAST, h.name LIMIT 300
    """,
        (place_id,),
    )
    out["married"] = [dict(r) for r in cur.fetchall()]
    return out


def _events_in_commune(cur, commune_insee: str) -> dict[str, list]:
    """born/died/married aggregated across all localities of a commune, each row
    tagged with the locality (hamlet) it occurred in."""
    out: dict[str, list] = {}
    cur.execute(
        """
        SELECT i.id, i.name, i.given_name, i.surname, i.sex,
               i.birth_year, i.death_year,
               bp.name AS hamlet, bp.id AS hamlet_place_id
        FROM individuals i JOIN places bp ON bp.id = i.birth_place_id
        WHERE bp.commune_insee = %s
        ORDER BY i.birth_year NULLS LAST, i.name LIMIT 1000
    """,
        (commune_insee,),
    )
    out["born"] = [dict(r) for r in cur.fetchall()]
    cur.execute(
        """
        SELECT i.id, i.name, i.given_name, i.surname, i.sex,
               i.birth_year, i.death_year,
               dp.name AS hamlet, dp.id AS hamlet_place_id
        FROM individuals i JOIN places dp ON dp.id = i.death_place_id
        WHERE dp.commune_insee = %s
        ORDER BY i.death_year NULLS LAST, i.name LIMIT 1000
    """,
        (commune_insee,),
    )
    out["died"] = [dict(r) for r in cur.fetchall()]
    cur.execute(
        """
        SELECT f.id AS family_id, f.husband_id, h.name AS husband_name,
               f.wife_id, w.name AS wife_name, f.marriage_year,
               mp.name AS hamlet, mp.id AS hamlet_place_id
        FROM families f JOIN places mp ON mp.id = f.marriage_place_id
        LEFT JOIN individuals h ON h.id = f.husband_id
        LEFT JOIN individuals w ON w.id = f.wife_id
        WHERE mp.commune_insee = %s
        ORDER BY f.marriage_year NULLS LAST, h.name LIMIT 600
    """,
        (commune_insee,),
    )
    out["married"] = [dict(r) for r in cur.fetchall()]
    return out


def get_place_detail(cur, place_id: int) -> dict[str, Any] | None:
    """
    Locality detail: the place's own events (scoped, not aggregated), its kind,
    the commune it belongs to, and its sibling localities. None if not found.
    """
    cur.execute(
        """
        SELECT
            p.id, p.name, p.kind, p.county, p.state, p.country, p.country_iso,
            p.lat, p.lon, p.commune_insee,
            c.nom AS commune_nom, c.county AS commune_county, c.state AS commune_state,
            c.description AS commune_description,
            c.description_source AS commune_description_source,
            c.description_url AS commune_description_url,
            p.description, p.description_source
        FROM places p
        LEFT JOIN communes c ON c.insee = p.commune_insee
        WHERE p.id = %s
    """,
        (place_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    place = dict(row)

    place.update(_events_at_place(cur, place_id))

    commune_insee = place.get("commune_insee")
    if commune_insee:
        place["commune"] = {
            "insee": commune_insee,
            "nom": place.get("commune_nom"),
            "county": place.get("commune_county"),
            "state": place.get("commune_state"),
            "description": place.get("commune_description"),
            "description_source": place.get("commune_description_source"),
            "description_url": place.get("commune_description_url"),
        }
        place["siblings"] = get_commune_localities(cur, commune_insee, exclude_place_id=place_id)
    else:
        place["commune"] = None
        place["siblings"] = []
    return place


def get_commune_detail(cur, insee: str) -> dict[str, Any] | None:
    """
    Commune detail: the commune entity plus events aggregated across ALL its
    localities (each tagged with its locality) and the locality list. None if
    the INSEE code is unknown.
    """
    cur.execute(
        """
        SELECT insee, nom, county, state, country, country_iso,
               description, description_source, description_url
        FROM communes WHERE insee = %s
    """,
        (insee,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    commune = dict(row)
    commune.update(_events_in_commune(cur, insee))
    commune["localities"] = get_commune_localities(cur, insee)

    # Top surnames born in this commune
    cur.execute(
        """
        SELECT i.surname, count(*)::int AS n
        FROM individuals i
        JOIN places bp ON bp.id = i.birth_place_id
        WHERE bp.commune_insee = %s
          AND i.surname IS NOT NULL
          AND lower(i.surname) != 'n'
        GROUP BY i.surname
        ORDER BY n DESC
        LIMIT 10
    """,
        (insee,),
    )
    commune["top_surnames"] = [dict(r) for r in cur.fetchall()]

    return commune


# ---------------------------------------------------------------------------
# Historical bans
# ---------------------------------------------------------------------------


def _ban_communes(cur, ban_id: int) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT bc.commune_insee AS insee, cc.nom, cd.nom AS county,
               cr.nom AS state, bc.role
        FROM ban_communes bc
        JOIN cog_communes cc ON cc.insee = bc.commune_insee
        LEFT JOIN cog_departements cd ON cd.code = cc.dept_code
        LEFT JOIN cog_regions cr ON cr.code = cc.region_code
        WHERE bc.ban_id = %s
        ORDER BY cc.nom
    """,
        (ban_id,),
    )
    return [dict(r) for r in cur.fetchall()]


def get_bans(cur) -> list[dict[str, Any]]:
    """List all bans with their mapped communes (lightweight summary)."""
    cur.execute("""
        SELECT b.id, b.name, b.abolished_year, b.suzerain, b.origin_note
        FROM bans b
        ORDER BY b.id
    """)
    bans = [dict(r) for r in cur.fetchall()]
    for ban in bans:
        ban["communes"] = _ban_communes(cur, ban["id"])
    return bans


def get_ban_detail(cur, ban_id: int) -> dict[str, Any] | None:
    """Full ban detail: all text fields + communes + localities."""
    cur.execute(
        """
        SELECT id, name, origin_note, suzerain, lords_succession,
               parishes, abolished_year, abolition_note, notes
        FROM bans WHERE id = %s
    """,
        (ban_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    ban = dict(row)
    ban["communes"] = _ban_communes(cur, ban_id)
    cur.execute(
        """
        SELECT bl.id, bl.place_id, bl.name, bl.parish, bl.notes
        FROM ban_localities bl
        WHERE bl.ban_id = %s
        ORDER BY bl.parish NULLS LAST, bl.name
    """,
        (ban_id,),
    )
    ban["localities"] = [dict(r) for r in cur.fetchall()]
    return ban


# ---------------------------------------------------------------------------
# Professions
# ---------------------------------------------------------------------------


def get_profession_list(cur) -> list[dict[str, Any]]:
    """All professions (occupations) with individual count."""
    cur.execute("""
        SELECT p.id, p.name, p.category, p.description, COUNT(ip.individual_id) AS count
        FROM professions p
        LEFT JOIN individual_professions ip ON ip.profession_id = p.id
        GROUP BY p.id, p.name, p.category, p.description
        ORDER BY count DESC, p.name
    """)
    return [dict(r) for r in cur.fetchall()]


def get_profession_detail(cur, profession_id: int) -> dict[str, Any] | None:
    """Profession metadata + all individuals who practised it."""
    cur.execute(
        "SELECT id, name, category, description FROM professions WHERE id = %s",
        (profession_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    prof = dict(row)
    cur.execute(
        """
        SELECT
            i.id, i.name, i.given_name, i.surname, i.sex,
            i.birth_year, i.death_year,
            bp.id AS birth_place_id, bp.name AS birth_locality, bp.country_iso AS birth_country_iso
        FROM individual_professions ip
        JOIN individuals i ON i.id = ip.individual_id
        LEFT JOIN places bp ON bp.id = i.birth_place_id
        WHERE ip.profession_id = %s
        ORDER BY i.surname NULLS LAST, i.given_name NULLS LAST
    """,
        (profession_id,),
    )
    prof["individuals"] = [dict(r) for r in cur.fetchall()]
    return prof


# ---------------------------------------------------------------------------
# Distinctions
# ---------------------------------------------------------------------------


def get_distinction_list(cur) -> list[dict[str, Any]]:
    """All distinctions with individual count, ordered chronologically within category."""
    cur.execute("""
        SELECT d.id, d.name, d.category, d.description, d.year_start, d.year_end,
               COUNT(id_.individual_id) AS count
        FROM distinctions d
        LEFT JOIN individual_distinctions id_ ON id_.distinction_id = d.id
        GROUP BY d.id, d.name, d.category, d.description, d.year_start, d.year_end
        ORDER BY d.category NULLS LAST, d.year_start NULLS LAST, d.name
    """)
    return [dict(r) for r in cur.fetchall()]


def get_distinction_detail(cur, distinction_id: int) -> dict[str, Any] | None:
    """Distinction metadata + all individuals who hold it, including service notes."""
    cur.execute(
        "SELECT id, name, category, description, year_start, year_end FROM distinctions WHERE id = %s",
        (distinction_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    dist = dict(row)
    cur.execute(
        """
        SELECT
            i.id, i.name, i.given_name, i.surname, i.sex,
            i.birth_year, i.death_year,
            i.death_note,
            bp.id AS birth_place_id, bp.name AS birth_locality, bp.country_iso AS birth_country_iso,
            id_.note AS distinction_note,
            n.body AS individual_note
        FROM individual_distinctions id_
        JOIN individuals i ON i.id = id_.individual_id
        LEFT JOIN places bp ON bp.id = i.birth_place_id
        LEFT JOIN notes n ON n.individual_id = i.id
        WHERE id_.distinction_id = %s
        ORDER BY i.death_year NULLS LAST, i.surname NULLS LAST, i.given_name NULLS LAST
    """,
        (distinction_id,),
    )
    dist["individuals"] = [dict(r) for r in cur.fetchall()]
    return dist


# ---------------------------------------------------------------------------
# Military ranks
# ---------------------------------------------------------------------------


def get_military_rank_list(cur) -> list[dict[str, Any]]:
    """All canonical military ranks with individual count."""
    cur.execute("""
        SELECT mr.id, mr.name, mr.branch, mr.grade, mr.era, mr.description,
               COUNT(imr.individual_id) AS count
        FROM military_ranks mr
        LEFT JOIN individual_military_ranks imr ON imr.rank_id = mr.id
        GROUP BY mr.id, mr.name, mr.branch, mr.grade, mr.era, mr.description
        ORDER BY mr.grade NULLS LAST, mr.name
    """)
    return [dict(r) for r in cur.fetchall()]


def get_military_rank_detail(cur, rank_id: int) -> dict[str, Any] | None:
    """Military rank metadata + all individuals who hold it."""
    cur.execute(
        "SELECT id, name, branch, grade, era, description FROM military_ranks WHERE id = %s",
        (rank_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    rank = dict(row)
    cur.execute(
        """
        SELECT
            i.id, i.name, i.given_name, i.surname, i.sex,
            i.birth_year, i.death_year,
            bp.id AS birth_place_id, bp.name AS birth_locality, bp.country_iso AS birth_country_iso,
            imr.year_start, imr.year_end, imr.regiment, imr.note
        FROM individual_military_ranks imr
        JOIN individuals i ON i.id = imr.individual_id
        LEFT JOIN places bp ON bp.id = i.birth_place_id
        WHERE imr.rank_id = %s
        ORDER BY i.surname NULLS LAST, i.given_name NULLS LAST
    """,
        (rank_id,),
    )
    rank["individuals"] = [dict(r) for r in cur.fetchall()]
    return rank


def get_on_this_day(cur, month: int, day: int) -> list[dict[str, Any]]:
    """People born, died, or married on a given month+day, any year."""
    cur.execute(
        """
        SELECT id, name, sex, birth_year, death_year,
               'naissance' AS event_type, birth_year AS event_year
        FROM individuals
        WHERE birth_month = %s AND birth_day = %s
          AND birth_year IS NOT NULL
          AND lower(coalesce(surname, '')) != 'n'
        UNION ALL
        SELECT id, name, sex, birth_year, death_year,
               'décès' AS event_type, death_year AS event_year
        FROM individuals
        WHERE death_month = %s AND death_day = %s
          AND death_year IS NOT NULL
          AND lower(coalesce(surname, '')) != 'n'
        ORDER BY event_year, id
    """,
        (month, day, month, day),
    )
    rows = [dict(r) for r in cur.fetchall()]

    # Also marriages
    cur.execute(
        """
        SELECT
            f.id AS family_id,
            ih.name AS husband_name, ih.id AS husband_id,
            iw.name AS wife_name, iw.id AS wife_id,
            f.marriage_year AS event_year
        FROM families f
        LEFT JOIN individuals ih ON ih.id = f.husband_id
        LEFT JOIN individuals iw ON iw.id = f.wife_id
        WHERE f.marriage_month = %s AND f.marriage_day = %s
          AND f.marriage_year IS NOT NULL
        ORDER BY f.marriage_year
    """,
        (month, day),
    )
    marriages = [dict(r) for r in cur.fetchall()]
    return {"individuals": rows, "marriages": marriages}
