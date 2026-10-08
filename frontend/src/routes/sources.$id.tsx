import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PersonList, PersonListRow } from '@/components/person/PersonList'
import { SexMark } from '@/components/person/PersonChip'
import { SCOPE_LABEL, citationPlace } from '@/components/source/Citation'
import { Transcript } from '@/components/source/Transcript'
import { Button } from '@/components/ui/Button'
import { SignInForm } from '@/components/ui/FamilyAccess'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  citationImageUrl,
  useFamilyAccess,
  useSource,
  type SourceCitation,
  type SourceFamilyLink,
  type SourcePersonLink,
} from '@/lib/api'
import { typeLabel } from '@/lib/timeline'

export const Route = createFileRoute('/sources/$id')({
  component: SourceDetailPage,
})

const KIND_LABEL: Record<string, string> = {
  registre: 'Registre',
  liasse: "Liasse d'archives",
  manuscrit: 'Manuscrit',
  correspondance: 'Correspondance',
  ouvrage: 'Ouvrage',
  article: 'Article',
  revue: 'Revue',
  carte: 'Carte',
  base: 'Base en ligne',
  arbre: 'Arbre en ligne',
}

/** What the citation backs on this person: the vital event, or the event by name. */
function personNote(p: SourcePersonLink): string {
  const what =
    p.scope === 'event'
      ? [typeLabel(p.event_type), p.event_date_raw].filter(Boolean).join(', ')
      : SCOPE_LABEL[p.scope] ?? p.scope
  return [what, p.note].filter(Boolean).join(' : ')
}

function FamilyRow({ f }: { f: SourceFamilyLink }) {
  const partner = (id: string | null, name: string | null, sex: string | null) =>
    id ? (
      <span className="inline-flex items-center gap-1.5">
        <SexMark sex={sex} size="sm" />
        {name ?? id}
      </span>
    ) : (
      <span className="text-ink-3">inconnu</span>
    )
  return (
    <li>
      <Link
        to="/families/$id"
        params={{ id: f.family_id }}
        className="flex items-start gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 text-foreground">
            {partner(f.husband_id, f.husband_name, f.husband_sex)}
            <span aria-hidden="true" className="text-ink-3">
              &amp;
            </span>
            {partner(f.wife_id, f.wife_name, f.wife_sex)}
          </span>
          <span className="mt-0.5 block text-xs text-ink-3">
            {[SCOPE_LABEL[f.scope] ?? f.scope, f.note].filter(Boolean).join(' : ')}
          </span>
        </span>
        {f.marriage_year != null && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
            {f.marriage_year}
          </span>
        )}
      </Link>
    </li>
  )
}

