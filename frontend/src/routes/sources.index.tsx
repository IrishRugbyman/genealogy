import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Input } from '@/components/ui/Field'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSources, type SourceSummary } from '@/lib/api'

export const Route = createFileRoute('/sources/')({
  component: SourcesPage,
})

/* The research's works, by kind, then the compiler's: his SOUR lines are free
   text, one source per distinct text, so they are listed apart rather than mixed
   into a bibliography they do not follow. */
const KINDS: Array<{ key: string; label: string }> = [
  { key: 'registre', label: 'Registres' },
  { key: 'liasse', label: "Liasses et pièces d'archives" },
  { key: 'manuscrit', label: 'Manuscrits' },
  { key: 'correspondance', label: 'Correspondance' },
  { key: 'ouvrage', label: 'Ouvrages' },
  { key: 'article', label: 'Articles' },
  { key: 'revue', label: 'Revues' },
  { key: 'carte', label: 'Cartes' },
  { key: 'base', label: 'Bases et inventaires en ligne' },
  { key: 'arbre', label: 'Arbres en ligne' },
]

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function haystack(s: SourceSummary): string {
  return fold(
    [s.title, s.author, s.publication, s.repository, s.call_number, s.date_text]
      .filter(Boolean)
      .join(' '),
  )
}

function SourceRow({ s }: { s: SourceSummary }) {
  const holding = [s.repository, s.call_number].filter(Boolean).join(', ')
  const uses = [
    s.link_count > 0 && `${s.link_count} lien${s.link_count > 1 ? 's' : ''}`,
    s.cited_by_count > 0 && `cité ${s.cited_by_count} fois de seconde main`,
  ].filter(Boolean)
  return (
    <li>
      <Link
        to="/sources/$id"
        params={{ id: s.id }}
        className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-foreground">
            {s.author && <span className="text-ink-2">{s.author}, </span>}
            {s.title}
          </span>
          {(holding || s.publication) && (
            <span className="mt-0.5 block text-xs text-ink-3">
              {[s.publication, holding].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right text-xs text-ink-3">
          {s.date_text && (
            <span className="block font-mono tabular-nums text-ink-2">{s.date_text}</span>
          )}
          {uses.length > 0 ? (
            <span className="block">{uses.join(' · ')}</span>
          ) : (
            <span className="block">pas encore citée</span>
          )}
        </span>
      </Link>
    </li>
  )
}

function SourceGroup({ title, sources }: { title: string; sources: SourceSummary[] }) {
  return (
    <Section title={title} count={sources.length}>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
        {sources.map((s) => (
          <SourceRow key={s.id} s={s} />
        ))}
      </ul>
    </Section>
  )
}

function SourcesPage() {
  const { data, isLoading, isError, refetch } = useSources()
  const [q, setQ] = useState('')

  useEffect(() => {
    document.title = 'Sources · Généalogie'
    return () => {
      document.title = 'Généalogie'
    }
  }, [])

  const groups = useMemo(() => {
    const needle = fold(q.trim())
    const shown = (data ?? []).filter((s) => !needle || haystack(s).includes(needle))
    const research = shown.filter((s) => s.origin === 'research')
    const known = new Set(KINDS.map((k) => k.key))
    return {
      byKind: KINDS.map((k) => ({
        ...k,
        sources: research.filter((s) => s.kind === k.key),
      })).filter((g) => g.sources.length > 0),
      other: research.filter((s) => !s.kind || !known.has(s.kind)),
      exported: shown.filter((s) => s.origin === 'export'),
      total: shown.length,
    }
  }, [data, q])

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Sources" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </PageContainer>
    )
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="Sources" />
        <ErrorBanner message="Impossible de charger les sources." onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  const nResearch = data.filter((s) => s.origin === 'research').length

  return (
    <PageContainer>
      <PageHeader
        title="Sources"
        subtitle={`${nResearch} ouvrages, registres et fonds lus ou repérés par nos recherches, et ${data.length - nResearch} sources de l'arbre du compilateur. Ouvrez une source pour voir chaque acte qu'on y a lu et les fiches qui s'appuient dessus.`}
      />

      <div className="mb-8 max-w-md">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Titre, auteur, dépôt, cote…"
          aria-label="Filtrer les sources"
          className="w-full"
        />
      </div>

      {groups.total === 0 ? (
        <EmptyState message="Aucune source ne correspond" description="Essayez un autre mot." />
      ) : (
        <div className="space-y-8">
          {groups.byKind.map((g) => (
            <SourceGroup key={g.key} title={g.label} sources={g.sources} />
          ))}
          {groups.other.length > 0 && <SourceGroup title="Autres" sources={groups.other} />}
          {groups.exported.length > 0 && (
            <Section
              title="Sources de l'arbre du compilateur"
              count={groups.exported.length}
              actions={<Badge>GEDCOM</Badge>}
            >
              <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
                {groups.exported.map((s) => (
                  <SourceRow key={s.id} s={s} />
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </PageContainer>
  )
}
