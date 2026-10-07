import { hierarchy } from 'd3-hierarchy'
import type { TreePerson } from './api'

export type { TreePerson }

export interface TreeState {
  focusId: string
  expandedUp: Set<string>
  expandedDown: Set<string>
}

/** Fold fetched records into the cache, newest wins. */
export function mergePeople(
  cache: Map<string, TreePerson>,
  people: TreePerson[],
): Map<string, TreePerson> {
  const next = new Map(cache)
  for (const p of people) next.set(p.id, p)
  return next
}

/** The tree opened `up` generations above `focusId` and `down` below: every
    person nearer than that is expanded, so the farthest row shows and offers
    its own "+ parents" / "+ enfants". */
export function stateForDepth(
  focusId: string,
  up: number,
  down: number,
  cache: Map<string, TreePerson>,
): TreeState {
  const expandedUp = new Set<string>()
  const expandedDown = new Set<string>()
  let row = [focusId]
  for (let d = 0; d < up && row.length; d++) {
    const next: string[] = []
    for (const id of row) {
      if (expandedUp.has(id)) continue
      expandedUp.add(id)
      const p = cache.get(id)
      if (p?.father_id) next.push(p.father_id)
      if (p?.mother_id) next.push(p.mother_id)
    }
    row = next
  }
  row = [focusId]
  for (let d = 0; d < down && row.length; d++) {
    const next: string[] = []
    for (const id of row) {
      if (expandedDown.has(id)) continue
      expandedDown.add(id)
      next.push(...(cache.get(id)?.child_ids ?? []))
    }
    row = next
  }
  return { focusId, expandedUp, expandedDown }
}

// ---------------------------------------------------------------------------
// Hierarchy builders
// ---------------------------------------------------------------------------

interface AncNode {
  id: string
  father: AncNode | null
  mother: AncNode | null
}

interface DescNode {
  id: string
  children: DescNode[]
}

function buildAncNode(
  id: string,
  expandedUp: Set<string>,
  cache: Map<string, TreePerson>,
  visited: Set<string>,
): AncNode {
  const node: AncNode = { id, father: null, mother: null }
  if (!expandedUp.has(id)) return node
  const p = cache.get(id)
  if (!p) return node

  if (p.father_id && !visited.has(p.father_id)) {
    visited.add(p.father_id)
    node.father = buildAncNode(p.father_id, expandedUp, cache, visited)
  }
  if (p.mother_id && !visited.has(p.mother_id)) {
    visited.add(p.mother_id)
    node.mother = buildAncNode(p.mother_id, expandedUp, cache, visited)
  }
  return node
}

function buildDescNode(
  id: string,
  expandedDown: Set<string>,
  cache: Map<string, TreePerson>,
  visited: Set<string>,
): DescNode {
  const node: DescNode = { id, children: [] }
  if (!expandedDown.has(id)) return node
  const p = cache.get(id)
  if (!p) return node

  for (const cid of p.child_ids) {
    if (!visited.has(cid)) {
      visited.add(cid)
      node.children.push(buildDescNode(cid, expandedDown, cache, visited))
    }
  }
  return node
}

export type AncestorHierarchy = ReturnType<typeof hierarchy<AncNode>>
export type DescendantHierarchy = ReturnType<typeof hierarchy<DescNode>>

export function buildHierarchies(
  state: TreeState,
  cache: Map<string, TreePerson>,
): { anc: AncestorHierarchy; desc: DescendantHierarchy } {
  const ancRoot = buildAncNode(state.focusId, state.expandedUp, cache, new Set([state.focusId]))
  const descRoot = buildDescNode(state.focusId, state.expandedDown, cache, new Set([state.focusId]))

  const anc = hierarchy(ancRoot, (n) => {
    const children: AncNode[] = []
    if (n.father) children.push(n.father)
    if (n.mother) children.push(n.mother)
    return children.length ? children : null
  })

  const desc = hierarchy(descRoot, (n) => n.children.length ? n.children : null)

  return { anc, desc }
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export function expandUp(state: TreeState, id: string): TreeState {
  const next = new Set(state.expandedUp)
  next.add(id)
  return { ...state, expandedUp: next }
}

export function collapseUp(state: TreeState, id: string, cache: Map<string, TreePerson>): TreeState {
  // Remove id and all ancestors reachable only through id
  const next = new Set(state.expandedUp)
  function pruneUp(pid: string) {
    next.delete(pid)
    const p = cache.get(pid)
    if (!p) return
    if (p.father_id && next.has(p.father_id)) pruneUp(p.father_id)
    if (p.mother_id && next.has(p.mother_id)) pruneUp(p.mother_id)
  }
  const p = cache.get(id)
  if (p?.father_id) pruneUp(p.father_id)
  if (p?.mother_id) pruneUp(p.mother_id)
  return { ...state, expandedUp: next }
}

export function expandDown(state: TreeState, id: string): TreeState {
  const next = new Set(state.expandedDown)
  next.add(id)
  return { ...state, expandedDown: next }
}

export function collapseDown(state: TreeState, id: string, cache: Map<string, TreePerson>): TreeState {
  const next = new Set(state.expandedDown)
  function pruneDown(pid: string) {
    next.delete(pid)
    const p = cache.get(pid)
    if (!p) return
    for (const cid of p.child_ids) {
      if (next.has(cid)) pruneDown(cid)
    }
  }
  const p = cache.get(id)
  if (p) for (const cid of p.child_ids) pruneDown(cid)
  return { ...state, expandedDown: next }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** IDs of all people that need to be fetched for the current state.
 *
 * A node is "visible" if it appears in the built hierarchy (i.e. it is a
 * child of an expanded node). We always fetch visible nodes so cards show
 * real data. We only descend further when the node itself is also expanded.
 */
export function requiredIds(state: TreeState, cache: Map<string, TreePerson>): string[] {
  const needed = new Set<string>()

  function walkUp(id: string) {
    if (!cache.has(id)) { needed.add(id); return }
    if (!state.expandedUp.has(id)) return
    const p = cache.get(id)!
    if (p.father_id) walkUp(p.father_id)
    if (p.mother_id) walkUp(p.mother_id)
  }

  function walkDown(id: string) {
    if (!cache.has(id)) { needed.add(id); return }
    if (!state.expandedDown.has(id)) return
    for (const cid of cache.get(id)!.child_ids) walkDown(cid)
  }

  walkUp(state.focusId)
  walkDown(state.focusId)
  return [...needed]
}
