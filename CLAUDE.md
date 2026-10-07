# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The **viewer** of a family tree: a read-only FastAPI backend and a React SPA over a
PostgreSQL database `genealogy`. Nothing here writes to the database. The data is built by
an ETL pipeline that lives in a **separate, private repository**, together with the archive
research that feeds it; this repo only reads what that pipeline produced.

**This repository is public.** Never commit anything that names a person in the tree, any
research note or act scan, or a deployment secret. Everything specific to one family (the
Sosa root, the branch names, the upload password, who to contact) is deployment config
in a gitignored env file (see "Configuration"), and the code must keep working without any
of it.

## Where the guidance lives

| File | Covers |
|---|---|
| `api/CLAUDE.md` | FastAPI app, routers, the upload route, tests, service |
| `frontend/CLAUDE.md` | React SPA, routing, map rendering model, build |
| `docs/ROADMAP.md` | Planned viewer features (forward-looking only) |

## Layout and the contract

```
db/schema.sql    the database schema: tables, views, immutable SQL functions
db/queries.py    every SQL query the app runs (no ORM, plain psycopg2)
api/             FastAPI, imports db/queries.py through api/app/db.py
frontend/        Vite + React SPA, talks only to /api
```

`db/schema.sql` and `db/queries.py` are the **contract** with the ETL repo: it creates the
database from this `schema.sql` and its query CLI imports this `queries.py`, both by path
(the two repos are checked out side by side). So a change to either file is a change to
the ETL's input: rename a column or a function here, and the ETL breaks until it follows.

## Configuration

All deployment-specific values come from `api/.env` (read by the systemd unit through
`EnvironmentFile`, and by the test suite's `conftest.py`) or, for the frontend, from
`frontend/.env.local` at build time. Both files are gitignored.

| Variable | Used for | Unset |
|---|---|---|
| `GENEALOGY_DSN` | PostgreSQL DSN | `dbname=genealogy` (peer auth) |
| `GENEALOGY_SOSA_ROOT` | Individual id numbered Sosa 1 | no Sosa numbering at all |
| `GENEALOGY_BRANCH_LABELS` | Names of branch 1 (root's father's side) and 2, comma-separated | `Paternelle,Maternelle` |
| `GENEALOGY_UPLOAD_PASSWORD` | Shared password of the `/depot` upload page | uploads refused (503) |
| `GENEALOGY_VIEW_PASSWORD` | Family password that unlocks the living (see below) | the upload password; neither set = nobody can unlock, the living stay hidden |
| `GENEALOGY_DEPOT_DIR` | Where `/depot` batches land | uploads refused (503) |
| `VITE_DEPOT_CONTACT` | Who the depot page says to warn on an error | "l'administrateur du site" |
| `VITE_CARTO_KEY` | CARTO basemaps key for the map tiles (same account as the freight app) | tiles show an "API KEY REQUIRED" watermark |

The Sosa root and branch labels reach the frontend through `GET /api/tree`, never through
a constant.

## Commands

```bash
# API (FastAPI, port 8005)
cd api && .venv/bin/uvicorn app.main:app --reload        # dev server
api/.venv/bin/python -m pytest api/tests                  # suite (skips if the DB is unreachable)
sudo systemctl restart genealogy-api

# Frontend (Vite + React, port 5173)
cd frontend && npm run dev     # proxies /api -> localhost:8005
npm run build                  # -> dist/, served by nginx (no reload needed)
npm run type-check             # tsc -b

# Python lint (global ruff config, line-length 100, py311, Google docstrings)
ruff check db/ api/ && ruff format db/ api/
```

The tree is lint-clean; keep it that way (pre-commit runs ruff on every commit).

## Conventions that cross every layer

- `individuals.id` and `families.id` are the **GEDCOM id strings** (`I123`, `F45`), not
  serials.
- Name placeholders: lowercase `n` is an unknown first name, uppercase `N` an unknown last
  name (sources also use `?` and `x`). Anything matching people must treat these as
  *absent*, never as a name - they collide by the hundred.
- Dates follow the full GEDCOM model: `qualifier` (ABT/BEF/AFT/BET/FROM), `year`/`month`/`day`
  plus `year2`/`month2`/`day2` for ranges. Never render a bare year without its qualifier.
- **Commune vs locality.** A `communes` row is one French INSEE code; a `places` row is a
  locality (village, hamlet, lieu-dit, or foreign place) pointing at its commune via
  `commune_insee`. No place row "is" a commune. Events link to *localities*
  (`*_place_id`), and the commune is reached through the FK. This shapes the API
  (`/api/places/{id}` vs `/api/communes/{insee}`), the frontend routes and the map layers.
- The tree is **endogamous**: recursive ancestor CTEs use `UNION`, not `UNION ALL`, or they
  never terminate.
- **The living are private.** Anyone with no recorded death who was born, or is estimated
  born, less than 100 years ago (`queries.infer_living`) is masked as "Personne vivante" for
  a visitor who has not signed in with the family password, and left out of every listing.
  The masking is one response middleware (`api/app/privacy.py`), so a new endpoint is
  covered without doing anything; `api/tests/test_privacy.py` checks no route leaks.

## Deployment

- API: systemd `genealogy-api.service` (`api/genealogy-api.service`), 2 uvicorn workers,
  `127.0.0.1:8005`
- Frontend: `npm run build` -> `frontend/dist/`, served directly by nginx
- Nginx sends `Cache-Control: no-cache` on `index.html` (every SPA route falls back to it)
  and a one-year immutable cache on `/assets/`. Without the first, browsers guess a lifetime
  from `Last-Modified` and keep running an old build for days after a deploy.
- Nginx: `api/nginx-genealogy.conf` is a reference copy. The live vhost in
  `/etc/nginx/sites-enabled/` is a regular file carrying certbot's TLS block, so an edit
  here must be carried over by hand (the header of that file says how)
