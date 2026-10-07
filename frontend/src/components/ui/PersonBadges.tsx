import { Badge } from './Badge'
import { useBranchLabels, useTree } from '@/lib/api'
import { personName } from '@/lib/utils'

interface PersonBadgesProps {
  sosa?: number | null
  branch?: number | null
  isDirectLine?: boolean
}

/* Order is fixed: Sosa, then branch, then the direct-line mark. A stable order
   means the eye can skip to the same slot on every card instead of re-reading
   the row. */

export function PersonBadges({ sosa, branch, isDirectLine }: PersonBadgesProps) {
  const root = useTree().data?.sosa_root
  const branchLabel = useBranchLabels()
  const of = root && !root.living ? ` de ${personName(root.given_name, root.surname)}` : ''
  return (
    <>
      {/* Labelled rather than a bare figure: "4" on its own says nothing, and
          the Sosa number is the one figure on a person card that a reader
          cannot infer from context. */}
      {sosa != null && (
        <Badge title={`Ancêtre Sosa n° ${sosa}${of}`}>
          Sosa <span className="font-mono tabular-nums">{sosa}</span>
        </Badge>
      )}
      {branch != null && branchLabel[branch] && (
        <Badge tone={`branch-${branch}` as 'branch-1' | 'branch-2' | 'branch-3'}>
          {branchLabel[branch]}
        </Badge>
      )}
      {isDirectLine && (
        <Badge tone="accent" title="Ancêtre en ligne directe">
          Directe
        </Badge>
      )}
    </>
  )
}
