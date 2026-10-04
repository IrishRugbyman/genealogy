import { createFileRoute } from '@tanstack/react-router'
import {
  Camera,
  Check,
  FileText,
  ImageUp,
  Lock,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Field, Input, Label } from '@/components/ui/Field'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/depot')({
  component: DepotPage,
})

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
// Who the family should tell when an upload fails. Set at build time in
// `frontend/.env.local` (gitignored), so the public code names nobody.
const CONTACT: string = import.meta.env.VITE_DEPOT_CONTACT || "l'administrateur du site"

/* Mirrors api/app/routers/uploads.py. Duplicated deliberately: the browser
   check is there to fail fast on a 40 Mo scan before it goes up a domestic
   uplink, the server check is the one that counts. */
const ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.heic', '.heif',
  '.tif', '.tiff',
  '.pdf',
]
const MAX_FILES = 20
const MAX_FILE_BYTES = 40 * 1024 * 1024
const MAX_BATCH_BYTES = 250 * 1024 * 1024

/* The password is remembered so a sender types it once, ever, on their own machine.
   It gates a drop-off directory, not personal data - the tree behind it is
   public - so localStorage is the right trade here. */
const PASSWORD_KEY = 'genealogy.depot.password'

const ACCEPT = 'image/*,.heic,.heif,.tif,.tiff,application/pdf'

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

/** Browsers render these inline; a HEIC or a TIFF gets an icon instead. */
function isPreviewable(file: File): boolean {
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extensionOf(file.name))
}

function keyOf(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function messageFrom(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (status === 401) return 'Mot de passe incorrect.'
  if (status === 413) return "L'envoi est trop lourd."
  if (status === 429) return 'Trop de tentatives. Réessayez dans une heure.'
  return `Erreur ${status}. Réessayez, ou prévenez ${CONTACT}.`
}

async function postForm(path: string, form: FormData): Promise<unknown> {
  const res = await fetch(BASE_URL + path, { method: 'POST', body: form })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFrom(res.status, body))
  return body
}

interface UploadResult {
  batch: string
  files: number
  bytes: number
}

/* fetch() has no upload-progress event, and these are 20 Mo photos on a home
   connection: without a bar the page looks frozen for a minute. XHR is the only
   way to get one. */
