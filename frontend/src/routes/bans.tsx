import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react'
import { Card, Section } from '@/components/ui/Section'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useBan } from '@/lib/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/bans')({
  component: BansPage,
})

// There are exactly 2 bans in the DB (IDs 1 and 2). If more are added later,
// expose a /api/bans list and replace these with a useBans() hook + map.
const BAN_IDS = [1, 2]

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 py-2.5 sm:grid sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
      <dt className="shrink-0 text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 text-sm leading-relaxed text-foreground">{value}</dd>
    </div>
  )
}

function BanCard({ banId }: { banId: number }) {
  const { data: ban, isLoading, isError, refetch } = useBan(banId)
  const [localitiesOpen, setLocalitiesOpen] = useState(false)

  const byParish = useMemo(() => {
    if (!ban) return {}
    return ban.localities.reduce<Record<string, typeof ban.localities>>((acc, loc) => {
      const key = loc.parish ?? 'Autres localités'
      ;(acc[key] ??= []).push(loc)
      return acc
    }, {})
  }, [ban])

  if (isLoading) return <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
  if (isError || !ban) {
    return (
      <ErrorBanner
        message={`Impossible de charger le ban ${banId}.`}
        onRetry={() => void refetch()}
      />
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-surface-2 px-4 py-4 sm:px-5">
        <h2 className="font-display text-xl font-medium leading-tight text-foreground">{ban.name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          <span>
            Aboli en <span className="font-mono tabular-nums">{ban.abolished_year}</span>
          </span>
          <span>
            <span className="font-mono tabular-nums">{ban.communes.length}</span> communes actuelles
          </span>
          <span>
            <span className="font-mono tabular-nums">{ban.localities.length}</span> localités
            historiques
          </span>
        </p>
      </div>

      <div className="space-y-6 p-4 sm:p-5">
        <dl className="divide-y divide-border">
          <InfoRow label="Origine" value={ban.origin_note} />
          <InfoRow label="Suzerain" value={ban.suzerain} />
          <InfoRow label="Seigneurs" value={ban.lords_succession} />
          <InfoRow label="Paroisses" value={ban.parishes} />
          <InfoRow label="Abolition" value={ban.abolition_note} />
          <InfoRow label="Notes" value={ban.notes} />
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-2">Communes actuelles</h3>
          <div className="flex flex-wrap gap-2">
            {ban.communes.map((c) => (
              <Link
                key={c.insee}
                to="/communes/$insee"
                params={{ insee: c.insee }}
                className={cn(
                  'group flex max-w-full flex-col rounded-[var(--radius)] border border-border bg-card px-2.5 py-1.5',
                  'transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out-expo)]',
                  'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:translate-y-px',
                )}
              >
                <span className="truncate text-sm text-foreground">{c.nom}</span>
                {c.role && <span className="truncate text-xs text-ink-3">{c.role}</span>}
                <span className="truncate text-xs text-ink-3">
                  {c.county} · {c.state}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setLocalitiesOpen((v) => !v)}
            aria-expanded={localitiesOpen}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2 text-sm text-ink-2',
              'transition-colors hover:border-[var(--rule-strong)] hover:text-foreground active:translate-y-px',
            )}
          >
            <span className="flex items-center gap-2">
              <MapPin size={13} aria-hidden="true" />
              Localités historiques
              <span className="font-mono text-xs tabular-nums text-ink-3">
                {ban.localities.length}
              </span>
            </span>
            {localitiesOpen ? (
              <ChevronDown size={15} aria-hidden="true" />
            ) : (
              <ChevronRight size={15} aria-hidden="true" />
            )}
          </button>

          {localitiesOpen && (
            <div className="animate-fade-in mt-2 divide-y divide-border rounded-[var(--radius-lg)] border border-border">
              {Object.entries(byParish).map(([parish, locs]) => (
                <div key={parish} className="px-4 py-3">
                  <p className="mb-2 text-xs font-medium text-ink-2">{parish}</p>
                  <div className="space-y-1.5">
                    {locs.map((loc) => (
                      <div key={loc.id} className="flex items-start gap-2 text-sm">
                        {/* The dot is state, not decoration: filled means the
                            locality is linked to a place in the database. */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                            loc.place_id ? 'bg-primary' : 'bg-[var(--rule-strong)]',
                          )}
                        />
                        <div className="min-w-0">
                          {loc.place_id ? (
                            <Link
                              to="/places/$id"
                              params={{ id: String(loc.place_id) }}
                              className="text-foreground underline-offset-2 hover:text-primary hover:underline"
                            >
                              {loc.name}
                            </Link>
                          ) : (
                            <span className="text-foreground">{loc.name}</span>
                          )}
                          {loc.notes && <p className="mt-0.5 text-xs text-ink-3">{loc.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="px-4 py-2.5 text-xs text-ink-3">
                Une puce pleine signale une localité reliée à l'arbre : cliquez pour voir les
                personnes qui s'y rattachent.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function BansPage() {
  useEffect(() => {
    document.title = 'Bans historiques · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  return (
    <PageContainer>
      <PageHeader
        title="Bans historiques"
        subtitle="Circonscriptions seigneuriales pré-révolutionnaires de la haute vallée de la Moselle, sous la suzeraineté de l'abbaye de Remiremont ou du duc de Lorraine. Abolies en 1789 avec la création des communes."
      />

      <Section className="space-y-6" bodyClassName="space-y-6">
        {BAN_IDS.map((id) => (
          <BanCard key={id} banId={id} />
        ))}
      </Section>
    </PageContainer>
  )
}
