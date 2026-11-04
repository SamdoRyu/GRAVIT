// Where every task box wants to be: a crew pod, the docking bay (backlog), the archive (done) or the bridge table.
// Positions come from the station ThemeLayout; this file only decides the role and the order inside it.
import { PRIORITY_META } from '../data/meta'
import { backlogTasks, isOpen, tasksOf } from '../data/selectors'
import type { Id, Member, Task } from '../data/types'
import type { PlaceRole } from './model/types'
import { stationFor } from './stationSeats'

export const BOX_W = 0.42
export const BOX_D = 0.34
/** One height for every box: the stacks in the station ThemeLayout use a fixed layer pitch (v1 tasks have no estimate). */
export const BOX_H = 0.36

/** Agenda boxes shown on the bridge table (two rings of six); the rest wait hidden and are counted by the room tag. */
export const AGENDA_VISIBLE = 12
/** Done boxes shown in the archive: the most recent ones, one layer. Older ones are counted by the archive tag. */
export const DONE_VISIBLE = 14

export interface Slot {
  x: number
  y: number
  z: number
  rot: number
  scale: number
  home: 'desk' | 'backlog' | 'done' | 'agenda'
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

/** Done tasks the archive shows, newest first. */
export function recentDone(tasks: Record<Id, Task>): Task[] {
  return Object.values(tasks)
    .filter((t) => t.status === 'done' && t.completedAt)
    .sort((a, b) => (b.completedAt! < a.completedAt! ? -1 : b.completedAt! > a.completedAt! ? 1 : 0))
}

/**
 * Compute a slot for every visible task. `doneAssign` persists which archive cell each completed task occupies so
 * older ones don't shuffle when a new one arrives. `prev` keeps slot object identity stable.
 */
export function computeSlots(
  tasks: Record<Id, Task>,
  members: Record<Id, Member>,
  doneAssign: Map<Id, number>,
  prev: Map<Id, Slot>,
): Map<Id, Slot> {
  const { layout, seats } = stationFor(members)
  const out = new Map<Id, Slot>()
  const put = (id: Id, role: PlaceRole, index: number, home: Slot['home'], jitter: number, scale = 1) => {
    const [x, y, z] = layout.anchor(role, index)
    const s: Slot = { x, y, z, rot: (hash01(id) - 0.5) * jitter, scale, home }
    const old = prev.get(id)
    out.set(id, old && sameSlot(old, s) ? old : s)
  }

  const onTable = (t: Task) => t.onAgenda === true && isOpen(t)

  // ---- crew pods: the task in progress first, then the rest ----
  for (const m of Object.values(members)) {
    if (!seats.has(m.id)) continue
    const list = tasksOf(tasks, m.id).filter((t) => !onTable(t))
    const inProg = list.find((t) => t.status === 'in_progress')
    const ordered = inProg ? [inProg, ...list.filter((t) => t !== inProg)] : list
    ordered.forEach((t, i) => put(t.id, `desk:${m.id}`, i, 'desk', 0.3))
  }

  // ---- docking bay: unassigned tasks, then open tasks whose owner has no pod (missing member or no seat) ----
  const orphans = Object.values(tasks).filter((t) => isOpen(t) && t.assigneeId !== null && !onTable(t) && !seats.has(t.assigneeId))
  ;[...backlogTasks(tasks).filter((t) => !onTable(t)), ...orphans].forEach((t, i) => put(t.id, 'backlog', i, 'backlog', 0.12, 0.92))

  // ---- bridge table: any open task on the agenda. Most important first, then by number; beyond the table they wait hidden ----
  Object.values(tasks)
    .filter(onTable)
    .sort((a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight || a.number - b.number)
    .forEach((t, k) => put(t.id, 'meeting', k < AGENDA_VISIBLE ? k : 0, 'agenda', 0.14, k < AGENDA_VISIBLE ? 0.95 : 0))

  // ---- archive: the most recent done tasks, each keeping its cell ----
  const recent = recentDone(tasks).slice(0, DONE_VISIBLE)
  const keep = new Set(recent.map((t) => t.id))
  for (const id of [...doneAssign.keys()]) if (!keep.has(id)) doneAssign.delete(id)
  const used = new Set(doneAssign.values())
  for (const t of recent) {
    if (doneAssign.has(t.id)) continue
    let k = 0
    while (used.has(k)) k++
    doneAssign.set(t.id, k)
    used.add(k)
  }
  for (const t of recent) put(t.id, 'done', doneAssign.get(t.id) ?? 0, 'done', 0.5, 0.9)
  return out
}
