import { Monitor, Moon, Sun } from 'lucide-react'
import { IconButton } from './Button'
import { useTheme, type ThemeChoice } from '@/lib/theme'

const ORDER: ThemeChoice[] = ['system', 'light', 'dark']

const META: Record<ThemeChoice, { icon: typeof Sun; now: string }> = {
  system: { icon: Monitor, now: 'thème du système' },
  light: { icon: Sun, now: 'thème clair' },
  dark: { icon: Moon, now: 'thème sombre' },
}

export function ThemeToggle() {
  const [choice, setChoice] = useTheme()
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]
  const Icon = META[choice].icon

  // The icon shows the current state; the label says what a click will do, so
  // the control is legible to a screen reader without seeing the icon change.
  const label = `Apparence : ${META[choice].now}. Basculer vers le ${META[next].now}.`

  return (
    <IconButton
      size="sm"
      aria-label={label}
      title={label}
      onClick={() => setChoice(next)}
    >
      <Icon size={16} />
    </IconButton>
  )
}
