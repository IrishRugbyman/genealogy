import { cn } from '@/lib/utils'

interface SegOption {
  key: string
  label: string
  count?: number
}

interface SegmentedControlProps {
  options: SegOption[]
  value: string
  onChange: (value: string) => void
  /** Names the group for screen readers, e.g. "Affichage de la chronologie". */
  label: string
  className?: string
  size?: 'sm' | 'md'
}

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  className,
  size = 'sm',
}: SegmentedControlProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex rounded-[var(--radius)] border border-border bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-3px)] font-medium',
              'transition-[background-color,color,box-shadow] duration-150 ease-[var(--ease-out-expo)]',
              'focus-visible:z-10 active:translate-y-px',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              active
                ? 'bg-card text-foreground shadow-[var(--shadow-sm)]'
                : 'text-ink-3 hover:text-foreground',
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span className="font-mono text-[10px] tabular-nums text-ink-3">{opt.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
