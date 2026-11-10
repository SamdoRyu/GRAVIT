// What letting go of a dragged shape does (CONTRACTS.md 「8」 드롭 결과). Pure, no three. OWNER: C.
// An original issue / PR:
// - the bridge (`meeting`) → raise it as an agenda item (#30 · #26)
// - a requirement plate (`requirement:<id>`) → link that requirement to the issue (#15 — RequirementLink is requirement ↔ issue,
//   so a PR prism does nothing there)
// - the waiting plate (`requirement:waiting`) → an issue opens the waiting list to pick the requirement, then link (#197 —
//   store openRequirementWaiting(taskId))
// - anywhere else → nothing. Either way the shape flies back to its own place: neither changes where the original is.
// An agenda shape on the bridge table (#291 — FR-LRN-14): only one the viewer may withdraw (raised by them, not decided yet) is
// picked up. Let go over the bridge trash can → withdrawAgendaItem (the agenda item becomes `withdrawn`; the original issue · PR
// stays, and a help request goes back to its state right before it was raised — #313 · #314); anywhere else → nothing, it flies
// back to its place on the table.
import type { AgendaItemDto, Viewer } from '../data/types'
import { MEETING_MSG } from '../data/rules/meeting'
import type { PlaceRole } from './model/types'
import { REQUIREMENT_WAITING_ROLE } from './model/buildSceneModel'

/** The dragged original: an issue (task) or a PR (submission) */
export interface CargoSource {
  type: 'task' | 'submission'
  id: string
}

/** A dragged agenda shape on the bridge table (#291): the agenda item id */
export interface AgendaDragSource {
  type: 'agenda'
  id: string
}

/** Anything a shape in the 3D office can be picked up as */
export type DragSource = CargoSource | AgendaDragSource

const REQUIREMENT_PREFIX = 'requirement:'

/** The drop target of the bridge trash can (#291): an agenda shape let go there is withdrawn */
export const TRASH_TARGET = 'trash'

/** The drop zone that would act if the shape were let go over `zone` (ThemeLayout dropZoneAt), or null */
export function cargoDropTarget(zone: PlaceRole | null, source: CargoSource): PlaceRole | null {
  if (zone === 'meeting') return zone
  if (zone !== null && zone.startsWith(REQUIREMENT_PREFIX) && source.type === 'task') return zone
  return null
}

/**
 * The drop target of a dragged agenda shape: the trash can when the pointer is within its catch range, else nothing — the
 * bridge itself does nothing (the item is already on the agenda), nor do requirement plates.
 */
export const agendaDropTarget = (overTrash: boolean): typeof TRASH_TARGET | null => (overTrash ? TRASH_TARGET : null)

/** Whether a point (top view, any one unit) lies within `catchRadius` of the trash can's centre */
export const withinTrash = (x: number, z: number, centre: { x: number; z: number }, catchRadius: number): boolean => Math.hypot(x - centre.x, z - centre.z) <= catchRadius

/**
 * Why the viewer may not withdraw this agenda item, or null if they may (the store · server rules — FR-LRN-14: the member who
 * raised it, before it is decided). Checked again when a shape is let go over the trash can: the item may have been decided by
 * someone else meanwhile. The server checks the same and has the last word.
 */
export function withdrawRefusal(viewer: Viewer, item: AgendaItemDto | undefined): string | null {
  if (!item || item.status !== 'confirmed') return MEETING_MSG.agendaNotConfirmed
  if (viewer.memberId === null || item.raisedByMemberId !== viewer.memberId) return MEETING_MSG.withdrawNotOwner
  return null
}

/** Whether a drop target is the waiting plate (pick the requirement from the waiting list) */
export const isWaitingTarget = (target: string | null): boolean => target === REQUIREMENT_WAITING_ROLE

/** The requirement id of a `requirement:<id>` drop target, or null */
export function requirementOf(target: string | null): string | null {
  return target !== null && target.startsWith(REQUIREMENT_PREFIX) && target !== REQUIREMENT_WAITING_ROLE ? target.slice(REQUIREMENT_PREFIX.length) : null
}
