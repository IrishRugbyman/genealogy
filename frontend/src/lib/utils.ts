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

/* The source marks an unknown part of a name with a placeholder: lowercase `n`
   for a first name, uppercase `N` for a surname, sometimes `?` or `x`. Shown
   raw they read as initials ("n MOREAU", "Marie N"), so they are rendered the
   way GeneWeb, where the tree is compiled, renders them: "?". */
const NAME_PLACEHOLDERS = new Set(['n', 'N', '?', 'x'])

export function isNamePlaceholder(part: string | null | undefined): boolean {
  return part != null && NAME_PLACEHOLDERS.has(part.trim())
}

/** "n MOREAU" -> "? MOREAU", "Marie N" -> "Marie ?", "N N" -> "Inconnu". */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.every((p) => NAME_PLACEHOLDERS.has(p))) return 'Inconnu'
  if (NAME_PLACEHOLDERS.has(parts[0])) parts[0] = '?'
  const last = parts.length - 1
  if (last > 0 && NAME_PLACEHOLDERS.has(parts[last])) parts[last] = '?'
  return parts.join(' ')
}

/** "Jean", "DE LA TOUR" -> "Jean De La Tour": the source stores surnames in capitals,
    which reads as shouting inside a sentence. */
export function personName(given: string | null, surname: string | null): string {
  if (isNamePlaceholder(given)) given = '?'
  if (isNamePlaceholder(surname)) surname = '?'
  const sur = (surname ?? '')
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('fr'))
  return [given, sur].filter(Boolean).join(' ')
}
