-- Genealogy database schema
-- Design principles:
--   - Common vital events (birth/death/marriage/baptism/burial) inlined on
--     person/family rows for join-free access on the common case.
--   - Full GEDCOM date model: qualifier + year/month/day + year2/month2/day2
--     for range qualifiers (BET...AND, FROM...TO).
--   - Raw place strings preserved; places table populated during harmonization.
--   - Variable-count sub-records (events, notes, titles, media) in own tables.
--   - name_normalized / given_name_normalized for accent-insensitive search.

CREATE EXTENSION IF NOT EXISTS unaccent;
-- pg_trgm powers the ranked name search in queries.py (similarity() + the `%`
-- match operator); the GIN trigram indexes below are NOT optional.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Immutable wrapper required to use unaccent() in index expressions. Both the function
-- and its dictionary are schema-qualified: pg_dump/pg_restore run with an empty
-- search_path, and an unqualified unaccent() made every restore of this database fail
-- while building the indexes on it (found 2026-10-05).
CREATE OR REPLACE FUNCTION unaccent_lower(text) RETURNS text AS $$
    SELECT lower(public.unaccent('public.unaccent'::regdictionary, $1))
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- surname_key(): collapse the written endings that are ONE SOUND in French.
--
-- Why. Word-final -ay, -ey and -ez all spell /e/, and -ez is the Lorraine
-- convention in particular. A 17th-century priest heard the name and wrote
-- whichever ending came to his pen, so one family can sit in the base under
-- two or three separate surnames (MOREY, MOREZ, MORAY) - a family cut in
-- pieces, with fathers and sons recorded under different forms.
--
-- The surname column itself is RAW and is never rewritten: the priest really
-- did write MORAY. This is a derived grouping key that sits beside it.
--
-- Deliberately narrow. The obvious wider rule (also stripping a bare final
-- -e, -et, -er) was tested against a whole base and rejected: it merges
-- CLAUDE with CLAUDEZ, BARRE with BARRET, FOUQUE with FOUQUET - names that
-- differ by a real sound. Only -ay/-ey/-ez fold, and on the base it was built
-- for that rule produced zero false merges.
--
-- What it does NOT do, on purpose: the information is in the STEM, never in
-- the ending. MOURAY keeps a key of its own because the -ou- is audible and
-- may be a real variant. Fuzzy matching (pg_trgm) still bridges those in
-- search - that is its job, not this function's.
-- The folded ending becomes '~', and the choice of character is load-bearing
-- twice over. It must not be a letter the key could produce on its own:
-- folding to a plain 'e' makes CLAUDEZ collapse into CLAUDE, BORDEY into
-- BORDE, COLLEY into COLLE - names that differ by a real sound. And it must
-- survive lower(), so that feeding a key back through the function returns
-- itself instead of quietly folding a second time.
CREATE OR REPLACE FUNCTION surname_key(text) RETURNS text AS $$
    SELECT regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, $1)), '(ez|ey|ay)$', '~')
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- ---------------------------------------------------------------------------
-- COG reference (Code Officiel Geographique): the authoritative source of
-- truth for French admin names, loaded from geo.api.gouv.fr by db/load_cog.py.
-- NEVER derived from raw GEDCOM text. communes.nom/county/state are populated
-- and guarded against these tables (db/verify_communes.py).
-- ---------------------------------------------------------------------------
CREATE TABLE cog_regions (
    code  CHAR(2) PRIMARY KEY,              -- INSEE region code, e.g. '27'
    nom   TEXT NOT NULL                     -- 'Bourgogne-Franche-Comté'
);

CREATE TABLE cog_departements (
    code         TEXT PRIMARY KEY,          -- '70', '2A', '971'
    nom          TEXT NOT NULL,             -- 'Haute-Saône'
    region_code  CHAR(2) REFERENCES cog_regions(code)
);

CREATE TABLE cog_communes (
    insee        CHAR(5) PRIMARY KEY,       -- INSEE commune code, e.g. '70489'
    nom          TEXT NOT NULL,             -- official name, 'Servance-Miellin'
    dept_code    TEXT REFERENCES cog_departements(code),
    region_code  CHAR(2) REFERENCES cog_regions(code)
);