function postBatch(
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE_URL}/api/uploads`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadResult)
      else reject(new Error(messageFrom(xhr.status, body)))
    }
    xhr.onerror = () => reject(new Error('Connexion interrompue. Réessayez.'))
    xhr.onabort = () => reject(new Error('Envoi annulé.'))
    xhr.send(form)
  })
}

// ---------------------------------------------------------------------------
// Password gate
// ---------------------------------------------------------------------------

function PasswordGate({ onUnlock }: { onUnlock: (password: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim() || checking) return
    setChecking(true)
    setError(null)
    const form = new FormData()
    form.append('password', value)
    try {
      await postForm('/api/uploads/auth', form)
      localStorage.setItem(PASSWORD_KEY, value)
      onUnlock(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec')
    } finally {
      setChecking(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex max-w-md flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-border bg-surface-2 text-ink-2">
          <Lock size={16} />
        </span>
        <div>
          <p className="font-display text-lg text-foreground">Page protégée</p>
          <p className="text-sm text-ink-2">Entrez le mot de passe pour déposer des images.</p>
        </div>
      </div>

      <Field label="Mot de passe" error={error ?? undefined}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="current-password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </Field>

      <Button type="submit" variant="primary" loading={checking} disabled={!value.trim()}>
        Entrer
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// The drop zone
// ---------------------------------------------------------------------------

function Thumbnail({ file }: { file: File }) {
  const url = useMemo(() => (isPreviewable(file) ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  if (!url) {
    return (
      <span className="flex h-full w-full items-center justify-center text-ink-3">
        <FileText size={18} />
      </span>
    )
  }
  return <img src={url} alt="" className="h-full w-full object-cover" />
}

function DepotForm({ password, onLocked }: { password: string; onLocked: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [sender, setSender] = useState('')
  const [note, setNote] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [sent, setSent] = useState<UploadResult | null>(null)

  const pickRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const busy = progress !== null

  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return
    const candidates = Array.from(incoming)
    if (candidates.length === 0) return

    setError(null)
    setFiles((current) => {
      const seen = new Set(current.map(keyOf))
      const next = [...current]
      const rejected: string[] = []

      for (const file of candidates) {
        if (seen.has(keyOf(file))) continue
        if (!ALLOWED_EXT.includes(extensionOf(file.name))) {
          rejected.push(`${file.name} : format non accepté`)
          continue
        }
        if (file.size > MAX_FILE_BYTES) {
          rejected.push(`${file.name} : ${formatBytes(file.size)}, la limite est 40 Mo`)
          continue
        }
        if (next.length >= MAX_FILES) {
          rejected.push(`${file.name} : ${MAX_FILES} fichiers au maximum par envoi`)
          continue
        }
        seen.add(keyOf(file))
        next.push(file)
      }

      if (rejected.length > 0) setError(rejected.join(' · '))
      return next
    })
  }, [])

  // Coller une capture d'écran marche aussi: Ctrl+V depuis n'importe où sur la page.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (pasted.length > 0) addFiles(pasted)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  /* dragenter/dragleave fire for every child element the pointer crosses, so a
     boolean flag flickers. Counting the enters and leaves is what keeps the
     zone lit for the whole drag. */
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (!busy) addFiles(e.dataTransfer.files)
  }

  function removeAt(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  async function send() {
    if (files.length === 0 || busy) return
    if (totalBytes > MAX_BATCH_BYTES) {
      setError(
        `Envoi de ${formatBytes(totalBytes)} : la limite est 250 Mo. Envoyez-les en deux fois.`,
      )
      return
    }

    setError(null)
    setProgress(0)
    const form = new FormData()
    form.append('password', password)
    form.append('sender', sender)
    form.append('note', note)
    for (const file of files) form.append('files', file, file.name)

    try {
      const result = await postBatch(form, setProgress)
      setSent(result)
      setFiles([])
      setNote('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de l’envoi'
      setError(message)
      if (message.startsWith('Mot de passe')) {
        localStorage.removeItem(PASSWORD_KEY)
        onLocked()
      }
    } finally {
      setProgress(null)
    }
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-primary">
          <Check size={20} />
        </span>
        <div>
          <p className="font-display text-xl text-foreground">
            {sent.files === 1 ? 'Image reçue' : `${sent.files} images reçues`}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {formatBytes(sent.bytes)} enregistrés. Merci, je les classe et je reviens vers vous.
          </p>
          <p className="mt-3 font-mono text-xs text-ink-3">{sent.batch}</p>
        </div>
        <Button onClick={() => setSent(null)}>
          <RotateCcw size={14} />
          Envoyer autre chose
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorBanner message={error} />}

      <div
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-dashed px-6 py-12 text-center',
          'transition-colors duration-150 ease-[var(--ease-out-expo)]',
          dragging ? 'border-primary bg-surface-2' : 'border-border',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          <ImageUp size={20} />
        </span>
        <div className="max-w-[46ch]">
          <p className="font-display text-lg text-foreground">
            Glissez vos photos et scans ici
          </p>
          <p className="mt-1 text-sm text-ink-2">
            Ou utilisez les boutons. JPEG, PNG, HEIC, TIFF et PDF, jusqu’à 40 Mo par fichier
            et {MAX_FILES} fichiers par envoi.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" onClick={() => pickRef.current?.click()}>
            <Upload size={14} />
            Choisir des fichiers
          </Button>
          {/* Sur téléphone ceci ouvre l'appareil photo; sur ordinateur, le
              sélecteur de fichiers, ce qui est inutile mais inoffensif. */}
          <Button onClick={() => cameraRef.current?.click()} className="sm:hidden">
            <Camera size={14} />
            Prendre une photo
          </Button>
        </div>

        <input
          ref={pickRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <Section
          title="À envoyer"
          count={`${files.length} · ${formatBytes(totalBytes)}`}
          actions={
            !busy && (
              <Button size="sm" variant="ghost" onClick={() => setFiles([])}>
                Tout retirer
              </Button>
            )
          }
        >
          <ul className="flex flex-col divide-y divide-border">
            {files.map((file, index) => (
              <li key={keyOf(file)} className="flex items-center gap-3 py-2.5">
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-2">
                  <Thumbnail file={file} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{file.name}</span>
                  <span className="block text-xs tabular-nums text-ink-3">
                    {formatBytes(file.size)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Retirer ${file.name}`}
                  disabled={busy}
                  onClick={() => removeAt(index)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Ce que vous en savez">
        <div className="flex flex-col gap-4">
          <Field
            label="Votre nom"
            helper="Pour savoir de qui vient le document."
            className="sm:max-w-xs"
          >
            {(props) => (
              <Input
                {...props}
                value={sender}
                maxLength={120}
                disabled={busy}
                onChange={(e) => setSender(e.target.value)}
                placeholder="Votre prénom"
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="depot-note">Message</Label>
            <textarea
              id="depot-note"
              value={note}
              maxLength={4000}
              rows={5}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="De qui, de quand, d'où ça vient, ce que vous arrivez à lire, ce dont vous n'êtes pas sûr. Même approximatif, c'est ce qui permet de classer l'image."
              className={cn(
                'w-full rounded-[var(--radius)] border border-border bg-card px-2.5 py-2 text-sm text-foreground',
                'placeholder:text-ink-3 transition-[border-color] duration-150',
                'hover:border-[var(--rule-strong)] focus:border-primary focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-55',
              )}
            />
            <p className="text-xs text-ink-3">
              Facultatif, mais une photo sans contexte est presque inexploitable.
            </p>
          </div>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          loading={busy}
          disabled={files.length === 0}
          onClick={send}
        >
          <Upload size={14} />
          {files.length <= 1 ? 'Envoyer' : `Envoyer les ${files.length} fichiers`}
        </Button>
        {busy && (
          <span className="flex min-w-[180px] flex-1 items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
              />
            </span>
            <span className="text-xs tabular-nums text-ink-3">
              {Math.round((progress ?? 0) * 100)} %
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function DepotPage() {
  const [password, setPassword] = useState<string | null>(null)

  useEffect(() => {
    setPassword(localStorage.getItem(PASSWORD_KEY))
  }, [])

  useEffect(() => {
    document.title = 'Dépôt · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  return (
    <PageContainer>
      <PageHeader
        title="Dépôt d'images"
        subtitle="Actes, photos de famille, pages de registre : déposez-les ici plutôt que par mail. Ils arrivent directement dans le dossier des sources."
        actions={
          password && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                localStorage.removeItem(PASSWORD_KEY)
                setPassword(null)
              }}
            >
              <Lock size={14} />
              Verrouiller
            </Button>
          )
        }
      />
      {password ? (
        <DepotForm password={password} onLocked={() => setPassword(null)} />
      ) : (
        <PasswordGate onUnlock={setPassword} />
      )}
    </PageContainer>
  )
}
