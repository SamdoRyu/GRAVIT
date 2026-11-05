// Where every issue box / PR wants to be. The role comes from the SceneModel (placeRole), the position from the station
// ThemeLayout; this file only decides the order inside a role and which done items the archive shows.
import type { Instant, WorkspaceSnapshot } from '../data/types'
import type { PlaceRole, SceneEntity, ThemeLayout } from './model/types'

export const BOX_W = 0.42
export const BOX_D = 0.34
/** One height for every box: the stacks in the station ThemeLayout use a fixed layer pitch. */
export const BOX_H = 0.36

/** Done items shown in the archive: the most recent ones, one layer. Older ones are counted by the archive tag. */
export const DONE_VISIBLE = 14

export interface Slot {
  x: number
  y: number
  z: number
  rot: number
  scale: number
  home: 'desk' | 'backlog' | 'review' | 'done'
}

function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

function sameSlot(a: Slot, b: Slot) {
  return (
    Math.abs(a.x - b.x) < 1e-4 &&
    Math.abs(a.y - b.y) < 1e-4 &&
    Math.abs(a.z - b.z) < 1e-4 &&
    Math.abs(a.rot - b.rot) < 1e-4 &&
    a.scale === b.scale &&
    a.home === b.home
  )
}

/** Issues and PRs — the things placed as cargo. */
export const isCargo = (e: SceneEntity) => e.kind === 'issue' || e.kind === 'pr'

/** When a done item was finished: an issue's closedAt, a PR's mergedAt (or closedAt when closed unmerged). */
function doneAtOf(snapshot: WorkspaceSnapshot): Map<string, Instant> {
  const at = new Map<string, Instant>()
  for (const t of snapshot.tasks) if (t.closedAt) at.set(`task:${t.id}`, t.closedAt)
  for (const s of snapshot.submissions) {
    const when = s.mergedAt ?? s.closedAt
    if (when) at.set(`submission:${s.id}`, when)
  }
  return at
}

/** Done cargo, newest first (ties: by key, so the order is stable). */
export function recentDone(entities: readonly SceneEntity[], snapshot: WorkspaceSnapshot): SceneEntity[] {
  const at = doneAtOf(snapshot)
  return entities
    .filter((e) => isCargo(e) && e.placeRole === 'done')
    .sort((a, b) => {
      const x = at.get(a.key) ?? ''
      const y = at.get(b.key) ?? ''
      return x < y ? 1 : x > y ? -1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    })
}

const HOME: Record<'desk' | 'backlog' | 'review', { jitter: number; scale: number }> = {
  desk: { jitter: 0.3, scale: 1 },
  backlog: { jitter: 0.12, scale: 0.92 },
  review: { jitter: 0.12, scale: 0.92 },
}

/**
 * A slot for every placed issue / PR, keyed by SceneEntity key. Desk, docking bay and scanner keep the SceneModel order
 * (the Snapshot's: issue / PR number ascending) and stack upward when full. The archive shows the DONE_VISIBLE most recent;
 * `doneAssign` keeps which archive cell each one occupies so older ones don't shuffle when a new one arrives. `prev`
 * keeps slot object identity stable.
 */
export function computeSlots(
  entities: readonly SceneEntity[],
  snapshot: WorkspaceSnapshot,
  layout: ThemeLayout,
  doneAssign: Map<string, number>,
  prev: Map<string, Slot>,
): Map<string, Slot> {
  const out = new Map<string, Slot>()
  const put = (key: string, role: PlaceRole, index: number, home: Slot['home'], jitter: number, scale: number) => {
    const [x, y, z] = layout.anchor(role, index)
    const s: Slot = { x, y, z, rot: (hash01(key) - 0.5) * jitter, scale, home }
    const old = prev.get(key)
    out.set(key, old && sameSlot(old, s) ? old : s)
  }

  const counts = new Map<PlaceRole, number>()
  for (const e of entities) {
    if (!isCargo(e)) continue
    const role = e.placeRole
    const home = role.startsWith('desk:') ? 'desk' : role === 'backlog' || role === 'review' ? role : null
    if (home === null) continue // done: below. Other roles (requirement zones, …) come with their issues.
    const i = counts.get(role) ?? 0
    counts.set(role, i + 1)
    put(e.key, role, i, home, HOME[home].jitter, HOME[home].scale)
  }

  const recent = recentDone(entities, snapshot).slice(0, DONE_VISIBLE)
  const keep = new Set(recent.map((e) => e.key))
  for (const key of [...doneAssign.keys()]) if (!keep.has(key)) doneAssign.delete(key)
  const used = new Set(doneAssign.values())
  for (const e of recent) {
    if (doneAssign.has(e.key)) continue
    let k = 0
    while (used.has(k)) k++
    doneAssign.set(e.key, k)
    used.add(k)
  }
  for (const e of recent) put(e.key, 'done', doneAssign.get(e.key) ?? 0, 'done', 0.5, 0.9)
  return out
}
