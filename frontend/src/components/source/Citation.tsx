import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { SourceRef } from '@/lib/api'
import { cn } from '@/lib/utils'

/** What a citation supports, as a record names it. */
export const SCOPE_LABEL: Record<string, string> = {
  birth: 'Naissance',
  baptism: 'Baptême',
  death: 'Décès',
  burial: 'Inhumation',
  marriage: 'Mariage',
  record: 'Fiche',
  event: 'Événement',
  correction: 'Corrigé',
}

/** The place in the source, as one line: the act, its date, the page or view. */
export function citationPlace(c: {
  label: string | null
  date_text: string | null
  locator: string | null
}): string {
  return [c.label, c.date_text, c.locator].filter(Boolean).join(', ')
}

/**
 * One citation: the source (a link to its page, which lists everything else it
 * backs), the place in it, what it says there, and the work it reports
 * second-hand when that work was not seen.
 */
export function Citation({ c, compact = false }: { c: SourceRef; compact?: boolean }) {
  const place = citationPlace(c)
  const holding = [c.source_repository, c.source_call_number].filter(Boolean).join(', ')
  return (
    <span className="block min-w-0">
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <Link
          to="/sources/$id"
          params={{ id: c.source_id }}
          className="text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
        >
          {c.source_author && <span className="text-ink-2">{c.source_author}, </span>}
          {c.source_title}
        </Link>
        {holding && <span className="text-ink-3">({holding})</span>}
        {c.origin === 'research' && (
          <Badge tone="accent" title="Lu par nos recherches, en plus de l'arbre du compilateur">
            Nos recherches
          </Badge>
        )}
        {c.origin === 'notes' && (
          <Badge title="Source nommée dans une note du compilateur, recopiée telle quelle">
            Note du compilateur
          </Badge>
        )}
      </span>
      {place && (
        <span className="mt-0.5 flex items-baseline gap-1.5 text-ink-2">
          <span className="min-w-0">{place}</span>
          {c.url && (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex shrink-0 items-center text-ink-3 transition-colors hover:text-foreground"
              aria-label="Voir en ligne"
              title="Voir en ligne"
            >
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </span>
      )}
      {c.note && <span className="mt-0.5 block text-ink-2">{c.note}</span>}
      {!compact && c.citation_note && (
        <span className="mt-1 block max-w-[70ch] whitespace-pre-wrap text-xs leading-relaxed text-ink-3">
          {c.citation_note}
        </span>
      )}
      {(c.has_transcript || c.image_count > 0) && (
        <Link
          to="/sources/$id"
          params={{ id: c.source_id }}
          hash={`c-${c.citation_id}`}
          className="mt-0.5 inline-block text-xs text-ink-2 underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-foreground"
        >
          {c.has_transcript ? "Lire l'acte" : "Voir l'acte"}
          {c.image_count > 0 &&
            ` (${c.image_count} cliché${c.image_count > 1 ? 's' : ''})`}
        </Link>
      )}
      {c.cites_source_id && (
        <span className="mt-0.5 block text-xs text-ink-3">
          Cite{' '}
          <Link
            to="/sources/$id"
            params={{ id: c.cites_source_id }}
            className="underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-foreground"
          >
            {c.cites_source_title}
          </Link>{' '}
          (non vu)
        </span>
      )}
    </span>
  )
}

/** Citations as a bordered list, each with what it supports on the left. */
export function CitationList({
  sources,
  showScope = true,
  className,
}: {
  sources: SourceRef[]
  showScope?: boolean
  className?: string
}) {
  return (
    <ul
      className={cn(
        'divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border',
        className,
      )}
    >
      {sources.map((s, i) => (
        <li key={`${s.citation_id}-${s.scope}-${i}`} className="flex gap-3 px-3 py-2.5 text-sm">
          {showScope && (
            <span className="w-24 shrink-0 text-ink-3">{SCOPE_LABEL[s.scope] ?? s.scope}</span>
          )}
          <Citation c={s} />
        </li>
      ))}
    </ul>
  )
}
