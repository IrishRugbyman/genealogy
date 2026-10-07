import type { PersonDetail } from './api'
import { formatPlaceObj } from './utils'

export type EventCategory = 'birth' | 'death' | 'marriage' | 'child' | 'other'

export interface TimelineEvent {
  year: number
  qualifier: string | null
  year2: number | null
  label: string
  sublabel: string | null
  place: string | null
  category: EventCategory
  personId?: string
}

export interface TimelineData {
  events: TimelineEvent[]
  undated: Array<{ label: string; sublabel: string | null }>
}

export const VITAL_TYPES = new Set(['BIRT', 'BAPM', 'CHR', 'DEAT', 'BURI', 'CREM'])

/** Event categories map onto the validated categorical scale, not onto raw
    Tailwind palette steps. Read as a CSS variable so the mark follows the
    light/dark swap. Birth and "child born" deliberately share the blue/teal
    end: they are the same kind of event seen from two sides. */
export const EVENT_HUE: Record<EventCategory, string> = {
  birth:    'var(--cat-3)',
  marriage: 'var(--cat-5)',
  child:    'var(--cat-1)',
  other:    'var(--cat-2)',
  death:    'var(--ink-3)',
}

export const EVENT_TONE: Record<EventCategory, string> = {
  birth:    'event-birth',
  marriage: 'event-marriage',
  child:    'event-child',
  other:    'event-other',
  death:    'event-death',
}

export const LEGEND_ITEMS: Array<{ category: EventCategory; label: string }> = [
  { category: 'birth',    label: 'Naissance / Baptême' },
  { category: 'marriage', label: 'Mariage' },
  { category: 'child',    label: 'Enfant né(e)' },
  { category: 'other',    label: 'Autre événement' },
  { category: 'death',    label: 'Décès / Inhumation' },
]

const TYPE_LABEL: Record<string, string> = {
  BIRT: 'Naissance',
  BAPM: 'Baptême',
  CHR:  'Baptême',
  DEAT: 'Décès',
  BURI: 'Inhumation',
  CREM: 'Crémation',
  EMIG: 'Émigration',
  IMMI: 'Immigration',
  NATU: 'Naturalisation',
  RESI: 'Résidence',
  OCCU: 'Profession',
  EVEN: 'Événement',
  WILL: 'Testament',
  PROB: 'Homologation testament',
  CENS: 'Recensement',
  CONF: 'Confirmation',
  FCOM: 'Première communion',
}

export function typeLabel(type: string | null): string {
  return TYPE_LABEL[type ?? ''] ?? (type ?? 'Événement')
}

function typeCategory(type: string | null): EventCategory {
  if (!type) return 'other'
  if (['BIRT', 'BAPM', 'CHR', 'FCOM', 'CONF'].includes(type)) return 'birth'
  if (['DEAT', 'BURI', 'CREM'].includes(type)) return 'death'
  return 'other'
}

function normalizeQualifier(q: string | null | undefined): string | null {
  return q && q !== 'EXACT' ? q : null
}

export function formatTimelineYear(
  year: number,
  qualifier: string | null,
  year2: number | null,
): string {
  if (qualifier === 'ABT') return `~${year}`
  if (qualifier === 'BEF') return `<${year}`
  if (qualifier === 'AFT') return `>${year}`
  if ((qualifier === 'BET' || qualifier === 'FROM') && year2) return `${year}-${year2}`
  return String(year)
}

export function spacerHeight(yearDiff: number): number {
  return Math.min(Math.max(yearDiff * 5, 12), 120)
}

export function buildTimeline(person: PersonDetail): TimelineData {
  const timed: TimelineEvent[] = []
  const undated: Array<{ label: string; sublabel: string | null }> = []

  if (person.birth_year != null) {
    timed.push({
      year: person.birth_year,
      qualifier: normalizeQualifier(person.birth_qualifier),
      year2: null,
      label: 'Naissance',
      sublabel: formatPlaceObj(person.birth_place) || null,
      place: null,
      category: 'birth',
    })
  } else {
    const place = formatPlaceObj(person.birth_place)
    if (place) undated.push({ label: 'Naissance', sublabel: place })
  }

  if (person.baptism_year != null) {
    timed.push({
      year: person.baptism_year,
      qualifier: null,
      year2: null,
      label: 'Baptême',
      sublabel: formatPlaceObj(person.baptism_place) || null,
      place: null,
      category: 'birth',
    })
  } else {
    const place = formatPlaceObj(person.baptism_place)
    if (place) undated.push({ label: 'Baptême', sublabel: place })
  }

  if (person.death_year != null) {
    timed.push({
      year: person.death_year,
      qualifier: normalizeQualifier(person.death_qualifier),
      year2: null,
      label: 'Décès',
      sublabel: formatPlaceObj(person.death_place) || null,
      place: null,
      category: 'death',
    })
  } else {
    const place = formatPlaceObj(person.death_place)
    if (place) undated.push({ label: 'Décès', sublabel: place })
  }

  if (person.burial_year != null) {
    timed.push({
      year: person.burial_year,
      qualifier: null,
      year2: null,
      label: 'Inhumation',
      sublabel: formatPlaceObj(person.burial_place) || null,
      place: null,
      category: 'death',
    })
  } else {
    const place = formatPlaceObj(person.burial_place)
    if (place) undated.push({ label: 'Inhumation', sublabel: place })
  }

  for (const e of person.events) {
    if (VITAL_TYPES.has(e.type ?? '')) continue
    if (e.date_year != null) {
      timed.push({
        year: e.date_year,
        qualifier: normalizeQualifier(e.date_qualifier),
        year2: e.date_year2 ?? null,
        label: typeLabel(e.type),
        sublabel: null,
        place: null,
        category: typeCategory(e.type),
      })
    } else {
      undated.push({ label: typeLabel(e.type), sublabel: null })
    }
  }

  // A union or a birth involving someone hidden as living has no date or place
  // to show: it is left out rather than listed as an empty "Sans date" line.
  for (const s of person.spouses) {
    if (s.spouse_living) continue
    const label = s.divorced ? 'Mariage (div.)' : 'Mariage'
    const place = s.marriage_locality || null
    const spouseName = s.spouse_name ?? 'Conjoint inconnu'
    if (s.marriage_year != null) {
      timed.push({
        year: s.marriage_year,
        qualifier: normalizeQualifier(s.marriage_qualifier),
        year2: null,
        label,
        sublabel: spouseName,
        place,
        category: 'marriage',
        personId: s.spouse_id ?? undefined,
      })
    }
    // An undated union is not listed under "Sans date": the Famille section
    // above the timeline already shows every union, dated or not.
  }

  for (const c of person.children) {
    if (c.living) continue
    const name = c.name ?? 'Enfant inconnu'
    const childPlace =
      formatPlaceObj({
        locality: c.child_birth_locality,
        county: c.child_birth_county,
        country: c.child_birth_country,
      }) || null
    if (c.child_birth_year != null) {
      timed.push({
        year: c.child_birth_year,
        qualifier: null,
        year2: null,
        label: 'Naissance de',
        sublabel: name,
        place: childPlace,
        category: 'child',
        personId: c.child_id,
      })
    }
    // Same for an undated child: listed with their union in the Famille section.
  }

  const catOrder: Record<EventCategory, number> = {
    birth: 0,
    marriage: 1,
    child: 2,
    other: 3,
    death: 4,
  }
  timed.sort((a, b) => a.year - b.year || catOrder[a.category] - catOrder[b.category])

  return { events: timed, undated }
}
