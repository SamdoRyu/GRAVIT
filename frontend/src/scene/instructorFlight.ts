// 강사 우주선의 도착 · 출발 (#290) — 시간 t(초)에 머무는 자리(게시판 위)에서 얼마나 떨어져 있는지. 순수 함수 — 그리는 쪽
// (InstructorShip)이 매 프레임 부른다. 도착은 화면 밖 동쪽 위에서 감속하며 들어오고, 출발은 같은 쪽으로 가속하며 나간다.
// 단위는 시안 단위(WORLD_SCALE 그룹 안).

export type InstructorFlight = 'arrive' | 'depart'

/** 머무는 자리에서 본 출발점 — 동쪽(+x) 위, 조금 뒤(-z). 정거장 위 하늘에서 내려오는 것처럼 보인다 */
export const FLIGHT_FROM = { x: 34, y: 16, z: -10 } as const
export const FLIGHT_SECONDS: Record<InstructorFlight, number> = { arrive: 2.6, depart: 2.0 }

export interface ShipPose {
  /** 머무는 자리에서의 거리(시안 단위) */
  dx: number
  dy: number
  dz: number
  /** 기울기(라디안) — 날아가는 쪽으로 살짝 */
  bank: number
  /** 추진 불꽃 세기 0~1 */
  thrust: number
  done: boolean
}

const easeOutCubic = (k: number) => 1 - (1 - k) ** 3
const easeInCubic = (k: number) => k ** 3

/** t초 뒤의 자세. 도착: 1 → 0(감속), 출발: 0 → 1(가속) */
export function instructorShipPose(kind: InstructorFlight, t: number): ShipPose {
  const k = Math.min(1, Math.max(0, t / FLIGHT_SECONDS[kind]))
  const away = kind === 'arrive' ? 1 - easeOutCubic(k) : easeInCubic(k)
  // 빠를수록 많이 기울고 불꽃이 세다 — 도착은 처음에, 출발은 끝에 빠르다
  const speed = kind === 'arrive' ? (1 - k) ** 2 : k ** 2
  return { dx: FLIGHT_FROM.x * away, dy: FLIGHT_FROM.y * away, dz: FLIGHT_FROM.z * away, bank: -0.35 * speed, thrust: speed, done: k >= 1 }
}