/** The act's scans: thumbnails for the family, a way in for everyone else. */
function ActImages({ c }: { c: SourceCitation }) {
  const { family, available } = useFamilyAccess()
  const [asking, setAsking] = useState(false)
  // `?? []`: a browser may still hold this page's answer from before images existed
  // (the API lets it cache for an hour).
  const images = c.images ?? []
  if (images.length === 0) return null
  const n = images.length
  if (!family) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-border px-3 py-2.5 text-sm text-ink-2">
        <p>
          {n} cliché{n > 1 ? 's' : ''} de l'acte, réservé{n > 1 ? 's' : ''} à la famille : ce
          sont les photographies des archives, qu'on ne republie pas.
        </p>
        {available &&
          (asking ? (
            <div className="mt-3 max-w-sm">
              <SignInForm autoFocus onDone={() => setAsking(false)} />
            </div>
          ) : (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => setAsking(true)}>
              Accès famille
            </Button>
          ))}
      </div>
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((img) => {
        const src = citationImageUrl(c.id, img.ord)
        const caption = img.caption ?? `Cliché ${img.ord}`
        return (
          <li key={img.ord}>
            <a
              href={src}
              target="_blank"
              rel="noreferrer noopener"
              className="group block overflow-hidden rounded-[var(--radius)] border border-border bg-surface-2"
            >
              <img
                src={src}
                alt={`${citationPlace(c) || 'Acte'}, ${caption}`}
                loading="lazy"
                className="aspect-[3/4] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              />
              <span className="block px-2 py-1 text-xs text-ink-3">{caption}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

function CitationBlock({ c, showPlace }: { c: SourceCitation; showPlace: boolean }) {
  const place = citationPlace(c)
  const n = c.individuals.length + c.families.length
  return (
    <section id={`c-${c.id}`} className="scroll-mt-20 space-y-3">
      {showPlace && (
        <h3 className="flex flex-wrap items-baseline gap-x-2 font-display text-base font-medium text-foreground">
          {place || 'Sans précision de page'}
          {c.url && (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-sans text-xs font-normal text-ink-3 hover:text-foreground"
            >
              <ExternalLink size={12} aria-hidden="true" />
              voir en ligne
            </a>
          )}
        </h3>
      )}
      {c.note && (
        <p className="max-w-[70ch] whitespace-pre-wrap border-l-2 border-border pl-4 text-sm leading-relaxed text-ink-2">
          {c.note}
        </p>
      )}
      {c.transcript && (
        <details open className="group rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
            Texte de l'acte
          </summary>
          <div className="mt-3">
            <Transcript text={c.transcript} />
          </div>
        </details>
      )}
      <ActImages c={c} />
      {c.cites_source_id && (
        <p className="text-xs text-ink-3">
          Cite{' '}
          <Link
            to="/sources/$id"
            params={{ id: c.cites_source_id }}
            className="underline decoration-border underline-offset-2 hover:text-foreground"
          >
            {c.cites_source_title}
          </Link>{' '}
          (non vu)
        </p>
      )}
      {n === 0 ? (
        <p className="text-xs text-ink-3">Aucune fiche de l'arbre ne s'appuie encore sur cet acte.</p>
      ) : (
        <div className="space-y-2">
          {c.individuals.length > 0 && (
            <PersonList>
              {c.individuals.map((p, i) => (
                <PersonListRow
                  key={`${p.id}-${p.scope}-${i}`}
                  id={p.id}
                  name={p.name}
                  sex={p.sex}
                  birthYear={p.birth_year}
                  deathYear={p.death_year}
                  note={personNote(p)}
                />
              ))}
            </PersonList>
          )}
          {c.families.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
              {c.families.map((f, i) => (
                <FamilyRow key={`${f.family_id}-${f.scope}-${i}`} f={f} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-28 shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  )
}

function SourceDetailPage() {
  const { id } = Route.useParams()
  const { data, isLoading, isError, refetch } = useSource(id)

  // A record page links to one act with #c-<citation>: scroll there once it exists.
  useEffect(() => {
    if (!data || !window.location.hash) return
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView()
  }, [data])

  useEffect(() => {
    if (!data) return
    document.title = `${data.title} · Généalogie`
    return () => {
      document.title = 'Généalogie'
    }
  }, [data?.title])

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="mb-4 h-4 w-16" />
        <Skeleton className="mb-6 h-9 w-72" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </PageContainer>
    )
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="Source introuvable" back={{ to: '/sources', label: 'Toutes les sources' }} />
        <ErrorBanner
          message="Cette source n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  const records = data.citations.reduce((n, c) => n + c.individuals.length + c.families.length, 0)
  // An export source has one citation and no page: show its records directly,
  // without a heading that would only say "no page given".
  const single = data.citations.length === 1 && !citationPlace(data.citations[0])

  return (
    <PageContainer>
      <PageHeader
        title={data.title}
        back={{ to: '/sources', label: 'Toutes les sources' }}
        subtitle={[data.author, data.publication].filter(Boolean).join(' · ') || undefined}
        actions={
          data.origin === 'research' ? (
            <Badge tone="accent">Nos recherches</Badge>
          ) : data.origin === 'notes' ? (
            <Badge title="Source nommée dans une note du compilateur, recopiée telle quelle">
              Note du compilateur
            </Badge>
          ) : (
            <Badge title="Ligne SOUR de l'arbre du compilateur">Arbre du compilateur</Badge>
          )
        }
      />

      <dl className="mb-6 max-w-2xl divide-y divide-border border-y border-border">
        {data.kind && <Meta label="Nature">{KIND_LABEL[data.kind] ?? data.kind}</Meta>}
        {data.repository && <Meta label="Conservé à">{data.repository}</Meta>}
        {data.call_number && (
          <Meta label="Cote">
            <span className="font-mono tabular-nums">{data.call_number}</span>
          </Meta>
        )}
        {data.date_text && (
          <Meta label="Dates">
            <span className="font-mono tabular-nums">{data.date_text}</span>
          </Meta>
        )}
        {data.url && (
          <Meta label="En ligne">
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 break-all text-ink-2 underline decoration-border underline-offset-2 hover:text-foreground"
            >
              {new URL(data.url).hostname.replace(/^www\./, '')}
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </Meta>
        )}
      </dl>

      {data.note && (
        <p className="mb-8 max-w-[70ch] text-sm leading-relaxed text-ink-2">{data.note}</p>
      )}

      <div className="space-y-10">
        {data.cited_by.length > 0 && (
          <Section title="Connu de seconde main par" count={data.cited_by.length}>
            <ul className="space-y-1.5 text-sm">
              {data.cited_by.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/sources/$id"
                    params={{ id: c.source_id }}
                    className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                  >
                    {c.source_title}
                  </Link>
                  {(c.label || c.locator) && (
                    <span className="text-ink-3">
                      , {[c.label, c.locator].filter(Boolean).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.citations.length === 0 ? (
          data.cited_by.length === 0 && (
            <EmptyState
              message="Rien n'y a encore été lu"
              description="La source est repérée par nos recherches ; aucun acte n'y a encore été relevé."
            />
          )
        ) : single ? (
          <Section title="Fiches qui s'appuient dessus" count={records}>
            <CitationBlock c={data.citations[0]} showPlace={false} />
          </Section>
        ) : (
          <Section
            title="Actes et passages lus"
            count={data.citations.length}
            bodyClassName="space-y-8"
          >
            {data.citations.map((c) => (
              <CitationBlock key={c.id} c={c} showPlace />
            ))}
          </Section>
        )}
      </div>
    </PageContainer>
  )
}
