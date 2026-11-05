// Shared hooks for the HUD. OWNER: ui-builder.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Id, Member, Task } from '../data/types'
import { PRIORITY_META } from '../data/meta'
import { isOpen } from '../data/selectors'
import { useOffice } from '../store'

/** Re-renders every `ms` so relative times stay fresh. Returns Date.now(). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function useProjectList() {
  const projects = useOffice((s) => s.projects)
  return useMemo(() => Object.values(projects), [projects])
}

export function useMemberList(): Member[] {
  const members = useOffice((s) => s.members)
  return useMemo(() => Object.values(members).sort((a, b) => a.name.localeCompare(b.name, 'ko')), [members])
}

/** Below this width the management rail is an overlay drawer instead of a docked column. */
export const OVERLAY_QUERY = '(max-width: 1100px)'

/** Live `matchMedia(query).matches`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/**
 * One permanent non-passive touchmove listener: WebKit decides scroll-blocking at touchstart, so it has
 * to exist before the finger lands. It only cancels the scroll while a drag is active.
 */
export function useTouchDragGuard() {
  useEffect(() => {
    const block = (ev: TouchEvent) => {
      if (ev.cancelable && useOffice.getState().drag) ev.preventDefault()
    }
    window.addEventListener('touchmove', block, { passive: false })
    return () => window.removeEventListener('touchmove', block)
  }, [])
}

/** Open tasks on the agenda, in the order a meeting uses them (priority desc, then number). */
export function agendaOrder(tasks: Record<Id, Task>): Task[] {
  return Object.values(tasks)
    .filter((t) => t.onAgenda === true && isOpen(t))
    .sort((a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight || a.number - b.number)
}

export function useAgendaTasks(): Task[] {
  const tasks = useOffice((s) => s.tasks)
  return useMemo(() => agendaOrder(tasks), [tasks])
}
