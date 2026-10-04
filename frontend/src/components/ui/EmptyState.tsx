import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  message: string
  /** Say how to populate it, not just that it is empty. */
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, message, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          <Icon size={18} />
        </span>
      )}
      <div className="max-w-[42ch]">
        <p className="font-display text-lg text-foreground">{message}</p>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  )
}
