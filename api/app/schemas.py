"""
Pydantic v2 response schemas for the genealogy API.

All fields that may be absent in the DB are typed as X | None = None.
Floats for lat/lon are left as float | None (JSON serializes them directly).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# Shared sub-objects
# ---------------------------------------------------------------------------


class PlaceRef(BaseModel):
    """Resolved place attached to a vital event."""

    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    locality: str | None = None
    county: str | None = None
    state: str | None = None
    country: str | None = None
    country_iso: str | None = None
    lat: float | None = None
    lon: float | None = None


class ParentRef(BaseModel):
    """Parents of an individual (from the parent_child view)."""

    model_config = ConfigDict(from_attributes=True)

    father_id: str | None = None
    father_name: str | None = None
    mother_id: str | None = None
    mother_name: str | None = None
    family_id: str | None = None


class SpouseRef(BaseModel):
    """A spouse + family context as seen from one individual's record."""

    model_config = ConfigDict(from_attributes=True)

    family_id: str | None = None
    spouse_id: str | None = None
    spouse_name: str | None = None
    spouse_sex: str | None = None
    spouse_birth_year: int | None = None
    spouse_death_year: int | None = None
    divorced: bool | None = None
    divorce_note: str | None = None
    marriage_year: int | None = None
    marriage_month: int | None = None
    marriage_day: int | None = None
    marriage_raw: str | None = None
    marriage_qualifier: str | None = None
    marriage_place_raw: str | None = None
    marriage_place_id: int | None = None
    marriage_locality: str | None = None
    marriage_country_iso: str | None = None
    marriage_note: str | None = None
    marriage_contract_qualifier: str | None = None
    marriage_contract_year: int | None = None
    marriage_contract_month: int | None = None
    marriage_contract_day: int | None = None
    marriage_contract_place_raw: str | None = None
    marriage_contract_locality: str | None = None
    marriage_sources: list[str] = []


class ChildRef(BaseModel):
    """Child summary as seen from a parent's record."""

    model_config = ConfigDict(from_attributes=True)

    child_id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    sex: str | None = None
    child_birth_year: int | None = None
    child_death_year: int | None = None
    child_birth_locality: str | None = None
    child_birth_county: str | None = None
    child_birth_country: str | None = None
    family_id: str | None = None
    other_parent_id: str | None = None


class EventRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: str | None = None
    date_raw: str | None = None
    date_qualifier: str | None = None
    date_year: int | None = None
    date_month: int | None = None
    date_day: int | None = None
    date_year2: int | None = None
    date_month2: int | None = None
    date_day2: int | None = None
    place_raw: str | None = None
    place_id: int | None = None
    place_locality: str | None = None
    note: str | None = None


class SourceRef(BaseModel):
    """A source citation attached to a record or a specific vital event."""

    model_config = ConfigDict(from_attributes=True)

    scope: str  # birth/death/baptism/burial/marriage/record
    citation: str


class TitleRef(BaseModel):
    """A title/honorific, optionally with a NOTE sub-record."""

    model_config = ConfigDict(from_attributes=True)

    title: str
    note: str | None = None


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


