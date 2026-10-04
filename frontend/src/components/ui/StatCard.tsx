import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

/* A stat tile, not a chart: one number doing the work, its label under it.
   No icon chrome, no trend arrow, no background track - none of those say
   anything the number does not already say.

   Figures use the display face here (EB Garamond's old-style numerals, which
   sit on the baseline at varying heights and read as typeset rather than as
   dashboard output). Figures inside tables and lists use mono + tabular
   instead, because there they have to align down a column. */

interface StatCardProps {
  value: string | number
  label: string
  /** Optional context line, e.g. a date range or a qualifier. */
  hint?: string
  to?: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  className?: string
}

function Body({ value, label, hint }: Pick<StatCardProps, 'value' | 'label' | 'hint'>) {
  return (
    <>
      <p className="font-display text-3xl font-medium leading-none text-foreground sm:text-4xl">
        {value}
      </p>
      <p className="mt-2 text-sm text-ink-2">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </>
  )
}

export function StatCard({ value, label, hint, to, params, search, className }: StatCardProps) {
  const shell = cn(
    'block rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-5',
    className,
  )

  if (to) {
    return (
      <Link
        to={to as never}
        params={params as never}
        search={search as never}
        className={cn(
          shell,
          'transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)]',
          'hover:border-[var(--rule-strong)] hover:shadow-[var(--shadow-md)]',
          'active:translate-y-px active:shadow-none',
        )}
      >
        <Body value={value} label={label} hint={hint} />
      </Link>
    )
  }

  return (
    <div className={shell}>
      <Body value={value} label={label} hint={hint} />
    </div>
  )
}
