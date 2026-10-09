# Changelog

What was built in the viewer, and why. Forward-looking plan: `docs/ROADMAP.md`.
History before the 2026-10-04 split lives in the private research repo's CHANGELOG.
This repo is public: entries name no person, only code, routes and tables.

---

## 2026-10-09 - Docs: this changelog opens

Viewer work had been logged in the research repo's CHANGELOG, mixed with research
findings. From here on it is logged here; the entries below were reconstructed from the
commit history since the split. Phase 11 (source citations) closed in the ROADMAP.

---

## 2026-10-08 - Sources: a registry, a page per source, the text of each act

**Built:**
- **Schema.** The free-text `sources` table is replaced by three tables:
  - `sources`, the work ;
  - `citations`, a place in it: act, call number, page, abstract, transcription, and
    `cites_source_id` for a work reported second-hand ;
  - `citation_links`, a citation backing an individual, a family or an event, with a
    scope and a note.

  `raw_corrections.citation_id` names the act behind a correction, and `tree_additions`
  accepts `citation_links`.
- **Three origins.** `export` (the GEDCOM's SOUR lines, keyed by a hash of their text, so
  a reload keeps the URL), `research` (readable keys) and, later the same day, `notes`
  (sources the compiler names inside his notes, quoted verbatim). Each has its own badge
  on citations and its own group on the Sources page.
- **API.**
  - `/api/sources` lists the bibliography.
  - `/api/sources/{id}` returns each act read in a source, with its public transcription,
    the records it backs and the corrections it supports.
  - `/api/citations/{id}/images/{n}` serves the act's scans to the signed-in family only
    (403 otherwise), read from `$GENEALOGY_ACTES_DIR`.
  - Person, family and event responses carry their citations.
- **Front.** A Sources page (a filterable bibliography), one page per source, and a
  `Citation` component under events and in the record's sources, on person and family
  pages. `Transcript.tsx` renders the act texts with a minimal Markdown renderer, without
  a library.
- **Logo.** `tree.svg` was referenced but missing, so browsers showed a generic globe. It
  is now an ascending tree on the accent colour, with a 32 px PNG and an Apple touch icon.

**Fixed:** a browser holding an hour-old cached `/api/sources/{id}` response crashed the
page for lack of a new field. The source routes are now `no-cache`, and the front
tolerates a missing `images` field.

---

## 2026-10-08 - Schema: `tree_additions`

The registry of the research tree's additions, replayed after each reload of the export,
so that what research adds to the tree survives a re-import.

---

## 2026-10-07 - Living people masked, family access, readable text, the tree in one request

- **Privacy.** A person counts as living if:
  - no death or burial is recorded, and
  - they were born, or are estimated born (from a spouse, a marriage, children or
    parents), less than 100 years ago.

  Living people are shown as « Personne vivante » to visitors who are not signed in, and
  are left out of every list. A response middleware (`api/app/privacy.py`) recognises
  people by their keys, not by route, so a new endpoint is covered by default.
  `/api/search` and `/api/families` exclude them in SQL, which keeps pagination and counts
  right. `test_privacy.py` walks every route that reaches a living person.
- **Family access.** `POST /api/session` with the family password sets a signed HttpOnly
  cookie. `robots.txt`, a noindex meta tag and `X-Robots-Tag` keep the site out of search
  engines.
- **Readability.** The type scale goes from 12/14 to 13/15 px, in rem, with an « Aa »
  button for 100, 112.5 or 125 %, remembered per device.
- **Corrections.** A « Corriger ou compléter » button on each record opens
  `/depot?person=`. A submission can be a message alone.
- **Tree.** It used to open on one generation and fetch each person's full record, one
  request per box.
  - It now opens on three generations of ancestors (two on a phone) and one of
    descendants, from a single request: `GET /api/people/{id}/tree?up=&down=`.
  - Unfolding a box loads what it reveals in one batch: `GET /api/people?ids=`.
  - A masked living person keeps their parent and child links, without which the tree
    could not climb from a living root. The links name no one, and a test checks it.
- **Menu.** It keeps four entries (Recherche, Arbre, Carte, Dépôt) and moves the reference
  pages under « Explorer ».
- **Map.** Since late August 2026, CARTO raster tiles answer key-less requests with a
  valid image stamped « API KEY REQUIRED ». The key now comes from `VITE_CARTO_KEY`.

---

## 2026-10-05 - Schema: `unaccent` qualified by its schema

`pg_dump` and `pg_restore` run with an empty `search_path`, so `unaccent_lower()` and
`surname_key()` failed while rebuilding their indexes and no backup restored. The function
and its dictionary are now schema-qualified. Same results, same indexes.

---

## 2026-10-04 - The viewer becomes its own public repo

FastAPI + React over the family tree database, split from the research repo with a fresh
history. Everything family-specific is deployment config in the gitignored `.env` files.
