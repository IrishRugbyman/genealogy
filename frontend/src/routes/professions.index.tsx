import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useProfessions, type ProfessionSummary } from '@/lib/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/professions/')({
  component: ProfessionsPage,
})

/* The previous version gave each of the fourteen categories its own hue. The
   chips are already grouped under a heading that names the category, so the
   colour restated what the heading said and produced fourteen barely-separable
   fills doing it. Chips are neutral now; the grouping carries the meaning. */

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: 'agriculture',    label: 'Agriculture' },
  { key: 'textile',        label: 'Textile' },
  { key: 'artisanat',      label: 'Artisanat' },
  { key: 'maritime',       label: 'Maritime' },
  { key: 'mines',          label: 'Mines' },
  { key: 'commerce',       label: 'Commerce' },
  { key: 'droit',          label: 'Droit et notariat' },
  { key: 'médecine',       label: 'Médecine' },
  { key: 'militaire',      label: 'Militaire' },
  { key: 'administration', label: 'Administration' },
  { key: 'religion',       label: 'Religion' },
  { key: 'enseignement',   label: 'Enseignement' },
  { key: 'arts-lettres',   label: 'Arts et lettres' },
  { key: 'journalier',     label: 'Journaliers et ouvriers' },
]

export function CatalogChip({
  to,
  params,
  name,
  count,
}: {
  to: string
  params: Record<string, string>
  name: string
  count?: number
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius)] border border-border bg-card px-2.5 py-1.5 text-sm text-foreground',
        'transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out-expo)]',
        'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:translate-y-px',
      )}
    >
      <span className="truncate">{name}</span>
      {count != null && (
        <span className="font-mono text-xs tabular-nums text-ink-3">{count}</span>
      )}
    </Link>
  )
}

function ProfessionsPage() {
  const { data, isLoading, isError, refetch } = useProfessions()

  useEffect(() => {
    document.title = 'Métiers · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  const { byCategory, uncategorized, mentions } = useMemo(() => {
    const sectionKeys = new Set(SECTIONS.map((s) => s.key))
    const byCategory: Record<string, ProfessionSummary[]> = {}
    const uncategorized: ProfessionSummary[] = []
    for (const p of data ?? []) {
      // A profession lands in "Autres" if it has no category OR its category has
      // no dedicated section, so a new category is never silently dropped.
      if (p.category && sectionKeys.has(p.category)) (byCategory[p.category] ??= []).push(p)
      else uncategorized.push(p)
    }
    return {
      byCategory,
      uncategorized,
      mentions: (data ?? []).reduce((s, p) => s + p.count, 0),
    }
  }, [data])

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Métiers" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </PageContainer>
    )
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="Métiers" />
        <ErrorBanner message="Impossible de charger les métiers." onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Métiers"
        subtitle={`${data.length} métiers distincts, ${mentions.toLocaleString('fr-FR')} mentions. Ouvrez un métier pour voir qui l'exerçait.`}
      />

      <div className="space-y-8">
        {SECTIONS.filter((s) => byCategory[s.key]?.length).map((s) => (
          <Section key={s.key} title={s.label} count={byCategory[s.key].length}>
            <div className="flex flex-wrap gap-2">
              {byCategory[s.key].map((p) => (
                <CatalogChip
                  key={p.id}
                  to="/professions/$id"
                  params={{ id: String(p.id) }}
                  name={p.name}
                  count={p.count}
                />
              ))}
            </div>
          </Section>
        ))}

        {uncategorized.length > 0 && (
          <Section title="Autres" count={uncategorized.length}>
            <div className="flex flex-wrap gap-2">
              {uncategorized.map((p) => (
                <CatalogChip
                  key={p.id}
                  to="/professions/$id"
                  params={{ id: String(p.id) }}
                  name={p.name}
                  count={p.count}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </PageContainer>
  )
}
