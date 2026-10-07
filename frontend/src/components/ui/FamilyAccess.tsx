import { Lock, Users, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, IconButton } from './Button'
import { Field, Input } from './Field'
import { useFamilyAccess } from '@/lib/api'
import { cn } from '@/lib/utils'

/* People who may still be alive are hidden from visitors: the API masks them
   unless this browser signed in with the family password. These are the two
   ways in: a button in the header, and the same form inline on a hidden
   person's page, where the question "why can't I see this?" arises. */

export function SignInForm({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const { signIn } = useFamilyAccess()
  const [value, setValue] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim() || signIn.isPending) return
    signIn.mutate({ password: value }, { onSuccess: () => onDone?.() })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Mot de passe de la famille"
        helper="Il reste mémorisé sur cet appareil."
        error={signIn.error?.message}
      >
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="current-password"
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" loading={signIn.isPending} disabled={!value.trim()}>
        Entrer
      </Button>
    </form>
  )
}

/** Header control: "Accès famille" when signed out, "Famille" when signed in. */
export function FamilyAccessButton({ className }: { className?: string }) {
  const { family, available, signOut } = useFamilyAccess()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  // The native <dialog> gives focus trapping, Escape and the backdrop for free.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!available) return null

  return (
    <>
      <Button
        size="sm"
        variant={family ? 'ghost' : 'secondary'}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={className}
      >
        {family ? <Users size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
        {family ? 'Famille' : 'Accès famille'}
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // A click on the backdrop lands on the dialog element itself.
          if (e.target === dialogRef.current) setOpen(false)
        }}
        aria-labelledby="family-access-title"
        className={cn(
          'm-auto w-[min(26rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-border bg-card p-0 text-foreground shadow-[var(--shadow-lg)]',
          'backdrop:bg-[var(--scrim)]',
        )}
      >
        {open && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id="family-access-title" className="font-display text-xl text-foreground">
                {family ? 'Accès famille ouvert' : 'Accès famille'}
              </h2>
              <IconButton size="sm" aria-label="Fermer" onClick={() => setOpen(false)}>
                <X size={16} />
              </IconButton>
            </div>
            {family ? (
              <>
                <p className="text-base text-ink-2">
                  Cet appareil affiche aussi les personnes vivantes : noms, dates et lieux.
                  Sur un ordinateur partagé, fermez l'accès en partant.
                </p>
                <Button
                  variant="secondary"
                  loading={signOut.isPending}
                  onClick={() => signOut.mutate(undefined, { onSuccess: () => setOpen(false) })}
                >
                  <Lock size={14} aria-hidden="true" />
                  Fermer l'accès famille
                </Button>
              </>
            ) : (
              <>
                <p className="text-base text-ink-2">
                  Les personnes vivantes sont masquées pour les visiteurs. Entrez le mot de
                  passe de la famille pour les voir.
                </p>
                <SignInForm autoFocus onDone={() => setOpen(false)} />
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}
