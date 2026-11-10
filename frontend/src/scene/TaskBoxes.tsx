// Every issue / PR of the open v1 office as one persistent box (keyed by SceneEntity key), placed by its SceneModel role,
// plus an agenda shape on the bridge table for each item on the agenda: issue · PR (#30 · #26), learning · other (#31), help (#205).
import { useMemo, useRef, type ReactElement } from 'react'
import { useOffice, type OfficeSelection } from '../store'
import { withdrawRefusal } from './cargoDrop'
import { CargoCapsules } from './CargoCapsules'
import { MergeBurst } from './MergeBurst'
import { TaskBox, type AgendaSource } from './TaskBox'
import { useToday } from './signals'
import { computeSlots, type Slot } from './slots'
import { useStationScene } from './useStationScene'

/**
 * 사무실마다 이미 본 상자 키 — 처음 연 사무실의 상자는 그냥 거기 있고, 그 뒤에 새로 생긴 상자만 등장 연출(새 이슈는 화물 캡슐 #304)을 한다.
 * 다른 사무실로 갔다가 돌아와도 이미 본 상자는 다시 연출하지 않는다(새로 고치면 처음부터).
 */
const seenByOffice = new Map<string, Set<string>>()

export function TaskBoxes() {
  const scene = useStationScene()
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const today = useToday()

  const doneAssign = useRef(new Map<string, number>())
  const prevSlots = useRef(new Map<string, Slot>())
  const popped = useRef(new Map<string, boolean>())
  const poppedOffice = useRef<string | null>(null)

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
   * shape opens its source and is dragged to the bridge trash can only when the viewer may withdraw it (#291 — FR-LRN-14: raised
   * by them, not decided yet; others' items are not picked up at all).
   */
  const targets = useMemo(() => {
    const m = new Map<string, { select: OfficeSelection | null; raise: AgendaSource | null; withdraw?: string; helpRequestId?: string }>()
    for (const t of snapshot?.tasks ?? []) m.set(`task:${t.id}`, { select: { kind: 'task', id: t.id }, raise: { type: 'task', id: t.id } })
    for (const p of snapshot?.submissions ?? []) m.set(`submission:${p.id}`, { select: { kind: 'submission', id: p.id }, raise: { type: 'submission', id: p.id } })
    for (const a of snapshot?.agendaItems ?? []) {
      const src = a.source
      const select: OfficeSelection | null = src?.type === 'task' ? { kind: 'task', id: src.id } : src?.type === 'submission' ? { kind: 'submission', id: src.id } : null
      // a help-request item opens its help request in the panel (the v1 detail drawer shows issues · PRs · members only)
      const withdraw = snapshot && withdrawRefusal(snapshot.viewer, a) === null ? { withdraw: a.id } : {}
      m.set(`agenda:${a.id}`, { select, raise: null, ...withdraw, ...(src?.type === 'help_request' ? { helpRequestId: src.id } : {}) })
    }
    return m
  }, [snapshot])

  if (!scene) return null
  // 처음 본 사무실의 상자는 그냥 거기 있고, 이미 본 적 없는 상자만 등장 연출을 한다(사무실을 옮겨도 다시 하지 않는다)
  const officeId = snapshot?.workspace.id ?? null
  if (officeId !== poppedOffice.current) {
    poppedOffice.current = officeId
    popped.current.clear()
  }
  if (officeId !== null && slots.size > 0) {
    let seen = seenByOffice.get(officeId)
    const firstLook = seen === undefined
    if (!seen) seenByOffice.set(officeId, (seen = new Set()))
    for (const key of slots.keys()) {
      if (!popped.current.has(key)) popped.current.set(key, !firstLook && !seen.has(key))
      seen.add(key)
    }
  }

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
        withdraw={target?.withdraw ?? null}
        helpRequestId={target?.helpRequestId ?? null}
        dropZoneAt={scene.layout.dropZoneAt}
        overdue={overdue.has(e.key)}
        pop={popped.current.get(e.key) ?? false}
      />,
    )
  }
  // 머지 축하 입자(#300) — 상자들이 알리는 빛 꼬리 · 반짝이를 한곳에서 그린다
  return (
    <>
      {items}
      <MergeBurst />
      {/* 새 이슈 화물 캡슐(#304) — 보고 있는 중에 들어온 이슈 상자를 싣고 온다 */}
      <CargoCapsules />
    </>
  )
}
