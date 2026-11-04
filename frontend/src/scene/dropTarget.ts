// Synchronous drop-target hit test: pointer (client px) → ray → a crew member's avatar, or the station zone under the
// pointer (crew pod, docking bay, bridge) from the ThemeLayout. Called from DOM event handlers (never from useFrame) so the
// target is always current when pointerup lands.
import { Box3, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useOffice, type DropTarget } from '../store'
import type { PlaceRole } from './model/types'
import { avatarLive, DRAG_Y, dragPoint, sceneApi } from './runtime'
import { stationFor } from './stationSeats'

const ray = new Raycaster()
const ndc = new Vector2()
const planeDrag = new Plane(new Vector3(0, 1, 0), -DRAG_Y)
/** Zones are read where the ray meets this height: about the pod decks, between the bridge floor and the bay deck. */
const planeZones = new Plane(new Vector3(0, 1, 0), -0.6)
const tmpBox = new Box3()
const hitA = new Vector3()
const hitB = new Vector3()

/** Station zone → what the store's drop does today (demo store; CONTRACTS.md 「8」 drop rules apply once the screen moves to v1). */
function toTarget(role: PlaceRole): DropTarget | null {
  if (role.startsWith('desk:')) return { kind: 'member', id: role.slice('desk:'.length) }
  if (role === 'backlog') return { kind: 'backlog' }
  if (role === 'meeting') return { kind: 'agenda' }
  return null
}

/** undefined = nothing published yet this drag, so the first hit always overwrites a stale (panel) target. */
let last: DropTarget | null | undefined

export function resetDropTracking() {
  last = undefined
}

function sameTarget(a: DropTarget | null | undefined, b: DropTarget | null) {
  if (a === undefined) return false
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  return a.kind !== 'member' || (b.kind === 'member' && a.id === b.id)
}

function publish(t: DropTarget | null) {
  if (sameTarget(last, t)) return
  last = t
  useOffice.getState().setDropTarget(t)
}

/** Clear the scene's claim (pointer left the canvas); the panel may set its own target next. */
export function clearSceneTarget() {
  dragPoint.active = false
  publish(null)
  last = undefined
}

/** Update dragPoint and the drop target from a client-space pointer position over the canvas. */
export function updateDropTarget(clientX: number, clientY: number) {
  const api = sceneApi.get?.()
  if (!api) return
  const rect = api.gl.domElement.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  // The camera's projection includes any view offset, so this stays consistent with what is drawn.
  ray.setFromCamera(ndc, api.camera)

  if (ray.ray.intersectPlane(planeDrag, hitA)) {
    dragPoint.x = hitA.x
    dragPoint.y = DRAG_Y
    dragPoint.z = hitA.z
    dragPoint.active = true
  }

  // A crew member's avatar under the pointer wins; otherwise the station zone where the ray meets the deck height.
  let target: DropTarget | null = null
  let best = Infinity
  const state = useOffice.getState()
  const members = state.members
  const o = ray.ray.origin

  for (const [id, live] of avatarLive) {
    if (!live.visible || !members[id]) continue
    tmpBox.min.set(live.x - 0.45, live.y, live.z - 0.45)
    tmpBox.max.set(live.x + 0.45, live.y + 1.7, live.z + 0.45)
    if (ray.ray.intersectBox(tmpBox, hitB)) {
      const t = o.distanceTo(hitB)
      if (t < best) {
        best = t
        target = { kind: 'member', id }
      }
    }
  }

  if (target === null && ray.ray.intersectPlane(planeZones, hitB)) {
    const role = stationFor(members).layout.dropZoneAt([hitB.x, hitB.y, hitB.z])
    target = role ? toTarget(role) : null
    // The bridge takes only open tasks that aren't on the agenda yet (dropping back on it is a no-op).
    const dragged = state.drag ? state.tasks[state.drag.taskId] : undefined
    if (target?.kind === 'agenda' && (!dragged || dragged.status === 'done' || dragged.onAgenda)) target = null
  }
  publish(target)
}

/** True when the client point is over the 3D canvas itself (not a HUD element on top of it). */
export function isOverCanvas(clientX: number, clientY: number): boolean {
  const api = sceneApi.get?.()
  if (!api) return false
  return document.elementFromPoint(clientX, clientY) === api.gl.domElement
}
