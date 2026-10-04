import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

/* Shared by the métiers, distinctions and grades catalogues. Each of those
   pages used to give every category its own hue, which restated the section
   heading directly above the chips and, at fourteen categories, produced
   fills nobody could tell apart. Chips are neutral; the grouping carries the
   category and the count carries the weight. */

export function CatalogChip({
  to,
  params,
  name,
  count,
  detail,
}: {
  to: string
  params: Record<string, string>
  name: string
  count?: number
  /** Secondary line, e.g. a year range or an era. */
  detail?: string | null
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className={cn(
        'inline-flex max-w-full flex-col gap-0.5 rounded-[var(--radius)] border border-border bg-card px-2.5 py-1.5 text-sm',
        'transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out-expo)]',
        'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:translate-y-px',
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="truncate text-foreground">{name}</span>
        {count != null && (
          <span className="font-mono text-xs tabular-nums text-ink-3">{count}</span>
        )}
      </span>
      {detail && <span className="font-mono text-xs tabular-nums text-ink-3">{detail}</span>}
    </Link>
  )
}
