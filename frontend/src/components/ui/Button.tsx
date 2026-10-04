import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

/* Every interactive surface in the app routes through these class lists, so the
   eight states are defined once instead of being re-improvised per call site:

     default / :hover / :focus-visible / :active / disabled  - here
     loading                                                 - `loading` prop
     error / success                                          - not a button
       colour in this app. A failed action shows an ErrorBanner and a succeeded
       one changes the content; recolouring the button would say the same thing
       twice and strand colourblind users on the colour alone.

   :active uses a 1px push rather than a scale so it reads on touch, where
   there is no hover state at all. */

const base =
  'relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 ' +
  'whitespace-nowrap font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)] ' +
  'active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45'

const variants: Record<ButtonVariant, string> = {
  primary:
    'rounded-[var(--radius)] bg-primary text-primary-foreground shadow-[var(--shadow-sm)] ' +
    'hover:bg-[var(--accent-hover)] active:bg-[var(--accent-hover)] active:shadow-none',
  secondary:
    'rounded-[var(--radius)] border border-border bg-card text-foreground ' +
    'hover:border-[var(--rule-strong)] hover:bg-surface-2 active:bg-surface-2',
  ghost:
    'rounded-[var(--radius)] text-ink-2 hover:bg-surface-2 hover:text-foreground active:bg-surface-2',
  danger:
    'rounded-[var(--radius)] border border-destructive/35 bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface))] text-destructive ' +
    'hover:bg-[color-mix(in_oklab,var(--danger)_18%,var(--surface))] active:bg-[color-mix(in_oklab,var(--danger)_22%,var(--surface))]',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
}

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className)
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {/* The label keeps its box while loading so the button never resizes
          mid-click and shifts what is underneath it. */}
      <span className={cn('inline-flex items-center gap-1.5', loading && 'invisible')}>
        {children}
      </span>
      {loading && (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        </span>
      )}
    </button>
  )
}

/** Small square button for a lone icon. Needs an aria-label from the caller. */
export function IconButton({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...props
}: Omit<ButtonProps, 'loading'>) {
  return (
    <button
      type="button"
      className={cn(
        base,
        variants[variant],
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        'px-0',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
