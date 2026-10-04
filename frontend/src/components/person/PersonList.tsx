import { Link } from '@tanstack/react-router'
import { SexMark } from './PersonChip'
import { formatLifespan } from '@/lib/utils'

/* The métiers, distinctions and grades detail pages each rendered their own
   near-identical person list. One row component now, so a person reads the
   same way whichever catalogue you arrived from. */

export function PersonListRow({
  id,
  name,
  sex,
  birthYear,
  deathYear,
  place,
  placeId,
  note,
  /** Extra right-aligned figure, e.g. the years someone held a rank. */
  trailing,
}: {
  id: string
  name?: string | null
  sex?: string | null
  birthYear?: number | null
  deathYear?: number | null
  place?: string | null
  placeId?: number | null
  note?: string | null
  trailing?: string | null
}) {
  const span = formatLifespan(birthYear, deathYear)
  return (
    <li>
      <Link
        to="/people/$id"
        params={{ id }}
        className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2"
      >
        <SexMark sex={sex} size="sm" className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm text-foreground">{name ?? id}</span>
            {place &&
              (placeId ? (
                <Link
                  to="/places/$id"
                  params={{ id: String(placeId) }}
                  onClick={(e) => e.stopPropagation()}
                  className="hidden text-xs text-ink-3 underline-offset-2 hover:text-foreground hover:underline sm:inline"
                >
                  {place}
                </Link>
              ) : (
                <span className="hidden text-xs text-ink-3 sm:inline">{place}</span>
              ))}
          </span>
          {note && <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{note}</span>}
        </span>
        <span className="shrink-0 text-right font-mono text-xs tabular-nums text-ink-3">
          {trailing && <span className="block text-ink-2">{trailing}</span>}
          {span && <span className="block">{span}</span>}
        </span>
      </Link>
    </li>
  )
}

export function PersonList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border">
      {children}
    </ul>
  )
}