class PersonSummary(BaseModel):
    """Lightweight person row returned by /api/search."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    nickname: str | None = None
    sex: str | None = None
    birth_year: int | None = None
    birth_month: int | None = None
    birth_day: int | None = None
    death_year: int | None = None
    death_month: int | None = None
    death_day: int | None = None
    birth_place_id: int | None = None
    birth_place: str | None = None
    birth_country_iso: str | None = None
    branch: int | None = None
    is_direct_line: bool = False
    sosa: int | None = None


class SosaRoot(BaseModel):
    """The individual numbered Sosa 1, set per deployment by $GENEALOGY_SOSA_ROOT."""

    id: str
    given_name: str | None
    surname: str | None


class TreeConfig(BaseModel):
    """What this deployment's tree is rooted on and how its two sides are named.

    `branches` labels the `branch` column: "1" is the root's father's side, "2"
    its mother's ($GENEALOGY_BRANCH_LABELS, comma-separated, in that order).
    """

    sosa_root: SosaRoot | None
    branches: dict[str, str]


class PedigreeGeneration(BaseModel):
    """One generation row for the pedigree collapse chart."""

    generation: int
    potential: int
    known: int


# ---------------------------------------------------------------------------
# Individual detail
# ---------------------------------------------------------------------------


class PersonDetail(BaseModel):
    """Full individual record returned by /api/people/{id}."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    nickname: str | None = None
    sex: str | None = None
    occupation: str | None = None

    # Birth
    birth_raw: str | None = None
    birth_qualifier: str | None = None
    birth_year: int | None = None
    birth_month: int | None = None
    birth_day: int | None = None
    birth_year2: int | None = None
    birth_month2: int | None = None
    birth_day2: int | None = None
    birth_place_raw: str | None = None
    birth_place_id: int | None = None
    birth_place: PlaceRef | None = None

    # Death
    death_raw: str | None = None
    death_qualifier: str | None = None
    death_year: int | None = None
    death_month: int | None = None
    death_day: int | None = None
    death_year2: int | None = None
    death_month2: int | None = None
    death_day2: int | None = None
    death_place_raw: str | None = None
    death_place_id: int | None = None
    death_place: PlaceRef | None = None

    # Baptism
    baptism_raw: str | None = None
    baptism_qualifier: str | None = None
    baptism_year: int | None = None
    baptism_month: int | None = None
    baptism_day: int | None = None
    baptism_place_raw: str | None = None
    baptism_place_id: int | None = None
    baptism_place: PlaceRef | None = None

    # Burial
    burial_raw: str | None = None
    burial_qualifier: str | None = None
    burial_year: int | None = None
    burial_month: int | None = None
    burial_day: int | None = None
    burial_place_raw: str | None = None
    burial_place_id: int | None = None
    burial_place: PlaceRef | None = None

    # Vital-event notes
    birth_note: str | None = None
    death_note: str | None = None
    baptism_note: str | None = None
    burial_note: str | None = None

    # Branch membership
    branch: int | None = None
    is_direct_line: bool = False

    # Relations
    parents: ParentRef | None = None
    spouses: list[SpouseRef] = []
    children: list[ChildRef] = []

    # Sub-records
    events: list[EventRecord] = []
    notes: list[str] = []
    titles: list[TitleRef] = []
    sources: list[SourceRef] = []
    professions: list[ProfessionRef] = []
    distinctions: list[DistinctionRef] = []
    military_ranks: list[MilitaryRankRef] = []


# ---------------------------------------------------------------------------
# Ancestor / descendant tree node
# ---------------------------------------------------------------------------


class TreeNode(BaseModel):
    """One person in an ancestor or descendant list."""

    model_config = ConfigDict(from_attributes=True)

    depth: int
    id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    sex: str | None = None
    birth_year: int | None = None
    birth_month: int | None = None
    birth_day: int | None = None
    death_year: int | None = None
    death_month: int | None = None
    death_day: int | None = None
    birth_place: str | None = None
    birth_country_iso: str | None = None
    sosa: int | None = None


class CommonAncestor(BaseModel):
    """Shared ancestor with distances from both query subjects."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    sex: str | None = None
    birth_year: int | None = None
    death_year: int | None = None
    depth_from_id1: int
    depth_from_id2: int
    total_depth: int


# ---------------------------------------------------------------------------
# Family
# ---------------------------------------------------------------------------


class FamilyChild(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    child_id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    sex: str | None = None
    birth_year: int | None = None
    death_year: int | None = None


class FamilyEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: str | None = None
    date_raw: str | None = None
    date_qualifier: str | None = None
    date_year: int | None = None
    date_month: int | None = None
    date_day: int | None = None
    place_raw: str | None = None
    place_id: int | None = None
    place_locality: str | None = None
    note: str | None = None


class FamilySummary(BaseModel):
    """Lightweight family row for the family list."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    husband_id: str | None = None
    husband_name: str | None = None
    husband_birth_year: int | None = None
    husband_death_year: int | None = None
    wife_id: str | None = None
    wife_name: str | None = None
    wife_birth_year: int | None = None
    wife_death_year: int | None = None
    marriage_year: int | None = None
    marriage_qualifier: str | None = None
    marriage_locality: str | None = None
    marriage_place_id: int | None = None
    child_count: int = 0


