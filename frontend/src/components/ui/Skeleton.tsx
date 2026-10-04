import { cn } from '@/lib/utils'

/* Skeletons mirror the shape of what is arriving, so the layout does not jump
   when it lands. That is also the CLS story: the placeholder reserves the real
   box. Nothing here is a centred spinner. */

export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn('animate-shimmer rounded-[var(--radius-sm)]', className)}
      style={style}
      aria-hidden="true"
    />
  )
}

export function PersonCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-5 w-10" />
      </div>
      <Skeleton className="mt-2.5 h-3 w-20" />
      <Skeleton className="mt-1.5 h-3 w-28" />
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-5">
      <Skeleton className="h-9 w-24" />
      <Skeleton className="mt-2.5 h-4 w-20" />
    </div>
  )
}

export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <Skeleton className="h-3 w-full" />
        </td>
      ))}
    </tr>
  )
}

export function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" style={{ opacity: Math.max(0.35, 1 - i * 0.22) }} />
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border rounded-[var(--radius-lg)] border border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${60 - i * 5}%` }} />
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  )
}
