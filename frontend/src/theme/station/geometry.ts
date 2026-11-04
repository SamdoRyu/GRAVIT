// 우주정거장 테마의 좌표 — 확정 시안 public/station/js/scene/station.js의 값을 옮긴 것. 소유: C.
// 단위는 시안과 같다(x → 동, z → 남, y 위). 시안 원본은 고치지 않는다.
// 포드 4~7(시안에 없음)은 2026-11-04 결정: 시안 포드와 같은 모델을 남북 방향으로 넘패드 9 · 1 · 3 · 7 자리에 둔다.

/** 모듈 축의 높이 */
export const HULL_Y = 3.2

/** 컷어웨이 원통 모듈 바닥 높이 — 시안 module()의 deckY */
const deckY = (radius: number) => HULL_Y - radius * 0.55 + 0.08

export type Axis = 'x' | 'z'

export interface Pod {
  /** 포드 중심 */
  x: number
  z: number
  axis: Axis
  /** 콘솔이 있는 바깥쪽 끝 방향(축을 따라 +1 / -1) */
  outward: 1 | -1
  /** 승무원(아바타)이 서는 자리와 바라보는 방향(라디안, 0 = +z) */
  crew: { x: number; z: number; facing: number }
  /** 작업 상자 첫 자리 */
  cargo: { x: number; z: number }
}

export const POD = {
  radius: 2.5,
  length: 6,
  /** 끝 캡이 축 방향으로 더 나온 길이 */
  capLength: 1.05,
  /** 띠까지 포함한 바깥 반지름 */
  outerRadius: 2.64,
  deckY: deckY(2.5),
} as const

const CREW_FACING = Math.PI / 4

/** 북쪽 줄 포드(콘솔이 북쪽) — 시안 K 포드의 상대 위치 */
function northPod(x: number, z: number): Pod {
  return { x, z, axis: 'z', outward: -1, crew: { x: x - 0.7, z: z + 1.0, facing: CREW_FACING }, cargo: { x: x + 1.2, z: z - 0.4 } }
}
/** 남쪽 줄 포드(콘솔이 남쪽) — 시안 C 포드의 상대 위치 */
function southPod(x: number, z: number): Pod {
  return { x, z, axis: 'z', outward: 1, crew: { x: x + 0.7, z: z - 0.9, facing: CREW_FACING }, cargo: { x: x - 1.2, z: z + 0.5 } }
}

export const HUB = { x: 28, z: 30, radius: 2.9 } as const

/**
 * deskIndex → 포드. 넘패드로 보면 허브가 5.
 * 0~3은 시안 포드 K(8) · L(6) · P(4) · C(2). 4~7은 9 · 1 · 3 · 7(2026-11-04 결정) — 화면 양옆부터 대칭으로 채우고,
 * 카메라에서 가장 먼 7은 마지막에 쓴다.
 */
export const PODS: readonly Pod[] = [
  northPod(28, 23.8),
  { x: 34.2, z: 30, axis: 'x', outward: 1, crew: { x: 33.4, z: 30.7, facing: CREW_FACING }, cargo: { x: 34.8, z: 28.8 } },
  { x: 21.8, z: 30, axis: 'x', outward: -1, crew: { x: 22.6, z: 30.7, facing: CREW_FACING }, cargo: { x: 21.4, z: 28.8 } },
  southPod(28, 36.2),
  northPod(HUB.x + 5.75, HUB.z - 9.75),
  southPod(HUB.x - 5.75, HUB.z + 9.75),
  southPod(HUB.x + 5.75, HUB.z + 9.75),
  northPod(HUB.x - 5.75, HUB.z - 9.75),
]

/** 시안 포드 0~3은 앉은 팀원이 없어도 그리고, 4~7은 자리를 쓰는 팀원이 있을 때만 그린다(CONTRACTS.md 「10」). */
export const ALWAYS_SHOWN_PODS = 4

/** A. 지휘 브리지 — 회의실 */
export const BRIDGE = { x: 12, z: 12, radius: 7.2, floorY: 0.2, tableTopY: 1.38 } as const
/** B. 통신 허브 — 공용 게시 공간 */
export const COMM_HUB = { x: 30.5, z: 7.5, radius: 3.4, length: 11, deckY: deckY(3.4), shelf: { z: 5.35, y: deckY(3.4) + 0.5 } } as const
/** C. 화물 도킹 베이 — 백로그 선반 */
export const DOCK = { x: 9.5, z: 33, radius: 4.2, length: 14, deckY: deckY(4.2) } as const
/** E. 스캐너 터널 — 검토 영역 */
export const SCANNER = { x: 48, z: 29, radius: 2.6, length: 16, floorY: HULL_Y - 2.6 * 0.62 + 0.15 } as const
/** G. 아카이브 화물칸 — 완료 선반 */
export const ARCHIVE = { x: 47, z: 4.5, radius: 3.6, length: 9, deckY: deckY(3.6) } as const

/** 화물 한 칸의 간격(크기 약 1) */
export const CARGO_PITCH = 1.3
export const CARGO_STACK = 1.05
