// 우주정거장 ThemeLayout — 공간 역할 → 좌표 · 드롭 구역 (CONTRACTS.md 「8」). 소유: C.
// 도메인 규칙(무엇이 어느 역할인지)은 SceneModel이 정한다. 여기는 그 역할이 정거장의 어디인지만 안다.
import type { PlaceRole, ThemeLayout, Vec3 } from '../../scene/model/types'
import { ARCHIVE, BRIDGE, CARGO_PITCH, CARGO_STACK, COMM_HUB, DOCK, POD, PODS, REQ_DECK, REQ_PLATE, REQ_PLATE_SLOTS, reqPlateCenter, SCANNER, WORLD_SCALE, type Pod } from './geometry'

/** 포드 하나의 작업 상자 칸: 열(포드 축을 따라 허브 쪽으로) × 층 */
const POD_COLUMNS = 3
const POD_LAYERS = 3
/** 회의 탁자 둘레 안건 자리(시안의 6칸 각도, 도) — 바깥 고리 다음 안쪽 고리 */
const AGENDA_ANGLES = [165, 225, 285, 345, 45, 105]
const AGENDA_RINGS = [2.0, 1.0]

const DESK_PREFIX = 'desk:'
const REQUIREMENT_PREFIX = 'requirement:'
/** 판 위(바닥에서 조금 띄운) 높이 — 이름표 · 드롭 빛의 기준 */
const PLATE_TOP = REQ_DECK.deckY + 0.12

/** 줄 단위로 채우고, 칸이 다 차면 그 위 층으로 올린다 */
function grid(index: number, slots: number, place: (slot: number) => [number, number], baseY: number): Vec3 {
  const [x, z] = place(index % slots)
  return [x, baseY + Math.floor(index / slots) * CARGO_STACK, z]
}

function podCargo(pod: Pod, index: number): Vec3 {
  // 콘솔 반대쪽(허브 쪽)으로 열을 늘리고, 한 열은 POD_LAYERS층까지 쌓는다. 넘치면 마지막 열에 계속 쌓는다.
  const column = Math.min(Math.floor(index / POD_LAYERS), POD_COLUMNS - 1)
  const layer = index - column * POD_LAYERS
  const step = -pod.outward * column * CARGO_PITCH
  const x = pod.cargo.x + (pod.axis === 'x' ? step : 0)
  const z = pod.cargo.z + (pod.axis === 'z' ? step : 0)
  return [x, POD.deckY + layer * CARGO_STACK, z]
}

function agendaSlot(index: number): Vec3 {
  const perRing = AGENDA_ANGLES.length
  const ring = Math.floor(index / perRing) % AGENDA_RINGS.length
  const layer = Math.floor(index / (perRing * AGENDA_RINGS.length))
  const a = (AGENDA_ANGLES[index % perRing] * Math.PI) / 180
  const r = AGENDA_RINGS[ring]
  return [BRIDGE.x + Math.cos(a) * r, BRIDGE.tableTopY + layer * CARGO_STACK, BRIDGE.z + Math.sin(a) * r]
}

/** 포드가 차지하는 바닥 사각형(위에서 본 모양) 안에 점이 있는가 */
function insidePod(pod: Pod, x: number, z: number): boolean {
  const along = pod.axis === 'x' ? x - pod.x : z - pod.z
  const across = pod.axis === 'x' ? z - pod.z : x - pod.x
  return Math.abs(along) <= POD.length / 2 + POD.capLength && Math.abs(across) <= POD.outerRadius
}

/** 축 방향 원통 모듈의 바닥 사각형 */
function insideModule(m: { x: number; z: number; radius: number; length: number }, axis: 'x' | 'z', x: number, z: number): boolean {
  const along = axis === 'x' ? x - m.x : z - m.z
  const across = axis === 'x' ? z - m.z : x - m.x
  return Math.abs(along) <= m.length / 2 + m.radius * 0.42 && Math.abs(across) <= m.radius
}

/** 판 자리 slot의 중심(월드 단위) — 요구사항이 없는 자리 · 대기 칸도 같은 자리에 그린다 */
export function reqPlateAnchor(slot: number): Vec3 {
  const { x, z } = reqPlateCenter(slot)
  return [x * WORLD_SCALE, PLATE_TOP * WORLD_SCALE, z * WORLD_SCALE]
}

