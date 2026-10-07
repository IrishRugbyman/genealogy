import { cn } from '@/lib/utils'

/* Badges carry NEUTRAL ink text on a hue-tinted fill, never coloured text.

   Two reasons, and the second is the load-bearing one:
     1. It is the data-viz rule - text wears text tokens; the mark beside it
        carries identity. Five hues of small coloured text was most of what
        made the old pages feel like confetti.
     2. Coloured label text cannot pass AA at 12px across the whole scale.
        Slot 2 (gold #ac7d00) measures 3.63:1 on --surface: fine for a mark
        (3:1) and a hard fail for text (4.5:1). Neutral ink on the tint
        measures ~13:1 for every slot in both modes.

   Identity is never colour-alone either: every badge below renders a word or
   a letter. */

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'danger'
  | 'sex-m'
  | 'sex-f'
  | 'sex-x'
  | 'branch-1'
  | 'branch-2'
  | 'branch-3'
  | 'event-birth'
  | 'event-marriage'
  | 'event-child'
  | 'event-death'
  | 'event-other'

const HUE: Record<BadgeTone, string | null> = {
  neutral: null,
  accent: 'var(--accent)',
  danger: 'var(--danger)',
  'sex-m': 'var(--cat-1)',
  'sex-f': 'var(--cat-5)',
  'sex-x': null,
  'branch-1': 'var(--cat-4)',
  'branch-2': 'var(--cat-2)',
  'branch-3': 'var(--cat-3)',
  'event-birth': 'var(--cat-3)',
  'event-marriage': 'var(--cat-5)',
  'event-child': 'var(--cat-1)',
  'event-death': null,
  'event-other': 'var(--cat-2)',
}

interface BadgeProps {
  children: React.ReactNode
  tone?: BadgeTone
  /** `mono` for figures that should align: Sosa numbers, INSEE codes, IDs. */
  mono?: boolean
  className?: string
  title?: string
}

export function Badge({ children, tone = 'neutral', mono, className, title }: BadgeProps) {
  const hue = HUE[tone]

  // Accent and danger are the two hues that DO clear AA as text, and they mark
  // emphasis rather than category, so they read stronger on purpose.
  const emphatic = tone === 'accent' || tone === 'danger'

  return (
    <span
      title={title}
      style={
        hue
          ? ({
              '--h': hue,
              backgroundColor: `color-mix(in oklab, ${hue} ${emphatic ? 12 : 15}%, var(--surface))`,
              borderColor: `color-mix(in oklab, ${hue} ${emphatic ? 34 : 40}%, var(--surface))`,
              color: emphatic ? hue : undefined,
            } as React.CSSProperties)
          : undefined
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-px',
        'text-[0.8125rem] font-medium leading-5',
        mono && 'font-mono tabular-nums',
        !hue && 'border-border bg-surface-2 text-ink-2',
        hue && !emphatic && 'text-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A hue mark used beside its own label: timeline events, chart legends. */
export function Dot({
  tone,
  className,
  size = 8,
}: {
  tone: BadgeTone
  className?: string
  size?: number
}) {
  const hue = HUE[tone] ?? 'var(--ink-3)'
  return (
    <span
      aria-hidden="true"
      style={{ background: hue, width: size, height: size }}
      className={cn('inline-block shrink-0 rounded-full', className)}
    />
  )
}
