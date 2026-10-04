import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { BadgeTone } from '@/components/ui/Badge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(
  year: number | null,
  month?: number | null,
  day?: number | null,
): string {
  if (!year) return ''
  if (day && month) return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
  if (month) return `${String(month).padStart(2, '0')}/${year}`
  return String(year)
}

/**
 * "1802 - 1871" when both years are known, "1802" when only the birth is,
 * "† 1871" when only the death is, and "" when neither.
 *
 * A trailing "1802 -" reads as a truncated string rather than as an open-ended
 * life, so the open end is left implicit instead. The dagger is the standard
 * genealogical mark for a death date and is unambiguous on its own.
 */
export function formatLifespan(
  birth: number | null | undefined,
  death: number | null | undefined,
): string {
  if (birth == null && death == null) return ''
  if (birth != null && death != null) return `${birth} - ${death}`
  if (birth != null) return String(birth)
  return `† ${death}`
}

export function sexLabel(sex: string | null): string {
  if (sex === 'M') return 'H'
  if (sex === 'F') return 'F'
  return '?'
}

export function sexTone(sex: string | null | undefined): BadgeTone {
  if (sex === 'M') return 'sex-m'
  if (sex === 'F') return 'sex-f'
  return 'sex-x'
}

export function formatPlaceObj(p: {
  locality?: string | null
  county?: string | null
  country?: string | null
} | null | undefined): string {
  if (!p) return ''
  return [p.locality, p.county, p.country].filter(Boolean).join(', ')
}

/** "Jean", "DE LA TOUR" -> "Jean De La Tour": the source stores surnames in capitals,
    which reads as shouting inside a sentence. */
export function personName(given: string | null, surname: string | null): string {
  const sur = (surname ?? '')
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('fr'))
  return [given, sur].filter(Boolean).join(' ')
}