-- ---------------------------------------------------------------------------
-- Communes: French administrative entities referenced by the genealogy data,
-- one row per INSEE code actually used. The abstract commune that localities
-- belong to (the choropleth/aggregation unit). nom/county/state are
-- denormalized copies of the COG reference (cog_communes/_departements/
-- _regions), populated and verified by db/verify_communes.py - never derived
-- from raw GEDCOM strings.
-- ---------------------------------------------------------------------------
CREATE TABLE communes (
    insee        CHAR(5) PRIMARY KEY REFERENCES cog_communes(insee),
    nom          TEXT NOT NULL,             -- official name, e.g. 'Servance-Miellin'
    county       TEXT,                      -- department
    state        TEXT,                      -- region
    country      TEXT    DEFAULT 'France',
    country_iso  CHAR(2) DEFAULT 'FR'
);

-- ---------------------------------------------------------------------------
-- Memoized raw-string -> INSEE decisions. The matcher consults this first, so
-- a GEDCOM reload auto-resolves every string seen before; only genuinely new
-- raw strings need human/web judgment. source: 'web' | 'geo.api' | 'manual'.
-- ---------------------------------------------------------------------------
CREATE TABLE place_insee_overrides (
    raw     TEXT PRIMARY KEY,
    insee   CHAR(5) REFERENCES cog_communes(insee),
    source  TEXT,
    note    TEXT
);

-- ---------------------------------------------------------------------------
-- Places = localities (villages, hamlets, lieux-dits, and foreign places).
-- French localities link to a commune (commune_insee) and carry a `kind`;
-- foreign places have commune_insee NULL and kind NULL.
-- Populated during the harmonization pass, not during initial load.
-- ---------------------------------------------------------------------------
CREATE TABLE places (
    id            SERIAL PRIMARY KEY,
    raw           TEXT UNIQUE NOT NULL,
    name          TEXT,                      -- locality name (was `locality`)
    kind          TEXT CHECK (kind IS NULL OR kind IN ('chef-lieu','former-commune','hameau','lieu-dit')),
    county        TEXT,
    state         TEXT,
    country       TEXT,
    country_iso   CHAR(2),
    lat           DOUBLE PRECISION,
    lon           DOUBLE PRECISION,
    commune_insee CHAR(5) REFERENCES communes(insee),  -- NULL for foreign places
    description        TEXT, -- curated historical/descriptive text (db/seed_place_descriptions.py)
    description_source TEXT, -- attribution/source line for the description

    -- lat/lon are set together or not at all (a half-geocoded point is a bug)
    CONSTRAINT places_latlon_both CHECK ((lat IS NULL) = (lon IS NULL))
);

CREATE INDEX ON places (country_iso);
CREATE INDEX ON places (unaccent_lower(name));
CREATE INDEX ON places (lat, lon) WHERE lat IS NOT NULL;
CREATE INDEX ON places (commune_insee);
CREATE INDEX ON places (kind);

