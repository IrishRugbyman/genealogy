import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import type { FeatureCollection, Feature } from 'geojson'
import type { PlaceGeo } from '@/lib/api'
import { useResolvedTheme } from '@/lib/theme'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export type ViewMode = 'country' | 'region' | 'department' | 'commune'

interface Props {
  places: PlaceGeo[]
  mode: ViewMode
  onModeChange: (m: ViewMode) => void
  layerLoading: Record<ViewMode, boolean>
  countries:   FeatureCollection | undefined
  regions:     FeatureCollection | undefined
  departments: FeatureCollection | undefined
  communes:    FeatureCollection | undefined
}

// ---------------------------------------------------------------------------
// Granularity: which mode a non-French place belongs to
// ---------------------------------------------------------------------------

function placeGranularity(p: PlaceGeo): ViewMode {
  if (p.locality) return 'commune'
  if (p.county)   return 'department'
  if (p.state)    return 'region'
  return 'country'
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/* Leaflet writes colours into SVG presentation attributes, where var() does
   not resolve, so the map cannot ride the CSS custom properties like the rest
   of the app. The two ramps are therefore materialised here and the layers are
   rebuilt when the theme flips.

   The choropleth is SEQUENTIAL: one hue (the accent), six steps, monotone in
   lightness. Both ramps were machine-checked for monotonicity, adjacent step
   separation, and a light end that still clears its own surface, so the
   emptiest band is visible rather than invisible. */

interface MapPalette {
  ramp: string[]
  empty: string
  boundary: string
  hover: string
  /** Non-French place markers: same hue as the choropleth, they are the same
      measure seen as points instead of polygons. */
  marker: string
  markerEdge: string
  /** Hamlets are a different KIND of thing, so they take a different slot. */
  hamlet: string
  hamletEdge: string
  link: string
  tiles: string
}

/* CARTO raster basemap. Since late August 2026 the keyless endpoint answers
   every tile with a valid PNG reading "API KEY REQUIRED" (HTTP 200: nothing
   errors, the map is just defaced). The key comes from VITE_CARTO_KEY in the
   gitignored .env.local; a browser basemap key is public by construction, CARTO
   itself puts it in the tile URL. Free tier: 5M tile requests a month. */
const CARTO_KEY = import.meta.env.VITE_CARTO_KEY as string | undefined

function cartoTiles(style: 'light_all' | 'dark_all'): string {
  const url = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`
  return CARTO_KEY ? `${url}?key=${encodeURIComponent(CARTO_KEY)}` : url
}

const PALETTES: Record<'light' | 'dark', MapPalette> = {
  light: {
    ramp:       ['#ea9b7c', '#df7f59', '#cf663b', '#bb4f1d', '#a23d07', '#833006'],
    empty:      'rgba(120,113,108,0.08)',
    boundary:   'rgba(80,60,50,0.45)',
    hover:      '#833006',
    marker:     '#bb4f1d',
    markerEdge: '#833006',
    hamlet:     '#3c5db9',
    hamletEdge: '#2a4287',
    link:       '#a24112',
    tiles:      cartoTiles('light_all'),
  },
  dark: {
    ramp:       ['#773e22', '#974a24', '#b55a2d', '#d16c3b', '#e78354', '#f5a27c'],
    empty:      'rgba(200,190,185,0.06)',
    boundary:   'rgba(255,225,210,0.28)',
    hover:      '#f5a27c',
    marker:     '#e78354',
    markerEdge: '#f5a27c',
    hamlet:     '#5176d4',
    hamletEdge: '#8aa6e6',
    link:       '#ea9162',
    tiles:      cartoTiles('dark_all'),
  },
}

/** sqrt, because the distribution is heavy-tailed: a handful of communes hold
    most of the events and a linear scale would flatten everywhere else. */
function choroplethColor(count: number, max: number, pal: MapPalette): string {
  if (count === 0 || max === 0) return pal.empty
  const ratio = Math.sqrt(count / max)
  const i = Math.min(pal.ramp.length - 1, Math.floor(ratio * pal.ramp.length))
  return pal.ramp[i]
}

// ---------------------------------------------------------------------------
// Popup builder (shared across all layers; API always sends display_name etc.)
// ---------------------------------------------------------------------------

function choroplethPopup(props: Record<string, unknown>, pal: MapPalette): string {
  const name  = props.display_name as string
  const b = (props.birth_count     as number) || 0
  const d = (props.death_count     as number) || 0
  const m = (props.marriage_count  as number) || 0
  const insee = props.insee as string | undefined
  // Commune features carry an INSEE -> link to the commune page; aggregate layers
  // (country/region/department) don't, so the link only appears at commune level.
  const link = insee
    ? `<br/><a href="/communes/${insee}" style="color:${pal.link};text-decoration:none;font-size:0.8125rem">Voir les personnes &rarr;</a>`
    : ''
  const total = b + d + m
  if (total === 0) return `<strong>${name}</strong><br/><span>Aucun événement</span>${link}`
  const detail = [b && `${b} naiss.`, d && `${d} décès`, m && `${m} mar.`]
    .filter(Boolean)
    .join(' · ')
  return `<strong>${name}</strong><br/><span>${total.toLocaleString('fr-FR')} événements</span><br/>${detail}${link}`
}

function placePopup(place: PlaceGeo, pal: MapPalette): string {
  const label = place.locality ?? place.county ?? place.state ?? place.country ?? 'Lieu inconnu'
  const parts: string[] = [`<strong>${label}</strong>`]
  if (place.country_iso) parts.push(`<span>${place.country_iso}</span>`)
  const stats = [
    place.birth_count    && `${place.birth_count} naiss.`,
    place.death_count    && `${place.death_count} décès`,
    place.marriage_count && `${place.marriage_count} mar.`,
  ].filter(Boolean)
  if (stats.length) parts.push(stats.join(' · '))
  parts.push(`<a href="/places/${place.id}" style="color:${pal.link};text-decoration:none;font-size:0.8125rem">Voir les personnes &rarr;</a>`)
  return parts.join('<br/>')
}

// ---------------------------------------------------------------------------
// Place search (fly-to autocomplete over the in-memory places list)
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// French locality kind -> human label; chef-lieu represents the commune itself.
const FR_KIND_TYPE: Record<string, string> = {
  'chef-lieu': 'Commune', 'former-commune': 'Ancienne commune',
  'hameau': 'Hameau', 'lieu-dit': 'Lieu-dit',
}

function placeHead(p: PlaceGeo): string {
  return p.locality ?? p.county ?? p.state ?? p.country ?? '?'
}

// The type of place: French localities by kind, others by granularity.
// A chef-lieu is only "Commune" when its name IS the commune name (e.g. Le Thillot);
// when it differs (Servance within Servance-Miellin) it's a former commune.
function placeType(p: PlaceGeo): string {
  if (p.commune_insee && p.kind) {
    if (p.kind === 'chef-lieu') {
      return p.commune_nom && p.commune_nom !== p.locality ? 'Ancienne commune' : 'Commune'
    }
    return FR_KIND_TYPE[p.kind] ?? 'Lieu'
  }
  if (p.locality) return 'Commune'
  if (p.county)   return 'Département'
  if (p.state)    return 'Région'
  return 'Pays'
}

// Hierarchy shown under the name: commune (if distinct) -> dept -> region -> pays.
function placeCrumb(p: PlaceGeo): string[] {
  const parts: string[] = []
  if (p.commune_nom && p.commune_nom !== p.locality) parts.push(p.commune_nom)
  if (p.county) parts.push(p.county)
  if (p.state)  parts.push(p.state)
  if (p.country) parts.push(p.country)
  return parts
}

// Everything searchable for a place (name + commune + admin hierarchy).
function placeSearchText(p: PlaceGeo): string {
  return [p.locality, p.commune_nom, p.county, p.state, p.country].filter(Boolean).join(' ')
}

function placeTotal(p: PlaceGeo): number {
  return (p.birth_count ?? 0) + (p.death_count ?? 0) + (p.marriage_count ?? 0)
}

function PlaceSearch({ places, onSelect }: { places: PlaceGeo[]; onSelect: (p: PlaceGeo) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (q.length < 2) return []
    const scored: { p: PlaceGeo; rank: number; head: number; total: number }[] = []
    for (const p of places) {
      if (!normalize(placeSearchText(p)).includes(q)) continue
      // Match on the locality name OR the commune name (so a commune like
      // "Servance-Miellin" is findable even though the locality is "Servance").
      const loc = normalize(p.locality ?? p.county ?? p.state ?? p.country ?? '')
      const com = normalize(p.commune_nom ?? '')
      const rank = loc.startsWith(q) || com.startsWith(q) ? 0
                 : loc.includes(q) || com.includes(q) ? 1 : 2
      // Surface the chef-lieu first when several localities of one commune match.
      scored.push({ p, rank, head: p.kind === 'chef-lieu' ? 0 : 1, total: placeTotal(p) })
    }
    scored.sort((a, b) => a.rank - b.rank || a.head - b.head || b.total - a.total)
    return scored.slice(0, 8).map((s) => s.p)
  }, [places, query])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function choose(p: PlaceGeo) {
    onSelect(p)
    setQuery(placeHead(p))
    setOpen(false)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[Math.min(active, results.length - 1)]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={boxRef} className="absolute left-14 top-3 z-[1000] w-64 max-w-[calc(100%-16rem)]">
      <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 py-2 shadow-[var(--shadow-md)]">
        <Search size={14} className="shrink-0 text-ink-3" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Rechercher un lieu…"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-ink-3 focus:outline-none"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="mt-1 max-h-72 overflow-auto rounded-[var(--radius-lg)] border border-border bg-card shadow-[var(--shadow-lg)]">
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  i === active ? 'bg-surface-2' : 'hover:bg-surface-2'
                }`}
              >
                <MapPin size={12} className="mt-0.5 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">{placeHead(p)}</span>
                    <span className="shrink-0 rounded-[var(--radius-sm)] bg-surface-2 px-1 py-px text-[0.75rem] text-ink-3">
                      {placeType(p)}
                    </span>
                  </span>
                  {placeCrumb(p).length > 0 && (
                    <span className="block truncate text-[0.8125rem] text-ink-3">
                      {placeCrumb(p).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 shrink-0 self-start text-xs text-ink-3">
                  {placeTotal(p).toLocaleString('fr-FR')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Build a choropleth L.GeoJSON layer from a FeatureCollection
// ---------------------------------------------------------------------------

function buildChoroplethLayer(fc: FeatureCollection, pal: MapPalette): L.GeoJSON {
  const maxEvents = Math.max(
    ...fc.features.map((f) => (f.properties?.total_events as number) || 0),
    1,
  )

  const layer = L.geoJSON(fc as GeoJSON.GeoJsonObject, {
    style: (feature) => {
      const total = (feature?.properties?.total_events as number) || 0
      return {
        fillColor:   choroplethColor(total, maxEvents, pal),
        weight:      0.8,
        opacity:     0.6,
        color:       pal.boundary,
        fillOpacity: 1,
      }
    },
    onEachFeature: (feature: Feature, fl: L.Layer) => {
      ;(fl as L.Path).bindPopup(
        choroplethPopup(feature.properties as Record<string, unknown>, pal),
        { className: 'genealogy-popup' },
      )
      ;(fl as L.Path).on({
        mouseover(e) {
          const p = e.target as L.Path
          p.setStyle({ weight: 2, color: pal.hover, fillOpacity: 0.9 })
          p.bringToFront()
        },
        mouseout(e) {
          layer.resetStyle(e.target as L.Path)
        },
      })
    },
  })

  return layer
}

// ---------------------------------------------------------------------------
// Layer mode metadata
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<ViewMode, string> = {
  country:    'Pays',
  region:     'Régions',
  department: 'Départements',
  commune:    'Communes',
}

const LEGEND_LABELS: Record<ViewMode, string> = {
  country:    'Événements par pays',
  region:     'Événements par région',
  department: 'Événements par département',
  commune:    'Événements par commune',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenealogyMap({
  places,
  mode,
  onModeChange,
  layerLoading,
  countries,
  regions,
  departments,
  communes,
}: Props) {
  const theme = useResolvedTheme()
  const pal = PALETTES[theme]

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<L.Map | null>(null)
  const tileRef       = useRef<L.TileLayer | null>(null)

  // One Leaflet layer ref per choropleth layer type
  const layerRefs   = useRef<Partial<Record<ViewMode, L.GeoJSON>>>({})
  const clusterRefs = useRef<Partial<Record<ViewMode, L.MarkerClusterGroup>>>({})
  // French hamlet/lieu-dit point markers, shown only in commune mode.
  const hamletLayerRef = useRef<L.LayerGroup | null>(null)
  const modeRef     = useRef<ViewMode>(mode)
  const themeRef    = useRef(theme)

  // Data lookup for each mode (excluding 'commune' from point layer)
  const geoData: Partial<Record<ViewMode, FeatureCollection>> = {
    country:    countries,
    region:     regions,
    department: departments,
    commune:    communes,
  }

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center:      [46.5, 2.5],
      zoom:        5,
      zoomControl: true,
    })
    tileRef.current = L.tileLayer(PALETTES[themeRef.current].tiles, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom:    19,
    }).addTo(map)

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; tileRef.current = null }
  }, [])

  /* Leaflet bakes colours into SVG attributes, so a theme flip cannot be
     handled by CSS alone: swap the basemap and drop every cached layer so the
     builders below re-run against the new palette. */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    tileRef.current?.setUrl(pal.tiles)

    if (themeRef.current === theme) return
    themeRef.current = theme

    for (const layer of Object.values(layerRefs.current)) {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer)
    }
    layerRefs.current = {}

    for (const cluster of Object.values(clusterRefs.current)) {
      if (cluster && map.hasLayer(cluster)) map.removeLayer(cluster)
    }
    clusterRefs.current = {}

    if (hamletLayerRef.current) {
      if (map.hasLayer(hamletLayerRef.current)) map.removeLayer(hamletLayerRef.current)
      hamletLayerRef.current = null
    }
  }, [theme, pal])

  // Build / show / hide choropleth layers when data arrives or mode changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const activeMode = mode
    modeRef.current  = activeMode

    // Build any layer whose data just became available and hasn't been built yet
    for (const [m, fc] of Object.entries(geoData) as [ViewMode, FeatureCollection | undefined][]) {
      if (fc && !layerRefs.current[m]) {
        layerRefs.current[m] = buildChoroplethLayer(fc, pal)
      }
    }

    // Show only the cluster matching the active mode
    for (const [m, cl] of Object.entries(clusterRefs.current) as [ViewMode, L.MarkerClusterGroup][]) {
      if (m === activeMode) {
        if (!map.hasLayer(cl)) cl.addTo(map)
      } else {
        if (map.hasLayer(cl)) map.removeLayer(cl)
      }
    }

    // Hamlet markers only make sense at commune granularity (inside their commune polygon)
    const hamlets = hamletLayerRef.current
    if (hamlets) {
      if (activeMode === 'commune') {
        if (!map.hasLayer(hamlets)) hamlets.addTo(map)
      } else if (map.hasLayer(hamlets)) {
        map.removeLayer(hamlets)
      }
    }

    // Toggle choropleth layers
    for (const [m, layer] of Object.entries(layerRefs.current) as [ViewMode, L.GeoJSON][]) {
      if (m === activeMode) {
        if (!map.hasLayer(layer)) layer.addTo(map)
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer)
      }
    }
  }, [mode, countries, regions, departments, communes, theme, pal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build one cluster per granularity mode (non-French places only)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !places.length || Object.keys(clusterRefs.current).length) return

    const modes: ViewMode[] = ['region', 'department', 'commune']
    for (const m of modes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cluster = (L as any).markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius:    50,
        spiderfyOnMaxZoom:   true,
      })

      for (const place of places) {
        if (place.lat == null || place.lon == null) continue
        if (place.country_iso === 'FR') continue
        if (placeGranularity(place) !== m) continue
        const total = (place.birth_count ?? 0) + (place.death_count ?? 0) + (place.marriage_count ?? 0)
        const r     = Math.max(5, Math.min(16, 4 + Math.sqrt(total) * 1.4))
        const marker = L.circleMarker([place.lat, place.lon], {
          radius:      r,
          fillColor:   pal.marker,
          fillOpacity: 0.8,
          color:       pal.markerEdge,
          weight:      1,
        })
        marker.bindPopup(placePopup(place, pal), { className: 'genealogy-popup' })
        cluster.addLayer(marker)
      }
      clusterRefs.current[m] = cluster
    }

    // Show the current mode's cluster immediately
    const active = clusterRefs.current[modeRef.current]
    if (active) active.addTo(map)
  }, [places, theme, pal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build the French hamlet marker layer (geocoded lieu-dit places inside a
  // commune). These sit on top of the commune choropleth in commune mode.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !places.length || hamletLayerRef.current) return

    const group = L.layerGroup()
    for (const place of places) {
      if (place.country_iso !== 'FR') continue
      if (!place.commune_insee) continue
      if (place.lat == null || place.lon == null) continue
      // Skip commune heads (locality == commune name); only true hamlets get a point.
      if (place.locality && place.commune_nom && place.locality === place.commune_nom) continue

      const marker = L.circleMarker([place.lat, place.lon], {
        radius:      5,
        fillColor:   pal.hamlet,
        fillOpacity: 0.9,
        color:       pal.hamletEdge,
        weight:      1,
      })
      marker.bindPopup(placePopup(place, pal), { className: 'genealogy-popup' })
      if (place.locality) {
        marker.bindTooltip(place.locality, { direction: 'top', offset: [0, -4] })
      }
      group.addLayer(marker)
    }

    hamletLayerRef.current = group
    if (modeRef.current === 'commune') group.addTo(map)
  }, [places, theme, pal]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeData    = geoData[mode]
  const isLoading     = layerLoading[mode]
  const totalEvents   = places.reduce(
    (s, p) => s + (p.birth_count ?? 0) + (p.death_count ?? 0) + (p.marriage_count ?? 0),
    0,
  )

  // A French commune searched before its GeoJSON has loaded; flown to once data arrives.
  const pendingCommuneRef = useRef<PlaceGeo | null>(null)

  // Fit the map to a French commune's polygon (matched by INSEE) and open its popup.
  // Returns false if the commune GeoJSON isn't loaded yet or has no matching feature.
  function flyToCommunePolygon(place: PlaceGeo): boolean {
    const map = mapRef.current
    if (!map || !communes || !place.commune_insee) return false
    const feature = communes.features.find(
      (f) => (f.properties?.insee as string | undefined) === place.commune_insee,
    )
    if (!feature) return false
    const bounds = L.geoJSON(feature as GeoJSON.GeoJsonObject).getBounds()
    if (!bounds.isValid()) return false
    map.flyToBounds(bounds, { maxZoom: 13, duration: 1.1, padding: [40, 40] })
    L.popup({ className: 'genealogy-popup' })
      .setLatLng(bounds.getCenter())
      .setContent(placePopup(place, pal))
      .openOn(map)
    return true
  }

  // Fly the map to a searched place and open an info popup.
  function flyToPlace(place: PlaceGeo) {
    const map = mapRef.current
    if (!map) return
    // A place with its own coordinates (non-French points, or geocoded French
    // hamlets) flies straight to the point. French hamlets also switch to commune
    // mode so their marker is on screen.
    if (place.lat != null && place.lon != null) {
      if (place.commune_insee && modeRef.current !== 'commune') onModeChange('commune')
      const zoom = place.locality ? 13 : place.county ? 9 : place.state ? 7 : 5
      map.flyTo([place.lat, place.lon], zoom, { duration: 1.1 })
      L.popup({ className: 'genealogy-popup' })
        .setLatLng([place.lat, place.lon])
        .setContent(placePopup(place, pal))
        .openOn(map)
      return
    }
    // French commune heads have no point - switch to commune mode and zoom to the
    // polygon (deferring if the commune GeoJSON isn't loaded yet).
    if (place.commune_insee) {
      if (modeRef.current !== 'commune') onModeChange('commune')
      if (!flyToCommunePolygon(place)) pendingCommuneRef.current = place
    }
  }

  // Once the commune GeoJSON arrives, complete any deferred fly-to.
  useEffect(() => {
    if (pendingCommuneRef.current && flyToCommunePolygon(pendingCommuneRef.current)) {
      pendingCommuneRef.current = null
    }
  }, [communes]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Place search (fly-to) */}
      <PlaceSearch places={places} onSelect={flyToPlace} />

      {/* Granularity switch */}
      <div
        role="group"
        aria-label="Niveau de découpage de la carte"
        className="absolute right-3 top-3 z-[1000] flex rounded-[var(--radius)] border border-border bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] p-0.5 shadow-[var(--shadow-md)] backdrop-blur"
      >
        {(['country', 'region', 'department', 'commune'] as ViewMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            aria-pressed={mode === m}
            className={`rounded-[calc(var(--radius)-3px)] px-2.5 py-1 text-xs font-medium transition-colors active:translate-y-px ${
              mode === m
                ? 'bg-primary text-primary-foreground'
                : 'text-ink-3 hover:text-foreground'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div role="status" className="absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-border bg-card px-4 py-2 text-sm text-ink-2 shadow-[var(--shadow-lg)]">
          {mode === 'commune'
            ? 'Calcul des contours communaux…'
            : `Chargement des ${MODE_LABELS[mode].toLowerCase()}…`}
        </div>
      )}

      {/* Legend */}
      {activeData && !isLoading && (
        <div className="absolute bottom-8 left-3 z-[1000] rounded-[var(--radius-lg)] border border-border bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-3 py-2 text-xs shadow-[var(--shadow-md)] backdrop-blur">
          <div className="mb-1.5 font-medium text-foreground">{LEGEND_LABELS[mode]}</div>
          <div className="flex items-center gap-2">
            <span className="flex overflow-hidden rounded-[3px] border border-border">
              {pal.ramp.map((c) => (
                <span key={c} aria-hidden="true" className="block h-3.5 w-5" style={{ background: c }} />
              ))}
            </span>
            <span className="text-ink-3">faible à élevé</span>
          </div>
        </div>
      )}

      {/* Stats badge */}
      <div className="absolute bottom-8 right-3 z-[1000] rounded-[var(--radius-lg)] border border-border bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-3 py-2 text-xs text-ink-2 shadow-[var(--shadow-md)] backdrop-blur">
        <span className="font-mono tabular-nums">{places.length}</span> lieux · <span className="font-mono tabular-nums">{totalEvents.toLocaleString('fr-FR')}</span> événements
      </div>
    </div>
  )
}
