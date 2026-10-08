import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTree } from '@/lib/api'
import { cn } from '@/lib/utils'

/* Four destinations carry almost every visit: find someone, see the tree, see
   where the family lived, send a document. They get the bar. The reference
   pages (catalogues, statistics, data quality) are one level down under
   "Explorer", each with a line saying what it is: "Bans" or "Qualité" alone
   means nothing to someone who did not build the site. */

interface NavItem {
  to: string
  label: string
  /** Paths, besides `to`, under which this item is the current one. */
  also?: string[]
}

interface ExploreItem extends NavItem {
  hint: string
}

export const EXPLORE_ITEMS: ExploreItem[] = [
  { to: '/families', label: 'Familles', hint: 'Tous les couples, par nom, lieu ou date' },
  { to: '/stats', label: 'Statistiques', hint: 'Noms, siècles, lieux, durées de vie' },
  { to: '/professions', label: 'Métiers', hint: 'Les métiers exercés, et par qui' },
  { to: '/distinctions', label: 'Distinctions', hint: 'Décorations, titres et honneurs' },
  { to: '/military-ranks', label: 'Grades militaires', hint: 'Qui a servi, et à quel grade' },
  { to: '/sources', label: 'Sources', hint: 'Registres, ouvrages et actes cités, et qui ils documentent' },
  { to: '/bans', label: 'Bans historiques', hint: "Seigneuries d'avant 1789 et leurs villages" },
  { to: '/gaps', label: 'Qualité des données', hint: 'Lieux encore mal situés' },
]

/** The bar: search, the tree (from the Sosa root, when the deployment has one),
    the map, the depot. */
export function usePrimaryItems(): NavItem[] {
  const root = useTree().data?.sosa_root
  return [
    { to: '/', label: 'Recherche', also: ['/people/'] },
    ...(root ? [{ to: `/tree/${root.id}`, label: 'Arbre', also: ['/tree/', '/relation/'] }] : []),
    { to: '/map', label: 'Carte', also: ['/places/', '/communes/'] },
    { to: '/depot', label: 'Dépôt' },
  ]
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)) return true
  return (item.also ?? []).some((p) => pathname.startsWith(p))
}

function usePathname() {
  return useRouterState({ select: (s) => s.location.pathname })
}

const barItem =
  'relative rounded-[var(--radius-sm)] px-2 py-1 text-sm transition-colors duration-150 ' +
  'after:absolute after:inset-x-2 after:-bottom-[13px] after:h-px after:transition-colors after:content-[""]'

function barItemState(active: boolean) {
  return active
    ? 'font-medium text-foreground after:bg-primary'
    : 'text-ink-3 after:bg-transparent hover:text-foreground'
}

/** The desktop bar. `probe` renders an inert copy, measured by the header to
    decide whether the bar fits (see `useNavFits` in `__root.tsx`). */
export function DesktopNav({ probe }: { probe?: boolean }) {
  const items = usePrimaryItems()
  const pathname = usePathname()
  return (
    <>
      {items.map((item) => {
        const active = isActive(item, pathname)
        return (
          <Link
            key={item.label}
            to={item.to}
            tabIndex={probe ? -1 : undefined}
            aria-current={active && !probe ? 'page' : undefined}
            className={cn(barItem, barItemState(active))}
          >
            {item.label}
          </Link>
        )
      })}
      <ExploreMenu probe={probe} />
    </>
  )
}

function ExploreMenu({ probe }: { probe?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const active = EXPLORE_ITEMS.some((i) => isActive(i, pathname))

  useEffect(() => setOpen(false), [pathname])

  // Closes on Escape (focus back on the button), on a click elsewhere, and
  // when keyboard focus leaves the menu.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div
      ref={wrapRef}
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        tabIndex={probe ? -1 : undefined}
        aria-expanded={probe ? undefined : open}
        aria-controls={probe ? undefined : panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(barItem, barItemState(active), 'inline-flex items-center gap-1')}
      >
        Explorer
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn('transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {open && !probe && (
        <div
          id={panelId}
          className="absolute left-0 top-full z-50 mt-3 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-border bg-card p-1.5 shadow-[var(--shadow-lg)]"
        >
          <ul className="flex flex-col">
            {EXPLORE_ITEMS.map((item) => {
              const current = isActive(item, pathname)
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'block rounded-[var(--radius)] px-3 py-2 transition-colors duration-150',
                      'hover:bg-surface-2 focus-visible:bg-surface-2',
                      current && 'bg-surface-2',
                    )}
                  >
                    <span className="block text-sm font-medium text-foreground">{item.label}</span>
                    <span className="block text-xs text-ink-3">{item.hint}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** The drawer's list: the bar's items, then the Explorer pages with their hints. */
export function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  const items = usePrimaryItems()
  const pathname = usePathname()

  const row = (item: NavItem, hint?: string) => {
    const active = isActive(item, pathname)
    return (
      <Link
        key={item.label}
        to={item.to}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={cn(
          'block border-b border-border px-6 py-3 transition-colors active:bg-surface-2',
          active ? 'border-l-2 border-l-primary pl-[22px]' : '',
        )}
      >
        <span
          className={cn(
            'block text-base',
            active ? 'font-medium text-foreground' : 'text-ink-2',
          )}
        >
          {item.label}
        </span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </Link>
    )
  }

  return (
    <>
      {items.map((item) => row(item))}
      <p className="px-6 pb-1.5 pt-5 text-xs font-medium uppercase tracking-wide text-ink-3">
        Explorer
      </p>
      {EXPLORE_ITEMS.map((item) => row(item, item.hint))}
    </>
  )
}
