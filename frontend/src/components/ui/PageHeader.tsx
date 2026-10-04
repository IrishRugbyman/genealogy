import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  back?: { to: string; label?: string }
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ icon, title, subtitle, back, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6', className)}>
      {back && (
        <Link
          to={back.to as never}
          className="group -ml-1 mb-4 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-sm text-ink-3 transition-colors hover:text-foreground active:translate-y-px"
        >
          <ArrowLeft
            size={14}
            className="transition-transform duration-150 ease-[var(--ease-out-expo)] group-hover:-translate-x-0.5"
          />
          {back.label ?? 'Retour'}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-border bg-surface-2 text-ink-2">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-medium leading-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
