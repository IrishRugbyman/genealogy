import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/ui/Button'
import { FamilyAccessButton } from '@/components/ui/FamilyAccess'
import { TextSizeToggle } from '@/components/ui/TextSizeToggle'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'Recherche' },
  { to: '/families', label: 'Familles' },
  { to: '/map', label: 'Carte' },
  { to: '/stats', label: 'Statistiques' },
  { to: '/professions', label: 'Métiers' },
  { to: '/distinctions', label: 'Distinctions' },
  { to: '/military-ranks', label: 'Militaire' },
  { to: '/bans', label: 'Lieux' },
  { to: '/gaps', label: 'Qualité' },
  { to: '/depot', label: 'Dépôt' },
] as const

function isActive(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname.startsWith(to)
}

/* The wordmark is set in the display face rather than paired with a stock
   tree glyph. A lucide TreePine next to the word "Généalogie" was the most
   generic thing on the page and said nothing the word did not. */
function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      className="group flex shrink-0 items-center gap-2 rounded-[var(--radius-sm)] px-0.5"
    >
      <span className="font-display text-lg font-medium tracking-[-0.01em] text-foreground transition-colors group-hover:text-primary">
        Généalogie
      </span>
    </Link>
  )
}

function DesktopNavItem({ to, label }: { to: string; label: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const active = isActive(to, pathname)
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative rounded-[var(--radius-sm)] px-2 py-1 text-sm transition-colors duration-150',
        'after:absolute after:inset-x-2 after:-bottom-[13px] after:h-px after:transition-colors after:content-[""]',
        active
          ? 'font-medium text-foreground after:bg-primary'
          : 'text-ink-3 after:bg-transparent hover:text-foreground',
      )}
    >
      {label}
    </Link>
  )
}

function MobileNavItem({
  to,
  label,
  onClose,
}: {
  to: string
  label: string
  onClose: () => void
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const active = isActive(to, pathname)
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      onClick={onClose}
      className={cn(
        'border-b border-border px-6 py-3.5 text-base transition-colors active:bg-surface-2',
        active
          ? 'border-l-2 border-l-primary pl-[22px] font-medium text-foreground'
          : 'text-ink-2 hover:text-foreground',
      )}
    >
      {label}
    </Link>
  )
}

/* Whether the full navigation fits on one line beside the wordmark and the
   controls. Its width follows the reader's text size, which a CSS breakpoint
   cannot see (media queries measure in the browser's default rem), so an
   invisible copy of the nav is measured instead and the header falls back to
   the drawer whenever the real one would not fit. */
function useNavFits() {
  const rowRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const fixedRefs = useRef<(HTMLElement | null)[]>([])
  const [fits, setFits] = useState(true)

  useLayoutEffect(() => {
    const row = rowRef.current
    const probe = probeRef.current
    if (!row || !probe) return
    const check = () => {
      const style = getComputedStyle(row)
      const gap = parseFloat(style.columnGap) || 0
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const fixed = fixedRefs.current.reduce(
        (w, el) => w + (el ? el.getBoundingClientRect().width : 0),
        0,
      )
      // Wordmark, nav, controls: two gaps between three items.
      setFits(row.clientWidth >= padding + fixed + probe.scrollWidth + 2 * gap)
    }
    const observer = new ResizeObserver(check)
    observer.observe(row)
    observer.observe(probe)
    fixedRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return { rowRef, probeRef, fixedRefs, fits }
}

function RootLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const nav = useNavFits()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    if (nav.fits) setDrawerOpen(false)
  }, [nav.fits])

  // Escape closes the drawer, and the body is locked so the page behind does
  // not scroll under the overlay.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  return (
    <div className="flex h-full flex-col">
      <a
        href="#contenu"
        className="sr-only rounded-[var(--radius)] bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Aller au contenu
      </a>

      {/* Header height is 56px; it never wraps to a second line, so nav labels
          are condensed rather than allowed to reflow. */}
      <header className="sticky top-0 z-40 border-b border-border bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] backdrop-blur-md">
        <div
          ref={nav.rowRef}
          className="relative mx-auto flex h-14 max-w-[1600px] items-center gap-4 overflow-hidden px-4 sm:px-6"
        >
          <span ref={(el) => { nav.fixedRefs.current[0] = el }} className="shrink-0">
            <Wordmark />
          </span>

          {/* Measuring copy: same items, same type, never seen nor focusable. */}
          <div
            ref={nav.probeRef}
            aria-hidden="true"
            className="invisible pointer-events-none absolute left-0 top-0 flex w-max items-center gap-0.5"
          >
            {NAV_ITEMS.map((item) => (
              <DesktopNavItem key={item.to} to={item.to} label={item.label} />
            ))}
          </div>

          {nav.fits && (
            <nav aria-label="Navigation principale" className="flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => (
                <DesktopNavItem key={item.to} to={item.to} label={item.label} />
              ))}
            </nav>
          )}

          <div
            ref={(el) => { nav.fixedRefs.current[1] = el }}
            className="ml-auto flex shrink-0 items-center gap-1"
          >
            <FamilyAccessButton className="hidden sm:inline-flex" />
            <TextSizeToggle />
            <ThemeToggle />
            {!nav.fits && (
              <IconButton
                size="sm"
                aria-label="Ouvrir le menu"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu size={16} />
              </IconButton>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50',
          nav.fits && 'hidden',
          drawerOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ background: 'var(--scrim)' }}
          className={cn(
            'absolute inset-0 transition-opacity duration-200',
            drawerOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          role="dialog"
          aria-modal={drawerOpen}
          aria-label="Navigation"
          className={cn(
            'absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-card',
            'transition-transform duration-250 ease-[var(--ease-out-expo)]',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-border px-5">
            <Wordmark onClick={() => setDrawerOpen(false)} />
            <IconButton
              size="sm"
              aria-label="Fermer le menu"
              onClick={() => setDrawerOpen(false)}
            >
              <X size={16} />
            </IconButton>
          </div>
          <div className="border-b border-border px-5 py-3 sm:hidden">
            <FamilyAccessButton className="w-full" />
          </div>
          <nav aria-label="Navigation" className="flex flex-col overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <MobileNavItem
                key={item.to}
                to={item.to}
                label={item.label}
                onClose={() => setDrawerOpen(false)}
              />
            ))}
          </nav>
        </div>
      </div>

      <main id="contenu" className="min-h-0 flex-1 overflow-auto">
        <Outlet />
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-ink-3 sm:px-6">
            <span>Données issues d'un fichier GEDCOM personnel</span>
            <span className="font-mono tabular-nums">{new Date().getFullYear()}</span>
          </div>
        </footer>
      </main>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
