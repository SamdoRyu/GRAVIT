// 우주정거장 테마의 좌표 — 확정 시안 public/station/js/scene/station.js의 값을 옮긴 것. 소유: C.
// 단위는 시안과 같다(x → 동, z → 남, y 위). 시안 원본은 고치지 않는다.
// 포드 4~7(시안에 없음)은 2026-11-04 결정: 시안 포드와 같은 모델을 남북 방향으로 넘패드 9 · 1 · 3 · 7 자리에 둔다.

/**
 * 시안 단위 → 화면 월드 단위. 시안 정거장은 이전 사무실보다 약 2.4배 커서, 정거장을 줄여 상자 · 아바타 · 카메라 · 드래그의
 * 기존 크기를 그대로 쓴다. 이 파일의 값은 모두 시안 단위이고, ThemeLayout과 테마 컴포넌트가 바깥으로 낼 때만 곱한다.
 */
export const WORLD_SCALE = 0.42

/** 정거장이 차지하는 범위(시안 단위) — 카메라 맞춤용 */
// maxZ: 도킹 링(z 41.8) 앞에 가로로 붙은 우주선(scene/DockShip.tsx — 동체 축 z 45.7, 날개 끝 z 48.5)까지
export const STATION_BOUNDS = { minX: 0, maxX: 56, minY: -3, maxY: 11, minZ: 0, maxZ: 49 } as const

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

/**
 * H. 요구사항 데크 — 시안에 없는 모듈(요구사항 구역은 Must — CLAUDE.md 「디자인 테마」). 스캐너 남쪽 빈자리에 시안의 컷어웨이
 * 모듈을 하나 더 두고 스캐너와 통로로 잇는다(2026-11-06 결정 — A안 + 태양전지 판). 정거장 범위(STATION_BOUNDS) 안이다.
 */
export const REQ_DECK = { x: 47.5, z: 38.6, radius: 3.4, length: 13, deckY: deckY(3.4) } as const

/**
 * 데크 바닥의 요구사항 판 자리: 2줄 × 5칸, 앞줄(북쪽, 스캐너 쪽)부터 서쪽 → 동쪽. 판 하나 = 시안 panel()(크림 틀 + 남색 판 +
 * 격자)을 바닥에 눕힌 것. 판 수는 요구사항 수에 따라 5~10장(stationScene `deckPlan`).
 */
export const REQ_PLATE = { columns: 5, rows: 2, pitchX: 2.45, rowZ: [-1.15, 1.15], width: 2.05, depth: 1.75 } as const
export const REQ_PLATE_SLOTS = REQ_PLATE.columns * REQ_PLATE.rows

/** 판 자리 i의 중심(시안 단위, 바닥 높이) */
export function reqPlateCenter(slot: number): { x: number; z: number } {
  const col = slot % REQ_PLATE.columns
  const row = Math.floor(slot / REQ_PLATE.columns) % REQ_PLATE.rows
  return { x: REQ_DECK.x + (col - (REQ_PLATE.columns - 1) / 2) * REQ_PLATE.pitchX, z: REQ_DECK.z + REQ_PLATE.rowZ[row] }
}

/** F. 발사 대기 거치대 — 장식(머지 준비 상태는 계약에 없다) */
export const LAUNCH_RACK = { x: 47, z: 17.6, y: 2.0 } as const

/** 지휘 브리지 회의 좌석: 탁자 둘레 각도(도), 반지름 — 시안 bridge 모드 승무원 자리에서 넓힘 */
export const BRIDGE_SEATS = { radius: 5.6, angles: [70, 20, 200, 250, 120, 330, 160, 290, 45, 225] } as const

/**
 * 지휘 브리지 쓰레기통(#291 — 올린 안건을 끌어다 놓아 철회): 탁자 가장자리(3.3)와 좌석(5.6) 사이, 좌석 70° · 120° 사이 빈자리
 * (각도 · 반지름은 BRIDGE_SEATS와 같은 규칙). 크기는 탁자 윗면(tableTopY)보다 낮아 안건을 가리지 않는다. catchRadius = 놓을 수 있는 범위
 */
export const BRIDGE_TRASH = { angle: 95, radius: 4.3, height: 0.95, catchRadius: 1.3 } as const

/** 쓰레기통 중심(시안 단위, 바닥 높이) */
export function bridgeTrashCenter(): { x: number; y: number; z: number } {
  const a = (BRIDGE_TRASH.angle * Math.PI) / 180
  return { x: BRIDGE.x + Math.cos(a) * BRIDGE_TRASH.radius, y: BRIDGE.floorY, z: BRIDGE.z + Math.sin(a) * BRIDGE_TRASH.radius }
}

/** 연결 통로: 축, 시작 · 끝(축 좌표), 다른 축의 위치 — 시안 tube() 목록 + 추가 포드 4~7을 옆 포드에 잇는 짧은 통로 */
export const TUBES: readonly { axis: Axis; from: number; to: number; at: number }[] = [
  { axis: 'x', from: 18.4, to: 25.0, at: 7.5 },
  { axis: 'z', from: 18.8, to: 24.6, at: 9.5 },
  { axis: 'x', from: 13.6, to: 17.6, at: 30 },
  { axis: 'z', from: 10.8, to: 19.8, at: 28 },
  { axis: 'x', from: 38.2, to: 40.2, at: 29.5 },
  { axis: 'z', from: 20.0, to: 26.6, at: 47 },
  { axis: 'z', from: 10.4, to: 15.6, at: 47 },
  // 스캐너 → 요구사항 데크(H)
  { axis: 'z', from: 31.6, to: 35.2, at: REQ_DECK.x },
]
/** 추가 포드 deskIndex → 옆 시안 포드와 잇는 통로(포드가 그려질 때만 그린다) */
export const EXTRA_POD_TUBES: Readonly<Record<number, { axis: Axis; from: number; to: number; at: number }>> = {
  4: { axis: 'x', from: 30.5, to: 31.25, at: 21.5 },
  5: { axis: 'x', from: 24.75, to: 25.5, at: 38.5 },
  6: { axis: 'x', from: 30.5, to: 31.25, at: 38.5 },
  7: { axis: 'x', from: 24.75, to: 25.5, at: 21.5 },
}

/** 화물 한 칸의 간격(크기 약 1) */
export const CARGO_PITCH = 1.3
export const CARGO_STACK = 1.05
