// What letting go of a dragged original issue / PR does (CONTRACTS.md 「8」 드롭 결과). Pure, no three. OWNER: C.
// - the bridge (`meeting`) → raise it as an agenda item (#30 · #26)
// - a requirement plate (`requirement:<id>`) → link that requirement to the issue (#15 — RequirementLink is requirement ↔ issue,
//   so a PR prism does nothing there)
// - the waiting plate (`requirement:waiting`) → an issue opens the waiting list to pick the requirement, then link (#197 —
//   store openRequirementWaiting(taskId))
// - anywhere else → nothing. Either way the shape flies back to its own place: neither changes where the original is.
import type { PlaceRole } from './model/types'
import { REQUIREMENT_WAITING_ROLE } from './model/buildSceneModel'

/** The dragged original: an issue (task) or a PR (submission) */
export interface CargoSource {
  type: 'task' | 'submission'
  id: string
}

const REQUIREMENT_PREFIX = 'requirement:'

/** The drop zone that would act if the shape were let go over `zone` (ThemeLayout dropZoneAt), or null */
export function cargoDropTarget(zone: PlaceRole | null, source: CargoSource): PlaceRole | null {
  if (zone === 'meeting') return zone
  if (zone !== null && zone.startsWith(REQUIREMENT_PREFIX) && source.type === 'task') return zone
  return null
}

/** Whether a drop target is the waiting plate (pick the requirement from the waiting list) */
export const isWaitingTarget = (target: string | null): boolean => target === REQUIREMENT_WAITING_ROLE

/** The requirement id of a `requirement:<id>` drop target, or null */
export function requirementOf(target: string | null): string | null {
  return target !== null && target.startsWith(REQUIREMENT_PREFIX) && target !== REQUIREMENT_WAITING_ROLE ? target.slice(REQUIREMENT_PREFIX.length) : null
}
