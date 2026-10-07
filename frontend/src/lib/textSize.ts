import { useCallback, useSyncExternalStore } from 'react'

/* Reading comfort, chosen per device. Everything in the app is sized in rem, so
   one root font-size scales text, spacing and controls together, the way a
   browser zoom would but remembered and one click away. The attribute is
   stamped before first paint by the inline script in index.html. */

export type TextSize = 'normal' | 'large' | 'xlarge'

export const TEXT_SIZES: TextSize[] = ['normal', 'large', 'xlarge']

/** Root font-size multiplier of each choice; must match index.css. */
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.125, xlarge: 1.25 }

const STORAGE_KEY = 'genealogy-text-size'

function read(): TextSize {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'large' || v === 'xlarge' ? v : 'normal'
  } catch {
    return 'normal'
  }
}

const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  window.addEventListener('storage', fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', fn)
  }
}

export function setTextSize(size: TextSize) {
  const root = document.documentElement
  if (size === 'normal') root.removeAttribute('data-text-size')
  else root.setAttribute('data-text-size', size)
  try {
    if (size === 'normal') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, size)
  } catch {
    /* storage unavailable: the attribute still applies for this session */
  }
  listeners.forEach((fn) => fn())
}

export function useTextSize(): [TextSize, (s: TextSize) => void] {
  const size = useSyncExternalStore(subscribe, read, () => 'normal' as TextSize)
  const set = useCallback((s: TextSize) => setTextSize(s), [])
  return [size, set]
}

/** The current multiplier, for the few things laid out in pixels (the tree). */
export function useTextScale(): number {
  return TEXT_SCALE[useTextSize()[0]]
}
