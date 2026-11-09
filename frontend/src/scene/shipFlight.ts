// 도킹 우주선의 비행 — 다른 정거장(같은 모델을 쓰는 다른 사무실)으로 떠나고, 새 정거장에 도착한다. 소유: C.
// 우주선은 도킹 링(도킹 베이 남쪽 끝) 앞에 가로로 누워 동체 옆면이 연결 통로에 붙어 있다. 붙어 있을 때 기수는 서쪽(-x).
// 떠남: 통로에서 남쪽(+z)으로 떨어진 뒤(분리) 기수 쪽(서쪽)으로 가속해 화면 밖으로.
// 도착: 서쪽 화면 밖에서 기수를 진행 방향(동쪽)으로 두고 들어와 멈추고, 세로로 반 바퀴(기수가 위로 들려 서쪽으로) 돌면서
// 뒤집힌 몸을 동체 축으로 반 바퀴 굴려 바로 세운 뒤 통로에 붙는다. three를 모르는 순수 계산이다.

/** 떠남: 분리 → 가속 */
const UNDOCK_S = 0.7
const CRUISE_OUT_S = 1.7
export const SHIP_DEPART_S = UNDOCK_S + CRUISE_OUT_S
/** 도착: 감속하며 들어옴 → 세로로 돌기 → 결합 */
const INBOUND_S = 1.8
const TURN_S = 1.2
const DOCK_S = 0.6
export const SHIP_ARRIVE_S = INBOUND_S + TURN_S + DOCK_S
/** 통로에서 떨어지는 거리(시안 단위) — 그 자리에서 돌아도 연결 통로에 닿지 않게 */
export const SHIP_STANDOFF = 2.6
/** 화면 밖까지의 거리 */
export const SHIP_FAR = 140
/** 멀리 갈수록 조금 떠오른다 — 정거장 아래로 파고들지 않게 */
const RISE = 0.08

export type ShipFlight = 'depart' | 'arrive'

/**
 * 방향은 붙어 있을 때(기수 서쪽 · 위가 위)에서 시작해 차례로 — ① 동체 축으로 roll만큼 구르고, ② 위아래 축으로 yaw만큼 돌고,
 * ③ 남북 축(+z)으로 pitch만큼 든다(양수 = 동쪽을 보던 기수가 위로). 도착하는 동안은 yaw = π(기수 동쪽)이고, 세로로 돌기를 마치면
 * pitch = roll = π — 붙어 있을 때와 같은 방향이 된다.
 */
export interface ShipPose {
  /** 도킹 자리에서 서쪽(-x)으로 떨어진 거리 */
  forward: number
  /** 도킹 자리에서 남쪽(+z, 통로에서 멀어지는 쪽)으로 떨어진 거리 */
  dz: number
  /** 도킹 자리에서 위로 떨어진 높이 */
  dy: number
  yaw: number
  pitch: number
  roll: number
  /** 분사구 불꽃 세기 0~1 */
  thrust: number
  /** 이 비행이 끝났다 */
  done: boolean
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeInOut = (k: number) => k * k * (3 - 2 * k)
const PI = Math.PI

/** 비행 시작 뒤 t초의 자세. 떠남은 끝나면 화면 밖(forward = SHIP_FAR), 도착은 끝나면 도킹 자리 */
export function shipPose(flight: ShipFlight, t: number): ShipPose {
  const still = { yaw: 0, pitch: 0, roll: 0 }
  if (flight === 'depart') {
    if (t <= UNDOCK_S) {
      const k = easeInOut(clamp01(t / UNDOCK_S))
      return { forward: 0, dz: SHIP_STANDOFF * k, dy: 0, ...still, thrust: 0.2 * k, done: false }
    }
    const k = clamp01((t - UNDOCK_S) / CRUISE_OUT_S)
    // 가속: 거리는 시간의 세제곱 — 처음엔 천천히, 끝엔 빠르게
    const forward = SHIP_FAR * k * k * k
    return { forward, dz: SHIP_STANDOFF, dy: forward * RISE, ...still, thrust: 0.3 + 0.7 * clamp01(k * 3), done: t >= SHIP_DEPART_S }
  }
  if (t < INBOUND_S) {
    // 기수를 진행 방향(동쪽)으로 두고 감속 — 남은 거리가 (1 - k)의 세제곱. 엔진은 점점 줄인다
    const k = clamp01(t / INBOUND_S)
    const forward = SHIP_FAR * (1 - k) ** 3
    return { forward, dz: SHIP_STANDOFF, dy: forward * RISE, yaw: PI, pitch: 0, roll: 0, thrust: 0.8 * (1 - k), done: false }
  }
  if (t < INBOUND_S + TURN_S) {
    // 세로로 반 바퀴: 기수가 위로 들려 서쪽으로. 뒤집히는 몸은 후반에 동체 축으로 반 바퀴 굴려 바로 세운다
    const k = clamp01((t - INBOUND_S) / TURN_S)
    const pitch = PI * easeInOut(k)
    const roll = PI * easeInOut(clamp01((k - 0.45) / 0.55))
    return { forward: 0, dz: SHIP_STANDOFF, dy: 0, yaw: PI, pitch, roll, thrust: 0.25, done: false }
  }
  const k = easeInOut(clamp01((t - INBOUND_S - TURN_S) / DOCK_S))
  const done = t >= SHIP_ARRIVE_S
  // 다 돈 방향(yaw = pitch = roll = π)은 붙어 있을 때(모두 0)와 같다 — 끝나면 0으로 적는다
  const turned = done ? still : { yaw: PI, pitch: PI, roll: PI }
  return { forward: 0, dz: SHIP_STANDOFF * (1 - k), dy: 0, ...turned, thrust: 0, done }
}

type V3 = [number, number, number]
const rotX = ([x, y, z]: V3, a: number): V3 => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]
const rotY = ([x, y, z]: V3, a: number): V3 => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]
const rotZ = ([x, y, z]: V3, a: number): V3 => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]

/**
 * 자세의 기수 · 위 방향(월드 축, 단위 벡터). 붙어 있을 때 기수 (-1, 0, 0) · 위 (0, 1, 0).
 * 동체 축 굴림은 붙어 있을 때 기수 축(x)으로, 그다음 yaw(y), pitch(z) 순서 — DockShip의 그룹 중첩과 같다.
 */
export function shipAxes(pose: Pick<ShipPose, 'yaw' | 'pitch' | 'roll'>): { nose: V3; up: V3 } {
  const turn = (v: V3) => rotZ(rotY(rotX(v, pose.roll), pose.yaw), pose.pitch)
  return { nose: turn([-1, 0, 0]), up: turn([0, 1, 0]) }
}
