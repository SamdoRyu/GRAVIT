// 새 이슈 화물 도착(#304)의 알림 통로 — 상자(TaskBox)가 자리를 신청하고 캡슐(CargoCapsules)이 읽어 그린다. 소유: C.
// 보고 있는 중에 새로 들어온 이슈 상자는 바로 자기 자리에 생기지 않고, 하늘에서 화물 캡슐이 도킹 베이 위로 내려와
// 뚜껑이 열리면 그 안에서 튀어나와 자기 자리로 날아간다. 한꺼번에 여러 개면 한 캡슐에 몇 개씩 묶고, 캡슐끼리는 시차를 둔다.
import { DOCK, HULL_Y, WORLD_SCALE } from '../theme/station/geometry'

/** 캡슐 한 번의 시간표(초, 캡슐 출발 기준) */
export const CARGO_T = {
  /** 하늘에서 도킹 베이 위까지 내려오는 시간 */
  descend: 1.7,
  /** 내려앉은 뒤 뚜껑이 열리는 시간 */
  open: 0.35,
  /** 첫 상자가 튀어나오는 때 · 다음 상자까지 간격 */
  firstOut: 2.0,
  gap: 0.24,
  /** 마지막 상자가 나간 뒤 머무는 시간 · 다시 떠오르는 시간 */
  hold: 0.7,
  lift: 1.5,
} as const

/** 한 캡슐에 담는 상자 수 · 같은 캡슐로 묶는 신청 간격(ms) */
const PER_CAPSULE = 4
const JOIN_WINDOW_MS = 600
/** 줄 선 캡슐이 이만큼이면 더 싣지 않는다 — 오래 안 본 뒤 한꺼번에 들어온 많은 이슈는 나머지가 제자리에 바로 나타난다 */
const MAX_CAPSULES = 3

/** 캡슐이 내려앉는 자리(월드 좌표) — 도킹 베이 모듈 바로 위 */
export const CARGO_LAND = { x: DOCK.x * WORLD_SCALE, y: (HULL_Y + DOCK.radius + 1.9) * WORLD_SCALE, z: DOCK.z * WORLD_SCALE } as const

export interface Capsule {
  id: number
  /** 출발 시각(performance.now, ms) */
  start: number
  /** 담은 상자 수 */
  count: number
}

export const cargoFx = { capsules: [] as Capsule[], nextId: 1 }

/** 캡슐이 다 떠나는 시각(ms) */
export function capsuleEnd(c: Capsule): number {
  return c.start + (CARGO_T.firstOut + (c.count - 1) * CARGO_T.gap + CARGO_T.hold + CARGO_T.lift) * 1000
}

/** 다음 캡슐이 출발해도 되는 시각 — 앞 캡슐이 상자를 다 내보내고 떠오르기 시작할 때 */
function liftAt(c: Capsule): number {
  return capsuleEnd(c) - CARGO_T.lift * 1000
}

/** 상자 하나의 자리를 캡슐에 신청한다 — 그 상자가 캡슐에서 튀어나올 시각(ms), 캡슐이 꽉 찼으면 0(바로 나타난다)을 돌려준다 */
export function requestCargo(): number {
  const now = performance.now()
  const last = cargoFx.capsules.at(-1)
  let c = last && last.count < PER_CAPSULE && now - last.start < JOIN_WINDOW_MS ? last : undefined
  if (!c) {
    if (cargoFx.capsules.length >= MAX_CAPSULES) return 0
    c = { id: cargoFx.nextId++, start: last ? Math.max(now, liftAt(last)) : now, count: 0 }
    cargoFx.capsules.push(c)
  }
  const at = c.start + (CARGO_T.firstOut + c.count * CARGO_T.gap) * 1000
  c.count++
  return at
}
