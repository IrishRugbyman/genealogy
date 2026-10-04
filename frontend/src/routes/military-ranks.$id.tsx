import { createFileRoute } from '@tanstack/react-router'
import { Shield } from 'lucide-react'
import { useEffect } from 'react'
import { PersonList, PersonListRow } from '@/components/person/PersonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useMilitaryRank } from '@/lib/api'

export const Route = createFileRoute('/military-ranks/$id')({
  component: MilitaryRankDetailPage,
})

const ERA_LABELS: Record<string, string> = {
  'antique':       'Antiquité',
  'médiéval':      'Moyen Âge',
  'ancien-régime': 'Ancien Régime',
  'révolution':    'Révolution',
  'empire':        'Empire',
  'moderne':       'Époque moderne',
}

function MilitaryRankDetailPage() {
  const { id } = Route.useParams()
  const rankId = parseInt(id, 10)
  const { data, isLoading, isError, refetch } = useMilitaryRank(isNaN(rankId) ? null : rankId)

  useEffect(() => {
    if (!data) return
    document.title = `${data.name} · Généalogie`
    return () => { document.title = 'Généalogie' }
  }, [data?.name])

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="mb-4 h-4 w-16" />
        <Skeleton className="mb-6 h-9 w-64" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </PageContainer>
    )
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="Grade introuvable" back={{ to: '/military-ranks', label: 'Tous les grades' }} />
        <ErrorBanner
          message="Ce grade n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  const n = data.individuals.length
  const meta = [
    `${n} personne${n !== 1 ? 's' : ''}`,
    data.branch,
    data.era ? (ERA_LABELS[data.era] ?? data.era) : null,
    data.grade != null ? `grade ${data.grade}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <PageContainer>
      <PageHeader
        icon={<Shield size={17} />}
        title={data.name}
        subtitle={meta}
        back={{ to: '/military-ranks', label: 'Tous les grades' }}
      />

      {data.description && (
        <p className="mb-8 max-w-[70ch] border-l-2 border-border pl-4 text-sm leading-relaxed text-ink-2">
          {data.description}
        </p>
      )}

      {n === 0 ? (
        <EmptyState
          message="Personne enregistrée pour ce grade"
          description="Le grade figure au catalogue mais n'est encore rattaché à aucune fiche."
        />
      ) : (
        <Section title="Personnes" count={n}>
          <PersonList>
            {data.individuals.map((p) => (
              <PersonListRow
                key={p.id}
                id={p.id}
                name={p.name}
                sex={p.sex}
                birthYear={p.birth_year}
                deathYear={p.death_year}
                place={p.birth_locality}
                placeId={p.birth_place_id}
                note={[p.regiment, p.note].filter(Boolean).join(' · ') || null}
                trailing={
                  p.year_start ? `${p.year_start}${p.year_end ? ` - ${p.year_end}` : ''}` : null
                }
              />
            ))}
          </PersonList>
        </Section>
      )}
    </PageContainer>
  )
}
