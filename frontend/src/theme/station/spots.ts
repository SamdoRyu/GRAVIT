// 아바타가 서거나 앉는 정거장 자리(월드 단위). 소유: C.
// 정거장은 통로가 아바타보다 작아 걸어 다니지 않는다 — 자리가 바뀌면 사라졌다 나타난다(CONTRACTS.md 「10」 아바타 이동 연출).
import { BRIDGE, BRIDGE_SEATS, DOCK, PODS, POD, WORLD_SCALE } from './geometry'

export interface Spot {
  x: number
  y: number
  z: number
  /** 바라보는 방향(라디안, 0 = +z) */
  facing: number
  seated: boolean
  /** 정거장을 떠난다: 도착하면 숨긴다 */
  exit?: boolean
}

const S = WORLD_SCALE

/** deskIndex 포드의 승무원 자리. 포드가 없는 번호면 null. */
export function crewSpot(deskIndex: number, seated: boolean): Spot | null {
  const pod = PODS[deskIndex]
  if (!pod) return null
  return { x: pod.crew.x * S, y: POD.deckY * S, z: pod.crew.z * S, facing: pod.crew.facing, seated }
}

/** 지휘 브리지 회의 좌석 i번 — 탁자를 바라본다 */
export function bridgeSeat(i: number): Spot {
  const n = BRIDGE_SEATS.angles.length
  const a = (BRIDGE_SEATS.angles[((i % n) + n) % n] * Math.PI) / 180
  const x = BRIDGE.x + Math.cos(a) * BRIDGE_SEATS.radius
  const z = BRIDGE.z + Math.sin(a) * BRIDGE_SEATS.radius
  return { x: x * S, y: BRIDGE.floorY * S, z: z * S, facing: Math.atan2(BRIDGE.x - x, BRIDGE.z - z), seated: false }
}

/** 정거장을 떠나는 자리 — 도킹 베이 끝 */
export const EXIT_SPOT: Spot = { x: DOCK.x * S, y: DOCK.deckY * S, z: (DOCK.z + DOCK.length / 2) * S, facing: 0, seated: false, exit: true }
