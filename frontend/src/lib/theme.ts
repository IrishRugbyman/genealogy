import { useCallback, useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'genealogy-theme'

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  // Another tab may have changed the choice.
  window.addEventListener('storage', fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', fn)
  }
}

export function setTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    /* storage unavailable: the attribute still applies for this session */
  }
  listeners.forEach((fn) => fn())
}

/** Current explicit choice. `system` means "follow prefers-color-scheme". */
export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, read, () => 'system' as ThemeChoice)
  const set = useCallback((c: ThemeChoice) => setTheme(c), [])
  return [choice, set]
}

/** What the user is actually looking at right now, choice + system resolved. */
export function useResolvedTheme(): 'light' | 'dark' {
  const resolved = useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', fn)
      const un = subscribe(fn)
      return () => {
        mq.removeEventListener('change', fn)
        un()
      }
    },
    () => {
      const attr = document.documentElement.getAttribute('data-theme')
      if (attr === 'light' || attr === 'dark') return attr
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    },
    () => 'light' as const,
  )
  return resolved
}
