import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  EVENT_HUE,
  LEGEND_ITEMS,
  formatTimelineYear,
  type TimelineData,
  type TimelineEvent,
} from '@/lib/timeline'

const SLOT = 130 // horizontal space reserved per event label (px)
const PAD = SLOT / 2

/**
 * Place each event proportionally by year, then resolve label collisions:
 * a forward pass pushes overlapping nodes right, a backward pass pulls them
 * back inside the right edge. Sparse regions stay proportional; only dense
 * clusters get spread out. Everything stays within [PAD, width - PAD].
 */
function layout(events: TimelineEvent[], width: number): number[] {
  const n = events.length
  if (n === 0) return []
  if (n === 1) return [width / 2]

  const minYear = events[0].year
  const maxYear = events[n - 1].year
  const span = Math.max(maxYear - minYear, 1)
  const usable = Math.max(width - SLOT, SLOT)

  const xs = events.map((e) => PAD + ((e.year - minYear) / span) * usable)

  // Forward pass: enforce minimum gap, pushing right
  for (let i = 1; i < n; i++) {
    if (xs[i] - xs[i - 1] < SLOT) xs[i] = xs[i - 1] + SLOT
  }
  // Backward pass: if we overflowed the right edge, push left
  const rightEdge = width - PAD
  if (xs[n - 1] > rightEdge) {
    xs[n - 1] = rightEdge
    for (let i = n - 2; i >= 0; i--) {
      if (xs[i + 1] - xs[i] < SLOT) xs[i] = xs[i + 1] - SLOT
    }
  }
  return xs
}

function EventNode({ e }: { e: TimelineEvent }) {
  const nameLink = e.personId ? (
    <Link
      to="/people/$id"
      params={{ id: e.personId }}
      className="hover:text-primary hover:underline"
    >
      {e.sublabel ?? '?'}
    </Link>
  ) : null

  let primary: React.ReactNode
  let secondary: string | null = null

  if (e.category === 'child') {
    primary = <>Naissance de {nameLink ?? (e.sublabel ?? '?')}</>
    secondary = e.place ? `à ${e.place}` : null
  } else if (e.category === 'marriage') {
    primary = <>{e.label} avec {nameLink ?? (e.sublabel ?? '?')}</>
    secondary = e.place ? `à ${e.place}` : null
  } else {
    primary = e.label
    secondary = e.sublabel ?? (e.place ? `à ${e.place}` : null)
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-center text-[11px] font-medium leading-snug text-foreground">
        {primary}
      </span>
      {secondary && (
        <span className="text-center text-[10px] leading-snug text-ink-3">{secondary}</span>
      )}
    </div>
  )
}

export function PersonTimelineHorizontal({ timeline }: { timeline: TimelineData }) {
  const { events, undated } = timeline

  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (events.length === 0 && undated.length === 0) {
    return <p className="text-sm text-ink-3">Aucun événement connu.</p>
  }

  const presentCategories = new Set(events.map((e) => e.category))
  const legend = LEGEND_ITEMS.filter((l) => presentCategories.has(l.category))

  const xs = width > 0 ? layout(events, width) : []

  return (
    <div>
      {legend.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1.5">
          {legend.map((l) => (
            <span key={l.category} className="flex items-center gap-1.5 text-xs text-ink-3">
              <span
                aria-hidden="true"
                style={{ background: EVENT_HUE[l.category] }}
                className="h-2 w-2 shrink-0 rounded-full"
              />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div ref={containerRef} className="relative w-full" style={{ height: 150 }}>
          {/* Axis line */}
          <div className="absolute bg-border" style={{ top: 44, left: 0, right: 0, height: 1 }} />

          {xs.length === events.length && events.map((e, i) => (
            <div
              key={i}
              className="absolute flex flex-col items-center"
              style={{ left: xs[i], top: 0, transform: 'translateX(-50%)', width: SLOT }}
            >
              <span className="mb-1 font-mono text-[10px] font-medium text-ink-3">
                {formatTimelineYear(e.year, e.qualifier, e.year2)}
              </span>

              {/* 2px surface ring so two marks that land on the same year
                  still read as two marks. */}
              <div
                aria-hidden="true"
                style={{ background: EVENT_HUE[e.category] }}
                className="z-10 h-3 w-3 rounded-full ring-2 ring-[var(--paper)]"
              />

              <div className="mt-2">
                <EventNode e={e} />
              </div>
            </div>
          ))}
        </div>
      )}

      {undated.length > 0 && (
        <div className={cn(events.length > 0 && 'mt-4')}>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Sans date</p>
          <div className="space-y-1">
            {undated.map((u, i) => (
              <p key={i} className="text-sm text-foreground">
                {u.label}
                {u.sublabel && <span className="ml-2 text-ink-3">· {u.sublabel}</span>}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
