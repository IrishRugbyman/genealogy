import { useEffect, useRef, useCallback } from 'react'
import { tree as d3tree } from 'd3-hierarchy'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { select } from 'd3-selection'
import { linkVertical } from 'd3-shape'
import { Crosshair, Minus, Plus } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { TreeNode, nodeSize } from './TreeNode'
import { useTextScale } from '@/lib/textSize'
import {
  buildHierarchies,
  expandUp,
  collapseUp,
  expandDown,
  collapseDown,
  type TreeState,
  type TreePerson,
} from '@/lib/tree'

const GAP_X = 24
const GAP_Y = 48
/* Fitting the tree to the screen never shrinks it below this: past it the names
   stop being readable, and a reader would rather pan than squint. */
const MIN_FIT_SCALE = 0.85
const FIT_PADDING = 32

interface Props {
  state: TreeState
  cache: Map<string, TreePerson>
  loadingIds: Set<string>
  onStateChange: (s: TreeState) => void
  /** Changes when the tree should be re-framed to fit the screen. */
  fitToken: number
}

export function FamilyTree({ state, cache, loadingIds, onStateChange, fitToken }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const textScale = useTextScale()

  // Set up zoom once, apply initial centering (focus node is always at SVG origin)
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 2])
      .on('zoom', (event) => {
        select(gRef.current!).attr('transform', event.transform.toString())
      })
    const { width, height } = svgRef.current.getBoundingClientRect()
    const initialTransform = zoomIdentity.translate(width / 2, height / 2)
    const sel = select(svgRef.current)
    sel.call(z).call(z.transform, initialTransform)
    sel.on('dblclick.zoom', null)
    zoomRef.current = z
  }, [])

  // The drawn extent, kept from the last render, so framing can read it.
  const boundsRef = useRef({ minX: 0, maxX: 0, minY: 0, maxY: 0 })

  /* Frame the whole tree when it fits at a readable scale. When it does not,
     keep the readable scale and centre on the focus person along the axis that
     overflows: the reader starts from the person they asked for and pans. */
  const fit = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    const { width, height } = svgRef.current.getBoundingClientRect()
    const b = boundsRef.current
    const w = b.maxX - b.minX + 2 * FIT_PADDING
    const h = b.maxY - b.minY + 2 * FIT_PADDING
    const k = Math.max(MIN_FIT_SCALE, Math.min(1, width / w, height / h))
    const cx = w * k <= width ? (b.minX + b.maxX) / 2 : 0
    const cy = h * k <= height ? (b.minY + b.maxY) / 2 : 0
    zoomRef.current.transform(
      select(svgRef.current),
      zoomIdentity.translate(width / 2 - cx * k, height / 2 - cy * k).scale(k),
    )
  }, [])

  useEffect(() => {
    fit()
  }, [fitToken, fit])

  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return
    zoomRef.current.scaleBy(select(svgRef.current), factor)
  }, [])

  // Build layout
  const { anc, desc } = buildHierarchies(state, cache)

  const { w: NODE_W, h: NODE_H } = nodeSize(textScale)
  // d3's default doubles the gap between cousins; in a pedigree every row is
  // cousins, so that only spreads the tree past the screen for nothing.
  const treeLayout = d3tree<{ id: string }>()
    .nodeSize([NODE_W + GAP_X, NODE_H + GAP_Y])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.1))

  treeLayout(anc as any)
  treeLayout(desc as any)

  // Collect all nodes with positions
  interface LayoutNode {
    id: string
    x: number
    y: number
    isAnc: boolean
  }

  const nodes: LayoutNode[] = []
  const links: Array<{ sx: number; sy: number; tx: number; ty: number }> = []

  // Ancestors: y goes upward (negate)
  anc.each((n: any) => {
    if (n.depth === 0) {
      nodes.push({ id: n.data.id, x: n.x, y: 0, isAnc: true })
    } else {
      nodes.push({ id: n.data.id, x: n.x, y: -n.y, isAnc: true })
    }
  })
  anc.links().forEach((l: any) => {
    links.push({ sx: l.source.x, sy: l.source.depth === 0 ? 0 : -l.source.y, tx: l.target.x, ty: -l.target.y })
  })

  // Descendants: y goes downward (exclude root to avoid duplicate focus node)
  desc.each((n: any) => {
    if (n.depth === 0) return
    nodes.push({ id: n.data.id, x: n.x, y: n.y, isAnc: false })
  })
  desc.links().forEach((l: any) => {
    if (l.source.depth === 0) {
      links.push({ sx: l.source.x, sy: 0, tx: l.target.x, ty: l.target.y })
    } else {
      links.push({ sx: l.source.x, sy: l.source.y, tx: l.target.x, ty: l.target.y })
    }
  })

  boundsRef.current = nodes.reduce(
    (b, n) => ({
      minX: Math.min(b.minX, n.x - NODE_W / 2),
      maxX: Math.max(b.maxX, n.x + NODE_W / 2),
      minY: Math.min(b.minY, n.y - NODE_H / 2),
      maxY: Math.max(b.maxY, n.y + NODE_H / 2),
    }),
    { minX: -NODE_W / 2, maxX: NODE_W / 2, minY: -NODE_H / 2, maxY: NODE_H / 2 },
  )

  const linkPath = linkVertical<unknown, { x: number; y: number }>()
    .x((d) => d.x)
    .y((d) => d.y)

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
      <svg ref={svgRef} className="h-full w-full">
        <g ref={gRef}>
          {/* Links */}
          {links.map((l, i) => (
            <path
              key={i}
              d={linkPath({ source: { x: l.sx, y: l.sy }, target: { x: l.tx, y: l.ty } }) ?? ''}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth={1.5}
            />
          ))}

          {/* Nodes via foreignObject */}
          {nodes.map((n) => {
            const person = cache.get(n.id)
            const loading = loadingIds.has(n.id)
            const isFocus = n.id === state.focusId

            const hasFather = !!(person?.father_id)
            const hasMother = !!(person?.mother_id)
            const hasParents = hasFather || hasMother
            const hasChildren = !!(person?.child_ids.length)

            return (
              <foreignObject
                key={n.id}
                x={n.x - NODE_W / 2}
                y={n.y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                style={{ overflow: 'visible' }}
              >
                <TreeNode
                  width={NODE_W}
                  height={NODE_H}
                  person={person}
                  isLoading={loading}
                  isFocus={isFocus}
                  showSpouses={isFocus || !n.isAnc}
                  canExpandUp={hasParents}
                  isExpandedUp={state.expandedUp.has(n.id)}
                  onExpandUp={() => onStateChange(expandUp(state, n.id))}
                  onCollapseUp={() => onStateChange(collapseUp(state, n.id, cache))}
                  canExpandDown={hasChildren}
                  isExpandedDown={state.expandedDown.has(n.id)}
                  onExpandDown={() => onStateChange(expandDown(state, n.id))}
                  onCollapseDown={() => onStateChange(collapseDown(state, n.id, cache))}
                />
              </foreignObject>
            )
          })}
        </g>
      </svg>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] p-1 shadow-[var(--shadow-lg)] backdrop-blur-sm">
        <IconButton aria-label="Zoom avant" title="Zoom avant" onClick={() => zoomBy(1.3)}>
          <Plus size={15} />
        </IconButton>
        <IconButton aria-label="Zoom arrière" title="Zoom arrière" onClick={() => zoomBy(1 / 1.3)}>
          <Minus size={15} />
        </IconButton>
        <IconButton aria-label="Ajuster l'arbre à l'écran" title="Ajuster à l'écran" onClick={fit}>
          <Crosshair size={15} />
        </IconButton>
      </div>

    </div>
  )
}
