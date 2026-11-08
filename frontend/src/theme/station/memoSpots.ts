// 활동 메모지 자리 (#173 — FR-ACT-03). 소유: C.
// 메모지는 콘솔 책상 위에 납작하게 놓인다 — 작성자 포드의 콘솔, 포드가 없는 작성자는 통신 허브 콘솔(SceneModel의 desk · board).
// 벽에 붙이면 컷어웨이 모듈이 돌아갈 때 가려져서, 위에서 늘 보이는 책상 앞쪽 띠에 둔다.
import { COMM_HUB, POD, PODS, WORLD_SCALE } from './geometry'

/** 콘솔 하나 — 시안 단위 중심 · 바닥 높이 · 방향(StationEnvironment의 Console과 같은 값) */
export interface ConsoleAt {
  x: number
  z: number
  deckY: number
  ry: number
}

/** 포드 콘솔: 바깥쪽 끝에서 2.1 안쪽, 바깥을 바라본다(StationEnvironment PodUnit · 시안 consoleAt) */
export function podConsole(deskIndex: number): ConsoleAt | null {
  const pod = PODS[deskIndex]
  if (!pod) return null
  const x = pod.axis === 'x' ? pod.x + pod.outward * 2.1 : pod.x
  const z = pod.axis === 'z' ? pod.z + pod.outward * 2.1 : pod.z
  const ry = pod.axis === 'z' ? (pod.outward < 0 ? 0 : Math.PI) : pod.outward > 0 ? -Math.PI / 2 : Math.PI / 2
  return { x, z, deckY: POD.deckY, ry }
}

/** 통신 허브 콘솔(StationEnvironment CommHub) — 포드가 없는 작성자의 메모지 */
export const COMM_CONSOLE: ConsoleAt = { x: COMM_HUB.x, z: 9.3, deckY: COMM_HUB.deckY, ry: Math.PI }

/** 한 콘솔에 보이는 메모지 수 — 더 있으면 "+N" 표시 */
export const MEMOS_PER_CONSOLE = 4

/** 콘솔 책상 윗면 높이(콘솔 안 좌표, Console 상판 1.05 + 두께 0.12 / 2) */
const TOP_Y = 1.115
/** 화면이 뒤쪽(-z)에 있어 앞쪽 띠에 한 줄로 */
const LOCAL_X = [-0.75, -0.25, 0.25, 0.75]
const LOCAL_Z = 0.35

export interface MemoSpot {
  /** 월드 좌표 — 메모지 아랫면 */
  x: number
  y: number
  z: number
  /** 메모지 방향(라디안) — 콘솔 방향 + 살짝 비틀기 */
  ry: number
}

/** 콘솔의 i번째(0 ~ MEMOS_PER_CONSOLE-1) 메모지 자리. `twist`는 키마다 다른 작은 기울기(라디안). */
export function memoSpot(c: ConsoleAt, i: number, twist = 0): MemoSpot {
  const lx = LOCAL_X[Math.min(Math.max(i, 0), LOCAL_X.length - 1)]
  // three.js Y 회전: x' = x cos + z sin, z' = -x sin + z cos
  const cos = Math.cos(c.ry)
  const sin = Math.sin(c.ry)
  const x = c.x + lx * cos + LOCAL_Z * sin
  const z = c.z - lx * sin + LOCAL_Z * cos
  return { x: x * WORLD_SCALE, y: (c.deckY + TOP_Y) * WORLD_SCALE, z: z * WORLD_SCALE, ry: c.ry + twist }
}
