import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { CatalogChip } from '@/components/ui/CatalogChip'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useDistinctions, type DistinctionSummary } from '@/lib/api'

export const Route = createFileRoute('/distinctions/')({
  component: DistinctionsPage,
})

const CATEGORY_LABELS: Record<string, string> = {
  croisade: 'Croisades',
  guerre:   'Guerres et conflits',
}

function yearRange(d: DistinctionSummary): string | null {
  if (!d.year_start) return null
  if (d.year_end && d.year_end !== d.year_start) return `${d.year_start}-${d.year_end}`
  return String(d.year_start)
}

function DistinctionsPage() {
  const { data, isLoading, isError, refetch } = useDistinctions()

  useEffect(() => {
    document.title = 'Distinctions · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  const { categories, byCategory, uncategorized, total } = useMemo(() => {
    const byCategory: Record<string, DistinctionSummary[]> = {}
    const uncategorized: DistinctionSummary[] = []
    for (const d of data ?? []) {
      if (d.category) (byCategory[d.category] ??= []).push(d)
      else uncategorized.push(d)
    }
    return {
      byCategory,
      uncategorized,
      categories: Object.keys(byCategory).sort(),
      total: (data ?? []).reduce((s, d) => s + d.count, 0),
    }
  }, [data])

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Distinctions" />
        <Skeleton className="h-48 rounded-[var(--radius-lg)]" />
      </PageContainer>
    )
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="Distinctions" />
        <ErrorBanner
          message="Impossible de charger les distinctions."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Distinctions"
        subtitle={`${data.length} distinctions, ${total.toLocaleString('fr-FR')} mentions. Ouvrez-en une pour voir qui la portait.`}
      />

      <div className="space-y-8">
        {categories.map((cat) => (
          <Section key={cat} title={CATEGORY_LABELS[cat] ?? cat} count={byCategory[cat].length}>
            <div className="flex flex-wrap gap-2">
              {byCategory[cat].map((d) => (
                <CatalogChip
                  key={d.id}
                  to="/distinctions/$id"
                  params={{ id: String(d.id) }}
                  name={d.name}
                  count={d.count}
                  detail={yearRange(d)}
                />
              ))}
            </div>
          </Section>
        ))}

        {uncategorized.length > 0 && (
          <Section title="Autres" count={uncategorized.length}>
            <div className="flex flex-wrap gap-2">
              {uncategorized.map((d) => (
                <CatalogChip
                  key={d.id}
                  to="/distinctions/$id"
                  params={{ id: String(d.id) }}
                  name={d.name}
                  count={d.count}
                  detail={yearRange(d)}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </PageContainer>
  )
}
