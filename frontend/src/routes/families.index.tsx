import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Heart, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Field, Input, Label } from '@/components/ui/Field'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { PersonCardSkeleton } from '@/components/ui/Skeleton'
import { useFamilies, useFamilyCount, useStats, type FamilySearchParams } from '@/lib/api'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

const MARRIAGE_QUALIFIER: Record<string, string> = {
  ABT: 'v. ',
  BEF: 'avant ',
  AFT: 'après ',
}

interface FamiliesState {
  name?: string
  place?: string
  year_from?: number
  year_to?: number
  min_children?: number
}

export const Route = createFileRoute('/families/')({
  component: FamiliesBrowserPage,
  validateSearch: (raw): FamiliesState => ({
    name: typeof raw.name === 'string' && raw.name ? raw.name : undefined,
    place: typeof raw.place === 'string' && raw.place ? raw.place : undefined,
    year_from: typeof raw.year_from === 'number' ? raw.year_from : undefined,
    year_to: typeof raw.year_to === 'number' ? raw.year_to : undefined,
    min_children: typeof raw.min_children === 'number' ? raw.min_children : undefined,
  }),
})

function FamiliesBrowserPage() {
  const navigate = useNavigate({ from: '/families/' })
  const urlSearch = Route.useSearch()
  const [filtersOpen, setFiltersOpen] = useState(
    !!(urlSearch.place || urlSearch.year_from || urlSearch.year_to || urlSearch.min_children)
  )
  const [offset, setOffset] = useState(0)
  const [allResults, setAllResults] = useState<ReturnType<typeof useFamilies>['data']>(undefined)
  const [nameInput, setNameInput] = useState(urlSearch.name ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const hasFilter = !!(urlSearch.name || urlSearch.place || urlSearch.year_from || urlSearch.year_to || urlSearch.min_children)

  const searchParams: FamilySearchParams = {
    name: urlSearch.name,
    place: urlSearch.place || undefined,
    year_from: urlSearch.year_from,
    year_to: urlSearch.year_to,
    min_children: urlSearch.min_children,
    limit: PAGE_SIZE,
    offset,
  }

  const { data: page, isFetching, isError, refetch } = useFamilies(searchParams, hasFilter)
  const countParams = { ...searchParams }
  delete countParams.limit
  delete countParams.offset
  const { data: countData } = useFamilyCount(countParams, hasFilter)
  // The total used to be a hardcoded string in the copy, which had drifted away
  // from the real figure. It comes from the API now.
  const { data: stats } = useStats()

  useEffect(() => {
    if (!page) return
    if (offset === 0) setAllResults(page)
    else setAllResults((prev) => [...(prev ?? []), ...page])
  }, [page, offset])

  useEffect(() => {
    setOffset(0)
    setAllResults(undefined)
  }, [urlSearch.name, urlSearch.place, urlSearch.year_from, urlSearch.year_to, urlSearch.min_children])

  const canLoadMore = page && page.length === PAGE_SIZE

  function handleNameChange(v: string) {
    setNameInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      navigate({ search: (s) => ({ ...s, name: v || undefined }) })
    }, 300)
  }

  function clearFilters() {
    navigate({ search: {} })
    setNameInput('')
    setFiltersOpen(false)
  }

  useEffect(() => {
    document.title = 'Familles · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  const total = countData?.count ?? allResults?.length ?? 0

  return (
    <PageContainer>
      <PageHeader
        title="Familles"
        subtitle={
          hasFilter && countData
            ? `${countData.count.toLocaleString('fr-FR')} famille${countData.count > 1 ? 's' : ''} trouvée${countData.count > 1 ? 's' : ''}.`
            : stats
              ? `${stats.total_families.toLocaleString('fr-FR')} familles dans l'arbre. Cherchez un époux ou une épouse pour commencer.`
              : "Cherchez un époux ou une épouse pour commencer."
        }
      />

      <search className="block">
        <div className="flex items-end gap-2">
          <Field label="Rechercher une famille" hideLabel className="min-w-0 flex-1">
            {(f) => (
              <div className="relative">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                />
                <Input
                  {...f}
                  ref={searchRef}
                  type="search"
                  placeholder="Nom d'époux ou d'épouse"
                  value={nameInput}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="h-11 pl-9 pr-10"
                />
                {nameInput && (
                  <button
                    type="button"
                    aria-label="Effacer la recherche"
                    onClick={() => {
                      setNameInput('')
                      navigate({ search: (s) => ({ ...s, name: undefined }) })
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
          </Button>
        </div>

        {filtersOpen && (
          <div className="animate-fade-in mt-3 rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Lieu de mariage">
                {(f) => (
                  <Input
                    {...f}
                    placeholder="Localité"
                    value={urlSearch.place ?? ''}
                    onChange={(e) => navigate({ search: (s) => ({ ...s, place: e.target.value || undefined }) })}
                  />
                )}
              </Field>

              <div className="flex flex-col gap-1.5">
                <Label>Année de mariage</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    aria-label="Année de début"
                    placeholder="de"
                    value={urlSearch.year_from ?? ''}
                    onChange={(e) => navigate({ search: (s) => ({ ...s, year_from: e.target.value ? Number(e.target.value) : undefined }) })}
                    className="w-24 tabular-nums"
                  />
                  <span aria-hidden="true" className="text-ink-3">-</span>
                  <Input
                    type="number"
                    aria-label="Année de fin"
                    placeholder="à"
                    value={urlSearch.year_to ?? ''}
                    onChange={(e) => navigate({ search: (s) => ({ ...s, year_to: e.target.value ? Number(e.target.value) : undefined }) })}
                    className="w-24 tabular-nums"
                  />
                </div>
              </div>

              <Field label="Nombre d'enfants minimum">
                {(f) => (
                  <Input
                    {...f}
                    type="number"
                    min={1}
                    value={urlSearch.min_children ?? ''}
                    onChange={(e) => navigate({ search: (s) => ({ ...s, min_children: e.target.value ? Number(e.target.value) : undefined }) })}
                    className="w-24 tabular-nums"
                  />
                )}
              </Field>
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

      <div className="mt-8">
        {isError && (
          <ErrorBanner message="La recherche a échoué." onRetry={() => void refetch()} />
        )}

        {!hasFilter && (
          <EmptyState
            icon={Heart}
            message="Commencez par un nom"
            description="Saisissez un nom d'époux ou d'épouse, ou ouvrez les filtres pour parcourir par lieu, par période ou par taille de fratrie."
          />
        )}

        {hasFilter && (
          <>
            {isFetching && offset === 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <PersonCardSkeleton key={i} />)}
              </div>
            )}

            {allResults && allResults.length === 0 && !isFetching && !isError && (
              <EmptyState
                icon={Heart}
                message="Aucune famille trouvée"
                description="Élargissez la période ou retirez un filtre."
                action={
                  <Button size="sm" onClick={clearFilters}>
                    Tout effacer
                  </Button>
                }
              />
            )}

            {allResults && allResults.length > 0 && (
              <>
                <p className="mb-3 text-sm text-ink-2" aria-live="polite">
                  <span className="font-mono tabular-nums text-foreground">
                    {total.toLocaleString('fr-FR')}
                  </span>{' '}
                  {total > 1 ? 'familles' : 'famille'}
                  {isFetching && (
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border border-ink-3 border-t-transparent align-middle"
                    />
                  )}
                </p>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {allResults.map((f) => (
                    <Link
                      key={f.id}
                      to="/families/$id"
                      params={{ id: f.id }}
                      className={cn(
                        'flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-border bg-card p-3',
                        'transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)]',
                        'hover:border-[var(--rule-strong)] hover:shadow-[var(--shadow-md)]',
                        'active:translate-y-px active:shadow-none',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium leading-snug text-foreground">
                            {f.husband_name ?? 'Inconnu'}
                          </span>
                          <span className="block truncate text-sm leading-snug text-ink-2">
                            et {f.wife_name ?? 'Inconnue'}
                          </span>
                        </div>
                        {f.child_count > 0 && (
                          <span className="shrink-0 rounded-[var(--radius-sm)] border border-border px-1.5 py-px font-mono text-[11px] leading-5 tabular-nums text-ink-3">
                            {f.child_count}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
                        {f.marriage_year && (
                          <span className="font-mono tabular-nums">
                            {MARRIAGE_QUALIFIER[f.marriage_qualifier ?? ''] ?? ''}
                            {f.marriage_year}
                          </span>
                        )}
                        {f.marriage_locality && <span className="truncate">{f.marriage_locality}</span>}
                      </div>
                    </Link>
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
