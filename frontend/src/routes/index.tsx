import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { BarChart2, GitBranch, Map, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Field, Input, Label, Select } from '@/components/ui/Field'
import { PageContainer } from '@/components/ui/PageContainer'
import { PersonBadges } from '@/components/ui/PersonBadges'
import { Section } from '@/components/ui/Section'
import { PersonCardSkeleton, StatCardSkeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { SexMark } from '@/components/person/PersonChip'
import {
  type SearchParams,
  useSearch,
  useSearchCount,
  useStats,
  useDistinctions,
  useProfessions,
  useOnThisDay,
  useBranchLabels,
} from '@/lib/api'
import { getRecent, type RecentPerson } from '@/lib/history'
import { cn, formatLifespan } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<string, string> = {
  agriculture:    'Agriculture',
  textile:        'Textile',
  artisanat:      'Artisanat',
  maritime:       'Maritime',
  droit:          'Droit et notariat',
  médecine:       'Médecine',
  mines:          'Mines',
  commerce:       'Commerce',
  administration: 'Administration',
  religion:       'Religion',
  enseignement:   'Enseignement',
  journalier:     'Journalier',
  'arts-lettres': 'Arts et lettres',
}

const SORT_OPTIONS = [
  { value: 'name', label: 'Nom' },
  { value: 'birth_year', label: 'Naissance croissante' },
  { value: '-birth_year', label: 'Naissance décroissante' },
  { value: 'death_year', label: 'Décès croissant' },
  { value: '-death_year', label: 'Décès décroissant' },
]

// ---------------------------------------------------------------------------
// URL search param schema
// ---------------------------------------------------------------------------

interface SearchState {
  name?: string
  place?: string
  year_from?: number
  year_to?: number
  sex?: string
  branch?: number
  prof_cat?: string
  prof_id?: number
  dist_id?: number
  sort?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (raw: Record<string, unknown>): SearchState => ({
    name: typeof raw.name === 'string' && raw.name ? raw.name
        : typeof raw.surname === 'string' && raw.surname ? raw.surname : undefined,
    place: typeof raw.place === 'string' && raw.place ? raw.place : undefined,
    year_from: typeof raw.year_from === 'number' ? raw.year_from : undefined,
    year_to: typeof raw.year_to === 'number' ? raw.year_to : undefined,
    sex: typeof raw.sex === 'string' && raw.sex ? raw.sex : undefined,
    branch: typeof raw.branch === 'number' ? raw.branch : undefined,
    prof_cat: typeof raw.prof_cat === 'string' && raw.prof_cat ? raw.prof_cat : undefined,
    prof_id: typeof raw.prof_id === 'number' ? raw.prof_id : undefined,
    dist_id: typeof raw.dist_id === 'number' ? raw.dist_id : undefined,
    sort: typeof raw.sort === 'string' && raw.sort ? raw.sort : undefined,
  }),
  component: ArbrePage,
})

