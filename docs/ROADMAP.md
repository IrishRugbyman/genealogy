# Roadmap

Forward-looking only. The viewer's history up to the 2026-10-04 split lives in the private
research repo's CHANGELOG.

---

## Phase 10 - Photos

*Goal: Display the 443 media references already in the `media` table on person
pages. The `media.file` field holds GEDCOM-relative paths; serve the files as
static assets and surface them on the person detail page.*

### Database / API
- [ ] Inspect `media` rows to understand actual file path patterns
      (`SELECT file FROM media LIMIT 20`)
- [ ] Decide on serving strategy: nginx static dir vs. `GET /api/media/{id}` stream
- [ ] Add `GET /api/people/{id}/media` route (or include in existing person response)
      returning `[{id, file, url}]`
- [ ] Add `MediaOut` Pydantic schema
- [ ] Configure nginx or API to serve/proxy the actual files from disk; document
      the path in CLAUDE.md

### Frontend
- [ ] Add photo strip / gallery section to `people.$id.tsx` below vital events
      (thumbnails, click to full-size)
- [ ] If a person has media, show the first image as a portrait in the page header
- [ ] Handle missing files gracefully (no broken-image icons)

### Definition of Done
- At least one person page shows their photo(s)
- Missing files degrade gracefully
- Photo storage path documented in CLAUDE.md

---

## Phase 11 - Source citations UI

*Goal: Surface the 116 source citations from the `sources` table on person and
family pages. Currently loaded by `load_event_extras.py` but never displayed.*

### Schema
`sources(id, individual_id, family_id, scope, citation)` where `scope` is
`birth/death/baptism/burial/marriage/record`.

### API
- [ ] Add `sources` list to `get_person()` in `db/queries.py`, grouped by scope
- [ ] Add `sources` list to `get_family()` for marriage sources
- [ ] Add `SourceOut` schema to `api/app/schemas.py`
- [ ] Expose on `GET /api/people/{id}` and `GET /api/families/{id}` responses

### Frontend
- [ ] On `people.$id.tsx`: show per-event citations beneath each event card
      (small italic text); `scope='record'` sources go in a bottom "Sources" section
- [ ] On `families.$id.tsx`: show marriage sources under the marriage date/place

### Definition of Done
- Person pages with source rows display citations under the relevant event
- Family pages show marriage sources
- Citations are visually de-emphasised (don't crowd the event cards)

---

## Phase 12 - On This Day + homepage enhancements

*Goal: Add a "Today in your family history" widget to the homepage, surfacing
birthdays and death anniversaries matching the current date.*

### API
- [ ] Verify `GET /api/onthisday` response shape; add marriage anniversaries if missing
- [ ] Confirm it returns `{individuals: [{id, name, event_type, year}]}` or similar

### Frontend
- [ ] Add a "On This Day" card at the top of `index.tsx` (above or beside the search bar)
      showing up to 5 family events for today's date
- [ ] Each entry links to `/people/$id` or `/families/$id`
- [ ] Hide the card entirely if the API returns 0 events for today
- [ ] Add `useOnThisDay` hook in `lib/api.ts`
- [ ] Add a stats mini-strip below the search bar: total individuals, families, places,
      oldest ancestor - fetched from `/api/stats` (already cached 1h)
- [ ] Auto-focus the search input on load (desktop only via `useEffect`)

### Definition of Done
- Widget appears on dates that have events, links work correctly
- Widget is absent (not empty) on dates with no events
- Stats strip shows correct totals from `/api/stats`

---

## Deliberately Not Building

- **GEDCOM editing / write-back** - the app is read-only; editing stays in the
  GEDCOM file and re-ingest
- **Multi-user auth** - personal use only; the API is read-only and unauthenticated
- **Real-time collab / CRDT** - no need for a single user
- **Native mobile app** - the SPA is responsive enough
- **AI chat / RAG over the tree** - out of scope; would need a GPU or paid API budget
- **GEDCOM export** - the original `.ged` file is the source of truth; no need to
  round-trip through the DB
