import { AlertCircle } from 'lucide-react'
import { Button } from './Button'

/* Status is never colour-alone: the icon and the wording carry it, the tint
   only reinforces. */

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      style={{
        backgroundColor: 'color-mix(in oklab, var(--danger) 9%, var(--surface))',
        borderColor: 'color-mix(in oklab, var(--danger) 32%, var(--surface))',
      }}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border px-4 py-3 text-sm"
    >
      <AlertCircle size={16} className="shrink-0 text-destructive" />
      <span className="min-w-0 flex-1 text-foreground">{message}</span>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  )
}
