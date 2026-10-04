import { createFileRoute, Link } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { useEffect } from 'react'
import { SexMark } from '@/components/person/PersonChip'
import { Badge } from '@/components/ui/Badge'
import { Card, Section } from '@/components/ui/Section'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useFamily, type FamilyChild } from '@/lib/api'
import { formatLifespan } from '@/lib/utils'

export const Route = createFileRoute('/families/$id')({
  component: FamilyDetailPage,
})

function formatFamilyDate(
  qualifier: string | null,
  year: number | null,
  month: number | null,
  day: number | null,
): string | null {
  if (!year) return null
  const q = qualifier === 'ABT' ? 'v. ' : qualifier === 'BEF' ? 'avant ' : qualifier === 'AFT' ? 'après ' : ''
  if (day && month) return `${q}${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`
  if (month) return `${q}${month.toString().padStart(2, '0')}/${year}`
  return `${q}${year}`
}

function ChildRow({ c }: { c: FamilyChild }) {
  return (
    <li>
      <Link
        to="/people/$id"
        params={{ id: c.child_id }}
        className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2"
      >
        <SexMark sex={c.sex} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.name ?? c.child_id}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
          {formatLifespan(c.birth_year, c.death_year)}
        </span>
      </Link>
    </li>
  )
}

/** One labelled fact in the marriage record. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <dt className="w-20 shrink-0 text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-foreground">{children}</dd>
    </div>
  )
}

function FamilyDetailPage() {
  const { id } = Route.useParams()
  const { data, isLoading, isError, refetch } = useFamily(id)

  useEffect(() => {
    if (!data) return
    const title = [data.husband_name, data.wife_name].filter(Boolean).join(' et ') || id
    document.title = `${title} · Généalogie`
    return () => { document.title = 'Généalogie' }
  }, [data, id])

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="mb-4 h-4 w-16" />
        <Skeleton className="mb-6 h-10 w-80" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </PageContainer>
    )
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="Famille introuvable" back={{ to: '/families', label: 'Retour aux familles' }} />
        <ErrorBanner
          message="Cette famille n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  const marriageDate = formatFamilyDate(data.marriage_qualifier, data.marriage_year, data.marriage_month, data.marriage_day)
  const contractDate = formatFamilyDate(null, data.marriage_contract_year, data.marriage_contract_month, data.marriage_contract_day)

  const placeLabel = data.marriage_locality
    ? [data.marriage_locality, data.marriage_county, data.marriage_country].filter(Boolean).join(', ')
    : null

  const hasMarriageFacts =
    marriageDate || placeLabel || data.marriage_note || contractDate || data.divorce_note

  const Spouse = ({ id: pid, name, birth, death }: {
    id: string | null
    name: string | null
    birth: number | null
    death: number | null
  }) => (
    <span className="min-w-0">
      {pid ? (
        <Link
          to="/people/$id"
          params={{ id: pid }}
          className="font-display text-xl font-medium leading-tight text-foreground underline-offset-4 hover:text-primary hover:underline sm:text-2xl"
        >
          {name ?? 'Inconnu'}
        </Link>
      ) : (
        <span className="font-display text-xl font-medium leading-tight text-foreground sm:text-2xl">
          {name ?? 'Inconnu'}
        </span>
      )}
      <span className="mt-0.5 block font-mono text-xs tabular-nums text-ink-3">
        {formatLifespan(birth, death)}
      </span>
    </span>
  )

  return (
    <PageContainer>
      <PageHeader title="Famille" back={{ to: '/families', label: 'Retour aux familles' }} />

      <Card elevated className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <Heart size={18} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
          <Spouse
            id={data.husband_id}
            name={data.husband_name}
            birth={data.husband_birth_year}
            death={data.husband_death_year}
          />
          <span aria-hidden="true" className="mt-1 text-sm text-ink-3">et</span>
          <Spouse
            id={data.wife_id}
            name={data.wife_name}
            birth={data.wife_birth_year}
            death={data.wife_death_year}
          />
          {data.divorced && <Badge className="mt-1.5">Divorcés</Badge>}
        </div>
      </Card>

      <div className="mt-8 space-y-8">
        {hasMarriageFacts && (
          <Section title="Mariage">
            <dl className="space-y-2">
              {marriageDate && (
                <Fact label="Date">
                  <span className="font-mono tabular-nums">{marriageDate}</span>
                </Fact>
              )}
              {placeLabel && (
                <Fact label="Lieu">
                  {data.marriage_place_id ? (
                    <Link
                      to="/places/$id"
                      params={{ id: String(data.marriage_place_id) }}
                      className="underline-offset-2 hover:text-primary hover:underline"
                    >
                      {placeLabel}
                    </Link>
                  ) : (
                    placeLabel
                  )}
                </Fact>
              )}
              {contractDate && (
                <Fact label="Contrat">
                  <span className="font-mono tabular-nums">{contractDate}</span>
                  {data.marriage_contract_locality && (
                    <span className="text-ink-2"> · {data.marriage_contract_locality}</span>
                  )}
                </Fact>
              )}
              {data.marriage_note && (
                <Fact label="Note">
                  <span className="whitespace-pre-wrap text-ink-2">{data.marriage_note}</span>
                </Fact>
              )}
              {data.divorce_note && (
                <Fact label="Divorce">
                  <span className="whitespace-pre-wrap text-ink-2">{data.divorce_note}</span>
                </Fact>
              )}
            </dl>
          </Section>
        )}

        {data.children.length > 0 && (
          <Section title="Enfants" count={data.children.length}>
            <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
              {data.children.map((c) => <ChildRow key={c.child_id} c={c} />)}
            </ul>
          </Section>
        )}

        {data.sources.length > 0 && (
          <Section title="Sources" count={data.sources.length}>
            <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
              {data.sources.map((s, i) => (
                <li key={i} className="flex gap-3 px-3 py-2 text-sm">
                  <span className="w-20 shrink-0 capitalize text-ink-3">{s.scope}</span>
                  <span className="min-w-0 text-foreground">{s.citation}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </PageContainer>
  )
}
