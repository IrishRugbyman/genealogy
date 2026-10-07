import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { CoverageBar, MarkTip, RankedBar, SERIES } from '@/components/chart/Chart'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton, StatCardSkeleton } from '@/components/ui/Skeleton'
import { usePedigree, useStats, useTree, type PedigreeGeneration } from '@/lib/api'
import { cn, personName } from '@/lib/utils'

export const Route = createFileRoute('/stats')({
  component: StatsPage,
})

// Country ISO -> French name
const COUNTRY_LABELS: Record<string, string> = {
  FR: 'France',
  NL: 'Pays-Bas',
  BE: 'Belgique',
  IT: 'Italie',
  DE: 'Allemagne',
  GB: 'Royaume-Uni',
  ES: 'Espagne',
  CH: 'Suisse',
  PT: 'Portugal',
  TR: 'Turquie',
  TN: 'Tunisie',
  IL: 'Israël',
  MA: 'Maroc',
  DZ: 'Algérie',
  GR: 'Grèce',
  RO: 'Roumanie',
  AT: 'Autriche',
  PL: 'Pologne',
  HR: 'Croatie',
  BA: 'Bosnie',
  RS: 'Serbie',
  HU: 'Hongrie',
  CZ: 'République tchèque',
  SK: 'Slovaquie',
  RU: 'Russie',
  UA: 'Ukraine',
  US: 'États-Unis',
  CA: 'Canada',
  EG: 'Égypte',
  SY: 'Syrie',
  LB: 'Liban',
  JO: 'Jordanie',
  IQ: 'Irak',
  IR: 'Iran',
  SA: 'Arabie Saoudite',
}

const CATEGORY_LABEL: Record<string, string> = {
  agriculture:    'Agriculture',
  textile:        'Textile',
  artisanat:      'Artisanat',
  journalier:     'Journalier',
  maritime:       'Maritime',
  commerce:       'Commerce',
  administration: 'Administration',
  droit:          'Droit',
  médecine:       'Médecine',
  mines:          'Mines',
  religion:       'Religion',
  enseignement:   'Enseignement',
  'arts-lettres': 'Arts et lettres',
  militaire:      'Militaire',
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR')
}

const CHART_H = 150

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function RecordTile({
  label, value, name, detail, to, params,
}: {
  label: string
  value: string
  name: string | null | undefined
  detail?: string
  to: string
  params: Record<string, string>
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className={cn(
        'flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3.5',
        'transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)]',
        'hover:border-[var(--rule-strong)] hover:shadow-[var(--shadow-sm)] active:translate-y-px',
      )}
    >
      <span className="text-xs text-ink-3">{label}</span>
      <span className="font-display text-xl font-medium leading-tight text-foreground">{value}</span>
      {name && <span className="truncate text-sm text-ink-2">{name}</span>}
      {detail && <span className="font-mono text-xs tabular-nums text-ink-3">{detail}</span>}
    </Link>
  )
}

