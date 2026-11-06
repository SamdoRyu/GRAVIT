// Every issue / PR of the open v1 office as one persistent box (keyed by SceneEntity key), placed by its SceneModel role,
// plus an agenda shape on the bridge table for each item on the agenda: issue · PR (#30 · #26), learning · other (#31), help (#205).
import { useMemo, useRef, type ReactElement } from 'react'
import { useOffice, type OfficeSelection } from '../store'
import { TaskBox, type AgendaSource } from './TaskBox'
import { useToday } from './signals'
import { computeSlots, type Slot } from './slots'
import { useStationScene } from './useStationScene'

export function TaskBoxes() {
  const scene = useStationScene()
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const today = useToday()

  const doneAssign = useRef(new Map<string, number>())
  const prevSlots = useRef(new Map<string, Slot>())
  const popped = useRef(new Map<string, boolean>())
  const firstBatch = useRef(true)

  const slots = useMemo(() => {
    if (!scene || !snapshot) return new Map<string, Slot>()
    const next = computeSlots(scene.entities, snapshot, scene.layout, doneAssign.current, prevSlots.current)
    prevSlots.current = next
    return next
  }, [scene, snapshot])

  /** Issues past their due date (P14 마감) — the one thing the box shows that the SceneModel doesn't carry */
  const overdue = useMemo(() => {
    const keys = new Set<string>()
    for (const t of snapshot?.tasks ?? []) if (t.state === 'open' && t.dueDate !== null && t.dueDate < today) keys.add(`task:${t.id}`)
    return keys
  }, [snapshot, today])

  /**
   * key → what a click opens and what a drop on the bridge raises. An original issue / PR opens and raises itself; an agenda
   * shape opens its source and is not dragged.
   */
  const targets = useMemo(() => {
    const m = new Map<string, { select: OfficeSelection | null; raise: AgendaSource | null; helpRequestId?: string }>()
    for (const t of snapshot?.tasks ?? []) m.set(`task:${t.id}`, { select: { kind: 'task', id: t.id }, raise: { type: 'task', id: t.id } })
    for (const p of snapshot?.submissions ?? []) m.set(`submission:${p.id}`, { select: { kind: 'submission', id: p.id }, raise: { type: 'submission', id: p.id } })
    for (const a of snapshot?.agendaItems ?? []) {
      const src = a.source
      const select: OfficeSelection | null = src?.type === 'task' ? { kind: 'task', id: src.id } : src?.type === 'submission' ? { kind: 'submission', id: src.id } : null
      // a help-request item opens its help request in the panel (the v1 detail drawer shows issues · PRs · members only)
      m.set(`agenda:${a.id}`, { select, raise: null, ...(src?.type === 'help_request' ? { helpRequestId: src.id } : {}) })
    }
    return m
  }, [snapshot])

  if (!scene) return null
  // Boxes present in the first loaded snapshot are simply there; later ones pop in.
  for (const key of slots.keys()) {
    if (!popped.current.has(key)) popped.current.set(key, !firstBatch.current)
  }
  if (slots.size > 0) firstBatch.current = false

  const items: ReactElement[] = []
  for (const e of scene.entities) {
    const slot = slots.get(e.key)
    if (!slot) continue
    const target = targets.get(e.key)
    items.push(
      <TaskBox
        key={e.key}
        entity={e}
        slot={slot}
        select={target?.select ?? null}
        raise={target?.raise ?? null}
        helpRequestId={target?.helpRequestId ?? null}
        dropZoneAt={scene.layout.dropZoneAt}
        overdue={overdue.has(e.key)}
        pop={popped.current.get(e.key) ?? false}
      />,
    )
  }
  return <>{items}</>
}
