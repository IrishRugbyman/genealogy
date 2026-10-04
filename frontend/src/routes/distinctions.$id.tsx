import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { PersonList, PersonListRow } from '@/components/person/PersonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useDistinction } from '@/lib/api'

export const Route = createFileRoute('/distinctions/$id')({
  component: DistinctionDetailPage,
})

function DistinctionDetailPage() {
  const { id } = Route.useParams()
  const distId = parseInt(id, 10)
  const { data, isLoading, isError, refetch } = useDistinction(isNaN(distId) ? null : distId)

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
        <PageHeader title="Distinction introuvable" back={{ to: '/distinctions', label: 'Toutes les distinctions' }} />
        <ErrorBanner
          message="Cette distinction n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  const years = data.year_start
    ? (data.year_end && data.year_end !== data.year_start
        ? `${data.year_start}-${data.year_end}`
        : String(data.year_start))
    : null

  const n = data.individuals.length

  return (
    <PageContainer>
      <PageHeader
        title={data.name}
        back={{ to: '/distinctions', label: 'Toutes les distinctions' }}
        subtitle={[`${n} personne${n !== 1 ? 's' : ''}`, data.category, years]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <Link
            to="/"
            search={{ dist_id: data.id }}
            className="text-sm text-ink-2 underline-offset-2 hover:text-primary hover:underline"
          >
            Filtrer dans la recherche
          </Link>
        }
      />

      {data.description && (
        <p className="mb-8 max-w-[70ch] border-l-2 border-border pl-4 text-sm leading-relaxed text-ink-2">
          {data.description}
        </p>
      )}

      {n === 0 ? (
        <EmptyState
          message="Personne enregistrée pour cette distinction"
          description="La distinction figure au catalogue mais n'est encore rattachée à aucune fiche."
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
                note={p.distinction_note ?? p.individual_note ?? p.death_note ?? null}
              />
            ))}
          </PersonList>
        </Section>
      )}
    </PageContainer>
  )
}
