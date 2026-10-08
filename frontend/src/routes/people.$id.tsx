import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitMerge,
  Lock,
  MapPin,
  PenLine,
  Search,
  Shield,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PersonTimeline } from '@/components/person/PersonTimeline'
import { PersonTimelineHorizontal } from '@/components/person/PersonTimelineHorizontal'
import { SexMark } from '@/components/person/PersonChip'
import { Citation, CitationList } from '@/components/source/Citation'
import { Badge } from '@/components/ui/Badge'
import { Button, buttonClasses } from '@/components/ui/Button'
import { Card, Section } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { SignInForm } from '@/components/ui/FamilyAccess'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { PersonBadges } from '@/components/ui/PersonBadges'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton, SectionSkeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import {
  useAncestors,
  useDescendants,
  useFamily,
  useFamilyAccess,
  usePerson,
  useSosa,
  useSearch,
  type ChildRef,
  type PersonDetail,
  type DistinctionRef,
  type MilitaryRankRef,
  type ProfessionRef,
  type PersonSummary,
  type SourceRef,
  type SpouseRef,
  type TitleRef,
  type TreeNode,
} from '@/lib/api'
import { VITAL_TYPES, buildTimeline, typeLabel } from '@/lib/timeline'
import { pushRecent } from '@/lib/history'
import { cn, formatDate, formatLifespan, formatPlaceObj } from '@/lib/utils'

export const Route = createFileRoute('/people/$id')({
  component: PersonPage,
})

const QUALIFIER_MARK: Record<string, string> = { ABT: '~', BEF: '<', AFT: '>' }

