import { createFileRoute, Link } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import { useEffect } from 'react'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton, SectionSkeleton } from '@/components/ui/Skeleton'
import { useCommuneDetail } from '@/lib/api'
import { DescriptionPanel, EventTabs, LocalityList } from '@/components/place/placeBits'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/communes/$insee')({
  component: CommunePage,
})

function CommunePage() {
  const { insee } = Route.useParams()
  const { data: commune, isLoading, isError, refetch } = useCommuneDetail(insee)

  useEffect(() => {
    document.title = `${commune?.nom ?? insee} · Généalogie`
    return () => { document.title = 'Généalogie' }
  }, [commune?.nom, insee])

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

  if (isError || !commune) {
    return (
      <PageContainer>
        <PageHeader title="Commune introuvable" back={{ to: '/', label: 'Retour à la recherche' }} />
        <ErrorBanner
          message="Cette commune n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  const subtitle = [commune.county, commune.state, commune.country ?? 'France']
    .filter(Boolean).join(', ')

  // The API already drops the self-referential chef-lieu (the locality whose name
  // equals the commune's), so `localities` is the distinct sub-localities only.
  const subLocalities = commune.localities

  return (
    <PageContainer>
      <PageHeader
        icon={<Building2 size={17} />}
        title={commune.nom ?? insee}
        subtitle={subtitle}
        back={{ to: '/', label: 'Retour à la recherche' }}
      />

      <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span className="font-mono tabular-nums">INSEE {commune.insee}</span>
        {subLocalities.length > 0 && (
          <span>
            {subLocalities.length} lieu{subLocalities.length > 1 ? 'x' : ''} rattaché
            {subLocalities.length > 1 ? 's' : ''}
          </span>
        )}
      </p>

      {commune.description && (
        <div className="mb-8">
          <DescriptionPanel
            text={commune.description}
            source={commune.description_source}
            url={commune.description_url}
          />
        </div>
      )}

      <EventTabs born={commune.born} died={commune.died} married={commune.married} />

      {commune.top_surnames.length > 0 && (
        <Section title="Noms les plus portés" className="mt-8">
          <div className="flex flex-wrap gap-2">
            {commune.top_surnames.map((s) => (
              <Link
                key={s.surname}
                to="/"
                search={{ name: s.surname }}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius)] border border-border bg-card px-2.5 py-1.5 text-sm text-foreground',
                  'transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out-expo)]',
                  'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:translate-y-px',
                )}
              >
                <span className="truncate">{s.surname}</span>
                <span className="font-mono text-xs tabular-nums text-ink-3">{s.n}</span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">Sur les naissances enregistrées dans la commune.</p>
        </Section>
      )}

      <LocalityList title="Lieux de la commune" localities={subLocalities} />
    </PageContainer>
  )
}
