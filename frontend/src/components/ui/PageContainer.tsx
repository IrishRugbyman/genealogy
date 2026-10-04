import { cn } from '@/lib/utils'

/* The old layout had no container at all, so at 1440px+ a person's events
   stretched the full window and the eye had to travel the whole width to pair
   a label with its value. Capped here once. */

export function PageContainer({
  children,
  className,
  /** For the map and the tree canvas, which genuinely want the whole window. */
  wide,
}: {
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8',
        wide ? 'max-w-[1600px]' : 'max-w-[1180px]',
        'animate-fade-in-up',
        className,
      )}
    >
      {children}
    </div>
  )
}
