# genealogy

A read-only web viewer for a family tree of some 13,000 people: search, person and family
pages, an hourglass tree, relationship paths, a choropleth map of French communes, and
statistics such as pedigree collapse.

- **Backend**: FastAPI over PostgreSQL, plain SQL in one query layer (`db/queries.py`), no ORM
- **Frontend**: React 19, Vite, TanStack Router and Query, Leaflet, d3-hierarchy
- **Places**: every French locality resolved to its official INSEE commune (COG), so
  hamlets, former communes and merged communes roll up correctly on the map

The database is built by a separate, private ETL pipeline from a GEDCOM export. This
repository only reads it: the one write route accepts file uploads into a directory, never
into the database.

## Running it

```bash
# API
cd api
uv venv && uv pip install -e '.[test]'
cp .env.example .env          # optional: Sosa root, branch labels, upload settings
.venv/bin/uvicorn app.main:app --reload --port 8005

# Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxies /api to :8005
```

The schema is `db/schema.sql`. The API tests run against a live database and skip
themselves when none is reachable.

## Layout

```
db/        schema.sql and queries.py, the contract with the ETL
api/       FastAPI app, routers, tests, systemd unit, nginx reference vhost
frontend/  the SPA
```

`CLAUDE.md` and the per-directory `CLAUDE.md` files document conventions and design
decisions in more depth.
