import { cn } from '@/lib/utils'

/* Replaces the old "every block is a bordered card with an UPPERCASE eyebrow"
   pattern. Two things changed:

   1. Section headings are real headings in the display face, not micro-labels.
      Uppercase tracking-wide eyebrows above every block are what made the old
      pages read as templated: nine sections, nine identical labels, no
      hierarchy between them.
   2. `plain` is the default. A box is spent only where elevation means
      something (a person's identity header, a stat tile, a popover); the rest
      group with a hairline and space. */

interface SectionProps {
  title?: string
  /** Small count/qualifier rendered next to the title, e.g. "10". */
  count?: number | string
  actions?: React.ReactNode
  /** `panel` draws the surface + border. Use it only for real elevation. */
  variant?: 'plain' | 'panel'
  /** Heading level. Pages carry one h1, so sections default to h2. */
  as?: 'h2' | 'h3'
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

export function Section({
  title,
  count,
  actions,
  variant = 'plain',
  as: Heading = 'h2',
  className,
  bodyClassName,
  children,
}: SectionProps) {
  const panel = variant === 'panel'
  return (
    <section
      className={cn(
        panel && 'rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-5',
        className,
      )}
    >
      {(title || actions) && (
        <div
          className={cn(
            'mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2',
            !panel && 'border-b border-border pb-2',
          )}
        >
          {title && (
            <Heading className="font-display text-lg font-medium leading-tight text-foreground sm:text-xl">
              {title}
              {count != null && (
                <span className="ml-2 font-sans text-sm font-normal tabular-nums text-ink-3">
                  {count}
                </span>
              )}
            </Heading>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/** Plain surface. No heading, no assumptions - just the material. */
export function Card({
  className,
  elevated,
  children,
}: {
  className?: string
  elevated?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-border bg-card',
        elevated && 'shadow-[var(--shadow-md)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
