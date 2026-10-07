import { Link } from '@tanstack/react-router'
import { cn, sexLabel } from '@/lib/utils'
import type { BadgeTone } from '@/components/ui/Badge'

/* Shared person affordances. Search results, siblings, spouses, children,
   witnesses and the recently-viewed list were each rendering their own markup
   for the same thing; they now share these two so a person looks the same
   everywhere and only has to be restyled once. */

export function sexTone(sex: string | null | undefined): BadgeTone {
  if (sex === 'M') return 'sex-m'
  if (sex === 'F') return 'sex-f'
  return 'sex-x'
}

const SEX_HUE: Record<string, string> = {
  M: 'var(--cat-1)',
  F: 'var(--cat-5)',
}

/** Circular mark carrying the sex letter. The letter is the identity channel;
    the tint reinforces it, so it still reads with colour vision deficiency. */
export function SexMark({
  sex,
  size = 'md',
  className,
}: {
  sex: string | null | undefined
  size?: 'sm' | 'md'
  className?: string
}) {
  const hue = sex ? SEX_HUE[sex] : undefined
  return (
    <span
      aria-hidden="true"
      style={
        hue
          ? {
              backgroundColor: `color-mix(in oklab, ${hue} 18%, var(--surface))`,
              borderColor: `color-mix(in oklab, ${hue} 42%, var(--surface))`,
            }
          : undefined
      }
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border font-medium text-foreground',
        !hue && 'border-border bg-surface-2 text-ink-3',
        size === 'sm' ? 'h-5 w-5 text-[0.75rem]' : 'h-7 w-7 text-xs',
        className,
      )}
    >
      {sexLabel(sex ?? null)}
    </span>
  )
}

interface PersonChipProps {
  id: string
  name?: string | null
  sex?: string | null
  /** Rendered after the name, e.g. a birth year or a life span. */
  detail?: string | null
  className?: string
}

/** Inline reference to a person: the unit used in relative lists. */
export function PersonChip({ id, name, sex, detail, className }: PersonChipProps) {
  return (
    <Link
      to="/people/$id"
      params={{ id }}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-2 py-1.5 text-sm',
        'transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out-expo)]',
        'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:translate-y-px',
        className,
      )}
    >
      <SexMark sex={sex} size="sm" />
      <span className="truncate text-foreground">{name ?? 'Inconnu'}</span>
      {detail && <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">{detail}</span>}
    </Link>
  )
}