class FamilyDetail(BaseModel):
    """Full family unit returned by /api/families/{id}."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    husband_id: str | None = None
    husband_name: str | None = None
    husband_birth_year: int | None = None
    husband_death_year: int | None = None
    wife_id: str | None = None
    wife_name: str | None = None
    wife_birth_year: int | None = None
    wife_death_year: int | None = None
    divorced: bool
    divorce_note: str | None = None
    marriage_raw: str | None = None
    marriage_qualifier: str | None = None
    marriage_year: int | None = None
    marriage_month: int | None = None
    marriage_day: int | None = None
    marriage_place_raw: str | None = None
    marriage_place_id: int | None = None
    marriage_locality: str | None = None
    marriage_county: str | None = None
    marriage_state: str | None = None
    marriage_country: str | None = None
    marriage_country_iso: str | None = None
    marriage_lat: float | None = None
    marriage_lon: float | None = None
    marriage_note: str | None = None

    # Marriage contract (MARC)
    marriage_contract_raw: str | None = None
    marriage_contract_qualifier: str | None = None
    marriage_contract_year: int | None = None
    marriage_contract_month: int | None = None
    marriage_contract_day: int | None = None
    marriage_contract_place_raw: str | None = None
    marriage_contract_place_id: int | None = None
    marriage_contract_locality: str | None = None
    marriage_contract_country_iso: str | None = None

    children: list[FamilyChild] = []
    events: list[FamilyEvent] = []
    sources: list[SourceRef] = []


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


class SexCount(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sex: str
    n: int


class CenturyCount(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    century: int | None = None
    n: int


class SurnameCount(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    surname: str
    n: int


class LocalityCount(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    locality: str
    country_iso: str | None = None
    n: int


class CountryCount(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    country_iso: str
    n: int


class Coverage(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    earliest_birth: int | None = None
    latest_birth: int | None = None
    with_birth_year: int
    with_death_year: int
    with_birth_place: int


class Statistics(BaseModel):
    total_individuals: int
    total_families: int
    total_places: int
    geocoded_places: int
    by_sex: dict[str, int]
    by_birth_century: list[dict]
    top_surnames: list[dict]
    top_given_names: list[dict]
    top_birth_places: list[dict]
    by_birth_country: list[dict]
    coverage: dict
    marriage_coverage: dict
    records: dict
    professions_by_century: list[dict]
    lifespan_distribution: list[dict]


# ---------------------------------------------------------------------------
# Geo
# ---------------------------------------------------------------------------


class PlaceGeo(BaseModel):
    """Geocoded place with event counts, for map rendering."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    locality: str | None = None
    county: str | None = None
    state: str | None = None
    country: str | None = None
    country_iso: str | None = None
    lat: float | None = None
    lon: float | None = None
    commune_insee: str | None = None
    commune_nom: str | None = None
    kind: str | None = None
    birth_count: int
    death_count: int
    marriage_count: int


class PlaceGap(BaseModel):
    """Place with missing geographic data, for the data-quality gaps view."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    locality: str | None = None
    county: str | None = None
    state: str | None = None
    country: str | None = None
    country_iso: str | None = None
    commune_insee: str | None = None
    lat: float | None = None
    lon: float | None = None
    birth_count: int
    death_count: int
    marriage_count: int
    event_count: int
    no_country: bool
    no_coords: bool
    fr_no_insee: bool


# ---------------------------------------------------------------------------
# Place detail
# ---------------------------------------------------------------------------


class PlacePersonRef(BaseModel):
    """Lightweight person reference for place detail lists."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    sex: str | None = None
    birth_year: int | None = None
    death_year: int | None = None
    # On a commune-head page, the hamlet the event actually occurred in (when it
    # differs from the commune head itself). None for the commune head's own rows.
    hamlet: str | None = None
    hamlet_place_id: int | None = None


class PlaceMarriageRef(BaseModel):
    """Family married at a place."""

    model_config = ConfigDict(from_attributes=True)

    family_id: str
    husband_id: str | None = None
    husband_name: str | None = None
    wife_id: str | None = None
    wife_name: str | None = None
    marriage_year: int | None = None
    hamlet: str | None = None
    hamlet_place_id: int | None = None


class LocalityRef(BaseModel):
    """A locality (place) belonging to a commune, with kind + event counts."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    kind: str | None = None  # chef-lieu | former-commune | hameau | lieu-dit
    birth_count: int = 0
    death_count: int = 0
    marriage_count: int = 0


class Commune(BaseModel):
    """A French commune (INSEE administrative entity) a locality belongs to."""

    model_config = ConfigDict(from_attributes=True)

    insee: str
    nom: str | None = None
    county: str | None = None
    state: str | None = None
    country: str | None = None
    country_iso: str | None = None
    description: str | None = None
    description_source: str | None = None
    description_url: str | None = None


class PlaceDetail(BaseModel):
    """Locality detail: the place's own events, its kind, parent commune, siblings."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    kind: str | None = None
    county: str | None = None
    state: str | None = None
    country: str | None = None
    country_iso: str | None = None
    lat: float | None = None
    lon: float | None = None
    commune_insee: str | None = None
    commune: Commune | None = None
    description: str | None = None
    description_source: str | None = None
    born: list[PlacePersonRef] = []
    died: list[PlacePersonRef] = []
    married: list[PlaceMarriageRef] = []
    siblings: list[LocalityRef] = []


