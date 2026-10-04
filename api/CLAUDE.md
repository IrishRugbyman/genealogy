# CLAUDE.md - api/

Read-only FastAPI backend over the `genealogy` database, port 8005. Read `../CLAUDE.md`
first: it holds the contract (`db/schema.sql`, `db/queries.py`) and the configuration table.

## The one hard rule

**No SQL in this directory.** Every query lives in `db/queries.py`, imported by the routers
and by the ETL repo's query CLI so both stay in step. A router's job is: validate parameters, call a query
function, shape the response through a Pydantic model. If you need new data, add a function
in `db/queries.py`.

## Layout

```
app/
  main.py      # app setup, lifespan (opens the connection pool, reads the Sosa root and
               # branch labels from the env, builds the Sosa map), CORS, rate limiting
  db.py        # ThreadedConnectionPool, get_cursor() dependency, DSN from $GENEALOGY_DSN
  schemas.py   # Pydantic v2 models mirroring what the queries return
  routers/
    search.py         # GET /api/search - name, surname, place, year range, sex, pagination
    people.py         # /api/people/{id}, /ancestors, /descendants, /sosa, /common-ancestors
    families.py       # /api/families, /api/families/count, /api/families/{id}
    places.py         # /api/places/{id} (locality), /api/communes/{insee} (commune)
    stats.py          # /api/stats (1h cache), /api/tree (root + branch labels),
                      # /api/stats/pedigree, /api/places (geocoded list),
                      # /api/places/gaps, /api/onthisday
    geo.py            # /api/geo/{countries|regions|departments|communes} - GeoJSON choropleth
    professions.py    # /api/professions, /api/professions/{id}
    distinctions.py   # /api/distinctions, /api/distinctions/{id}
    military_ranks.py # /api/military-ranks, /api/military-ranks/{id}
    bans.py           # /api/bans, /api/bans/{id} - BAN locality reference
    uploads.py        # POST /api/uploads (+ /auth) - the only write route
  limiter.py   # the shared slowapi Limiter, keyed on the real client IP
               # (CF-Connecting-IP / X-Forwarded-For, not the Cloudflare edge)
```

## The one write route

`POST /api/uploads` backs the `/depot` page: the family drops act scans and photos there
instead of mailing them. It writes **files, never the database** - a batch lands in
`$GENEALOGY_DEPOT_DIR/<batch>/` with a `meta.json`, and the sender's message is also
appended to `JOURNAL.md` in that directory - so the "nothing in the app writes to the DB"
rule is intact. On this server the depot sits inside the research repo, where the triage
happens; that repo documents it.

It is gated by one shared password, `$GENEALOGY_UPLOAD_PASSWORD`, read from `api/.env`.
With either variable unset the route answers 503: uploads are off, never open. The password
keeps a public URL from being a free file drop; it is not an account system and must not be
mistaken for one. What actually protects the disk is the rest:
extension whitelist plus a magic-byte sniff, 40 Mo per file, 250 Mo and 20 files per batch
enforced while streaming, and a batch that deletes itself whole if any file is refused.

`/api/places` (the geocoded list, in `stats.py`) and `/api/places/{id}` (locality detail, in
`places.py`) are deliberately different endpoints: the list feeds the map, the detail is the
locality page.

Routes receive a psycopg2 `RealDictCursor` through `Depends(get_cursor)`; the dependency
returns the connection to the pool in its own `finally`, so routers must not close anything.

`/api/stats` is cached for an hour in-process. After an ETL run that changes counts, restart
the service or the site keeps showing the old numbers.

## Commands

```bash
cd api
source .venv/bin/activate                 # or: uv venv && uv pip install -e '.[test]'
uvicorn app.main:app --reload             # dev server

.venv/bin/python -m pytest                # whole suite
.venv/bin/python -m pytest tests/test_people.py -q            # one file
.venv/bin/python -m pytest tests/test_people.py::test_sosa_root_is_one    # one test

sudo systemctl restart genealogy-api
sudo journalctl -u genealogy-api -n 50 --no-pager
```

The suite runs against the **real** read-only database (safe, since the API never writes) and
**skips itself entirely if the DB is unreachable** - a green run on a machine without
PostgreSQL proves nothing. `conftest.py` loads `api/.env` (without overriding the shell), so
the Sosa tests use the deployment's root; with no root configured they skip. Sample people
and surnames are discovered from the data, never hardcoded. One `TestClient` per session: entering its context manager runs
the lifespan, which opens the pool and builds the Sosa map.

## Deployment

systemd `genealogy-api.service`, 2 uvicorn workers on `127.0.0.1:8005`, behind the nginx
vhost. `api/nginx-genealogy.conf` is a reference copy, not the live file: the one in
`/etc/nginx/sites-enabled/` is a regular file with certbot's TLS block added. The DSN comes
from `$GENEALOGY_DSN`, defaulting to peer auth on the Unix socket.