/** Single-series column chart. The title names the series, so no legend. */
function CenturyChart({ data }: { data: Array<{ century: number | null; n: number }> }) {
  const filtered = useMemo(
    () =>
      data
        .filter((d) => d.century != null && d.century >= 1000)
        .sort((a, b) => a.century! - b.century!),
    [data],
  )
  if (filtered.length === 0) return null
  const max = Math.max(...filtered.map((d) => d.n))

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: CHART_H }}>
        {filtered.map((d) => {
          const century = d.century!
          const barH = Math.max(2, Math.round((d.n / max) * CHART_H))
          return (
            <Link
              key={century}
              to="/"
              search={{ year_from: century, year_to: century + 99 }}
              aria-label={`${fmt(d.n)} naissances au ${century}e siècle. Voir ces personnes.`}
              className="group relative min-w-0 flex-1 rounded-t-[3px] transition-opacity hover:opacity-80"
              style={{ height: barH, background: SERIES }}
            >
              <MarkTip>
                {century}s : {fmt(d.n)}
              </MarkTip>
            </Link>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1 border-t border-border pt-1.5">
        {filtered.map((d) => (
          <div key={d.century} className="min-w-0 flex-1 text-center font-mono text-[0.75rem] tabular-nums text-ink-3">
            {String(d.century).slice(0, 2)}
          </div>
        ))}
      </div>
    </div>
  )
}

function LifespanChart({ data }: { data: Array<{ bucket: number; n: number }> }) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.n))
  const labels: Record<number, string> = {
    0: '0-9', 10: '10-19', 20: '20-29', 30: '30-39', 40: '40-49', 50: '50-59',
    60: '60-69', 70: '70-79', 80: '80-89', 90: '90-99', 100: '100 et plus',
  }
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: CHART_H }}>
        {data.map((d) => {
          const barH = Math.max(2, Math.round((d.n / max) * CHART_H))
          return (
            <div
              key={d.bucket}
              tabIndex={0}
              role="img"
              aria-label={`${labels[d.bucket] ?? d.bucket} ans : ${fmt(d.n)} personnes`}
              className="group relative min-w-0 flex-1 rounded-t-[3px] transition-opacity hover:opacity-80"
              style={{ height: barH, background: SERIES }}
            >
              <MarkTip>
                {labels[d.bucket] ?? `${d.bucket}s`} : {fmt(d.n)}
              </MarkTip>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1 border-t border-border pt-1.5">
        {data.map((d) => (
          <div key={d.bucket} className="min-w-0 flex-1 text-center font-mono text-[0.75rem] tabular-nums text-ink-3">
            {d.bucket}
          </div>
        ))}
      </div>
    </div>
  )
}

/* The source data carries fourteen profession categories. Fourteen hues cannot
   be told apart, by anyone - the previous version cycled through the Tailwind
   palette and produced four greens and three blues. The chart now shows the
   four largest categories and folds the rest into "Autres", which is five
   series: exactly the width of the validated scale. The fold is stated in the
   caption rather than left silent. */
const STACK_SLOTS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
const TOP_CATEGORIES = 4
const OTHER = '__autres__'

function ProfessionsByCenturyChart({ data }: { data: Array<{ century: number; [cat: string]: number }> }) {
  const { series, rows, maxTotal, foldedCount } = useMemo(() => {
    const cats = Array.from(new Set(data.flatMap((d) => Object.keys(d).filter((k) => k !== 'century'))))
    const totalPerCat = new Map(cats.map((c) => [c, data.reduce((s, d) => s + (d[c] ?? 0), 0)]))
    const ranked = [...cats].sort((a, b) => (totalPerCat.get(b) ?? 0) - (totalPerCat.get(a) ?? 0))
    const kept = ranked.slice(0, TOP_CATEGORIES)
    const folded = ranked.slice(TOP_CATEGORIES)

    const series = [...kept, ...(folded.length ? [OTHER] : [])]
    const rows = data.map((d) => {
      const row: Record<string, number> = {}
      for (const c of kept) row[c] = d[c] ?? 0
      if (folded.length) row[OTHER] = folded.reduce((s, c) => s + (d[c] ?? 0), 0)
      return { century: d.century, row, total: series.reduce((s, c) => s + (row[c] ?? 0), 0) }
    })
    return {
      series,
      rows,
      maxTotal: Math.max(...rows.map((r) => r.total), 1),
      foldedCount: folded.length,
    }
  }, [data])

  const label = (c: string) => (c === OTHER ? 'Autres' : (CATEGORY_LABEL[c] ?? c))

  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-3" style={{ height: CHART_H }}>
        {rows.map(({ century, row, total }) => {
          const barH = Math.max(4, Math.round((total / maxTotal) * CHART_H))
          return (
            <div
              key={century}
              tabIndex={0}
              role="img"
              aria-label={`${century}e siècle, ${fmt(total)} mentions : ${series
                .filter((c) => row[c] > 0)
                .map((c) => `${label(c)} ${row[c]}`)
                .join(', ')}`}
              className="group relative min-w-0 flex-1"
            >
              <MarkTip>
                {century}s : {fmt(total)} mentions
              </MarkTip>
              {/* Segments stack bottom-up with a 2px surface gap between them. */}
              <div className="flex flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: barH }}>
                {series.map((cat, i) => {
                  const n = row[cat] ?? 0
                  if (n === 0) return null
                  return (
                    <div
                      key={cat}
                      style={{
                        height: `${(n / total) * 100}%`,
                        background: STACK_SLOTS[i],
                        borderBottom: '2px solid var(--paper)',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-1.5 flex gap-2 border-t border-border pt-1.5 sm:gap-3">
        {rows.map((r) => (
          <div key={r.century} className="min-w-0 flex-1 text-center font-mono text-[0.75rem] tabular-nums text-ink-3">
            {r.century}
          </div>
        ))}
      </div>

      {/* Five series, so a legend is required. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((cat, i) => (
          <span key={cat} className="flex items-center gap-1.5 text-xs text-ink-2">
            <span
              aria-hidden="true"
              style={{ background: STACK_SLOTS[i] }}
              className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
            />
            {label(cat)}
          </span>
        ))}
      </div>

      {foldedCount > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          « Autres » regroupe les {foldedCount} catégories de métiers restantes.
        </p>
      )}
    </div>
  )
}

function PedigreeChart({ data, rootName }: { data: PedigreeGeneration[]; rootName: string }) {
  const visible = data.filter((d) => d.generation <= 30)
  return (
    <div className="space-y-1.5">
      {visible.map((d) => {
        const p = d.potential === 0 ? 0 : Math.round((d.known / d.potential) * 100)
        return (
          <div
            key={d.generation}
            className="group flex items-center gap-2.5"
            title={`Génération ${d.generation} : ${fmt(d.known)} ancêtres connus sur ${fmt(d.potential)} possibles`}
          >
            <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-ink-3">
              {d.generation}
            </span>
            <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-surface-2">
              <span className="block h-full rounded-[3px]" style={{ width: `${p}%`, background: SERIES }} />
            </span>
            <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-ink-3">
              {fmt(d.known)}/{fmt(d.potential)}
            </span>
            <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-ink-2">{p} %</span>
          </div>
        )
      })}
      <p className="pt-2 text-xs text-ink-3">
        Génération 1 = les parents de {rootName} (Sosa 1). Le rapport compare les ancêtres
        connus au nombre théoriquement possible à cette génération.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function StatsPage() {
  const { data: stats, isLoading, isError, refetch } = useStats()
  const { data: pedigree } = usePedigree()
  const sosaRoot = useTree().data?.sosa_root

  useEffect(() => {
    document.title = 'Statistiques · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Statistiques" />
        <ErrorBanner
          message="Impossible de charger les statistiques."
          onRetry={() => void refetch()}
        />
      </PageContainer>
    )
  }

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Statistiques" />
        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid gap-10 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      </PageContainer>
    )
  }

  if (!stats) return null

  const total = stats.total_individuals
  const topSurnames = stats.top_surnames.filter((s) => s.surname !== 'N').slice(0, 12)
  const maxSurnameN = topSurnames[0]?.n ?? 1
  const topGivenNames = stats.top_given_names.slice(0, 12)
  const maxGivenN = topGivenNames[0]?.n ?? 1
  const totalByCountry = stats.by_birth_country.reduce((acc, c) => acc + c.n, 0)
  const topCountries = stats.by_birth_country.slice(0, 10)
  const maxCountryN = topCountries[0]?.n ?? 1

  return (
    <PageContainer>
      <PageHeader
        title="Statistiques"
        subtitle="Ce que contient l'arbre, et ce qui y manque encore."
      />

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={fmt(stats.total_individuals)} label="Personnes" />
        <StatCard value={fmt(stats.total_families)} label="Familles" />
        <StatCard value={fmt(stats.total_places)} label="Lieux" />
        <StatCard
          value={fmt(stats.geocoded_places)}
          label="Lieux géocodés"
          hint={`sur ${fmt(stats.total_places)}`}
        />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Naissances par siècle">
          <CenturyChart data={stats.by_birth_century} />
          <p className="mt-3 text-xs text-ink-3">
            Cliquez une colonne pour ouvrir la recherche filtrée sur ce siècle.
          </p>
        </Section>

        <Section title="Âge au décès">
          <LifespanChart data={stats.lifespan_distribution} />
          <p className="mt-3 text-xs text-ink-3">
            Décès survenus entre 1600 et 2000, par tranche de dix ans.
          </p>
        </Section>

        {stats.professions_by_century.length > 0 && (
          <Section title="Métiers par siècle" className="lg:col-span-2">
            <ProfessionsByCenturyChart data={stats.professions_by_century} />
          </Section>
        )}

        <Section title="Couverture des données">
          <div className="space-y-3.5">
            <CoverageBar label="Année de naissance" n={stats.coverage.with_birth_year} total={total} />
            <CoverageBar label="Année de décès" n={stats.coverage.with_death_year} total={total} />
            <CoverageBar label="Lieu de naissance" n={stats.coverage.with_birth_place} total={total} />
            <CoverageBar label="Lieu de décès" n={stats.coverage.with_death_place} total={total} />
          </div>

          <div className="mt-5 space-y-3.5 border-t border-border pt-4">
            <p className="text-sm font-medium text-ink-2">Sur les familles</p>
            <CoverageBar
              label="Date de mariage"
              n={stats.marriage_coverage.with_marriage_year}
              total={stats.marriage_coverage.total_families}
            />
            <CoverageBar
              label="Lieu de mariage"
              n={stats.marriage_coverage.with_marriage_place}
              total={stats.marriage_coverage.total_families}
            />
          </div>

          <dl className="mt-5 space-y-1.5 border-t border-border pt-4 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Naissance la plus ancienne</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {stats.coverage.earliest_birth != null
                  ? stats.coverage.earliest_birth < 0
                    ? `${Math.abs(stats.coverage.earliest_birth)} av. J.-C.`
                    : String(stats.coverage.earliest_birth)
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Naissance la plus récente</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {stats.coverage.latest_birth ?? '—'}
              </dd>
            </div>
            {Object.entries(stats.by_sex).map(([sex, n]) => (
              <div key={sex} className="flex justify-between gap-3">
                <dt className="text-ink-2">
                  {sex === 'M' ? 'Hommes' : sex === 'F' ? 'Femmes' : 'Sexe inconnu'}
                </dt>
                <dd className="font-mono tabular-nums text-foreground">{fmt(n as number)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Noms les plus portés">
          <div className="space-y-2">
            {topSurnames.map((s) => (
              <RankedBar
                key={s.surname}
                label={s.surname}
                value={s.n}
                max={maxSurnameN}
                href={
                  <Link
                    to="/"
                    search={{ name: s.surname }}
                    className="underline-offset-2 hover:text-primary hover:underline"
                  >
                    {s.surname}
                  </Link>
                }
              />
            ))}
          </div>
        </Section>

        <Section title="Prénoms les plus donnés">
          <div className="space-y-2">
            {topGivenNames.map((g) => (
              <RankedBar
                key={g.given_name}
                label={g.given_name}
                value={g.n}
                max={maxGivenN}
                href={
                  <Link
                    to="/"
                    search={{ name: g.given_name }}
                    className="underline-offset-2 hover:text-primary hover:underline"
                  >
                    {g.given_name}
                  </Link>
                }
              />
            ))}
          </div>
        </Section>

        <Section title="Naissances par pays">
          <div className="space-y-2">
            {topCountries.map((c) => (
              <RankedBar
                key={c.country_iso}
                label={COUNTRY_LABELS[c.country_iso] ?? c.country_iso}
                value={c.n}
                max={maxCountryN}
                labelWidth="w-28"
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">
            {fmt(totalByCountry)} personnes avec un pays connu, sur {fmt(total)}.
          </p>
        </Section>

        {stats.records && (
          <Section title="Curiosités" className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.records.oldest && (
                <RecordTile
                  label="Doyen"
                  value={`${stats.records.oldest.age} ans`}
                  name={stats.records.oldest.name}
                  detail={`${stats.records.oldest.birth_year} - ${stats.records.oldest.death_year}`}
                  to="/people/$id"
                  params={{ id: stats.records.oldest.id }}
                />
              )}
              {stats.records.most_children && (
                <RecordTile
                  label="Le plus d'enfants"
                  value={`${stats.records.most_children.child_count} enfants`}
                  name={stats.records.most_children.name}
                  detail={stats.records.most_children.birth_year ? String(stats.records.most_children.birth_year) : undefined}
                  to="/people/$id"
                  params={{ id: stats.records.most_children.id }}
                />
              )}
              {stats.records.largest_family && (() => {
                const f = stats.records.largest_family
                return (
                  <RecordTile
                    label="Plus grande fratrie"
                    value={`${f.child_count} enfants`}
                    name={[f.husband_name, f.wife_name].filter(Boolean).join(' et ')}
                    detail={f.marriage_year ? String(f.marriage_year) : undefined}
                    to="/families/$id"
                    params={{ id: f.id }}
                  />
                )
              })()}
              {stats.records.earliest && (
                <RecordTile
                  label="Ancêtre le plus ancien"
                  value={`${stats.records.earliest.birth_qualifier === 'ABT' ? 'v. ' : ''}${stats.records.earliest.birth_year}`}
                  name={stats.records.earliest.name}
                  to="/people/$id"
                  params={{ id: stats.records.earliest.id }}
                />
              )}
              {stats.records.most_sourced && (
                <RecordTile
                  label="Le mieux sourcé"
                  value={`${stats.records.most_sourced.source_count} source${stats.records.most_sourced.source_count > 1 ? 's' : ''}`}
                  name={stats.records.most_sourced.name}
                  detail={stats.records.most_sourced.birth_year ? String(stats.records.most_sourced.birth_year) : undefined}
                  to="/people/$id"
                  params={{ id: stats.records.most_sourced.id }}
                />
              )}
            </div>
          </Section>
        )}

        {pedigree && pedigree.length > 0 && (
          <Section title="Effondrement de pedigree" className="lg:col-span-2">
            <PedigreeChart
              data={pedigree}
              rootName={sosaRoot ? personName(sosaRoot.given_name, sosaRoot.surname) : 'la personne racine'}
            />
          </Section>
        )}
      </div>
    </PageContainer>
  )
}
