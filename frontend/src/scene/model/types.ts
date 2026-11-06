// SceneModel 타입 — CONTRACTS.md 「8」 SceneModel · ThemeLayout 그대로. 소유: C (프론트 3D).
// 계약을 바꾸지 않는다 — 다르면 문서 담당자에게.

/** 공간 역할. 좌표가 아니라 의미다 — 좌표는 ThemeLayout이 정한다. */
export type PlaceRole =
  | 'backlog'
  | `desk:${string}` // desk:<memberId>
  | 'review'
  | 'done'
  | 'meeting'
  | 'board'
  | `requirement:${string}` // requirement:<requirementId> · 대기 칸은 requirement:waiting(내부 ID는 숫자라 겹치지 않음)

export type SceneEntityKind =
  | 'issue'
  | 'pr'
  | 'help'
  | 'learning'
  | 'other'
  | 'activity'
  | 'avatar'
  | 'requirement'
  | 'requirementGroup'
  | 'board'

export interface SceneEntity {
  /** 종류를 붙인 화면 키 — 'task:42' · 'submission:42' · 'agenda:7' · 'member:3' · 'requirement:5' · 'requirement-group:waiting' · 'board' */
  key: string
  kind: SceneEntityKind
  /** 가리키는 도메인 내부 ID (대기 칸 · 게시판은 null) */
  refId: string | null
  placeRole: PlaceRole
  /** 막힘 · 추천·비추천 수 · 대기 칸 waiting:N · empty:k · Draft · 미병합 종료 · 시연 데이터 등 */
  badges: string[]
  highlight?: 'blocked' | 'recent' | 'dim' | 'focus'
  /** 요구사항 종류(원본 ID 접두사), 없으면 "미분류" — 이름표 · 분류 · 정렬용, 묶음 기준 아님 (2026-11-06) */
  groupKey?: string
}

export type Vec3 = [x: number, y: number, z: number]

/** 공간 역할 → 좌표 · 드롭 구역. 구현은 테마(src/theme/)가 하나만 갖는다. */
export interface ThemeLayout {
  /** 그 역할의 index번째 물건이 놓일 자리(바닥 기준 좌표) */
  anchor(role: PlaceRole, index: number): Vec3
  dropZoneAt(point: Vec3): PlaceRole | null
  /** 아바타 이동 */
  route?(from: PlaceRole, to: PlaceRole): Vec3[]
}
