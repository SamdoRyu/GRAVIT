// Every issue / PR of the open v1 office as one persistent box (keyed by SceneEntity key), placed by its SceneModel role.
import { useMemo, useRef, type ReactElement } from 'react'
import type { Priority } from '../data/types'
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

  /** key → what the box shows that the SceneModel doesn't carry (colour, overdue glow) */
  const looks = useMemo(() => {
    const m = new Map<string, { priority: Priority | null; overdue: boolean }>()
    if (!snapshot) return m
    for (const t of snapshot.tasks) m.set(`task:${t.id}`, { priority: t.priority, overdue: t.state === 'open' && t.dueDate !== null && t.dueDate < today })
    for (const s of snapshot.submissions) m.set(`submission:${s.id}`, { priority: s.priority, overdue: false })
    return m
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
    const look = looks.get(e.key)
    items.push(<TaskBox key={e.key} entity={e} slot={slot} priority={look?.priority ?? null} overdue={look?.overdue ?? false} pop={popped.current.get(e.key) ?? false} />)
  }
  return <>{items}</>
}
