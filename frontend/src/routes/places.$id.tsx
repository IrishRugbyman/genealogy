import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/Badge'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SectionSkeleton } from '@/components/ui/Skeleton'
import { usePlaceDetail } from '@/lib/api'
import { DescriptionPanel, EventTabs, LocalityList, kindLabel } from '@/components/place/placeBits'

export const Route = createFileRoute('/places/$id')({
  component: PlacePage,
})

function PlacePage() {
  const { id } = Route.useParams()
  const placeId = parseInt(id, 10)
  const { data: place, isLoading, isError, refetch } = usePlaceDetail(isNaN(placeId) ? null : placeId)

  const displayName = [place?.name, place?.commune?.county ?? place?.county, place?.country]
    .filter(Boolean)
    .join(', ')

  useEffect(() => {
    document.title = `${displayName || id} · Généalogie`
    return () => { document.title = 'Généalogie' }
  }, [displayName, id])

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="mb-4 h-4 w-16" />
        <div className="mb-6 flex gap-3">
          <Skeleton className="h-10 w-10 rounded-[var(--radius)]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <SectionSkeleton rows={5} />
      </PageContainer>
    )
  }

  if (isError || !place) {
    return (
      <PageContainer>
        <PageHeader title="Lieu introuvable" back={{ to: '/', label: 'Retour à la recherche' }} />
        <ErrorBanner
          message="Ce lieu n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  // A chef-lieu whose name equals its commune IS the commune; its locality page
  // would just duplicate the commune page (same name, same description, same
  // events). Send it to the single canonical commune page instead.
  if (
    place.kind === 'chef-lieu' &&
    place.commune_insee &&
    place.commune &&
    place.name === place.commune.nom
  ) {
    return <Navigate to="/communes/$insee" params={{ insee: place.commune_insee }} replace />
  }

  const subtitle = [
    place.commune?.county ?? place.county,
    place.commune?.state ?? place.state,
    place.country,
  ].filter(Boolean).join(', ')

  return (
    <PageContainer>
      <PageHeader
        icon={<MapPin size={17} />}
        title={place.name ?? place.county ?? place.country ?? 'Lieu inconnu'}
        subtitle={subtitle}
        back={{ to: '/', label: 'Retour à la recherche' }}
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-3">
        {place.kind && <Badge>{kindLabel(place.kind)}</Badge>}
        {place.commune && place.commune.nom !== place.name && (
          <span>
            Commune de{' '}
            <Link
              to="/communes/$insee"
              params={{ insee: place.commune.insee }}
              className="text-ink-2 underline-offset-2 hover:text-primary hover:underline"
            >
              {place.commune.nom}
            </Link>
          </span>
        )}
        {place.commune_insee && (
          <span className="font-mono tabular-nums">INSEE {place.commune_insee}</span>
        )}
        {place.lat != null && place.lon != null && (
          <span className="font-mono tabular-nums">
            {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
          </span>
        )}
      </div>

      {place.description ? (
        <div className="mb-8">
          <DescriptionPanel
            text={place.description}
            source={place.description_source}
          />
        </div>
      ) : place.commune?.description ? (
        /* No description for this locality: fall back to its commune's blurb. */
        <div className="mb-8">
          <DescriptionPanel
            text={place.commune.description}
            source={place.commune.description_source ?? 'Wikipédia'}
            url={place.commune.description_url}
            prefix={place.commune.nom}
          />
        </div>
      ) : null}

      <EventTabs born={place.born} died={place.died} married={place.married} />

      <LocalityList title="Autres lieux de la commune" localities={place.siblings} />
    </PageContainer>
  )
}
