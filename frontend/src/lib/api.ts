import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { displayName, isNamePlaceholder } from './utils'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE_URL + path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return tidyNames(await res.json()) as T
}

/** Name placeholders ("n", "N", "?") rendered once, here, for every response:
    a person's name reaches the page through some forty fields (`name`,
    `spouse_name`, `husband_name`...), and fixing it at each of the ninety
    places that print one would miss the ninety-first. */
function tidyNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(tidyNames)
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string' && (key === 'name' || key.endsWith('_name'))) {
      out[key] = key === 'given_name' ? (isNamePlaceholder(v) ? '?' : v) : displayName(v)
    } else if (typeof v === 'string' && key === 'surname') {
      out[key] = isNamePlaceholder(v) ? '?' : v
    } else {
      out[key] = tidyNames(v)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Types (mirror api/app/schemas.py)
// ---------------------------------------------------------------------------

export interface PlaceRef {
  id: number | null
  locality: string | null
  county: string | null
  state: string | null
  country: string | null
  country_iso: string | null
  lat: number | null
  lon: number | null
}

export interface PersonSummary {
  id: string
  name: string | null
  given_name: string | null
  surname: string | null
  nickname: string | null
  sex: string | null
  birth_year: number | null
  birth_month: number | null
  birth_day: number | null
  death_year: number | null
  death_month: number | null
  death_day: number | null
  birth_place_id: number | null
  birth_place: string | null
  birth_country_iso: string | null
  branch: number | null
  is_direct_line: boolean
  sosa: number | null
}

/** The individual numbered Sosa 1, set per deployment. */
export interface SosaRoot {
  id: string
  given_name: string | null
  surname: string | null
  living?: boolean
}

/** Deployment config: the Sosa root (null when none is set) and the labels of
    branch 1 (the root's father's side) and 2 (its mother's). */
export interface TreeConfig {
  sosa_root: SosaRoot | null
  branches: Record<'1' | '2', string>
}

export interface PedigreeGeneration {
  generation: number
  potential: number
  known: number
}

export interface ParentRef {
  father_id: string | null
  father_name: string | null
  father_birth_year: number | null
  father_death_year: number | null
  mother_id: string | null
  mother_name: string | null
  mother_birth_year: number | null
  mother_death_year: number | null
  family_id: string | null
}

export interface SpouseRef {
  family_id: string | null
  spouse_id: string | null
  spouse_name: string | null
  spouse_sex: string | null
  /** The spouse is hidden as living: name blank, marriage date and place blank. */
  spouse_living?: boolean
  spouse_birth_year: number | null
  spouse_death_year: number | null
  divorced: boolean | null
  divorce_note: string | null
  marriage_year: number | null
  marriage_month: number | null
  marriage_day: number | null
  marriage_raw: string | null
  marriage_qualifier: string | null
  marriage_place_raw: string | null
  marriage_place_id: number | null
  marriage_locality: string | null
  marriage_country_iso: string | null
  marriage_note: string | null
  marriage_contract_qualifier: string | null
  marriage_contract_year: number | null
  marriage_contract_month: number | null
  marriage_contract_day: number | null
  marriage_contract_place_raw: string | null
  marriage_contract_locality: string | null
  marriage_sources: SourceRef[]
}

/** A citation backing a record: what the link says, the place in the source, the
    source itself. A source is written once and cited by many records. */
/** 'export': a SOUR line of the GEDCOM; 'research': our own reading; 'notes': a source
    the compiler names inside one of his notes, quoted verbatim. */
export type SourceOrigin = 'export' | 'research' | 'notes'

export interface SourceRef {
  /** birth/death/baptism/burial/marriage/record/event */
  scope: string
  /** What the citation establishes for this record. */
  note: string | null
  citation_id: string
  /** 'export': a SOUR line of the GEDCOM; 'research': our own reading. */
  origin: SourceOrigin
  /** The act or passage. */
  label: string | null
  date_text: string | null
  /** Page, view, folio. */
  locator: string | null
  url: string | null
  /** Abstract or quotation. */
  citation_note: string | null
  source_id: string
  source_title: string
  source_kind: string | null
  source_author: string | null
  source_repository: string | null
  source_call_number: string | null
  /** A work reported second-hand, not seen. */
  cites_source_id: string | null
  cites_source_title: string | null
  /** The act's text is on its source page. */
  has_transcript: boolean
  /** Scans of the act, shown to the family only. */
  image_count: number
}

export interface TitleRef {
  title: string
  note: string | null
}

export interface ChildRef {
  child_id: string
  name: string | null
  given_name: string | null
  surname: string | null
  sex: string | null
  child_birth_year: number | null
  child_death_year: number | null
  child_birth_locality: string | null
  child_birth_county: string | null
  child_birth_country: string | null
  family_id: string | null
  other_parent_id: string | null
  /** Hidden as living: name and dates blank. */
  living?: boolean
}

export interface EventRecord {
  type: string | null
  date_raw: string | null
  date_qualifier: string | null
  date_year: number | null
  date_month: number | null
  date_day: number | null
  date_year2: number | null
  date_month2: number | null
  date_day2: number | null
  place_raw: string | null
  place_id: number | null
  place_locality: string | null
  note: string | null
  sources: SourceRef[]
}

export interface PersonDetail {
  id: string
  name: string | null
  given_name: string | null
  surname: string | null
  nickname: string | null
  sex: string | null
  occupation: string | null
  branch: number | null
  is_direct_line: boolean
  birth_raw: string | null
  birth_qualifier: string | null
  birth_year: number | null
  birth_month: number | null
  birth_day: number | null
  birth_place_raw: string | null
  birth_place: PlaceRef | null
  death_raw: string | null
  death_qualifier: string | null
  death_year: number | null
  death_month: number | null
  death_day: number | null
  death_place_raw: string | null
  death_place: PlaceRef | null
  baptism_year: number | null
  baptism_month: number | null
  baptism_day: number | null
  baptism_place_raw: string | null
  baptism_place: PlaceRef | null
  burial_year: number | null
  burial_month: number | null
  burial_day: number | null
  burial_place_raw: string | null
  burial_place: PlaceRef | null
  birth_note: string | null
  death_note: string | null
  baptism_note: string | null
  burial_note: string | null
  parents: ParentRef | null
  spouses: SpouseRef[]
  children: ChildRef[]
  events: EventRecord[]
  notes: string[]
  titles: TitleRef[]
  sources: SourceRef[]
  professions: ProfessionRef[]
  distinctions: DistinctionRef[]
  military_ranks: MilitaryRankRef[]
  /** Set by the API when this person may be alive and the viewer is not signed
      in: every field but the id, the sex and the structure is then blank. */
  living?: boolean
}

export interface TreeNode {
  depth: number
  id: string
  name: string | null
  given_name: string | null
  surname: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
  birth_place: string | null
  birth_country_iso: string | null
  sosa: number | null
  living?: boolean
}

export interface CommonAncestor extends TreeNode {
  depth_from_id1: number
  depth_from_id2: number
  total_depth: number
}

export interface PlaceGeo {
  id: number
  locality: string | null
  county: string | null
  state: string | null
  country: string | null
  country_iso: string | null
  lat: number | null
  lon: number | null
  commune_insee: string | null
  commune_nom: string | null
  kind: string | null
  birth_count: number
  death_count: number
  marriage_count: number
}

export interface Statistics {
  total_individuals: number
  total_families: number
  total_places: number
  geocoded_places: number
  by_sex: Record<string, number>
  by_birth_century: Array<{ century: number | null; n: number }>
  top_surnames: Array<{ surname: string; n: number }>
  top_given_names: Array<{ given_name: string; n: number }>
  top_birth_places: Array<{ place_id: number; locality: string; commune_insee: string | null; country_iso: string | null; n: number }>
  by_birth_country: Array<{ country_iso: string; n: number }>
  coverage: {
    earliest_birth: number | null
    latest_birth: number | null
    with_birth_year: number
    with_death_year: number
    with_birth_place: number
    with_death_place: number
  }
  marriage_coverage: {
    total_families: number
    with_marriage_year: number
    with_marriage_place: number
  }
  professions_by_century: Array<{ century: number; [category: string]: number }>
  records: {
    oldest: { id: string; name: string | null; birth_year: number; death_year: number; age: number } | null
    most_children: { id: string; name: string | null; birth_year: number | null; death_year: number | null; child_count: number } | null
    largest_family: { id: string; husband_name: string | null; wife_name: string | null; marriage_year: number | null; child_count: number } | null
    earliest: { id: string; name: string | null; birth_year: number; birth_qualifier: string | null } | null
    most_sourced: { id: string; name: string | null; birth_year: number | null; source_count: number } | null
  }
  lifespan_distribution: Array<{ bucket: number; n: number }>
}

export interface SearchParams {
  name?: string
  place?: string
  year_from?: number
  year_to?: number
  sex?: string
  branch?: number
  profession_category?: string
  profession_id?: number
  distinction_id?: number
  limit?: number
  offset?: number
  sort?: string
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSearch(params: SearchParams, enabled = true) {
  const qs = new URLSearchParams()
  if (params.name) qs.set('name', params.name)
  if (params.place) qs.set('place', params.place)
  if (params.year_from != null) qs.set('year_from', String(params.year_from))
  if (params.year_to != null) qs.set('year_to', String(params.year_to))
  if (params.sex) qs.set('sex', params.sex)
  if (params.branch != null) qs.set('branch', String(params.branch))
  if (params.profession_category) qs.set('profession_category', params.profession_category)
  if (params.profession_id != null) qs.set('profession_id', String(params.profession_id))
  if (params.distinction_id != null) qs.set('distinction_id', String(params.distinction_id))
  if (params.sort && params.sort !== 'name') qs.set('sort', params.sort)
  qs.set('limit', String(params.limit ?? 50))
  if (params.offset) qs.set('offset', String(params.offset))

  const query = qs.toString()
  return useQuery<PersonSummary[]>({
    queryKey: ['search', query],
    queryFn: () => fetchJson(`/api/search?${query}`),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useSearchCount(params: SearchParams, enabled: boolean) {
  const qs = new URLSearchParams()
  if (params.name) qs.set('name', params.name)
  if (params.place) qs.set('place', params.place)
  if (params.year_from != null) qs.set('year_from', String(params.year_from))
  if (params.year_to != null) qs.set('year_to', String(params.year_to))
  if (params.sex) qs.set('sex', params.sex)
  if (params.branch != null) qs.set('branch', String(params.branch))
  if (params.profession_category) qs.set('profession_category', params.profession_category)
  if (params.profession_id != null) qs.set('profession_id', String(params.profession_id))
  if (params.distinction_id != null) qs.set('distinction_id', String(params.distinction_id))
  const query = qs.toString()
  return useQuery<{ count: number }>({
    queryKey: ['search-count', query],
    queryFn: () => fetchJson(`/api/search/count?${query}`),
    enabled,
    staleTime: 30_000,
  })
}

export function fetchPerson(id: string): Promise<PersonDetail> {
  return fetchJson(`/api/people/${encodeURIComponent(id)}`)
}

/** One box of the interactive tree, with the links to its neighbours. */
export interface TreePerson {
  id: string
  name: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
  birth_locality: string | null
  father_id: string | null
  mother_id: string | null
  child_ids: string[]
  spouses: { id: string | null; name: string | null; living?: boolean }[]
  living?: boolean
}

/** Everyone the tree draws when it opens on `id`: one request, not one per box. */
export function fetchTreeNeighbourhood(id: string, up: number, down: number): Promise<TreePerson[]> {
  return fetchJson(`/api/people/${encodeURIComponent(id)}/tree?up=${up}&down=${down}`)
}

/** The boxes an expansion reveals, in one batch. */
export function fetchTreePeople(ids: string[]): Promise<TreePerson[]> {
  return fetchJson(`/api/people?ids=${ids.map(encodeURIComponent).join(',')}`)
}

// ---------------------------------------------------------------------------
// Family list
// ---------------------------------------------------------------------------

export interface FamilySummary {
  id: string
  husband_id: string | null
  husband_name: string | null
  husband_birth_year: number | null
  husband_death_year: number | null
  wife_id: string | null
  wife_name: string | null
  wife_birth_year: number | null
  wife_death_year: number | null
  marriage_year: number | null
  marriage_qualifier: string | null
  marriage_locality: string | null
  marriage_place_id: number | null
  child_count: number
}

export interface FamilySearchParams {
  name?: string
  place?: string
  year_from?: number
  year_to?: number
  min_children?: number
  limit?: number
  offset?: number
}

export function useFamilies(params: FamilySearchParams, enabled = true) {
  const qs = new URLSearchParams()
  if (params.name) qs.set('name', params.name)
  if (params.place) qs.set('place', params.place)
  if (params.year_from != null) qs.set('year_from', String(params.year_from))
  if (params.year_to != null) qs.set('year_to', String(params.year_to))
  if (params.min_children != null) qs.set('min_children', String(params.min_children))
  qs.set('limit', String(params.limit ?? 50))
  if (params.offset) qs.set('offset', String(params.offset))
  const query = qs.toString()
  return useQuery<FamilySummary[]>({
    queryKey: ['families', query],
    queryFn: () => fetchJson(`/api/families?${query}`),
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

export function useFamilyCount(params: FamilySearchParams, enabled = true) {
  const qs = new URLSearchParams()
  if (params.name) qs.set('name', params.name)
  if (params.place) qs.set('place', params.place)
  if (params.year_from != null) qs.set('year_from', String(params.year_from))
  if (params.year_to != null) qs.set('year_to', String(params.year_to))
  if (params.min_children != null) qs.set('min_children', String(params.min_children))
  const query = qs.toString()
  return useQuery<{ count: number }>({
    queryKey: ['families-count', query],
    queryFn: () => fetchJson(`/api/families/count?${query}`),
    enabled,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Family detail
// ---------------------------------------------------------------------------

export interface FamilyChild {
  child_id: string
  name: string | null
  given_name: string | null
  surname: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
}

export interface FamilyEvent {
  type: string | null
  date_raw: string | null
  date_qualifier: string | null
  date_year: number | null
  date_month: number | null
  date_day: number | null
  place_raw: string | null
  place_id: number | null
  place_locality: string | null
  note: string | null
  sources: SourceRef[]
}

export interface FamilyDetail {
  id: string
  husband_id: string | null
  husband_name: string | null
  husband_birth_year: number | null
  husband_death_year: number | null
  wife_id: string | null
  wife_name: string | null
  wife_birth_year: number | null
  wife_death_year: number | null
  divorced: boolean
  divorce_note: string | null
  marriage_raw: string | null
  marriage_qualifier: string | null
  marriage_year: number | null
  marriage_month: number | null
  marriage_day: number | null
  marriage_place_raw: string | null
  marriage_place_id: number | null
  marriage_locality: string | null
  marriage_county: string | null
  marriage_state: string | null
  marriage_country: string | null
  marriage_country_iso: string | null
  marriage_note: string | null
  marriage_contract_year: number | null
  marriage_contract_month: number | null
  marriage_contract_day: number | null
  marriage_contract_place_raw: string | null
  marriage_contract_place_id: number | null
  marriage_contract_locality: string | null
  children: FamilyChild[]
  events: FamilyEvent[]
  sources: SourceRef[]
}

export function useFamily(id: string | null) {
  return useQuery<FamilyDetail>({
    queryKey: ['family', id],
    queryFn: () => fetchJson(`/api/families/${encodeURIComponent(id!)}`),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })
}

export function usePerson(id: string | null) {
  return useQuery<PersonDetail>({
    queryKey: ['person', id],
    queryFn: () => fetchPerson(id!),
    enabled: id != null,
    staleTime: 5 * 60_000,
  })
}

export function useAncestors(id: string | null, depth = 8) {
  return useQuery<TreeNode[]>({
    queryKey: ['ancestors', id, depth],
    queryFn: () => fetchJson(`/api/people/${encodeURIComponent(id!)}/ancestors?depth=${depth}`),
    enabled: id != null,
    staleTime: 5 * 60_000,
  })
}

export function useSosa(id: string | null) {
  return useQuery<{ sosa: number | null }>({
    queryKey: ['sosa', id],
    queryFn: () => fetchJson(`/api/people/${encodeURIComponent(id!)}/sosa`),
    enabled: id != null,
    staleTime: 60 * 60_000,
  })
}

export function useDescendants(id: string | null, depth = 4) {
  return useQuery<TreeNode[]>({
    queryKey: ['descendants', id, depth],
    queryFn: () => fetchJson(`/api/people/${encodeURIComponent(id!)}/descendants?depth=${depth}`),
    enabled: id != null,
    staleTime: 5 * 60_000,
  })
}

export interface PlaceGap {
  id: number
  locality: string | null
  county: string | null
  state: string | null
  country: string | null
  country_iso: string | null
  commune_insee: string | null
  lat: number | null
  lon: number | null
  birth_count: number
  death_count: number
  marriage_count: number
  event_count: number
  no_country: boolean
  no_coords: boolean
  fr_no_insee: boolean
}

export interface PlacePersonRef {
  id: string
  name: string | null
  given_name: string | null
  surname: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
  hamlet: string | null
  hamlet_place_id: number | null
}

export interface PlaceMarriageRef {
  family_id: string
  husband_id: string | null
  husband_name: string | null
  wife_id: string | null
  wife_name: string | null
  marriage_year: number | null
  hamlet: string | null
  hamlet_place_id: number | null
}

export interface LocalityRef {
  id: number
  name: string | null
  kind: string | null
  birth_count: number
  death_count: number
  marriage_count: number
}

export interface CommuneRef {
  insee: string
  nom: string | null
  county: string | null
  state: string | null
  country: string | null
  country_iso: string | null
  description: string | null
  description_source: string | null
  description_url: string | null
}

export interface PlaceDetailData {
  id: number
  name: string | null
  kind: string | null
  county: string | null
  state: string | null
  country: string | null
  country_iso: string | null
  lat: number | null
  lon: number | null
  commune_insee: string | null
  commune: CommuneRef | null
  description: string | null
  description_source: string | null
  born: PlacePersonRef[]
  died: PlacePersonRef[]
  married: PlaceMarriageRef[]
  siblings: LocalityRef[]
}

export interface CommuneDetailData {
  insee: string
  nom: string | null
  county: string | null
  state: string | null
  country: string | null
  country_iso: string | null
  description: string | null
  description_source: string | null
  description_url: string | null
  born: PlacePersonRef[]
  died: PlacePersonRef[]
  married: PlaceMarriageRef[]
  localities: LocalityRef[]
  top_surnames: Array<{ surname: string; n: number }>
}

export function usePlaceDetail(id: number | null) {
  return useQuery<PlaceDetailData>({
    queryKey: ['place', id],
    queryFn: () => fetchJson(`/api/places/${id}`),
    enabled: id != null,
    staleTime: 5 * 60_000,
  })
}

export function useCommuneDetail(insee: string | null) {
  return useQuery<CommuneDetailData>({
    queryKey: ['commune', insee],
    queryFn: () => fetchJson(`/api/communes/${insee}`),
    enabled: insee != null,
    staleTime: 5 * 60_000,
  })
}

export function useCommonAncestors(id1: string | null, id2: string | null) {
  return useQuery<CommonAncestor[]>({
    queryKey: ['common-ancestors', id1, id2],
    queryFn: () =>
      fetchJson(`/api/people/${encodeURIComponent(id1!)}/common-ancestors?other=${encodeURIComponent(id2!)}`),
    enabled: id1 != null && id2 != null && id1 !== id2,
    staleTime: 5 * 60_000,
  })
}

export function usePlaceGaps() {
  return useQuery<PlaceGap[]>({
    queryKey: ['place-gaps'],
    queryFn: () => fetchJson('/api/places/gaps'),
    staleTime: 5 * 60_000,
  })
}

export function useStats() {
  return useQuery<Statistics>({
    queryKey: ['stats'],
    queryFn: () => fetchJson('/api/stats'),
    staleTime: Infinity,
  })
}

export function useTree() {
  return useQuery<TreeConfig>({
    queryKey: ['tree'],
    queryFn: () => fetchJson('/api/tree'),
    staleTime: Infinity,
  })
}

/** Label of each `branch` value, the two sides named by the deployment. Falls
    back to neutral names while /api/tree is loading. */
export function useBranchLabels(): Record<number, string> {
  const { data } = useTree()
  return {
    1: data?.branches['1'] ?? 'Paternelle',
    2: data?.branches['2'] ?? 'Maternelle',
    3: 'Les deux',
  }
}

export function usePedigree() {
  return useQuery<PedigreeGeneration[]>({
    queryKey: ['pedigree'],
    queryFn: () => fetchJson('/api/stats/pedigree'),
    staleTime: Infinity,
  })
}

export function usePlaces() {
  return useQuery<PlaceGeo[]>({
    queryKey: ['places'],
    queryFn: () => fetchJson('/api/places'),
    staleTime: Infinity,
  })
}

export function useDepartmentGeoJSON(enabled = true) {
  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['departments-geojson'],
    queryFn: () => fetchJson('/api/geo/departments'),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useRegionGeoJSON(enabled = true) {
  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['regions-geojson'],
    queryFn: () => fetchJson('/api/geo/regions'),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useCountryGeoJSON(enabled = true) {
  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['countries-geojson'],
    queryFn: () => fetchJson('/api/geo/countries'),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useCommuneGeoJSON(enabled = true) {
  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['communes-geojson'],
    queryFn: () => fetchJson('/api/geo/communes'),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

// ---------------------------------------------------------------------------
// Professions
// ---------------------------------------------------------------------------

export interface ProfessionRef {
  id: number
  name: string
  category: string | null
  description: string | null
  note: string | null
}

export interface ProfessionSummary extends ProfessionRef {
  count: number
}

export interface ProfessionPersonRef {
  id: string
  name: string | null
  given_name: string | null
  surname: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
  birth_place_id: number | null
  birth_locality: string | null
  birth_country_iso: string | null
}

export interface ProfessionDetail extends ProfessionRef {
  individuals: ProfessionPersonRef[]
}

export function useProfessions() {
  return useQuery<ProfessionSummary[]>({
    queryKey: ['professions'],
    queryFn: () => fetchJson('/api/professions'),
    staleTime: Infinity,
  })
}

export function useProfession(id: number | null) {
  return useQuery<ProfessionDetail>({
    queryKey: ['profession', id],
    queryFn: () => fetchJson(`/api/professions/${id}`),
    enabled: id != null,
    staleTime: Infinity,
  })
}

export interface SourceSummary {
  id: string
  origin: SourceOrigin
  kind: string | null
  title: string
  author: string | null
  publication: string | null
  repository: string | null
  call_number: string | null
  date_text: string | null
  citation_count: number
  link_count: number
  cited_by_count: number
}

export interface SourcePersonLink {
  id: string
  name: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
  scope: string
  note: string | null
  event_type: string | null
  event_date_raw: string | null
  living?: boolean
}

export interface SourceFamilyLink {
  family_id: string
  husband_id: string | null
  husband_name: string | null
  husband_sex: string | null
  wife_id: string | null
  wife_name: string | null
  wife_sex: string | null
  marriage_year: number | null
  marriage_qualifier: string | null
  scope: string
  note: string | null
  husband_living?: boolean
  wife_living?: boolean
}

export interface SourceCitation {
  id: string
  label: string | null
  date_text: string | null
  locator: string | null
  url: string | null
  note: string | null
  cites_source_id: string | null
  cites_source_title: string | null
  /** The act's own words (Markdown): transcription, translation, quoted passages. */
  transcript: string | null
  /** Scans of the act; fetch with `citationImageUrl`, family only. */
  images: Array<{ ord: number; caption: string | null }>
  individuals: SourcePersonLink[]
  families: SourceFamilyLink[]
}

export interface SourceDetail {
  id: string
  origin: SourceOrigin
  kind: string | null
  title: string
  author: string | null
  publication: string | null
  repository: string | null
  call_number: string | null
  date_text: string | null
  url: string | null
  note: string | null
  citations: SourceCitation[]
  cited_by: Array<{
    id: string
    label: string | null
    locator: string | null
    source_id: string
    source_title: string
  }>
}

/** One scan of a citation's act. The API answers 403 unless the family is signed in. */
export function citationImageUrl(citationId: string, ord: number): string {
  return `${BASE_URL}/api/citations/${encodeURIComponent(citationId)}/images/${ord}`
}

export function useSources() {
  return useQuery<SourceSummary[]>({
    queryKey: ['sources'],
    queryFn: () => fetchJson('/api/sources'),
    staleTime: Infinity,
  })
}

export function useSource(id: string | null) {
  return useQuery<SourceDetail>({
    queryKey: ['source', id],
    queryFn: () => fetchJson(`/api/sources/${encodeURIComponent(id!)}`),
    enabled: id != null,
    staleTime: Infinity,
  })
}

export interface DistinctionRef {
  id: number
  name: string
  category: string | null
  description: string | null
  year_start: number | null
  year_end: number | null
}

export interface DistinctionSummary extends DistinctionRef {
  count: number
}

export interface DistinctionPersonRef {
  id: string
  name: string | null
  given_name: string | null
  surname: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
  death_note: string | null
  birth_place_id: number | null
  birth_locality: string | null
  birth_country_iso: string | null
  distinction_note: string | null
  individual_note: string | null
}

export interface DistinctionDetail extends DistinctionRef {
  individuals: DistinctionPersonRef[]
}

export function useDistinctions() {
  return useQuery<DistinctionSummary[]>({
    queryKey: ['distinctions'],
    queryFn: () => fetchJson('/api/distinctions'),
    staleTime: Infinity,
  })
}

export function useDistinction(id: number | null) {
  return useQuery<DistinctionDetail>({
    queryKey: ['distinction', id],
    queryFn: () => fetchJson(`/api/distinctions/${id}`),
    enabled: id != null,
    staleTime: Infinity,
  })
}

// ---------------------------------------------------------------------------
// Military ranks
// ---------------------------------------------------------------------------

export interface MilitaryRankRef {
  id: number
  name: string
  branch: string | null
  grade: number | null
  era: string | null
  year_start: number | null
  year_end: number | null
  regiment: string | null
  note: string | null
}

export interface MilitaryRankSummary {
  id: number
  name: string
  branch: string | null
  grade: number | null
  era: string | null
  description: string | null
  count: number
}

export interface MilitaryRankPersonRef {
  id: string
  name: string | null
  given_name: string | null
  surname: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
  birth_place_id: number | null
  birth_locality: string | null
  birth_country_iso: string | null
  year_start: number | null
  year_end: number | null
  regiment: string | null
  note: string | null
}

export interface MilitaryRankDetail {
  id: number
  name: string
  branch: string | null
  grade: number | null
  era: string | null
  description: string | null
  individuals: MilitaryRankPersonRef[]
}

export function useMilitaryRanks() {
  return useQuery<MilitaryRankSummary[]>({
    queryKey: ['military-ranks'],
    queryFn: () => fetchJson('/api/military-ranks'),
    staleTime: Infinity,
  })
}

export function useMilitaryRank(id: number | null) {
  return useQuery<MilitaryRankDetail>({
    queryKey: ['military-rank', id],
    queryFn: () => fetchJson(`/api/military-ranks/${id}`),
    enabled: id != null,
    staleTime: Infinity,
  })
}

// ---------------------------------------------------------------------------
// Historical bans
// ---------------------------------------------------------------------------

export interface BanCommune {
  insee: string
  nom: string | null
  county: string | null
  state: string | null
  role: string | null
}

export interface BanLocality {
  id: number
  place_id: number | null
  name: string
  parish: string | null
  notes: string | null
}

export interface BanSummary {
  id: number
  name: string
  abolished_year: number
  suzerain: string | null
  origin_note: string | null
  communes: BanCommune[]
}

export interface BanDetail {
  id: number
  name: string
  origin_note: string | null
  suzerain: string | null
  lords_succession: string | null
  parishes: string | null
  abolished_year: number
  abolition_note: string | null
  notes: string | null
  communes: BanCommune[]
  localities: BanLocality[]
}

export function useBans() {
  return useQuery<BanSummary[]>({
    queryKey: ['bans'],
    queryFn: () => fetchJson('/api/bans'),
    staleTime: Infinity,
  })
}

export function useBan(id: number) {
  return useQuery<BanDetail>({
    queryKey: ['ban', id],
    queryFn: () => fetchJson(`/api/bans/${id}`),
    staleTime: Infinity,
  })
}


// ---------------------------------------------------------------------------
// On this day
// ---------------------------------------------------------------------------

export interface OnThisDayPerson {
  id: string
  name: string | null
  sex: string | null
  birth_year: number | null
  death_year: number | null
  event_type: string
  event_year: number
}

export interface OnThisDayMarriage {
  family_id: string
  husband_name: string | null
  husband_id: string | null
  wife_name: string | null
  wife_id: string | null
  event_year: number
}

export interface OnThisDay {
  individuals: OnThisDayPerson[]
  marriages: OnThisDayMarriage[]
}

export function useOnThisDay(month?: number, day?: number) {
  const params = month != null && day != null ? `?month=${month}&day=${day}` : ''
  return useQuery<OnThisDay>({
    queryKey: ['onthisday', month, day],
    queryFn: () => fetchJson(`/api/onthisday${params}`),
    staleTime: 60 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Family access
//
// One shared family password unlocks the living, through an HttpOnly cookie the
// API sets (see api/app/privacy.py). Without it they come back as
// "Personne vivante" with every date and place blanked.
// ---------------------------------------------------------------------------

/** Where the depot page remembers its password (see routes/depot.tsx). */
export const DEPOT_PASSWORD_KEY = 'genealogy.depot.password'

export interface SessionState {
  /** This browser is signed in and sees the living. */
  family: boolean
  /** A family password is configured at all. */
  available: boolean
}

export function useSession() {
  return useQuery<SessionState>({
    queryKey: ['session'],
    queryFn: () => fetchJson('/api/session'),
    staleTime: Infinity,
  })
}

async function sendSession(method: 'POST' | 'DELETE', password?: string): Promise<SessionState> {
  const res = await fetch(BASE_URL + '/api/session', {
    method,
    headers: password === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: password === undefined ? undefined : JSON.stringify({ password }),
  })
  if (res.status === 401) throw new Error('Mot de passe incorrect.')
  if (res.status === 429) throw new Error('Trop d\'essais. Réessayez dans une heure.')
  if (res.status === 503) throw new Error('L\'accès famille n\'est pas ouvert sur ce site.')
  if (!res.ok) throw new Error(`Le serveur n'a pas répondu (${res.status}).`)
  return res.json() as Promise<SessionState>
}

/** Also unlock the depot when the family password is the depot's too, which is
    the default: one password to remember, typed once. Silent when they differ. */
async function unlockDepotWith(password: string): Promise<void> {
  const form = new FormData()
  form.append('password', password)
  try {
    const res = await fetch(BASE_URL + '/api/uploads/auth', { method: 'POST', body: form })
    if (res.ok) localStorage.setItem(DEPOT_PASSWORD_KEY, password)
  } catch {
    // The depot is a convenience here; signing in already succeeded.
  }
}

/** Sign in or out. Every cached answer was shaped for the previous viewer, so
    both reset the whole query cache and let the visible pages refetch. */
export function useFamilyAccess() {
  const queryClient = useQueryClient()
  const session = useSession()

  const signIn = useMutation({
    mutationFn: async ({ password, depot = true }: { password: string; depot?: boolean }) => {
      const state = await sendSession('POST', password)
      if (depot) await unlockDepotWith(password)
      return state
    },
    onSuccess: (state) => {
      queryClient.setQueryData(['session'], state)
      void queryClient.resetQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    },
  })

  const signOut = useMutation({
    mutationFn: () => sendSession('DELETE'),
    onSuccess: (state) => {
      queryClient.setQueryData(['session'], state)
      void queryClient.resetQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    },
  })

  return {
    family: session.data?.family ?? false,
    available: session.data?.available ?? false,
    signIn,
    signOut,
  }
}