function PersonPage() {
  const { id } = Route.useParams()
  const { data: person, isLoading, isError, refetch } = usePerson(id)

  useEffect(() => {
    if (!person) return
    document.title = `${person.name ?? id} · Généalogie`
    if (person.living) return () => { document.title = 'Généalogie' }
    pushRecent({
      id: person.id,
      name: person.name,
      nickname: person.nickname,
      birth_year: person.birth_year,
      death_year: person.death_year,
      birth_place: person.birth_place?.locality ?? null,
      sex: person.sex,
    })
    return () => { document.title = 'Généalogie' }
  }, [person?.id, person?.living]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="mb-4 h-4 w-16" />
        <div className="mb-8 flex items-start gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-5">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-44" />
          </div>
        </div>
        <SectionSkeleton rows={4} />
      </PageContainer>
    )
  }

  if (isError || !person) {
    return (
      <PageContainer>
        <PageHeader title="Personne introuvable" back={{ to: '/', label: 'Retour à la recherche' }} />
        <ErrorBanner
          message="Cette fiche n'existe pas, ou le serveur n'a pas répondu."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PersonHeader person={person} />
      {/* Sections in narrative order: what happened, who they were surrounded
          by, then the supporting apparatus. Only the identity header is a
          raised card; the rest group with a hairline, so the page has a top
          instead of nine equally-loud boxes. */}
      <div className="mt-8 space-y-8">
        {person.living && <LivingNotice />}
        <FamilySection person={person} />
        {!person.living && <EventsSection person={person} />}
        {person.parents?.family_id && (
          <SiblingsSection familyId={person.parents.family_id} selfId={person.id} />
        )}
        <AncestorSection id={id} />
        <DescendantSection id={id} />
        {person.military_ranks.length > 0 && <MilitarySection ranks={person.military_ranks} />}
        {person.titles.length > 0 && <TitlesSection titles={person.titles} />}
        {person.notes.length > 0 && <NotesSection notes={person.notes} />}
        {person.sources.length > 0 && <SourcesSection sources={person.sources} />}
      </div>
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------
// Relation finder
// ---------------------------------------------------------------------------

function RelationFinder({ personId }: { personId: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const { data: results } = useSearch({ name: q, limit: 8 }, open && q.length > 1)

  useEffect(() => {
    if (!open) {
      setQ('')
      return
    }
    const t = setTimeout(() => inputRef.current?.focus(), 40)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function pick(other: PersonSummary) {
    setOpen(false)
    setQ('')
    navigate({ to: '/relation/$id1/$id2', params: { id1: personId, id2: other.id } })
  }

  return (
    <div ref={boxRef} className="relative">
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <GitMerge size={13} aria-hidden="true" /> Trouver la relation
      </Button>

      {open && (
        <div className="animate-scale-in absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search size={13} aria-hidden="true" className="shrink-0 text-ink-3" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une personne"
              aria-label="Rechercher une personne pour calculer la relation"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-ink-3 focus:outline-none"
            />
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-sm)] p-0.5 text-ink-3 transition-colors hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
          {results && results.length > 0 ? (
            <ul className="max-h-56 overflow-auto py-1">
              {results
                .filter((r) => r.id !== personId)
                .map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
                    >
                      <SexMark sex={r.sex} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{r.name ?? r.id}</span>
                      {r.birth_year && (
                        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
                          {formatLifespan(r.birth_year, r.death_year)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="px-3 py-2.5 text-sm text-ink-3">
              {q.length > 1 ? 'Aucun résultat.' : 'Tapez au moins deux lettres.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/* Professions and distinctions used to carry one hardcoded hue per category -
   thirteen of them, all written as dark-only Tailwind classes
   (`bg-green-950/30`), which would have read as near-black smudges in light
   mode. They are now neutral chips: thirteen categories is far past the point
   where hue can carry identity, and the label already says which one it is. */

function ProfessionBadge({ profession }: { profession: ProfessionRef }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex flex-wrap items-baseline gap-1.5">
        <Link
          to="/professions/$id"
          params={{ id: String(profession.id) }}
          className={buttonClasses('secondary', 'sm', 'h-auto py-0.5')}
          title={profession.description ?? undefined}
        >
          {profession.name}
        </Link>
        {profession.note && <span className="text-xs text-ink-3">{profession.note}</span>}
      </span>
      {profession.description && (
        <span className="max-w-[46ch] pl-0.5 text-xs leading-snug text-ink-3">
          {profession.description}
        </span>
      )}
    </span>
  )
}

function DistinctionBadge({ distinction }: { distinction: DistinctionRef }) {
  return (
    <Link
      to="/distinctions/$id"
      params={{ id: String(distinction.id) }}
      className={buttonClasses('secondary', 'sm', 'h-auto py-0.5')}
    >
      {distinction.name}
    </Link>
  )
}

function PersonHeader({ person }: { person: PersonDetail }) {
  const { data: sosaData } = useSosa(person.id)
  const sosa = sosaData?.sosa ?? null
  const span = formatLifespan(person.birth_year, person.death_year)
  const birthPlace = person.birth_place?.locality

  return (
    <>
      <Link
        to="/"
        className="group -ml-1 mb-4 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-sm text-ink-3 transition-colors hover:text-foreground"
      >
        <ChevronRight
          size={14}
          className="rotate-180 transition-transform duration-150 ease-[var(--ease-out-expo)] group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
        Retour à la recherche
      </Link>

      {/* The one raised surface on the page: this is the subject, everything
          else is about them. */}
      <Card elevated className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <SexMark sex={person.sex} className="h-12 w-12 text-base" />

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-medium leading-tight text-foreground sm:text-3xl">
              {person.name ?? 'Inconnu'}
            </h1>

            {person.nickname && (
              <p className="mt-0.5 text-sm text-ink-2">« {person.nickname} »</p>
            )}

            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
              {person.living ? (
                <span>Informations réservées à la famille</span>
              ) : (
                <span className="font-mono tabular-nums">{span || 'Dates inconnues'}</span>
              )}
              {birthPlace && (
                <>
                  <span aria-hidden="true" className="text-ink-3">·</span>
                  {person.birth_place?.id ? (
                    <Link
                      to="/places/$id"
                      params={{ id: String(person.birth_place.id) }}
                      className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                      {birthPlace}
                    </Link>
                  ) : (
                    <span>{birthPlace}</span>
                  )}
                </>
              )}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={person.sex === 'M' ? 'sex-m' : person.sex === 'F' ? 'sex-f' : 'sex-x'}>
                {person.sex === 'M' ? 'Homme' : person.sex === 'F' ? 'Femme' : 'Sexe inconnu'}
              </Badge>
              <PersonBadges sosa={sosa} branch={person.branch} isDirectLine={person.is_direct_line} />
              <Badge mono title="Identifiant GEDCOM">{person.id}</Badge>
            </div>

            {(person.professions.length > 0 || person.distinctions.length > 0) && (
              <div className="mt-3 flex flex-wrap items-start gap-2">
                {person.professions.map((p) => (
                  <ProfessionBadge key={p.id} profession={p} />
                ))}
                {person.distinctions.map((d) => (
                  <DistinctionBadge key={d.id} distinction={d} />
                ))}
              </div>
            )}

            {person.professions.length === 0 && person.occupation && (
              <p className="mt-2 text-sm text-ink-2">{person.occupation}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/tree/$id"
              params={{ id: person.id }}
              className={buttonClasses('secondary', 'sm')}
            >
              <GitBranch size={13} aria-hidden="true" /> Voir l'arbre
            </Link>
            <RelationFinder personId={person.id} />
            {/* The one way back from reader to contributor: an error spotted
                here, or an act that belongs to this person, goes to the depot
                already tied to this fiche. */}
            <Link
              to="/depot"
              search={{ person: person.id }}
              className={buttonClasses('secondary', 'sm')}
            >
              <PenLine size={13} aria-hidden="true" /> Corriger ou compléter
            </Link>
          </div>
        </div>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// A living person, seen by a visitor who is not signed in
// ---------------------------------------------------------------------------

function LivingNotice() {
  const { available } = useFamilyAccess()
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-8">
      <div className="flex-1">
        <h2 className="flex items-center gap-2 font-display text-xl text-foreground">
          <Lock size={16} aria-hidden="true" className="text-ink-3" />
          Personne vivante
        </h2>
        <p className="mt-2 text-base text-ink-2">
          Son nom, ses dates et ses lieux ne sont pas publiés : ils sont réservés à la
          famille. Ses parents et ses ancêtres restent visibles ci-dessous.
        </p>
      </div>
      {available && (
        <div className="sm:w-80">
          <SignInForm />
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function EventsSection({ person }: { person: PersonDetail }) {
  // The frieze needs width: on a phone its labels collide and it scrolls
  // sideways, so a narrow screen starts on the vertical view instead.
  const [view, setView] = useState<'horizontal' | 'vertical' | 'list'>(() =>
    window.matchMedia('(max-width: 47.99rem)').matches ? 'vertical' : 'horizontal',
  )
  const timeline = useMemo(() => buildTimeline(person), [person])
  const customEvents = useMemo(
    () => person.events.filter((e) => !VITAL_TYPES.has(e.type ?? '')),
    [person.events],
  )
  const hasDates = person.birth_year != null || person.death_year != null || customEvents.length > 0

  const VIEWS = [
    { key: 'horizontal', label: 'Frise' },
    { key: 'vertical', label: 'Verticale' },
    { key: 'list', label: 'Liste' },
  ]

  return (
    <Section
      title="Chronologie"
      actions={
        <SegmentedControl
          label="Affichage de la chronologie"
          options={VIEWS}
          value={view}
          onChange={(v) => setView(v as 'horizontal' | 'vertical' | 'list')}
        />
      }
    >
      {view === 'horizontal' ? (
        <PersonTimelineHorizontal timeline={timeline} />
      ) : view === 'vertical' ? (
        <PersonTimeline timeline={timeline} />
      ) : (
        <div className="divide-y divide-border rounded-[var(--radius-lg)] border border-border">
          {person.birth_year != null && (
            <EventRow icon={<Calendar size={13} />} label="Naissance"
              year={person.birth_year} month={person.birth_month} day={person.birth_day}
              qualifier={person.birth_qualifier} place={formatPlaceObj(person.birth_place)}
              placeId={person.birth_place?.id} note={person.birth_note} />
          )}
          {person.baptism_year != null && (
            <EventRow icon={<Calendar size={13} />} label="Baptême"
              year={person.baptism_year} month={person.baptism_month} day={person.baptism_day}
              qualifier={null} place={formatPlaceObj(person.baptism_place)}
              placeId={person.baptism_place?.id} note={person.baptism_note} />
          )}
          {person.death_year != null && (
            <EventRow icon={<Calendar size={13} />} label="Décès"
              year={person.death_year} month={person.death_month} day={person.death_day}
              qualifier={person.death_qualifier} place={formatPlaceObj(person.death_place)}
              placeId={person.death_place?.id} note={person.death_note}
              ageFrom={person.birth_year} />
          )}
          {person.burial_year != null && (
            <EventRow icon={<MapPin size={13} />} label="Inhumation"
              year={person.burial_year} month={person.burial_month} day={person.burial_day}
              qualifier={null} place={formatPlaceObj(person.burial_place)}
              placeId={person.burial_place?.id} note={person.burial_note} />
          )}
          {customEvents.map((e, i) => (
            <EventRow key={i} icon={<Calendar size={13} />} label={typeLabel(e.type)}
              year={e.date_year} month={e.date_month} day={e.date_day}
              qualifier={e.date_qualifier} place={e.place_locality}
              placeId={e.place_id} note={e.note} sources={e.sources} />
          ))}
          {!hasDates && (
            <EmptyState
              icon={Calendar}
              message="Aucune date connue"
              description="Cette personne est rattachée à l'arbre par ses liens familiaux, sans date d'état civil relevée."
              className="border-0"
            />
          )}
        </div>
      )}
    </Section>
  )
}

function EventRow({ icon, label, year, month, day, qualifier, place, placeId, note, ageFrom, sources }: {
  icon: React.ReactNode
  label: string
  year: number | null
  month?: number | null
  day?: number | null
  qualifier?: string | null
  place: string | null
  placeId?: number | null
  note?: string | null
  ageFrom?: number | null
  sources?: SourceRef[]
}) {
  const dateStr = formatDate(year, month, day)
  const qualStr = qualifier && qualifier !== 'EXACT' ? `${QUALIFIER_MARK[qualifier] ?? qualifier} ` : ''
  const age = ageFrom != null && year != null ? year - ageFrom : null
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3">{icon}</span>
      <span className="w-24 shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 flex-1">
        <span className="font-mono tabular-nums text-foreground">{qualStr}{dateStr || '?'}</span>
        {age != null && age >= 0 && age < 130 && (
          <span className="ml-2 text-xs text-ink-3">({age} ans)</span>
        )}
        {place && (
          <>
            <span aria-hidden="true" className="mx-1.5 text-ink-3">·</span>
            {placeId ? (
              <Link
                to="/places/$id"
                params={{ id: String(placeId) }}
                className="text-ink-2 underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {place}
              </Link>
            ) : (
              <span className="text-ink-2">{place}</span>
            )}
          </>
        )}
        {note && (
          <span className="mt-1 block whitespace-pre-wrap text-xs text-ink-3">{note}</span>
        )}
        {sources?.map((c, j) => (
          <span key={`${c.citation_id}-${j}`} className="mt-1.5 flex gap-1.5 text-xs">
            <span className="shrink-0 text-ink-3/70">Source</span>
            <Citation c={c} compact />
          </span>
        ))}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Relatives
// ---------------------------------------------------------------------------

function RelativeLink({
  id,
  name,
  sex,
  detail,
  sosa,
}: {
  id: string
  name?: string | null
  sex?: string | null
  detail?: string | null
  sosa?: number | null
}) {
  return (
    <Link
      to="/people/$id"
      params={{ id }}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-2 py-1.5 text-sm',
        'transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out-expo)]',
        'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:translate-y-px',
      )}
    >
      <SexMark sex={sex} size="sm" />
      <span className="truncate text-foreground">{name ?? 'Inconnu'}</span>
      {detail && <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">{detail}</span>}
      {sosa != null && (
        <span
          title={`Sosa ${sosa}`}
          className="shrink-0 font-mono text-xs tabular-nums text-primary"
        >
          {sosa}
        </span>
      )}
    </Link>
  )
}

function SiblingsSection({ familyId, selfId }: { familyId: string; selfId: string }) {
  const { data: family } = useFamily(familyId)
  const siblings = family?.children.filter((c) => c.child_id !== selfId) ?? []
  if (siblings.length === 0) return null
  return (
    <Section title="Frères et sœurs" count={siblings.length}>
      <div className="flex flex-wrap gap-2">
        {siblings.map((c) => (
          <RelativeLink
            key={c.child_id}
            id={c.child_id}
            name={c.name}
            sex={c.sex}
            detail={c.birth_year ? String(c.birth_year) : null}
          />
        ))}
      </div>
    </Section>
  )
}

/* Parents, then each union with its children under it: the layout of a GeneWeb
   page, which is what the person who compiled this tree reads every day. It sits
   right under the header because "who were their parents, whom did they marry,
   which children" is the first question asked of any fiche. */
function FamilySection({ person }: { person: PersonDetail }) {
  const p = person.parents
  const hasParents = !!(p?.father_id || p?.mother_id)
  const unionIds = new Set(person.spouses.map((s) => s.family_id))
  const otherChildren = person.children.filter((c) => !unionIds.has(c.family_id))
  if (!hasParents && person.spouses.length === 0 && person.children.length === 0) return null

  return (
    <Section title="Famille">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[9rem_1fr]">
        <FamilyRow label="Parents">
          {hasParents ? (
            <div className="flex flex-wrap gap-2">
              {p?.father_id ? (
                <RelativeLink
                  id={p.father_id}
                  name={p.father_name}
                  sex="M"
                  detail={formatLifespan(p.father_birth_year, p.father_death_year) || null}
                />
              ) : (
                <span className="self-center text-sm text-ink-3">Père inconnu</span>
              )}
              {p?.mother_id ? (
                <RelativeLink
                  id={p.mother_id}
                  name={p.mother_name}
                  sex="F"
                  detail={formatLifespan(p.mother_birth_year, p.mother_death_year) || null}
                />
              ) : (
                <span className="self-center text-sm text-ink-3">Mère inconnue</span>
              )}
            </div>
          ) : (
            <span className="inline-block pt-1.5 text-sm text-ink-3">Inconnus</span>
          )}
        </FamilyRow>

        {person.spouses.map((s, i) => (
          <FamilyRow
            key={s.family_id ?? i}
            label={person.spouses.length > 1 ? `Union ${i + 1}` : 'Union'}
          >
            <UnionDetail union={s} />
            <ChildList kids={person.children.filter((c) => c.family_id === s.family_id)} />
          </FamilyRow>
        ))}

        {otherChildren.length > 0 && (
          <FamilyRow label="Enfants">
            <ChildList kids={otherChildren} bare />
          </FamilyRow>
        )}
      </dl>
    </Section>
  )
}

function FamilyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="pt-1.5 text-sm font-medium text-ink-2">{label}</dt>
      <dd className="min-w-0 space-y-2">{children}</dd>
    </>
  )
}

function ChildList({ kids, bare }: { kids: ChildRef[]; bare?: boolean }) {
  if (kids.length === 0) return null
  return (
    <div className={cn('space-y-1.5', !bare && 'border-l border-border pl-3')}>
      {!bare && (
        <p className="text-sm text-ink-3">
          {kids.length === 1 ? '1 enfant' : `${kids.length} enfants`}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {kids.map((c) => (
          <RelativeLink
            key={c.child_id}
            id={c.child_id}
            name={c.name}
            sex={c.sex}
            detail={formatLifespan(c.child_birth_year, c.child_death_year) || null}
          />
        ))}
      </div>
    </div>
  )
}

function UnionDetail({ union: s }: { union: SpouseRef }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {s.spouse_id ? (
          <RelativeLink
            id={s.spouse_id}
            name={s.spouse_name}
            sex={s.spouse_sex}
            detail={formatLifespan(s.spouse_birth_year, s.spouse_death_year) || null}
          />
        ) : (
          <span className="text-sm text-ink-2">{s.spouse_name ?? 'Conjoint inconnu'}</span>
        )}

        {s.marriage_year && (
          <span className="text-sm text-ink-2">
            <span className="font-mono tabular-nums">
              {QUALIFIER_MARK[s.marriage_qualifier ?? ''] ?? ''}
              {formatDate(s.marriage_year, s.marriage_month, s.marriage_day)}
            </span>
            {s.marriage_locality && (
              <>
                <span aria-hidden="true" className="mx-1.5 text-ink-3">·</span>
                {s.marriage_place_id ? (
                  <Link
                    to="/places/$id"
                    params={{ id: String(s.marriage_place_id) }}
                    className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    {s.marriage_locality}
                  </Link>
                ) : (
                  s.marriage_locality
                )}
              </>
            )}
          </span>
        )}

        {s.divorced && <Badge>Divorcés</Badge>}

        {s.family_id && (
          <Link
            to="/families/$id"
            params={{ id: s.family_id }}
            className="text-sm text-ink-3 underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Voir la famille
          </Link>
        )}
      </div>

      {(s.marriage_contract_year != null || s.marriage_note || s.divorce_note || s.marriage_sources.length > 0) && (
        <div className="space-y-1 border-l border-border pl-3 text-xs text-ink-3">
          {s.divorce_note && <p>Divorce : {s.divorce_note}</p>}
          {s.marriage_contract_year != null && (
            <p>
              Contrat de mariage :{' '}
              <span className="font-mono tabular-nums">
                {QUALIFIER_MARK[s.marriage_contract_qualifier ?? ''] ?? ''}
                {formatDate(s.marriage_contract_year, s.marriage_contract_month, s.marriage_contract_day)}
              </span>
              {s.marriage_contract_locality && ` · ${s.marriage_contract_locality}`}
            </p>
          )}
          {s.marriage_note && <p className="whitespace-pre-wrap">{s.marriage_note}</p>}
          {s.marriage_sources.map((c, j) => (
            <p key={`${c.citation_id}-${j}`} className="flex gap-1.5">
              <span className="shrink-0 text-ink-3/70">Source</span>
              <Citation c={c} compact />
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Supporting apparatus
// ---------------------------------------------------------------------------

/** Sections that are reference material rather than narrative: collapsed by
    default so they do not compete with the timeline for attention. */
function Disclosure({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-4 border-b border-border pb-2 text-left transition-colors hover:text-foreground"
      >
        <h2 className="font-display text-lg font-medium leading-tight text-foreground sm:text-xl">
          {title}
          <span className="ml-2 font-sans text-sm font-normal tabular-nums text-ink-3">{count}</span>
        </h2>
        <span aria-hidden="true" className="shrink-0 self-center text-ink-3">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && <div className="animate-fade-in mt-3">{children}</div>}
    </section>
  )
}

const ERA_LABELS: Record<string, string> = {
  'antique':       'Antiquité',
  'médiéval':      'Moyen Âge',
  'ancien-régime': 'Ancien Régime',
  'révolution':    'Révolution',
  'empire':        'Empire',
  'moderne':       'Époque moderne',
}

function MilitarySection({ ranks }: { ranks: MilitaryRankRef[] }) {
  return (
    <Section title="Service militaire" count={ranks.length}>
      <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border">
        {ranks.map((r) => (
          <li key={r.id} className="px-3 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Shield size={13} aria-hidden="true" className="self-center text-ink-3" />
              <Link
                to="/military-ranks/$id"
                params={{ id: String(r.id) }}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {r.name}
              </Link>
              {r.regiment && <span className="text-sm text-ink-2">{r.regiment}</span>}
              <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-ink-3">
                {r.year_start
                  ? `${r.year_start}${r.year_end ? ` - ${r.year_end}` : ''}`
                  : r.era
                    ? (ERA_LABELS[r.era] ?? r.era)
                    : ''}
              </span>
            </div>
            {r.note && <p className="mt-1 text-xs text-ink-3">{r.note}</p>}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function TitlesSection({ titles }: { titles: TitleRef[] }) {
  return (
    <Section title="Titres" count={titles.length}>
      <div className="flex flex-wrap gap-2">
        {titles.map((t, i) => (
          <span
            key={i}
            className="inline-flex items-baseline gap-1.5 rounded-[var(--radius)] border border-border bg-card px-2.5 py-1.5 text-sm"
          >
            <span className="text-foreground">{t.title}</span>
            {t.note && <span className="text-xs text-ink-3">{t.note}</span>}
          </span>
        ))}
      </div>
    </Section>
  )
}

function NotesSection({ notes }: { notes: string[] }) {
  return (
    <Disclosure title="Notes" count={notes.length}>
      <div className="space-y-3">
        {notes.map((n, i) => (
          <p key={i} className="max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {n}
          </p>
        ))}
      </div>
    </Disclosure>
  )
}

function SourcesSection({ sources }: { sources: SourceRef[] }) {
  // The export can cite the same source twice for one scope; show it once.
  const unique = useMemo(() => {
    const seen = new Set<string>()
    return sources.filter((s) => {
      const k = `${s.scope}\0${s.citation_id}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [sources])

  return (
    <Disclosure title="Sources" count={unique.length}>
      <CitationList sources={unique} />
    </Disclosure>
  )
}

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

function LineageSection({
  title,
  data,
  isFetching,
  depth,
  setDepth,
  depths,
  labelFor,
  showSosa,
}: {
  title: string
  data: TreeNode[] | undefined
  isFetching: boolean
  depth: number
  setDepth: (d: number) => void
  depths: number[]
  labelFor: (n: number) => string
  showSosa?: boolean
}) {
  const byDepth = useMemo(() => {
    const map: Record<number, TreeNode[]> = {}
    data?.forEach((a) => { (map[a.depth] ??= []).push(a) })
    return map
  }, [data])

  if (!data?.length && !isFetching) return null

  return (
    <Section
      title={title}
      actions={
        <span className="flex items-center gap-2 text-xs text-ink-3">
          {isFetching && <Spinner className="h-3 w-3" />}
          Générations
          <SegmentedControl
            label={`Nombre de générations affichées : ${title.toLowerCase()}`}
            options={depths.map((d) => ({ key: String(d), label: String(d) }))}
            value={String(depth)}
            onChange={(v) => setDepth(Number(v))}
          />
        </span>
      }
    >
      <div className="space-y-4">
        {Object.entries(byDepth).map(([d, people]) => (
          <div key={d}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
              {labelFor(Number(d))}
            </p>
            <div className="flex flex-wrap gap-2">
              {people.map((a) => (
                <RelativeLink
                  key={a.id}
                  id={a.id}
                  name={a.name}
                  sex={a.sex}
                  detail={a.birth_year ? String(a.birth_year) : null}
                  sosa={showSosa ? a.sosa : null}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function AncestorSection({ id }: { id: string }) {
  const [depth, setDepth] = useState(3)
  const { data, isFetching } = useAncestors(id, depth)
  return (
    <LineageSection
      title="Ascendants"
      data={data}
      isFetching={isFetching}
      depth={depth}
      setDepth={setDepth}
      depths={[3, 5, 8]}
      showSosa
      labelFor={(n) =>
        n === 1 ? 'Parents'
        : n === 2 ? 'Grands-parents'
        : n === 3 ? 'Arrière-grands-parents'
        : `${n - 1}e génération d'arrière-grands-parents`
      }
    />
  )
}

function DescendantSection({ id }: { id: string }) {
  const [depth, setDepth] = useState(3)
  const { data, isFetching } = useDescendants(id, depth)
  return (
    <LineageSection
      title="Descendants"
      data={data}
      isFetching={isFetching}
      depth={depth}
      setDepth={setDepth}
      depths={[2, 3, 5]}
      labelFor={(n) =>
        n === 1 ? 'Enfants'
        : n === 2 ? 'Petits-enfants'
        : n === 3 ? 'Arrière-petits-enfants'
        : `${n - 1}e génération d'arrière-petits-enfants`
      }
    />
  )
}
