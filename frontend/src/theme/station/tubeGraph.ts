// 정거장 통로 그래프 — 아바타 이동 빛 점의 길 (CONTRACTS.md 「10」 아바타 이동 연출 · 「8」 ThemeLayout.route). 소유: C.
// 모듈 축과 연결 통로(geometry TUBES · EXTRA_POD_TUBES)의 중심선을 이은 작은 그래프다. 단위는 시안(x · z 평면).
// 길은 축을 따라 꺾이고, 둥근 방(허브 · 지휘 브리지) 안에서만 곧게 간다.
import { BRIDGE, COMM_HUB, DOCK, HUB, PODS } from './geometry'

export interface GraphPoint {
  x: number
  z: number
}

/** 노드 이름 → 자리. 포드는 `pod0` ~ `pod7`(PODS의 중심), 회의실은 `bridge`. */
const NODES: Record<string, GraphPoint> = {
  hub: { x: HUB.x, z: HUB.z },
  bridge: { x: BRIDGE.x, z: BRIDGE.z },
  // 포드 K(0) → 통신 허브 → 지휘 브리지 (TUBES: z 10.8~19.8 at x 28, x 18.4~25 at z 7.5)
  k21: { x: 28, z: 21.5 },
  kNorth: { x: 28, z: 19.8 },
  commSouth: { x: 28, z: 10.8 },
  comm28: { x: 28, z: COMM_HUB.z },
  commWest: { x: 25, z: COMM_HUB.z },
  bridgeEast: { x: 18.4, z: COMM_HUB.z },
  // 포드 P(2) → 도킹 베이 → 지휘 브리지 (TUBES: x 13.6~17.6 at z 30, z 18.8~24.6 at x 9.5)
  pWest: { x: 17.6, z: 30 },
  dockEast: { x: 13.6, z: 30 },
  dock30: { x: DOCK.x, z: 30 },
  dockNorth: { x: DOCK.x, z: 24.6 },
  bridgeSouth: { x: DOCK.x, z: 18.8 },
  // 추가 포드 4 · 7은 포드 K 옆(z 21.5), 5 · 6은 포드 C 옆(z 38.5) — EXTRA_POD_TUBES
  pod4Arm: { x: PODS[4].x, z: 21.5 },
  pod7Arm: { x: PODS[7].x, z: 21.5 },
  c38: { x: 28, z: 38.5 },
  pod5Arm: { x: PODS[5].x, z: 38.5 },
  pod6Arm: { x: PODS[6].x, z: 38.5 },
}
PODS.forEach((p, i) => (NODES[`pod${i}`] = { x: p.x, z: p.z }))

const EDGES: readonly [string, string][] = [
  // 시안 포드 네 개는 허브에 바로 붙어 있다
  ['pod0', 'hub'],
  ['pod1', 'hub'],
  ['pod2', 'hub'],
  ['pod3', 'hub'],
  // K → 통신 허브 → 브리지
  ['pod0', 'k21'],
  ['k21', 'kNorth'],
  ['kNorth', 'commSouth'],
  ['commSouth', 'comm28'],
  ['comm28', 'commWest'],
  ['commWest', 'bridgeEast'],
  ['bridgeEast', 'bridge'],
  // P → 도킹 베이 → 브리지
  ['pod2', 'pWest'],
  ['pWest', 'dockEast'],
  ['dockEast', 'dock30'],
  ['dock30', 'dockNorth'],
  ['dockNorth', 'bridgeSouth'],
  ['bridgeSouth', 'bridge'],
  // 추가 포드
  ['k21', 'pod4Arm'],
  ['pod4Arm', 'pod4'],
  ['k21', 'pod7Arm'],
  ['pod7Arm', 'pod7'],
  ['pod3', 'c38'],
  ['c38', 'pod5Arm'],
  ['pod5Arm', 'pod5'],
  ['c38', 'pod6Arm'],
  ['pod6Arm', 'pod6'],
]

const dist = (a: GraphPoint, b: GraphPoint) => Math.hypot(a.x - b.x, a.z - b.z)

const ADJ = new Map<string, { to: string; w: number }[]>()
for (const [a, b] of EDGES) {
  const w = dist(NODES[a], NODES[b])
  ADJ.set(a, [...(ADJ.get(a) ?? []), { to: b, w }])
  ADJ.set(b, [...(ADJ.get(b) ?? []), { to: a, w }])
}

/** 포드 번호의 노드 이름 — 정거장에 없는 번호면 null */
export const podNode = (deskIndex: number): string | null => (PODS[deskIndex] ? `pod${deskIndex}` : null)
export const BRIDGE_NODE = 'bridge'

/**
 * 두 노드 사이의 가장 짧은 길(통로 중심선의 꺾인 점들, 시작 · 끝 포함). 길이 없거나 모르는 노드면 빈 배열.
 * 노드가 스무 개 남짓이라 단순한 다익스트라로 충분하다.
 */
export function shortestPath(from: string, to: string): GraphPoint[] {
  if (!(from in NODES) || !(to in NODES)) return []
  if (from === to) return [NODES[from]]
  const best = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  const open = new Set<string>([from])
  while (open.size > 0) {
    let cur = ''
    let curD = Infinity
    for (const n of open) {
      const d = best.get(n) ?? Infinity
      if (d < curD) {
        cur = n
        curD = d
      }
    }
    open.delete(cur)
    if (cur === to) break
    for (const { to: nx, w } of ADJ.get(cur) ?? []) {
      const d = curD + w
      if (d < (best.get(nx) ?? Infinity)) {
        best.set(nx, d)
        prev.set(nx, cur)
        open.add(nx)
      }
    }
  }
  if (!best.has(to)) return []
  const path: string[] = [to]
  while (path[0] !== from) path.unshift(prev.get(path[0])!)
  return path.map((n) => NODES[n])
}

/** 꺾인 선의 길이 */
export const pathLength = (pts: readonly GraphPoint[]) => pts.reduce((sum, p, i) => (i === 0 ? 0 : sum + dist(pts[i - 1], p)), 0)
