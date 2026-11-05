// Every issue / PR of the open v1 office as one persistent box (keyed by SceneEntity key), placed by its SceneModel role.
import { useMemo, useRef, type ReactElement } from 'react'
import { useOffice } from '../store'
import { TaskBox } from './TaskBox'
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
    items.push(<TaskBox key={e.key} entity={e} slot={slot} overdue={overdue.has(e.key)} pop={popped.current.get(e.key) ?? false} />)
  }
  return <>{items}</>
}
