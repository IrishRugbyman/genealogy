const KEY = 'genealogy:recent'
const MAX = 10

export interface RecentPerson {
  id: string
  name: string | null
  nickname: string | null
  birth_year: number | null
  death_year: number | null
  birth_place: string | null
  sex: string | null
}

export function pushRecent(p: RecentPerson): void {
  try {
    const prev = getRecent()
    const next = [p, ...prev.filter((r) => r.id !== p.id)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage full or unavailable - silently ignore
  }
}

export function getRecent(): RecentPerson[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentPerson[]
  } catch {
    return []
  }
}
