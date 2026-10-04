import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { TableRowSkeleton } from '@/components/ui/Skeleton'
import { usePlaceGaps, type PlaceGap } from '@/lib/api'

export const Route = createFileRoute('/gaps')({
  component: GapsPage,
})

type GapFilter = 'all' | 'no_coords' | 'no_country' | 'fr_no_insee'

/* The three gap kinds used to be colour-coded (amber / violet / rose) both in
   the filter row and again as tinted tags in every table row. The tag already
   spells out which gap it is, so the hue was decoration on top of a label -
   and three hues repeated down a long table is exactly the confetti this
   redesign is removing. They are neutral tags now. */
const FILTERS: { key: GapFilter; label: string }[] = [
  { key: 'all',         label: 'Tous' },
  { key: 'no_coords',   label: 'Sans coordonnées' },
  { key: 'fr_no_insee', label: 'Sans code INSEE' },
  { key: 'no_country',  label: 'Sans pays' },
]

function displayPlace(p: PlaceGap): string {
  return [p.locality, p.county, p.state, p.country].filter(Boolean).join(', ') || `Lieu no ${p.id}`
}

export function GapsPage() {
  const { data: gaps, isLoading, isError, refetch } = usePlaceGaps()
  const [filter, setFilter] = useState<GapFilter>('all')

  useEffect(() => {
    document.title = 'Qualité des données · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  const { filtered, counts } = useMemo(() => {
    const all = gaps ?? []
    return {
      filtered: all.filter((g) => (filter === 'all' ? true : g[filter])),
      counts: {
        all: all.length,
        no_coords: all.filter((g) => g.no_coords).length,
        fr_no_insee: all.filter((g) => g.fr_no_insee).length,
        no_country: all.filter((g) => g.no_country).length,
      } as Record<GapFilter, number>,
    }
  }, [gaps, filter])

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Qualité des données" />
        <ErrorBanner
          message="Impossible de charger la liste des lacunes."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Qualité des données"
        subtitle="Lieux rattachés à au moins un événement mais dont les données géographiques sont incomplètes."
      />

      <div role="group" aria-label="Filtrer par type de lacune" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? 'primary' : 'secondary'}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="font-mono text-[11px] tabular-nums opacity-70">{counts[key]}</span>
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">
            Lieux avec des données géographiques incomplètes, filtre actif :{' '}
            {FILTERS.find((f) => f.key === filter)?.label}
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs text-ink-2">
              <th scope="col" className="px-3 py-2 font-medium">Lieu</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Événements</th>
              <th scope="col" className="px-3 py-2 font-medium">Lacunes</th>
              <th scope="col" className="px-3 py-2 font-medium">INSEE</th>
            </tr>
          </thead>
          {isLoading ? (
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={4} />
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y divide-border">
              {filtered.map((g) => (
                <tr key={g.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-3 py-2">
                    <Link
                      to="/places/$id"
                      params={{ id: String(g.id) }}
                      className="text-foreground underline-offset-2 hover:text-primary hover:underline"
                    >
                      {displayPlace(g)}
                    </Link>
                    {g.country_iso && (
                      <span className="ml-2 font-mono text-xs text-ink-3">{g.country_iso}</span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-mono tabular-nums text-ink-2"
                    title={`${g.birth_count} naissances, ${g.death_count} décès, ${g.marriage_count} mariages`}
                  >
                    {g.event_count}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {g.no_country && <Badge>Sans pays</Badge>}
                      {g.no_coords && <Badge>Sans coordonnées</Badge>}
                      {g.fr_no_insee && <Badge>Sans INSEE</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-ink-3">
                    {g.commune_insee ?? '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3">
                    <EmptyState
                      message="Aucune lacune dans cette catégorie"
                      description="Les données géographiques sont complètes pour ce filtre."
                      className="border-0"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          )}
        </table>
      </div>
    </PageContainer>
  )
}
