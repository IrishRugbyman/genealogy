import { Link } from '@tanstack/react-router'
import { ExternalLink, Loader2, Minus, Plus } from 'lucide-react'
import { cn, formatLifespan } from '@/lib/utils'
import type { TreePerson } from '@/lib/tree'

export const NODE_W = 176
export const NODE_H = 84

/* The left edge carries the sex, as a 2px rule rather than a filled card, so a
   dense tree stays readable and the node's own surface can still show focus. */
const SEX_EDGE: Record<string, string> = {
  M: 'var(--cat-1)',
  F: 'var(--cat-5)',
}

interface Props {
  person: TreePerson | undefined
  isLoading: boolean
  isFocus: boolean
  // ancestor expand controls
  canExpandUp: boolean
  isExpandedUp: boolean
  onExpandUp: () => void
  onCollapseUp: () => void
  // descendant expand controls
  canExpandDown: boolean
  isExpandedDown: boolean
  onExpandDown: () => void
  onCollapseDown: () => void
}

function ExpandButton({
  onClick,
  expanded,
  label,
}: {
  onClick: () => void
  expanded: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={expanded ? `Masquer les ${label}` : `Voir les ${label}`}
      aria-label={expanded ? `Masquer les ${label}` : `Voir les ${label}`}
      className="flex items-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-[11px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground active:translate-y-px"
    >
      {expanded ? <Minus size={10} aria-hidden="true" /> : <Plus size={10} aria-hidden="true" />}
      {label}
    </button>
  )
}

export function TreeNode({
  person,
  isLoading,
  isFocus,
  canExpandUp,
  isExpandedUp,
  onExpandUp,
  onCollapseUp,
  canExpandDown,
  isExpandedDown,
  onExpandDown,
  onCollapseDown,
}: Props) {
  const edge = person ? (SEX_EDGE[person.sex ?? ''] ?? 'var(--rule-strong)') : 'var(--rule-strong)'

  return (
    <div
      style={{ width: NODE_W, height: NODE_H, borderLeftColor: edge }}
      className={cn(
        'group relative flex cursor-pointer flex-col justify-between rounded-[var(--radius)] border border-l-2 border-border bg-card px-2.5 py-2 text-left shadow-[var(--shadow-sm)]',
        isFocus && 'ring-2 ring-primary ring-offset-2 ring-offset-[var(--paper)]',
      )}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 size={16} aria-hidden="true" className="animate-spin text-ink-3" />
          <span className="sr-only">Chargement</span>
        </div>
      ) : person ? (
        <>
          <div className="min-w-0">
            <Link
              to="/tree/$id"
              params={{ id: person.id }}
              className="block truncate text-xs font-medium leading-snug text-foreground hover:text-primary"
            >
              {person.name ?? 'Inconnu'}
            </Link>
            <p className="truncate text-[10px] text-ink-3">
              <span className="font-mono tabular-nums">
                {formatLifespan(person.birth_year, person.death_year)}
              </span>
              {person.birth_locality && <span className="ml-1">· {person.birth_locality}</span>}
            </p>
          </div>

          <Link
            to="/people/$id"
            params={{ id: person.id }}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-1.5 top-1.5 rounded-[var(--radius-sm)] p-0.5 text-ink-3 opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
            title="Voir la fiche"
            aria-label={`Voir la fiche de ${person.name ?? person.id}`}
          >
            <ExternalLink size={11} aria-hidden="true" />
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {canExpandUp && !isExpandedUp && (
                <ExpandButton onClick={onExpandUp} expanded={false} label="parents" />
              )}
              {isExpandedUp && !isFocus && (
                <ExpandButton onClick={onCollapseUp} expanded label="parents" />
              )}
            </div>
            <div className="flex gap-1">
              {canExpandDown && !isExpandedDown && (
                <ExpandButton onClick={onExpandDown} expanded={false} label="enfants" />
              )}
              {isExpandedDown && !isFocus && (
                <ExpandButton onClick={onCollapseDown} expanded label="enfants" />
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-ink-3">Inconnu</p>
      )}
    </div>
  )
}
