import { createFileRoute, Link } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FamilyTree } from '@/components/tree/FamilyTree'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Spinner } from '@/components/ui/Spinner'
import { fetchPerson, usePerson } from '@/lib/api'
import {
  initialState,
  requiredIds,
  toTreePerson,
  type TreePerson,
  type TreeState,
} from '@/lib/tree'

export const Route = createFileRoute('/tree/$id')({
  component: TreePage,
})

function TreePage() {
  const { id } = Route.useParams()
  const { data: focusPerson, isLoading: focusLoading, isError: focusError, refetch } = usePerson(id)

  const [state, setState] = useState<TreeState>(() => initialState(id))

  // When the route param changes (user navigated to a different person in the tree),
  // reset state with the new focus.
  const prevIdRef = useRef(id)
  if (prevIdRef.current !== id) {
    prevIdRef.current = id
    setState(initialState(id))
  }

  // Cache of fetched TreePerson objects, shared across all fetches
  const [cache, setCache] = useState<Map<string, TreePerson>>(new Map())

  // Insert focus person into cache as soon as it arrives
  useEffect(() => {
    if (!focusPerson) return
    const tp = toTreePerson(focusPerson)
    setCache((prev) => {
      if (prev.get(id)?.id === tp.id) return prev
      const next = new Map(prev)
      next.set(id, tp)
      return next
    })
  }, [focusPerson, id])

  // Determine which additional IDs need fetching
  const needed = useMemo(() => requiredIds(state, cache), [state, cache])

  // Fire one query per needed ID in parallel using useQueries
  const extraResults = useQueries({
    queries: needed.map((pid) => ({
      queryKey: ['person', pid],
      queryFn: () => fetchPerson(pid),
      staleTime: 5 * 60_000,
      enabled: true,
    })),
  })

  // Merge newly arrived results into cache
  useEffect(() => {
    let changed = false
    const next = new Map(cache)
    for (let i = 0; i < needed.length; i++) {
      const result = extraResults[i]
      if (result?.data) {
        const tp = toTreePerson(result.data)
        if (!cache.has(needed[i])) {
          next.set(needed[i], tp)
          changed = true
        }
      }
    }
    if (changed) setCache(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraResults])

  const loadingIds = useMemo(() => {
    const s = new Set<string>()
    for (let i = 0; i < needed.length; i++) {
      if (extraResults[i]?.isLoading) s.add(needed[i])
    }
    if (focusLoading) s.add(id)
    return s
  }, [needed, extraResults, focusLoading, id])

  useEffect(() => {
    const name = focusPerson?.name ?? id
    document.title = `${name} · Arbre · Généalogie`
    return () => { document.title = 'Généalogie' }
  }, [focusPerson?.name, id])

  if (focusLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6 text-ink-3" />
      </div>
    )
  }

  if (focusError || !focusPerson) {
    return (
      <PageContainer>
        <PageHeader title="Personne introuvable" back={{ to: '/', label: 'Retour à la recherche' }} />
        <ErrorBanner
          message="Cette fiche n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Thin context bar. The canvas below wants every remaining pixel. */}
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border px-4 py-2.5 sm:px-6">
        <Link
          to="/people/$id"
          params={{ id }}
          className="group inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-foreground"
        >
          <ChevronRight
            size={14}
            aria-hidden="true"
            className="rotate-180 transition-transform duration-150 ease-[var(--ease-out-expo)] group-hover:-translate-x-0.5"
          />
          {focusPerson.name ?? id}
        </Link>
        <span className="text-xs text-ink-3">Arbre ascendant et descendant</span>
      </div>

      <div className="min-h-0 flex-1">
        <FamilyTree
          state={state}
          cache={cache}
          loadingIds={loadingIds}
          onStateChange={setState}
        />
      </div>
    </div>
  )
}
