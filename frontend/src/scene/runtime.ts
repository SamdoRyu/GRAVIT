// Mutable, per-frame shared state between scene components. Never reactive — read inside useFrame / handlers only.
import type { RootState } from '@react-three/fiber'
import type { ComponentRef } from 'react'
import type { OrbitControls } from '@react-three/drei'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { Id } from '../data/types'

export type ControlsImpl = ComponentRef<typeof OrbitControls>

/** Live avatar position (updated every frame by each Avatar). */
export interface AvatarLive {
  x: number
  /** Floor height under the avatar (station decks differ). */
  y: number
  z: number
  visible: boolean
}
export const avatarLive = new Map<Id, AvatarLive>()

/** Live issue / PR box world position (updated every frame by each TaskBox), keyed by SceneEntity key. */
export interface BoxLive {
  x: number
  y: number
  z: number
}
export const boxLive = new Map<string, BoxLive>()

/** Height of the plane a dragged shape follows the pointer on (just above the decks). */
export const DRAG_Y = 1.2

/**
 * The cargo being dragged to the bridge (#30 · #26) — at most one. `x · y · z` is where it should be drawn, `overMeeting`
 * whether letting go now would raise it as an agenda item. Only the dragging TaskBox writes it.
 */
export const cargoDrag: { key: string | null; x: number; y: number; z: number; overMeeting: boolean } = { key: null, x: 0, y: DRAG_Y, z: 0, overMeeting: false }

/** Where the pointer (client px) meets the horizontal plane y = `planeY`, with the live camera. Null off the canvas or above the horizon. */
export function pointerOnPlane(clientX: number, clientY: number, planeY: number): { x: number; z: number } | null {
  const api = sceneApi.get?.()
  if (!api) return null
  const rect = api.gl.domElement.getBoundingClientRect()
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
  const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  const ray = new Raycaster()
  ray.setFromCamera(ndc, api.camera)
  const hit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -planeY), new Vector3())
  return hit ? { x: hit.x, z: hit.z } : null
}

/** The orbit controls, for code that has to reach them outside CameraRig. */
export const cameraLock: { controls: ControlsImpl | null } = { controls: null }

/** Pixels the pointer may move between pointerdown and click for it to still count as a click (not an orbit). */
export const CLICK_SLOP_PX = 4

/** CameraRig hooks for gestures that start on a shape: remember the camera before, undo the tiny swing after. */
export const cameraGesture: { begin: () => void; discard: () => void } = { begin: () => {}, discard: () => {} }

/** Touch is shakier than a mouse: a tap may wobble this far and still be a click. */
export function clickSlop(e: { nativeEvent?: unknown } | undefined): number {
  const t = (e?.nativeEvent as { pointerType?: string } | undefined)?.pointerType
  return t === 'touch' ? 14 : CLICK_SLOP_PX
}

/** Touch: how long a finger must rest on a panel card before it picks the card up (panel drags — ui/hooks.ts). */
export const LONG_PRESS_MS = 300

/** Coarse pointer (tablet / phone) or little device memory: render cheaper. Desktop is unchanged. */
export const LOW_POWER =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches === true || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4)

export function setCursor(cursor: string) {
  document.body.style.cursor = cursor
}

export const noRaycast = () => null

/** Latest R3F state getter (camera, canvas, ...), set by OfficeScene so code outside the Canvas can reach it. */
export const sceneApi: { get: (() => RootState) | null } = { get: null }

/** Layer for moving things (bots, boxes, diamonds, ghosts). Static furniture stays on layer 0 so ContactShadows can bake once. */
export const DYN_LAYER = 1