class CommuneDetail(BaseModel):
    """Commune detail: the entity + events aggregated across all its localities."""

    model_config = ConfigDict(from_attributes=True)

    insee: str
    nom: str | None = None
    county: str | None = None
    state: str | None = None
    country: str | None = None
    country_iso: str | None = None
    description: str | None = None
    description_source: str | None = None
    description_url: str | None = None
    born: list[PlacePersonRef] = []
    died: list[PlacePersonRef] = []
    married: list[PlaceMarriageRef] = []
    localities: list[LocalityRef] = []
    top_surnames: list[dict] = []


# ---------------------------------------------------------------------------
# Historical bans
# ---------------------------------------------------------------------------


class BanCommune(BaseModel):
    """A modern INSEE commune that covers part of a historical ban's territory."""

    model_config = ConfigDict(from_attributes=True)

    insee: str
    nom: str | None = None
    county: str | None = None
    state: str | None = None
    role: str | None = None


class BanLocality(BaseModel):
    """A historical locality (hamlet, village) within a ban."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    place_id: int | None = None  # links to places table if geocoded
    name: str
    parish: str | None = None
    notes: str | None = None


class ProfessionRef(BaseModel):
    """One occupation entry (used in person detail and profession list)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str | None = None
    description: str | None = None
    note: str | None = None


class ProfessionPersonRef(BaseModel):
    """Lightweight individual ref for the profession detail endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    sex: str | None = None
    birth_year: int | None = None
    death_year: int | None = None
    birth_place_id: int | None = None
    birth_locality: str | None = None
    birth_country_iso: str | None = None


class ProfessionSummary(ProfessionRef):
    """Occupation with individual count for the list endpoint."""

    count: int


class ProfessionDetail(ProfessionRef):
    """Occupation with full individual list."""

    individuals: list[ProfessionPersonRef] = []


class DistinctionRef(BaseModel):
    """One distinction entry (used in person detail and distinction list)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str | None = None
    description: str | None = None
    year_start: int | None = None
    year_end: int | None = None


class DistinctionPersonRef(BaseModel):
    """Lightweight individual ref for the distinction detail endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    sex: str | None = None
    birth_year: int | None = None
    death_year: int | None = None
    death_note: str | None = None
    birth_place_id: int | None = None
    birth_locality: str | None = None
    birth_country_iso: str | None = None
    distinction_note: str | None = None
    individual_note: str | None = None


class DistinctionSummary(DistinctionRef):
    """Distinction with individual count for the list endpoint."""

    count: int


class DistinctionDetail(DistinctionRef):
    """Distinction with full individual list."""

    individuals: list[DistinctionPersonRef] = []


# ---------------------------------------------------------------------------
# Historical bans
# ---------------------------------------------------------------------------


class BanSummary(BaseModel):
    """Lightweight ban for the list endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    abolished_year: int
    suzerain: str | None = None
    origin_note: str | None = None
    communes: list[BanCommune] = []


class BanDetail(BaseModel):
    """Full ban record with communes and all historical localities."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    origin_note: str | None = None
    suzerain: str | None = None
    lords_succession: str | None = None
    parishes: str | None = None
    abolished_year: int
    abolition_note: str | None = None
    notes: str | None = None
    communes: list[BanCommune] = []
    localities: list[BanLocality] = []


# ---------------------------------------------------------------------------
# Military ranks
# ---------------------------------------------------------------------------


class MilitaryRankRef(BaseModel):
    """A military rank held by an individual (person detail context)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    branch: str | None = None
    grade: int | None = None
    era: str | None = None
    year_start: int | None = None
    year_end: int | None = None
    regiment: str | None = None
    note: str | None = None


class MilitaryRankPersonRef(BaseModel):
    """Individual ref for the military rank detail endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    given_name: str | None = None
    surname: str | None = None
    sex: str | None = None
    birth_year: int | None = None
    death_year: int | None = None
    birth_place_id: int | None = None
    birth_locality: str | None = None
    birth_country_iso: str | None = None
    year_start: int | None = None
    year_end: int | None = None
    regiment: str | None = None
    note: str | None = None


class MilitaryRankSummary(BaseModel):
    """Military rank with individual count for the list endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    branch: str | None = None
    grade: int | None = None
    era: str | None = None
    description: str | None = None
    count: int


class MilitaryRankDetail(BaseModel):
    """Military rank with full individual list."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    branch: str | None = None
    grade: int | None = None
    era: str | None = None
    description: str | None = None
    individuals: list[MilitaryRankPersonRef] = []


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class Health(BaseModel):
    status: str
    version: str
