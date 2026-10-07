import { IconButton } from './Button'
import { TEXT_SIZES, useTextSize, type TextSize } from '@/lib/textSize'
import { cn } from '@/lib/utils'

const NOW: Record<TextSize, string> = {
  normal: 'texte normal',
  large: 'texte agrandi',
  xlarge: 'texte très agrandi',
}

/* "Aa" rather than an icon: it is the convention readers already know from
   e-readers and newspapers' sites, and it reads at a glance. The glyph grows
   with the setting, so the button shows where it stands. */
export function TextSizeToggle() {
  const [size, setSize] = useTextSize()
  const next = TEXT_SIZES[(TEXT_SIZES.indexOf(size) + 1) % TEXT_SIZES.length]
  const label = `Taille du texte : ${NOW[size]}. Passer au ${NOW[next]}.`

  return (
    <IconButton size="sm" aria-label={label} title={label} onClick={() => setSize(next)}>
      <span
        aria-hidden="true"
        className={cn(
          'font-display font-medium leading-none',
          size === 'normal' && 'text-[0.9375rem]',
          size === 'large' && 'text-[1.0625rem]',
          size === 'xlarge' && 'text-[1.1875rem]',
        )}
      >
        Aa
      </span>
    </IconButton>
  )
}
