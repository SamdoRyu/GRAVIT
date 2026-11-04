// 우주정거장 ThemeLayout — 공간 역할 → 좌표 · 드롭 구역 (CONTRACTS.md 「8」). 소유: C.
// 도메인 규칙(무엇이 어느 역할인지)은 SceneModel이 정한다. 여기는 그 역할이 정거장의 어디인지만 안다.
import type { PlaceRole, ThemeLayout, Vec3 } from '../../scene/model/types'
import { ARCHIVE, BRIDGE, CARGO_PITCH, CARGO_STACK, COMM_HUB, DOCK, POD, PODS, SCANNER, type Pod } from './geometry'

/** 포드 하나의 작업 상자 칸: 열(포드 축을 따라 허브 쪽으로) × 층 */
const POD_COLUMNS = 3
const POD_LAYERS = 3
/** 회의 탁자 둘레 안건 자리(시안의 6칸 각도, 도) — 바깥 고리 다음 안쪽 고리 */
const AGENDA_ANGLES = [165, 225, 285, 345, 45, 105]
const AGENDA_RINGS = [2.0, 1.0]

const DESK_PREFIX = 'desk:'

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

/**
 * @param seats memberId → deskIndex(0~7). 3D에 자리가 있는 팀원만 넣는다(SceneModel `isSeated`).
 */
export function createStationLayout(seats: ReadonlyMap<string, number>): ThemeLayout {
  const memberAt = new Map<number, string>()
  for (const [memberId, deskIndex] of seats) memberAt.set(deskIndex, memberId)

  function podOfMember(memberId: string): Pod {
    const deskIndex = seats.get(memberId)
    const pod = deskIndex === undefined ? undefined : PODS[deskIndex]
    // SceneModel은 자리가 없는 팀원에게 desk 역할을 주지 않는다 — 여기 오면 호출 쪽 버그다.
    if (!pod) throw new Error(`stationLayout: ${memberId}의 작업 포드가 없어요`)
    return pod
  }

  return {
    anchor(role: PlaceRole, index: number): Vec3 {
      if (role.startsWith(DESK_PREFIX)) return podCargo(podOfMember(role.slice(DESK_PREFIX.length)), index)
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
          // 요구사항 구역은 시안에 없어 #15에서 정거장 안에 만든다(CLAUDE.md 「디자인 테마」).
          throw new Error(`stationLayout: ${role} 구역은 아직 없어요`)
      }
    },

    dropZoneAt([x, , z]: Vec3): PlaceRole | null {
      for (const [deskIndex, memberId] of memberAt) {
        const pod = PODS[deskIndex]
        if (pod && insidePod(pod, x, z)) return `${DESK_PREFIX}${memberId}`
      }
      if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) <= BRIDGE.radius) return 'meeting'
      if (insideModule(DOCK, 'z', x, z)) return 'backlog'
      return null
    },
  }
}
