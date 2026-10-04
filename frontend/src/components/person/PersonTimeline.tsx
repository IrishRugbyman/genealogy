import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  EVENT_HUE,
  LEGEND_ITEMS,
  formatTimelineYear,
  spacerHeight,
  type TimelineData,
  type TimelineEvent,
} from '@/lib/timeline'

interface YearGroup {
  year: number
  events: TimelineEvent[]
}

function groupByYear(events: TimelineEvent[]): YearGroup[] {
  const groups: YearGroup[] = []
  for (const e of events) {
    const last = groups[groups.length - 1]
    if (last && last.year === e.year) {
      last.events.push(e)
    } else {
      groups.push({ year: e.year, events: [e] })
    }
  }
  return groups
}

export function PersonTimeline({ timeline }: { timeline: TimelineData }) {
  const { events, undated } = timeline

  if (events.length === 0 && undated.length === 0) {
    return <p className="text-sm text-ink-3">Aucun événement connu.</p>
  }

  const groups = groupByYear(events)
  const presentCategories = new Set(events.map((e) => e.category))
  const legend = LEGEND_ITEMS.filter((l) => presentCategories.has(l.category))

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
        <div className="relative">
          {/* Single continuous vertical line */}
          <div
            className="absolute top-2 bottom-2 w-px bg-border"
            style={{ left: '4.625rem' }}
          />

          <div className="flex flex-col">
            {groups.map((group, gi) => {
              const prevGroup = groups[gi - 1]
              const gap = prevGroup ? spacerHeight(group.year - prevGroup.year) : 0
              const yearStr = formatTimelineYear(
                group.year,
                group.events[0].qualifier,
                group.events[0].year2,
              )

              return (
                <div key={`${group.year}-${gi}`}>
                  {gap > 0 && <div style={{ height: gap }} />}
                  <div className="flex items-start">
                    {/* Year label - w-16 = 64px */}
                    <div className="w-16 shrink-0 pr-3 pt-0.5 text-right font-mono text-xs font-medium text-ink-3">
                      {yearStr}
                    </div>

                    {/* Dots - w-5 = 20px, center at 74px from left */}
                    <div className="relative z-10 flex w-5 shrink-0 flex-col items-center gap-3 pt-0.5">
                      {group.events.map((e, ei) => (
                        <div
                          key={ei}
                          aria-hidden="true"
                          style={{ background: EVENT_HUE[e.category] }}
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[var(--paper)]"
                        />
                      ))}
                    </div>

                    {/* Event content */}
                    <div className="flex-1 space-y-2 pb-1 pl-3">
                      {group.events.map((e, ei) => (
                        <div key={ei}>
                          {e.category === 'child' ? (
                            <>
                              <p className="text-sm font-medium leading-snug text-foreground">
                                Naissance de{' '}
                                {e.personId ? (
                                  <Link
                                    to="/people/$id"
                                    params={{ id: e.personId }}
                                    className="hover:text-primary hover:underline"
                                  >
                                    {e.sublabel ?? 'enfant inconnu'}
                                  </Link>
                                ) : (
                                  e.sublabel ?? 'enfant inconnu'
                                )}
                              </p>
                              {e.place && (
                                <p className="text-xs leading-snug text-ink-3">à {e.place}</p>
                              )}
                            </>
                          ) : e.category === 'marriage' ? (
                            <>
                              <p className="text-sm font-medium leading-snug text-foreground">
                                {e.label} avec{' '}
                                {e.personId ? (
                                  <Link
                                    to="/people/$id"
                                    params={{ id: e.personId }}
                                    className="hover:text-primary hover:underline"
                                  >
                                    {e.sublabel ?? 'conjoint inconnu'}
                                  </Link>
                                ) : (
                                  e.sublabel ?? 'conjoint inconnu'
                                )}
                              </p>
                              {e.place && (
                                <p className="text-xs leading-snug text-ink-3">
                                  à {e.place}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-medium leading-snug text-foreground">
                                {e.label}
                              </p>
                              {e.sublabel && (
                                <p className="text-xs leading-snug text-ink-3">
                                  {e.sublabel}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {undated.length > 0 && (
        <div className={cn(events.length > 0 && 'mt-6')}>
          <p className="mb-2 text-sm font-medium text-ink-2">Sans date</p>
          <div className="space-y-1">
            {undated.map((u, i) => (
              <p key={i} className="text-sm text-foreground">
                {u.label}
                {u.sublabel && (
                  <span className="ml-2 text-ink-3">· {u.sublabel}</span>
                )}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
