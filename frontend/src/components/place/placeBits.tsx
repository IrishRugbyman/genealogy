import { Link } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'
import { useState } from 'react'
import { SexMark } from '@/components/person/PersonChip'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Section } from '@/components/ui/Section'
import type { LocalityRef, PlaceMarriageRef, PlacePersonRef } from '@/lib/api'
import { formatLifespan } from '@/lib/utils'

export const KIND_LABEL: Record<string, string> = {
  'chef-lieu':       'Chef-lieu',
  'former-commune':  'Ancienne commune',
  'hameau':          'Hameau',
  'lieu-dit':        'Lieu-dit',
}

export function kindLabel(kind: string | null): string | null {
  return kind ? (KIND_LABEL[kind] ?? kind) : null
}

/** Hamlet reference shown beside a person or a marriage row. */
function HamletTag({ name, placeId }: { name: string; placeId?: number | null }) {
  const inner = (
    <>
      <MapPin size={11} aria-hidden="true" />
      {name}
    </>
  )
  const cls = 'inline-flex shrink-0 items-center gap-1 text-xs text-ink-3'
  return placeId ? (
    <Link
      to="/places/$id"
      params={{ id: String(placeId) }}
      className={`${cls} underline-offset-2 transition-colors hover:text-foreground hover:underline`}
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  )
}

export function PersonRow({ p }: { p: PlacePersonRef }) {
  return (
    <Link
      to="/people/$id"
      params={{ id: p.id }}
      className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface-2"
    >
      <SexMark sex={p.sex} size="sm" />
      <span className="min-w-0 flex-1 truncate text-foreground">{p.name ?? p.id}</span>
      {p.hamlet && <HamletTag name={p.hamlet} placeId={p.hamlet_place_id} />}
      <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">
        {formatLifespan(p.birth_year, p.death_year) || '—'}
      </span>
    </Link>
  )
}

export function MarriageRow({ m }: { m: PlaceMarriageRef }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface-2">
      <span className="min-w-0 flex-1 truncate text-foreground">
        {m.husband_id ? (
          <Link
            to="/people/$id"
            params={{ id: m.husband_id }}
            className="underline-offset-2 hover:text-primary hover:underline"
          >
            {m.husband_name ?? m.husband_id}
          </Link>
        ) : (m.husband_name ?? 'Inconnu')}
        <span className="mx-1.5 text-ink-3">et</span>
        {m.wife_id ? (
          <Link
            to="/people/$id"
            params={{ id: m.wife_id }}
            className="underline-offset-2 hover:text-primary hover:underline"
          >
            {m.wife_name ?? m.wife_id}
          </Link>
        ) : (m.wife_name ?? 'Inconnue')}
      </span>
      {m.hamlet && <HamletTag name={m.hamlet} placeId={m.hamlet_place_id} />}
      {m.marriage_year && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">{m.marriage_year}</span>
      )}
      <Link
        to="/families/$id"
        params={{ id: m.family_id }}
        className="shrink-0 text-xs text-ink-3 underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Famille
      </Link>
    </div>
  )
}

type Tab = 'born' | 'died' | 'married'

const PAGE = 100

export function EventTabs({
  born, died, married,
}: { born: PlacePersonRef[]; died: PlacePersonRef[]; married: PlaceMarriageRef[] }) {
  const [tab, setTab] = useState<Tab>('born')
  const [visible, setVisible] = useState(PAGE)
  const tabs = [
    { key: 'born',    label: 'Nés ici',  count: born.length },
    { key: 'died',    label: 'Décédés',  count: died.length },
    { key: 'married', label: 'Mariages', count: married.length },
  ]
  const people = tab === 'born' ? born : tab === 'died' ? died : []
  const marriages = tab === 'married' ? married : []
  const total = tab === 'married' ? married.length : people.length
  const hasMore = visible < total

  function switchTab(v: string) {
    setTab(v as Tab)
    setVisible(PAGE)
  }

  return (
    <>
      <SegmentedControl
        label="Type d'événement"
        options={tabs}
        value={tab}
        onChange={switchTab}
        className="mb-4"
        size="md"
      />
      {total === 0 ? (
        <EmptyState icon={MapPin} message="Aucun enregistrement pour ce lieu" />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border">
          <div className="divide-y divide-border">
            {tab === 'married'
              ? marriages.slice(0, visible).map((m) => <MarriageRow key={m.family_id} m={m} />)
              : (people as PlacePersonRef[]).slice(0, visible).map((p) => <PersonRow key={p.id} p={p} />)}
          </div>
          {hasMore && (
            <div className="border-t border-border p-2">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setVisible((v) => v + PAGE)}>
                Voir {Math.min(PAGE, total - visible)} de plus
                <span className="font-mono text-xs tabular-nums text-ink-3">
                  {visible}/{total}
                </span>
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export function LocalityList({ title, localities }: { title: string; localities: LocalityRef[] }) {
  if (localities.length === 0) return null
  return (
    <Section title={title} count={localities.length} className="mt-8">
      <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
        {localities.map((l) => (
          <Link
            key={l.id}
            to="/places/$id"
            params={{ id: String(l.id) }}
            className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface-2"
          >
            <MapPin size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate text-foreground">{l.name}</span>
            {l.kind && l.kind !== 'hameau' && <Badge>{kindLabel(l.kind)}</Badge>}
            <span className="shrink-0 text-xs text-ink-3">
              {l.birth_count > 0 && `${l.birth_count} né${l.birth_count > 1 ? 's' : ''}`}
              {l.birth_count > 0 && l.death_count > 0 && ' · '}
              {l.death_count > 0 && `${l.death_count} décès`}
            </span>
          </Link>
        ))}
      </div>
    </Section>
  )
}

/** Encyclopaedic blurb for a place or commune, with its attribution. Shared by
    the locality page and the commune page, which had drifted apart. */
export function DescriptionPanel({
  text,
  source,
  url,
  prefix,
}: {
  text: string
  source?: string | null
  url?: string | null
  /** e.g. the commune name, when the blurb is inherited from the commune. */
  prefix?: string | null
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-5">
      <div className="max-w-[70ch] space-y-3 text-sm leading-relaxed text-foreground">
        {text.split('\n\n').map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {source && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-ink-3">
          {prefix ? `${prefix} · ` : ''}
          Source :{' '}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-primary hover:underline"
            >
              {source}
            </a>
          ) : (
            source
          )}
        </p>
      )}
    </div>
  )
}
