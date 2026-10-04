import { createFileRoute } from '@tanstack/react-router'
import { Shield } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { CatalogChip } from '@/components/ui/CatalogChip'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useMilitaryRanks, type MilitaryRankSummary } from '@/lib/api'

export const Route = createFileRoute('/military-ranks/')({
  component: MilitaryRanksPage,
})

const BRANCH_LABELS: Record<string, string> = {
  'armée-de-terre': 'Armée de terre',
  'marine':         'Marine',
  'gendarmerie':    'Gendarmerie',
  'garde':          'Garde',
  'étranger':       'Service étranger',
}

const ERA_LABELS: Record<string, string> = {
  'antique':       'Antiquité',
  'médiéval':      'Moyen Âge',
  'ancien-régime': 'Ancien Régime',
  'révolution':    'Révolution',
  'empire':        'Empire',
  'moderne':       'Époque moderne',
}

function MilitaryRanksPage() {
  const { data, isLoading, isError, refetch } = useMilitaryRanks()

  useEffect(() => {
    document.title = 'Grades militaires · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  const { branches, byBranch, noBranch, total } = useMemo(() => {
    const byBranch: Record<string, MilitaryRankSummary[]> = {}
    const noBranch: MilitaryRankSummary[] = []
    for (const r of data ?? []) {
      if (r.branch) (byBranch[r.branch] ??= []).push(r)
      else noBranch.push(r)
    }
    return {
      byBranch,
      noBranch,
      branches: Object.keys(byBranch).sort(),
      total: (data ?? []).reduce((s, r) => s + r.count, 0),
    }
  }, [data])

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Grades militaires" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </PageContainer>
    )
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="Grades militaires" />
        <ErrorBanner
          message="Impossible de charger les grades militaires."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        icon={<Shield size={17} />}
        title="Grades militaires"
        subtitle={`${data.length} grades, ${total.toLocaleString('fr-FR')} mentions individuelles.`}
      />

      <div className="space-y-8">
        {branches.map((branch) => (
          <Section key={branch} title={BRANCH_LABELS[branch] ?? branch} count={byBranch[branch].length}>
            <div className="flex flex-wrap gap-2">
              {byBranch[branch].map((r) => (
                <CatalogChip
                  key={r.id}
                  to="/military-ranks/$id"
                  params={{ id: String(r.id) }}
                  name={r.name}
                  count={r.count}
                  detail={r.era ? (ERA_LABELS[r.era] ?? r.era) : null}
                />
              ))}
            </div>
          </Section>
        ))}

        {noBranch.length > 0 && (
          <Section title="Autres" count={noBranch.length}>
            <div className="flex flex-wrap gap-2">
              {noBranch.map((r) => (
                <CatalogChip
                  key={r.id}
                  to="/military-ranks/$id"
                  params={{ id: String(r.id) }}
                  name={r.name}
                  count={r.count}
                  detail={r.era ? (ERA_LABELS[r.era] ?? r.era) : null}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </PageContainer>
  )
}
