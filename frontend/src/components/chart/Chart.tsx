import { cn } from '@/lib/utils'

/* Shared chart pieces, so the mark specs live in one place:

   - Thin, recessive chrome. The grid is a single baseline, not a cage.
   - One hue per single-series chart. The chart title names the series, so a
     single series never gets a legend box.
   - Every mark is reachable and readable without a mouse: bars carry an
     accessible name, and the tooltip shows on focus as well as on hover.
   - Stacked segments get a 2px surface gap so two adjacent fills stay two
     fills rather than one long smear. */

export const SERIES = 'var(--cat-1)'

/** Tooltip that survives keyboard focus, not just hover. */
export function MarkTip({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap',
        'rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1 text-xs text-foreground shadow-[var(--shadow-md)]',
        'opacity-0 transition-opacity duration-150',
        'group-hover:opacity-100 group-focus-visible:opacity-100',
      )}
    >
      {children}
    </span>
  )
}

/** Horizontal ranked bar: label, bar, value. The value is always visible, so
    the bar is a comparison aid rather than the only way to read the number. */
export function RankedBar({
  label,
  value,
  max,
  href,
  labelWidth = 'w-36',
}: {
  label: string
  value: number
  max: number
  href?: React.ReactNode
  labelWidth?: string
}) {
  const w = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('shrink-0 truncate text-right text-xs text-foreground', labelWidth)}>
        {href ?? label}
      </span>
      <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-surface-2">
        <span
          className="block h-full rounded-[3px]"
          style={{ width: `${w}%`, background: SERIES }}
        />
      </span>
      <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-ink-2">
        {value.toLocaleString('fr-FR')}
      </span>
    </div>
  )
}

/** Part-to-whole gauge. The track is the whole, so it earns its background:
    it is not decoration around a score. */
export function CoverageBar({
  label,
  n,
  total,
}: {
  label: string
  n: number
  total: number
}) {
  const p = total === 0 ? 0 : Math.round((n / total) * 100)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink-2">{label}</span>
        <span className="shrink-0 font-mono tabular-nums text-foreground">
          {n.toLocaleString('fr-FR')}
          <span className="ml-1.5 text-ink-3">{p} %</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${p}%`, background: SERIES }}
        />
      </div>
    </div>
  )
}