/** 점이 판 자리 위인가(판 둘레 조금 넉넉히) — 판 번호, 아니면 -1 */
function plateAt(x: number, z: number, slots: number): number {
  for (let i = 0; i < slots; i++) {
    const c = reqPlateCenter(i)
    if (Math.abs(x - c.x) <= REQ_PLATE.width / 2 + 0.2 && Math.abs(z - c.z) <= REQ_PLATE.depth / 2 + 0.2) return i
  }
  return -1
}

/**
 * @param seats memberId → deskIndex(0~7). 3D에 자리가 있는 팀원만 넣는다(SceneModel `isSeated`).
 * @param plates 요구사항 데크 판 자리 순서의 requirementId 또는 'waiting'(stationScene `deckPlan`의 places). 판 위가 그 요구사항
 *   구역(`requirement:<id>`) · 대기 칸(`requirement:waiting`)이다. 요구사항이 없는 빈 판은 드롭 구역이 아니다(CONTRACTS.md 「8」).
 */
export function createStationLayout(seats: ReadonlyMap<string, number>, plates: readonly string[] = []): ThemeLayout {
  const memberAt = new Map<number, string>()
  for (const [memberId, deskIndex] of seats) memberAt.set(deskIndex, memberId)
  const plateOf = new Map(plates.slice(0, REQ_PLATE_SLOTS).map((id, i) => [id, i]))

  function podOfMember(memberId: string): Pod {
    const deskIndex = seats.get(memberId)
    const pod = deskIndex === undefined ? undefined : PODS[deskIndex]
    // SceneModel은 자리가 없는 팀원에게 desk 역할을 주지 않는다 — 여기 오면 호출 쪽 버그다.
    if (!pod) throw new Error(`stationLayout: ${memberId}의 작업 포드가 없어요`)
    return pod
  }

  /** 시안 단위 자리 */
  function slot(role: PlaceRole, index: number): Vec3 {
    if (role.startsWith(DESK_PREFIX)) return podCargo(podOfMember(role.slice(DESK_PREFIX.length)), index)
    if (role.startsWith(REQUIREMENT_PREFIX)) {
      // 요구사항 구역 = 데크의 판 하나. 이슈 상자는 구역에 놓이지 않는다(연결해도 제자리 — CONTRACTS.md 「8」), index는 쓰지 않는다.
      const plate = plateOf.get(role.slice(REQUIREMENT_PREFIX.length))
      if (plate === undefined) throw new Error(`stationLayout: ${role}은 데크에 판이 없어요`)
      const { x, z } = reqPlateCenter(plate)
      return [x, PLATE_TOP, z]
    }
    switch (role) {
      case 'backlog': // 도킹 베이 바닥: 2열 × 8줄
        return grid(index, 16, (s) => [DOCK.x + 0.9 + (s % 2) * 1.5, DOCK.z - 5.4 + Math.floor(s / 2) * 1.5], DOCK.deckY)
      case 'review': // 스캐너 터널 바닥: 한 줄 9칸
        return grid(index, 9, (s) => [SCANNER.x - 6.5 + s * 1.6, SCANNER.z], SCANNER.floorY)
      case 'done': // 아카이브 바닥: 2열 × 7줄
        return grid(index, 14, (s) => [ARCHIVE.x + 0.6 + (s % 2) * 1.3, ARCHIVE.z - 3.4 + Math.floor(s / 2) * 1.25], ARCHIVE.deckY)
      case 'meeting':
        return agendaSlot(index)
      case 'board': // 통신 허브 게시 선반: 한 줄 7칸
        return grid(index, 7, (s) => [COMM_HUB.x - 3.3 + s * 1.05, COMM_HUB.shelf.z], COMM_HUB.shelf.y)
      default:
        throw new Error(`stationLayout: ${role} 구역은 없어요`)
    }
  }

  return {
    anchor(role: PlaceRole, index: number): Vec3 {
      const [x, y, z] = slot(role, index)
      return [x * WORLD_SCALE, y * WORLD_SCALE, z * WORLD_SCALE]
    },

    dropZoneAt([wx, , wz]: Vec3): PlaceRole | null {
      const x = wx / WORLD_SCALE
      const z = wz / WORLD_SCALE
      for (const [deskIndex, memberId] of memberAt) {
        const pod = PODS[deskIndex]
        if (pod && insidePod(pod, x, z)) return `${DESK_PREFIX}${memberId}`
      }
      if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) <= BRIDGE.radius) return 'meeting'
      const plate = plateAt(x, z, Math.min(plates.length, REQ_PLATE_SLOTS))
      if (plate >= 0) return `${REQUIREMENT_PREFIX}${plates[plate]}`
      if (insideModule(DOCK, 'z', x, z)) return 'backlog'
      return null
    },
  }
}
