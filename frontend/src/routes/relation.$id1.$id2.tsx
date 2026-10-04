import { createFileRoute, Link } from '@tanstack/react-router'
import { GitMerge } from 'lucide-react'
import { useEffect } from 'react'
import { SexMark } from '@/components/person/PersonChip'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCommonAncestors, usePerson, type CommonAncestor } from '@/lib/api'
import { cn, formatLifespan } from '@/lib/utils'

export const Route = createFileRoute('/relation/$id1/$id2')({
  component: RelationPage,
})

// Returns a plain-language description of the relationship given the closest
// common ancestor's depths. depth1 = generations from person1 to ancestor,
// depth2 = from person2 to ancestor.
function describeRelation(d1: number, d2: number): string {
  if (d1 === 0) return 'ancêtre direct'
  if (d2 === 0) return 'descendant direct'
  if (d1 === 1 && d2 === 1) return 'frère ou sœur'
  if (d1 === 1 && d2 === 2) return 'oncle ou tante'
  if (d2 === 1 && d1 === 2) return 'neveu ou nièce'
  if (d1 === 1 && d2 === 3) return 'grand-oncle ou grand-tante'
  if (d2 === 1 && d1 === 3) return 'petit-neveu ou petite-nièce'
  if (d1 === 2 && d2 === 2) return 'cousins germains'
  if (d1 === 3 && d2 === 3) return 'cousins issus de germains'
  if (d1 === 4 && d2 === 4) return 'cousins au 3e degré'
  if (d1 === d2) return `cousins au ${d1 - 1}e degré`
  // Cross-generational cousins
  const minD = Math.min(d1, d2)
  const diff = Math.abs(d1 - d2)
  const base = minD <= 2 ? 'germains' : `au ${minD - 1}e degré`
  const removed = diff === 1 ? 'une fois' : `${diff} fois`
  return `cousins ${base}, éloignés ${removed}`
}

function AncestorRow({ a }: { a: CommonAncestor }) {
  const rel = describeRelation(a.depth_from_id1, a.depth_from_id2)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <SexMark sex={a.sex} size="sm" />
        <Link
          to="/people/$id"
          params={{ id: a.id }}
          className="truncate text-sm text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {a.name ?? 'Inconnu'}
        </Link>
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
          {formatLifespan(a.birth_year, a.death_year)}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span className="font-mono tabular-nums">
          {a.depth_from_id1} / {a.depth_from_id2} générations
        </span>
        <Badge>{rel}</Badge>
      </span>
    </div>
  )
}

function PersonPill({ id }: { id: string }) {
  const { data, isLoading } = usePerson(id)
  if (isLoading) return <Skeleton className="h-9 w-44" />
  if (!data) return <span className="font-mono text-sm text-ink-3">{id}</span>
  return (
    <Link
      to="/people/$id"
      params={{ id }}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-2.5 py-1.5 text-sm',
        'transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out-expo)]',
        'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:translate-y-px',
      )}
    >
      <SexMark sex={data.sex} size="sm" />
      <span className="truncate text-foreground">{data.name ?? id}</span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
        {formatLifespan(data.birth_year, data.death_year)}
      </span>
    </Link>
  )
}

function RelationPage() {
  const { id1, id2 } = Route.useParams()
  const { data: ancestors, isLoading, isError, refetch } = useCommonAncestors(id1, id2)

  useEffect(() => {
    document.title = 'Relation · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  const closest = ancestors?.[0]
  const closestRel = closest
    ? describeRelation(closest.depth_from_id1, closest.depth_from_id2)
    : null

  return (
    <PageContainer>
      <PageHeader
        icon={<GitMerge size={17} />}
        title="Relation"
        subtitle="Le lien entre deux personnes, calculé par leur ancêtre commun le plus proche."
        back={{ to: '/', label: 'Retour à la recherche' }}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PersonPill id={id1} />
        <span aria-hidden="true" className="text-sm text-ink-3">et</span>
        <PersonPill id={id2} />
      </div>

      {/* The answer, stated once at the top. Everything below is the working. */}
      {!isLoading && closest && (
        <div
          className="animate-fade-in mb-8 rounded-[var(--radius-lg)] border p-4"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--accent) 7%, var(--surface))',
            borderColor: 'color-mix(in oklab, var(--accent) 28%, var(--surface))',
          }}
        >
          <p className="text-sm text-ink-2">Lien le plus proche</p>
          <p className="mt-0.5 font-display text-2xl font-medium capitalize leading-tight text-foreground">
            {closestRel}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            Par {closest.name ?? closest.id}, à {closest.total_depth} génération
            {closest.total_depth > 1 ? 's' : ''} de distance.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <ErrorBanner
          message="Impossible de calculer la relation."
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && ancestors?.length === 0 && (
        <EmptyState
          icon={GitMerge}
          message="Aucun ancêtre commun"
          description="Ces deux personnes n'ont pas d'ancêtre commun enregistré dans l'arbre. Elles peuvent être reliées par alliance plutôt que par le sang."
        />
      )}

      {!isLoading && ancestors && ancestors.length > 0 && (
        <Section title="Ancêtres communs" count={ancestors.length}>
          <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
            {ancestors.map((a) => (
              <AncestorRow key={a.id} a={a} />
            ))}
          </div>
        </Section>
      )}
    </PageContainer>
  )
}
