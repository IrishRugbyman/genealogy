import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FamilyTree } from '@/components/tree/FamilyTree'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Spinner } from '@/components/ui/Spinner'
import { fetchTreeNeighbourhood, fetchTreePeople, useSession } from '@/lib/api'
import {
  mergePeople,
  requiredIds,
  stateForDepth,
  type TreePerson,
  type TreeState,
} from '@/lib/tree'

export const Route = createFileRoute('/tree/$id')({
  component: TreePage,
})

const UP_CHOICES = [2, 3, 4, 5]
const DOWN_CHOICES = [0, 1, 2, 3]

/* Three generations of ancestors is what a pedigree is opened for, and it fits
   a desktop screen; a phone gets two and pans for the rest. */
function defaultUp(): number {
  return window.matchMedia('(min-width: 68rem)').matches ? 3 : 2
}

function TreePage() {
  const { id } = Route.useParams()
  const family = useSession().data?.family ?? false
  const [depth, setDepth] = useState(() => ({ up: defaultUp(), down: 1 }))

  // Everything the tree draws on opening comes in one request.
  const hood = useQuery({
    queryKey: ['tree', id, depth.up, depth.down],
    queryFn: () => fetchTreeNeighbourhood(id, depth.up, depth.down),
    staleTime: 5 * 60_000,
  })

  const [cache, setCache] = useState<Map<string, TreePerson>>(new Map())
  const [state, setState] = useState<TreeState | null>(null)
  const [fitToken, setFitToken] = useState(0)

  // A new focus, a new depth, or a sign-in/out starts the tree over from the
  // neighbourhood: the cache is rebuilt rather than patched, so no box drawn
  // for the previous viewer (masked, or not) survives the change.
  const layoutKey = `${id}|${depth.up}|${depth.down}|${family}`
  const appliedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!hood.data) return
    if (appliedKey.current === layoutKey) {
      setCache((prev) => mergePeople(prev, hood.data))
      return
    }
    appliedKey.current = layoutKey
    const fresh = mergePeople(new Map(), hood.data)
    setCache(fresh)
    setState(stateForDepth(id, depth.up, depth.down, fresh))
    setFitToken((t) => t + 1)
  }, [hood.data, layoutKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // What an expansion reveals beyond the neighbourhood, in one batch.
  const needed = useMemo(() => (state ? requiredIds(state, cache) : []), [state, cache])
  const batchKey = [...needed].sort().join(',')
  const batch = useQuery({
    queryKey: ['tree-people', batchKey],
    queryFn: () => fetchTreePeople(needed),
    enabled: needed.length > 0,
    staleTime: 5 * 60_000,
  })
  useEffect(() => {
    if (batch.data) setCache((prev) => mergePeople(prev, batch.data))
  }, [batch.data])

  const loadingIds = useMemo(
    () => new Set(batch.isFetching ? needed : []),
    [batch.isFetching, needed],
  )

  const focus = cache.get(id)
  useEffect(() => {
    document.title = `${focus?.name ?? id} · Arbre · Généalogie`
    return () => { document.title = 'Généalogie' }
  }, [focus?.name, id])

  if (hood.isError) {
    return (
      <PageContainer>
        <PageHeader title="Personne introuvable" back={{ to: '/', label: 'Retour à la recherche' }} />
        <ErrorBanner
          message="Cette fiche n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void hood.refetch()}
        />
      </PageContainer>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Thin context bar. The canvas below wants every remaining pixel. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2 sm:px-6">
        <Link
          to="/people/$id"
          params={{ id }}
          className="group inline-flex min-w-0 items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-foreground"
        >
          <ChevronRight
            size={14}
            aria-hidden="true"
            className="shrink-0 rotate-180 transition-transform duration-150 ease-[var(--ease-out-expo)] group-hover:-translate-x-0.5"
          />
          <span className="truncate">{focus?.name ?? id}</span>
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2 text-xs text-ink-3">
            Ascendants
            <SegmentedControl
              label="Générations d'ascendants affichées"
              options={UP_CHOICES.map((n) => ({ key: String(n), label: String(n) }))}
              value={String(depth.up)}
              onChange={(v) => setDepth((d) => ({ ...d, up: Number(v) }))}
            />
          </span>
          <span className="flex items-center gap-2 text-xs text-ink-3">
            Descendants
            <SegmentedControl
              label="Générations de descendants affichées"
              options={DOWN_CHOICES.map((n) => ({ key: String(n), label: String(n) }))}
              value={String(depth.down)}
              onChange={(v) => setDepth((d) => ({ ...d, down: Number(v) }))}
            />
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {state ? (
          <FamilyTree
            state={state}
            cache={cache}
            loadingIds={loadingIds}
            onStateChange={setState}
            fitToken={fitToken}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-6 w-6 text-ink-3" />
          </div>
        )}
      </div>
    </div>
  )
}