const PAGE_SIZE = 50

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** A term that seeds a search. Used for surnames and for places. */
function EntryPill({
  children,
  count,
  onClick,
  to,
  params,
}: {
  children: React.ReactNode
  count: number
  onClick?: () => void
  to?: string
  params?: Record<string, string>
}) {
  const cls = cn(
    'inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius)] border border-border bg-card px-2.5 py-1.5 text-sm text-foreground',
    'transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out-expo)]',
    'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:translate-y-px',
  )
  const inner = (
    <>
      <span className="truncate">{children}</span>
      <span className="font-mono text-xs tabular-nums text-ink-3">{count}</span>
    </>
  )
  if (to) {
    return (
      <Link to={to as never} params={params as never} className={cls}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

function ShortcutLink({
  to,
  params,
  icon: Icon,
  label,
  hint,
}: {
  to: string
  params?: Record<string, string>
  icon: typeof Map
  label: string
  hint: string
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className={cn(
        'group flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-card px-3.5 py-3',
        'transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)]',
        'hover:border-[var(--rule-strong)] hover:shadow-[var(--shadow-sm)] active:translate-y-px active:shadow-none',
      )}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0 text-ink-3 transition-colors group-hover:text-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-ink-3">{hint}</span>
      </span>
    </Link>
  )
}

type SearchResult = NonNullable<ReturnType<typeof useSearch>['data']>[number]

function ResultCard({ p }: { p: SearchResult }) {
  const span = formatLifespan(p.birth_year, p.death_year)
  return (
    <Link
      to="/people/$id"
      params={{ id: p.id }}
      className={cn(
        'flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-border bg-card p-3',
        'transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)]',
        'hover:border-[var(--rule-strong)] hover:shadow-[var(--shadow-md)]',
        'active:translate-y-px active:shadow-none',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <SexMark sex={p.sex} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium leading-snug text-foreground">
              {p.name ?? 'Inconnu'}
            </span>
            {p.nickname && (
              <span className="block truncate text-xs text-ink-3">« {p.nickname} »</span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <PersonBadges sosa={p.sosa} branch={p.branch} isDirectLine={p.is_direct_line} />
        </span>
      </div>
      <span className="font-mono text-xs tabular-nums text-ink-2">{span || 'Dates inconnues'}</span>
      {p.birth_place && <span className="truncate text-xs text-ink-3">{p.birth_place}</span>}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ArbrePage() {
  const urlSearch = Route.useSearch()
  const navigate = useNavigate({ from: '/' })
  const branchLabel = useBranchLabels()

  // Local input state (debounced before writing to URL)
  const [nameInput, setNameInput] = useState(urlSearch.name ?? '')
  const [filtersOpen, setFiltersOpen] = useState(
    !!(urlSearch.place || urlSearch.year_from || urlSearch.year_to || urlSearch.sex
       || urlSearch.prof_cat || urlSearch.prof_id != null || urlSearch.dist_id != null)
  )
  const [offset, setOffset] = useState(0)
  const [allResults, setAllResults] = useState<ReturnType<typeof useSearch>['data']>([])

  useEffect(() => {
    document.title = 'Généalogie'
  }, [])
  const [recent] = useState<RecentPerson[]>(() => getRecent())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Sync nameInput -> URL with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const trimmed = nameInput.trim()
      if (trimmed === (urlSearch.name ?? '')) return
      navigate({ search: (s) => ({ ...s, name: trimmed || undefined }) })
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [nameInput]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep nameInput in sync if URL changes externally (back/forward)
  useEffect(() => {
    setNameInput(urlSearch.name ?? '')
  }, [urlSearch.name])

  // Auto-open filters panel when year/place/sex filters arrive in URL (e.g. from stats page links)
  useEffect(() => {
    if (urlSearch.place || urlSearch.year_from || urlSearch.year_to || urlSearch.sex
        || urlSearch.prof_cat || urlSearch.prof_id != null || urlSearch.dist_id != null) {
      setFiltersOpen(true)
    }
  }, [urlSearch.place, urlSearch.year_from, urlSearch.year_to, urlSearch.sex,
      urlSearch.prof_cat, urlSearch.prof_id, urlSearch.dist_id])

  // Reset pagination when URL filters change
  useEffect(() => {
    setOffset(0)
  }, [urlSearch.name, urlSearch.place, urlSearch.year_from, urlSearch.year_to,
      urlSearch.sex, urlSearch.prof_cat, urlSearch.prof_id, urlSearch.dist_id, urlSearch.sort])

  function setFilter(key: keyof SearchState, value: string | number | undefined) {
    navigate({ search: (s) => ({ ...s, [key]: value || undefined }) })
  }

  function clearFilters() {
    setNameInput('')
    navigate({ search: () => ({}) })
    setOffset(0)
    setFiltersOpen(false)
  }

  const isNameActive = (urlSearch.name?.length ?? 0) >= 2
  const hasFilter = isNameActive || urlSearch.place || urlSearch.year_from || urlSearch.year_to
    || urlSearch.sex || urlSearch.branch != null
    || urlSearch.prof_cat || urlSearch.prof_id != null || urlSearch.dist_id != null

  const searchParams: SearchParams = {
    name: isNameActive ? urlSearch.name : undefined,
    place: urlSearch.place || undefined,
    year_from: urlSearch.year_from,
    year_to: urlSearch.year_to,
    sex: urlSearch.sex || undefined,
    branch: urlSearch.branch,
    profession_category: urlSearch.prof_cat || undefined,
    profession_id: urlSearch.prof_id,
    distinction_id: urlSearch.dist_id,
    sort: urlSearch.sort || undefined,
    limit: PAGE_SIZE,
    offset,
  }

  const { data: page, isFetching, isError, refetch } = useSearch(searchParams, !!hasFilter)
  const countParams: SearchParams = { ...searchParams }
  delete countParams.limit
  delete countParams.offset
  const { data: countData } = useSearchCount(countParams, !!hasFilter)
  const { data: stats } = useStats()
  const { data: onThisDay } = useOnThisDay()

  // Accumulate pages for infinite scroll
  useEffect(() => {
    if (!page) return
    if (offset === 0) setAllResults(page)
    else setAllResults((prev) => [...(prev ?? []), ...page])
  }, [page, offset])

  const activeFilterCount = [
    urlSearch.place,
    urlSearch.year_from || urlSearch.year_to ? '1' : '',
    urlSearch.sex,
    urlSearch.branch != null ? '1' : '',
    urlSearch.prof_cat,
    urlSearch.prof_id != null ? '1' : '',
    urlSearch.dist_id != null ? '1' : '',
  ].filter(Boolean).length

  const { data: professions } = useProfessions()
  const { data: distinctions } = useDistinctions()

  // Derive unique categories from loaded professions
  const profCategories = useMemo(
    () =>
      professions
        ? [...new Set(professions.map((p) => p.category).filter(Boolean) as string[])].sort()
        : [],
    [professions],
  )

  // Look up labels for active prof_id / dist_id
  const activeProfName = urlSearch.prof_id != null
    ? professions?.find((p) => p.id === urlSearch.prof_id)?.name
    : null
  const canLoadMore = page && page.length === PAGE_SIZE

  const earliest = stats?.coverage.earliest_birth
  const earliestLabel =
    earliest == null ? '—' : earliest < 0 ? `${Math.abs(earliest)} av. J.-C.` : String(earliest)
  const total = countData?.count ?? allResults?.length ?? 0

  return (
    <PageContainer>
      {/* One h1, one line of context, then the primary action. The search
          field is the point of this page, so it opens the page instead of
          sitting under a row of tiles. */}
      <header className="mb-6">
        <h1 className="font-display text-3xl font-medium leading-tight text-foreground sm:text-4xl">
          Généalogie
        </h1>
        <p className="mt-1.5 max-w-[60ch] text-sm text-ink-2">
          {stats
            ? `${stats.total_individuals.toLocaleString('fr-FR')} personnes et ${stats.total_families.toLocaleString('fr-FR')} familles, reliées sur une trentaine de générations.`
            : 'Recherche par nom, lieu, période, métier ou distinction.'}
        </p>
      </header>

      {/* Search + filters */}
      <search className="block">
        <div className="flex items-end gap-2">
          <Field label="Rechercher une personne" hideLabel className="min-w-0 flex-1">
            {(fieldProps) => (
              <div className="relative">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                />
                <Input
                  {...fieldProps}
                  ref={searchRef}
                  type="search"
                  placeholder="Nom, prénom, ou les deux (ex. jean dupont)"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="h-11 pl-9 pr-10"
                />
                {nameInput && (
                  <button
                    type="button"
                    aria-label="Effacer la recherche"
                    onClick={() => {
                      setNameInput('')
                      searchRef.current?.focus()
                    }}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </Field>
          <Button
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className="h-11"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Filtres</span>
            {activeFilterCount > 0 && (
              <span className="rounded-[var(--radius-sm)] bg-primary px-1.5 font-mono text-[0.75rem] leading-4 tabular-nums text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {filtersOpen && (
          <div className="animate-fade-in mt-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Lieu">
                {(f) => (
                  <Input
                    {...f}
                    value={urlSearch.place ?? ''}
                    onChange={(e) => setFilter('place', e.target.value.trim())}
                    placeholder="ex. Servance"
                  />
                )}
              </Field>

              <div className="flex flex-col gap-1.5">
                <Label>Période (naissance ou décès)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Année de début"
                    value={urlSearch.year_from ?? ''}
                    onChange={(e) => setFilter('year_from', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="de" type="number" min={1} max={2100}
                    className="w-24 tabular-nums"
                  />
                  <span aria-hidden="true" className="text-ink-3">-</span>
                  <Input
                    aria-label="Année de fin"
                    value={urlSearch.year_to ?? ''}
                    onChange={(e) => setFilter('year_to', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="à" type="number" min={1} max={2100}
                    className="w-24 tabular-nums"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label id="filtre-sexe">Sexe</Label>
                <div role="group" aria-labelledby="filtre-sexe" className="flex flex-wrap gap-1.5">
                  {(['', 'M', 'F'] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={(urlSearch.sex ?? '') === s ? 'primary' : 'secondary'}
                      aria-pressed={(urlSearch.sex ?? '') === s}
                      onClick={() => setFilter('sex', s)}
                    >
                      {s === '' ? 'Tous' : s === 'M' ? 'Homme' : 'Femme'}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label id="filtre-branche">Branche</Label>
                <div role="group" aria-labelledby="filtre-branche" className="flex flex-wrap gap-1.5">
                  {([undefined, 1, 2] as const).map((b) => (
                    <Button
                      key={b ?? 'all'}
                      size="sm"
                      variant={urlSearch.branch === b ? 'primary' : 'secondary'}
                      aria-pressed={urlSearch.branch === b}
                      onClick={() => navigate({ search: (s) => ({ ...s, branch: b }) })}
                    >
                      {b == null ? 'Toutes' : branchLabel[b]}
                    </Button>
                  ))}
                </div>
              </div>

              <Field label="Catégorie de métier">
                {(f) => (
                  <Select
                    {...f}
                    value={urlSearch.prof_cat ?? ''}
                    onChange={(e) => navigate({ search: (s) => ({ ...s, prof_cat: e.target.value || undefined, prof_id: undefined }) })}
                  >
                    <option value="">Toutes</option>
                    {profCategories.map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABEL[cat] ?? cat}</option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Distinction">
                {(f) => (
                  <Select
                    {...f}
                    value={urlSearch.dist_id ?? ''}
                    onChange={(e) => navigate({ search: (s) => ({ ...s, dist_id: e.target.value ? Number(e.target.value) : undefined }) })}
                  >
                    <option value="">Toutes</option>
                    {distinctions?.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </Select>
                )}
              </Field>

              {urlSearch.prof_id != null && activeProfName && (
                <div className="flex flex-col gap-1.5">
                  <Label>Métier spécifique</Label>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate rounded-[var(--radius)] border border-border bg-surface-2 px-2.5 py-2 text-sm text-foreground">
                      {activeProfName}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Retirer le filtre de métier"
                      onClick={() => navigate({ search: (s) => ({ ...s, prof_id: undefined }) })}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {hasFilter && (
              <div className="mt-4 flex justify-end border-t border-border pt-3">
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Tout effacer
                </Button>
              </div>
            )}
          </div>
        )}
      </search>

      {/* Results / overview */}
      <div className="mt-8">
        {isError && <ErrorBanner message="La recherche a échoué." onRetry={() => void refetch()} />}

        {!hasFilter && (
          <div className="space-y-10">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats ? (
                <>
                  <StatCard value={stats.total_individuals.toLocaleString('fr-FR')} label="Personnes" />
                  <StatCard value={stats.total_families.toLocaleString('fr-FR')} label="Familles" />
                  <StatCard value={earliestLabel} label="Naissance la plus ancienne" />
                  <StatCard
                    value={String(stats.coverage.latest_birth ?? '—')}
                    label="Naissance la plus récente"
                  />
                </>
              ) : (
                Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
              )}
            </div>

            {/* Two columns from lg: ways in on the left, what is happening on
                the right. A single stacked column was the whole page before,
                which is why every block read at the same weight. */}
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="space-y-10">
                {stats && (
                  <Section title="Noms les plus portés">
                    <div className="flex flex-wrap gap-2">
                      {stats.top_surnames
                        .filter((s) => s.surname.length >= 2)
                        .slice(0, 12)
                        .map((s) => (
                          <EntryPill
                            key={s.surname}
                            count={s.n}
                            onClick={() => navigate({ search: (prev) => ({ ...prev, name: s.surname }) })}
                          >
                            {s.surname}
                          </EntryPill>
                        ))}
                    </div>
                  </Section>
                )}

                {stats && (
                  <Section title="Lieux les plus fréquents">
                    <div className="flex flex-wrap gap-2">
                      {stats.top_birth_places.slice(0, 10).map((p) => (
                        <EntryPill
                          key={p.place_id}
                          count={p.n}
                          to="/places/$id"
                          params={{ id: String(p.place_id) }}
                        >
                          {p.locality}
                        </EntryPill>
                      ))}
                    </div>
                  </Section>
                )}

                <Section title="Explorer">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <ShortcutLink
                      to="/map"
                      icon={Map}
                      label="Carte"
                      hint={stats ? `${stats.geocoded_places} lieux` : 'Lieux géolocalisés'}
                    />
                    <ShortcutLink to="/stats" icon={BarChart2} label="Statistiques" hint="Vue d'ensemble" />
                    <ShortcutLink
                      to="/tree/$id"
                      params={{ id: 'I1' }}
                      icon={GitBranch}
                      label="Arbre"
                      hint="Ascendants et descendants"
                    />
                  </div>
                </Section>
              </div>

              <div className="space-y-10">
                {onThisDay && (onThisDay.individuals.length > 0 || onThisDay.marriages.length > 0) && (
                  <Section
                    title="En ce jour"
                    count={onThisDay.individuals.length + onThisDay.marriages.length}
                  >
                    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
                      {onThisDay.individuals.slice(0, 8).map((p, i) => (
                        <li key={`${p.id}-${p.event_type}-${i}`}>
                          <Link
                            to="/people/$id"
                            params={{ id: p.id }}
                            className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2"
                          >
                            <Badge
                              tone={p.event_type === 'naissance' ? 'event-birth' : 'event-death'}
                              className="w-[70px] justify-center"
                            >
                              {p.event_type === 'naissance' ? 'Naissance' : 'Décès'}
                            </Badge>
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                              {p.name ?? p.id}
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
                              {p.event_year}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {onThisDay.marriages.slice(0, 3).map((m) => (
                        <li key={m.family_id}>
                          <Link
                            to="/families/$id"
                            params={{ id: m.family_id }}
                            className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2"
                          >
                            <Badge tone="event-marriage" className="w-[70px] justify-center">
                              Mariage
                            </Badge>
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                              {[m.husband_name, m.wife_name].filter(Boolean).join(' et ')}
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
                              {m.event_year}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {recent.length > 0 && (
                  <Section title="Récemment consultés">
                    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
                      {recent.map((p) => (
                        <li key={p.id}>
                          <Link
                            to="/people/$id"
                            params={{ id: p.id }}
                            className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2"
                          >
                            <SexMark sex={p.sex} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-foreground">
                                {p.name ?? 'Inconnu'}
                              </span>
                              {p.birth_place && (
                                <span className="block truncate text-xs text-ink-3">{p.birth_place}</span>
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
                              {formatLifespan(p.birth_year, p.death_year)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </div>
            </div>
          </div>
        )}

        {hasFilter && (
          <>
            {isFetching && offset === 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <PersonCardSkeleton key={i} />
                ))}
              </div>
            )}

            {allResults && allResults.length === 0 && !isFetching && !isError && (
              <EmptyState
                icon={Search}
                message="Aucun résultat"
                description="Élargissez la période, retirez un filtre, ou essayez une autre orthographe du nom."
                action={
                  <Button size="sm" onClick={clearFilters}>
                    Tout effacer
                  </Button>
                }
              />
            )}

            {allResults && allResults.length > 0 && (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-ink-2" aria-live="polite">
                    <span className="font-mono tabular-nums text-foreground">
                      {total.toLocaleString('fr-FR')}
                    </span>{' '}
                    {total > 1 ? 'résultats' : 'résultat'}
                    {isFetching && (
                      <span
                        aria-hidden="true"
                        className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border border-ink-3 border-t-transparent align-middle"
                      />
                    )}
                  </p>
                  <label className="flex items-center gap-2 text-xs text-ink-3">
                    Trier par
                    <Select
                      value={urlSearch.sort ?? 'name'}
                      onChange={(e) => navigate({ search: (s) => ({ ...s, sort: e.target.value === 'name' ? undefined : e.target.value }) })}
                      className="h-8 w-auto text-xs"
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {allResults.map((p) => (
                    <ResultCard key={p.id} p={p} />
                  ))}
                </div>

                {canLoadMore && (
                  <Button
                    onClick={() => setOffset((o) => o + PAGE_SIZE)}
                    loading={isFetching}
                    className="mt-4 w-full"
                  >
                    Charger plus
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PageContainer>
  )
}