-- ---------------------------------------------------------------------------
-- Individuals
-- ---------------------------------------------------------------------------
CREATE TABLE individuals (
    id                    TEXT PRIMARY KEY,  -- GEDCOM @Ixxx@ stripped

    -- Names
    name                  TEXT,
    given_name            TEXT,
    surname               TEXT,
    nickname              TEXT,
    name_normalized       TEXT,              -- lower(unaccent(name)), filled on load
    given_name_normalized TEXT,

    sex                   TEXT CHECK (sex IN ('M', 'F', 'U', NULL)),
    occupation            TEXT,

    -- Birth
    birth_raw             TEXT,
    birth_qualifier       TEXT,
    birth_year            INT,
    birth_month           SMALLINT,
    birth_day             SMALLINT,
    birth_year2           INT,              -- end of range for BET/FROM
    birth_month2          SMALLINT,
    birth_day2            SMALLINT,
    birth_place_id        INT REFERENCES places(id),

    -- Death
    death_raw             TEXT,
    death_qualifier       TEXT,
    death_year            INT,
    death_month           SMALLINT,
    death_day             SMALLINT,
    death_year2           INT,
    death_month2          SMALLINT,
    death_day2            SMALLINT,
    death_place_id        INT REFERENCES places(id),

    -- Baptism
    baptism_raw           TEXT,
    baptism_qualifier     TEXT,
    baptism_year          INT,
    baptism_month         SMALLINT,
    baptism_day           SMALLINT,
    baptism_place_id      INT REFERENCES places(id),

    -- Burial
    burial_raw            TEXT,
    burial_qualifier      TEXT,
    burial_year           INT,
    burial_month          SMALLINT,
    burial_day            SMALLINT,
    burial_place_id       INT REFERENCES places(id),

    -- Vital-event notes (parsed from NOTE sub-records on each event)
    birth_note            TEXT,
    death_note            TEXT,
    baptism_note          TEXT,
    burial_note           TEXT,

    CONSTRAINT birth_year_range CHECK (birth_year IS NULL OR (birth_year >= -4000 AND birth_year <= 2100)),
    CONSTRAINT death_year_range CHECK (death_year IS NULL OR (death_year >= -4000 AND death_year <= 2100)),
    CONSTRAINT individuals_months_valid CHECK (
        (birth_month   IS NULL OR birth_month   BETWEEN 1 AND 12) AND
        (birth_month2  IS NULL OR birth_month2  BETWEEN 1 AND 12) AND
        (death_month   IS NULL OR death_month   BETWEEN 1 AND 12) AND
        (death_month2  IS NULL OR death_month2  BETWEEN 1 AND 12) AND
        (baptism_month IS NULL OR baptism_month BETWEEN 1 AND 12) AND
        (burial_month  IS NULL OR burial_month  BETWEEN 1 AND 12)
    ),
    CONSTRAINT individuals_days_valid CHECK (
        (birth_day   IS NULL OR birth_day   BETWEEN 1 AND 31) AND
        (birth_day2  IS NULL OR birth_day2  BETWEEN 1 AND 31) AND
        (death_day   IS NULL OR death_day   BETWEEN 1 AND 31) AND
        (death_day2  IS NULL OR death_day2  BETWEEN 1 AND 31) AND
        (baptism_day IS NULL OR baptism_day BETWEEN 1 AND 31) AND
        (burial_day  IS NULL OR burial_day  BETWEEN 1 AND 31)
    )
);

CREATE INDEX ON individuals (name_normalized);
CREATE INDEX ON individuals (given_name_normalized);
CREATE INDEX ON individuals (birth_year);
CREATE INDEX ON individuals (death_year);
CREATE INDEX ON individuals (occupation);
CREATE INDEX ON individuals (sex);
CREATE INDEX individuals_surname_norm_idx ON individuals (unaccent_lower(surname));
-- Groups the spelling variants of one surname (see surname_key() above).
CREATE INDEX individuals_surname_key_idx  ON individuals (surname_key(surname));

