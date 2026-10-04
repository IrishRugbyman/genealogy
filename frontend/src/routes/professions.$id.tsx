import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { PersonList, PersonListRow } from '@/components/person/PersonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useProfession } from '@/lib/api'

export const Route = createFileRoute('/professions/$id')({
  component: ProfessionDetailPage,
})

function ProfessionDetailPage() {
  const { id } = Route.useParams()
  const profId = parseInt(id, 10)
  const { data, isLoading, isError, refetch } = useProfession(isNaN(profId) ? null : profId)

  useEffect(() => {
    if (!data) return
    document.title = `${data.name} · Généalogie`
    return () => { document.title = 'Généalogie' }
  }, [data?.name])

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="mb-4 h-4 w-16" />
        <Skeleton className="mb-6 h-9 w-56" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </PageContainer>
    )
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="Métier introuvable" back={{ to: '/professions', label: 'Tous les métiers' }} />
        <ErrorBanner
          message="Ce métier n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  const n = data.individuals.length

  return (
    <PageContainer>
      <PageHeader
        title={data.name}
        back={{ to: '/professions', label: 'Tous les métiers' }}
        subtitle={[
          `${n} personne${n !== 1 ? 's' : ''}`,
          data.category,
        ].filter(Boolean).join(' · ')}
        actions={
          <Link
            to="/"
            search={{ prof_id: data.id }}
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
          message="Personne enregistrée pour ce métier"
          description="Le métier figure au catalogue mais n'est encore rattaché à aucune fiche."
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
              />
            ))}
          </PersonList>
        </Section>
      )}
    </PageContainer>
  )
}
