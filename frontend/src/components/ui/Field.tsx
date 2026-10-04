import { useId } from 'react'
import { cn } from '@/lib/utils'

/* Form anatomy, fixed here so it cannot drift per page:
     label ABOVE the control, always present (never placeholder-as-label)
     helper text below the control, optional
     error text below that, and it also flips aria-invalid
   Every colour used is contrast-checked against --surface and --paper. */

const control =
  'w-full rounded-[var(--radius)] border border-border bg-card text-sm text-foreground ' +
  'placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow,background-color] duration-150 ease-[var(--ease-out-expo)] ' +
  'hover:border-[var(--rule-strong)] ' +
  'focus:border-primary focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-55 ' +
  'aria-[invalid=true]:border-destructive'

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-xs font-medium text-ink-2', className)}
      {...props}
    />
  )
}

interface FieldProps {
  label: string
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean
  helper?: string
  error?: string
  className?: string
  children: (props: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': boolean | undefined
  }) => React.ReactNode
}

export function Field({ label, hideLabel, helper, error, className, children }: FieldProps) {
  const id = useId()
  const helpId = helper ? `${id}-help` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [errId, helpId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </Label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {helper && !error && (
        <p id={helpId} className="text-xs text-ink-3">
          {helper}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({
  className,
  ...props
}: React.ComponentPropsWithRef<'input'>) {
  return <input className={cn(control, 'h-9 px-2.5', className)} {...props} />
}

export function Select({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<'select'>) {
  return (
    <select className={cn(control, 'h-9 cursor-pointer px-2.5 pr-8', className)} {...props}>
      {children}
    </select>
  )
}