-- GIN trigram indexes for the ranked/fuzzy name search (search_individuals):
-- the `%` operator and similarity() scans hit these. Required, not optional.
CREATE INDEX idx_individuals_name_trgm      ON individuals USING gin (name_normalized gin_trgm_ops);
CREATE INDEX idx_individuals_surname_trgm   ON individuals USING gin (unaccent_lower(surname) gin_trgm_ops);
CREATE INDEX idx_individuals_givenname_trgm ON individuals USING gin (unaccent_lower(given_name) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Families
-- ---------------------------------------------------------------------------
CREATE TABLE families (
    id                  TEXT PRIMARY KEY,
    husband_id          TEXT REFERENCES individuals(id),
    wife_id             TEXT REFERENCES individuals(id),
    divorced            BOOLEAN NOT NULL DEFAULT FALSE,

    -- Marriage
    marriage_raw        TEXT,
    marriage_qualifier  TEXT,
    marriage_year       INT,
    marriage_month      SMALLINT,
    marriage_day        SMALLINT,
    marriage_place_id   INT REFERENCES places(id),
    marriage_note       TEXT,
    divorce_note        TEXT,

    -- Marriage contract (MARC): a distinct dated/located act from the marriage
    marriage_contract_raw       TEXT,
    marriage_contract_qualifier TEXT,
    marriage_contract_year      INT,
    marriage_contract_month     SMALLINT,
    marriage_contract_day       SMALLINT,
    marriage_contract_place_raw TEXT,
    marriage_contract_place_id  INT REFERENCES places(id),

    CONSTRAINT families_months_valid CHECK (
        (marriage_month          IS NULL OR marriage_month          BETWEEN 1 AND 12) AND
        (marriage_contract_month IS NULL OR marriage_contract_month BETWEEN 1 AND 12)
    ),
    CONSTRAINT families_days_valid CHECK (
        (marriage_day          IS NULL OR marriage_day          BETWEEN 1 AND 31) AND
        (marriage_contract_day IS NULL OR marriage_contract_day BETWEEN 1 AND 31)
    )
);

CREATE INDEX ON families (husband_id);
CREATE INDEX ON families (wife_id);
CREATE INDEX ON families (marriage_year);

-- ---------------------------------------------------------------------------
-- Family-child links
-- ---------------------------------------------------------------------------
CREATE TABLE family_children (
    family_id   TEXT NOT NULL REFERENCES families(id),
    child_id    TEXT NOT NULL REFERENCES individuals(id),
    PRIMARY KEY (family_id, child_id)
);

CREATE INDEX ON family_children (child_id);

-- ---------------------------------------------------------------------------
-- Events (EVEN tags on individuals and families)
-- Unified table; exactly one of individual_id / family_id must be set.
-- ---------------------------------------------------------------------------
CREATE TABLE events (
    id              SERIAL PRIMARY KEY,
    individual_id   TEXT REFERENCES individuals(id),
    family_id       TEXT REFERENCES families(id),
    type            TEXT,
    date_raw        TEXT,
    date_qualifier  TEXT,
    date_year       INT,
    date_month      SMALLINT,
    date_day        SMALLINT,
    date_year2      INT,
    date_month2     SMALLINT,
    date_day2       SMALLINT,
    place_raw       TEXT,
    place_id        INT REFERENCES places(id),
    note            TEXT,

    CONSTRAINT one_owner CHECK (
        (individual_id IS NOT NULL) != (family_id IS NOT NULL)
    ),
    CONSTRAINT events_months_valid CHECK (
        (date_month  IS NULL OR date_month  BETWEEN 1 AND 12) AND
        (date_month2 IS NULL OR date_month2 BETWEEN 1 AND 12)
    ),
    CONSTRAINT events_days_valid CHECK (
        (date_day  IS NULL OR date_day  BETWEEN 1 AND 31) AND
        (date_day2 IS NULL OR date_day2 BETWEEN 1 AND 31)
    )
);

CREATE INDEX ON events (individual_id);
CREATE INDEX ON events (family_id);
CREATE INDEX ON events (type);
CREATE INDEX ON events (date_year);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
CREATE TABLE notes (
    id              SERIAL PRIMARY KEY,
    individual_id   TEXT REFERENCES individuals(id),
    family_id       TEXT REFERENCES families(id),
    body            TEXT,

    CONSTRAINT one_owner CHECK (
        (individual_id IS NOT NULL) != (family_id IS NOT NULL)
    )
);

CREATE INDEX ON notes (individual_id);
CREATE INDEX ON notes (family_id);

-- ---------------------------------------------------------------------------
-- Source citations (SOUR), attached to a record or a specific vital event.
-- scope: birth/death/baptism/burial/marriage (the event the citation supports)
--        or 'record' for a record-level citation on the individual/family.
-- ---------------------------------------------------------------------------
CREATE TABLE sources (
    id              SERIAL PRIMARY KEY,
    individual_id   TEXT REFERENCES individuals(id),
    family_id       TEXT REFERENCES families(id),
    scope           TEXT NOT NULL,
    citation        TEXT NOT NULL,

    CONSTRAINT sources_one_owner CHECK (
        (individual_id IS NOT NULL) != (family_id IS NOT NULL)
    ),
    CONSTRAINT sources_scope_valid CHECK (
        scope IN ('birth','death','baptism','burial','marriage','record')
    )
);

CREATE INDEX ON sources (individual_id);
CREATE INDEX ON sources (family_id);

-- ---------------------------------------------------------------------------
-- Titles and media (individual only)
-- ---------------------------------------------------------------------------
CREATE TABLE titles (
    id              SERIAL PRIMARY KEY,
    individual_id   TEXT NOT NULL REFERENCES individuals(id),
    title           TEXT,
    note            TEXT              -- NOTE sub-record on the TITL (rare)
);

CREATE INDEX ON titles (individual_id);

CREATE TABLE media (
    id              SERIAL PRIMARY KEY,
    individual_id   TEXT NOT NULL REFERENCES individuals(id),
    file            TEXT
);

CREATE INDEX ON media (individual_id);

-- ---------------------------------------------------------------------------
-- Professions (normalized occupations - métiers only)
-- ---------------------------------------------------------------------------

CREATE TABLE professions (
    id       SERIAL PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    category TEXT   -- agriculture | artisanat | textile | maritime | mines |
               --   commerce | droit | médecine | militaire | administration |
               --   journalier | religion | enseignement
);

COMMENT ON TABLE professions IS
  'Canonical occupation names, normalized from the raw OCCU strings in the GEDCOM file. '
  'Strictly métiers (occupations). Noble ranks go to the titles table; '
  'historical distinctions go to the distinctions table.';

CREATE TABLE individual_professions (
    individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    profession_id INT  NOT NULL REFERENCES professions(id) ON DELETE CASCADE,
    note          TEXT,   -- contextual detail: location ("à Remiremont"), period ("(1588-1599)"), etc.
    PRIMARY KEY (individual_id, profession_id)
);

CREATE INDEX ON individual_professions (profession_id);

-- ---------------------------------------------------------------------------
-- Distinctions (normalized historical participatory distinctions)
-- ---------------------------------------------------------------------------

CREATE TABLE distinctions (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    category   TEXT,           -- croisade | guerre | ...
    year_start INT,            -- first year of the event (e.g. 1096 for 1st Crusade)
    year_end   INT             -- last year (equal to year_start for single-year events)
);

COMMENT ON TABLE distinctions IS
  'Normalized historical distinctions shared by multiple individuals '
  '(e.g. participation in a Crusade, Mort pour la France). '
  'category groups entries (croisade, guerre, ...).';

CREATE TABLE individual_distinctions (
    individual_id  TEXT NOT NULL REFERENCES individuals(id)  ON DELETE CASCADE,
    distinction_id INT  NOT NULL REFERENCES distinctions(id) ON DELETE CASCADE,
    note           TEXT,       -- per-individual context (battle, unit, circumstance)
    PRIMARY KEY (individual_id, distinction_id)
);

CREATE INDEX ON individual_distinctions (distinction_id);

-- ---------------------------------------------------------------------------
-- Military ranks
-- ---------------------------------------------------------------------------

CREATE TABLE military_ranks (
    id      SERIAL PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,
    branch  TEXT,   -- armée-de-terre | marine | gendarmerie | garde | étranger
    grade   INT,    -- 1=soldat ... 14=maréchal, for ordering/display
    era     TEXT    -- ancien-régime | révolution | empire | moderne | médiéval | antique
);

CREATE TABLE individual_military_ranks (
    individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    rank_id       INT  NOT NULL REFERENCES military_ranks(id) ON DELETE CASCADE,
    year_start    INT,
    year_end      INT,
    regiment      TEXT,   -- "Régiment Royal Corse", "Génie", "lanciers", etc.
    note          TEXT,   -- free-form context
    PRIMARY KEY (individual_id, rank_id)
);

CREATE INDEX ON individual_military_ranks (rank_id);

-- ---------------------------------------------------------------------------
-- Historical bans (seigneurial territories, pre-Revolution)
-- ---------------------------------------------------------------------------

CREATE TABLE bans (
    id               serial PRIMARY KEY,
    name             text NOT NULL,
    origin_note      text,
    suzerain         text,
    lords_succession text,
    parishes         text,
    abolished_year   smallint NOT NULL DEFAULT 1789,
    abolition_note   text,
    notes            text
);

COMMENT ON TABLE bans IS
  'Historical seigneurial bans: pre-Revolution territorial units in Lorraine/Vosges, '
  'held by a lord under the suzerainty of the Abbey of Remiremont or the Duke of Lorraine. '
  'Abolished in 1789 and replaced by communes.';

CREATE TABLE ban_communes (
    ban_id          int     NOT NULL REFERENCES bans(id) ON DELETE CASCADE,
    commune_insee   char(5) NOT NULL REFERENCES cog_communes(insee),
    role            text,
    notes           text,
    PRIMARY KEY (ban_id, commune_insee)
);

COMMENT ON TABLE ban_communes IS
  'Maps each historical ban to the modern INSEE communes that cover its former territory.';

CREATE TABLE ban_localities (
    id        serial PRIMARY KEY,
    ban_id    int NOT NULL REFERENCES bans(id) ON DELETE CASCADE,
    place_id  int REFERENCES places(id),
    name      text NOT NULL,
    parish    text,
    notes     text
);

COMMENT ON TABLE ban_localities IS
  'Historical hamlets, villages and localities within a ban. '
  'place_id links to our places table where the locality is already geocoded.';

CREATE INDEX ON ban_localities (ban_id);
CREATE INDEX ON ban_localities (place_id);

-- ---------------------------------------------------------------------------
-- Correction registries: the hand-made decisions on the RAW layer, recorded so
-- that a reload replays them and the fidelity check (db/reconcile.py) knows
-- them. Populated by versioned seed scripts, never by hand:
--   raw_corrections  <- db/seed_raw_corrections.py   (a column changed or emptied)
--   deleted_notes    <- db/seed_deleted_notes.py     (a whole `notes` row removed)
--   deleted_note_lines <- db/seed_deleted_note_lines.py (one LINE of a note removed,
--                        the rest of the body kept - the case the other two cannot
--                        express, and the one a note-count check cannot see)
-- Both are keyed on GEDCOM ids and are rewritten by db/migrate_export.py when an
-- export renumbers people.
-- ---------------------------------------------------------------------------
CREATE TABLE raw_corrections (
    record_id        TEXT NOT NULL,
    column_name      TEXT NOT NULL,
    table_name       TEXT NOT NULL,
    source_value     TEXT NOT NULL,   -- what the GEDCOM says
    corrected_value  TEXT NOT NULL,   -- what the DB holds; '' = deliberately emptied
    reason           TEXT,
    PRIMARY KEY (record_id, column_name)
);

CREATE TABLE deleted_notes (
    individual_id  TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    body           TEXT NOT NULL,    -- the note exactly as the parsed JSON has it
    moved_to       TEXT,             -- where the locality it stated now lives
    reason         TEXT,
    PRIMARY KEY (individual_id, body)
);

CREATE TABLE deleted_note_lines (
    individual_id  TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    line           TEXT NOT NULL,    -- one line of a note, exactly as the JSON has it
    moved_to       TEXT,             -- where the locality it stated now lives
    reason         TEXT,
    PRIMARY KEY (individual_id, line)
);

-- The fourth registry records ADDITIONS rather than changes: the people,
-- families, child links, events, notes and sources that the research put into
-- the tree on top of the GEDCOM export. The site's tree is the research tree,
-- built on the export, not a mirror of it. Populated by
-- db/seed_tree_additions.py in the research repo, which deletes its previous
-- rows, re-inserts them and re-registers them, so a reload replays it whole.
-- Added people and families carry ids prefixed 'Q' (never 'I'/'F'). row_key is
-- the id for individuals/families, 'family_id|child_id' for family_children,
-- and the serial id for events/notes/sources. db/reconcile.py subtracts these
-- rows from its JSON <-> DB comparison.
CREATE TABLE tree_additions (
    table_name  TEXT NOT NULL,
    row_key     TEXT NOT NULL,
    reason      TEXT,
    PRIMARY KEY (table_name, row_key),
    CONSTRAINT tree_additions_table_valid CHECK (
        table_name IN ('individuals','families','family_children','events','notes','sources')
    )
);

-- ---------------------------------------------------------------------------
-- Convenience views
-- ---------------------------------------------------------------------------

-- Parent-child edges for recursive ancestor/descendant CTEs:
--   WITH RECURSIVE anc AS (
--     SELECT father_id, mother_id FROM parent_child WHERE child_id = $1
--     UNION ALL
--     SELECT pc.father_id, pc.mother_id FROM parent_child pc JOIN anc ON pc.child_id = anc.father_id OR pc.child_id = anc.mother_id
--   )
CREATE VIEW parent_child AS
SELECT
    fc.child_id,
    f.husband_id AS father_id,
    f.wife_id    AS mother_id,
    f.id         AS family_id
FROM family_children fc
JOIN families f ON f.id = fc.family_id;
