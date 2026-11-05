// v1 사무실 Snapshot → 3D가 그릴 것 (#102 T5-c-2 · #10 · #11). 소유: C.
// 도메인 데이터 → SceneModel(buildSceneModel) → 정거장 ThemeLayout(createStationLayout) — 그리기는 각 컴포넌트가 한다.
import type { MemberDto, WorkspaceSnapshot } from '../data/types'
import { ALWAYS_SHOWN_PODS, PODS } from '../theme/station/geometry'
import { createStationLayout } from '../theme/station/stationLayout'
import { deskSeats, buildSceneModel } from './model/buildSceneModel'
import type { SceneEntity, ThemeLayout } from './model/types'

export interface StationScene {
  /** SceneModel 그대로 */
  entities: SceneEntity[]
  /** memberId → 포드 번호. 정거장에 포드가 있는 팀원만(포드 8개 — CONTRACTS.md 「10」) */
  seats: Map<string, number>
  /** 3D에 아바타가 있는 팀원 (seats 순서 = Snapshot 순서) */
  crew: MemberDto[]
  /** 그릴 포드: 0~3은 늘, 4~7은 앉은 팀원이 있을 때만 */
  pods: Set<number>
  layout: ThemeLayout
}

/** 그릴 포드: 0~3은 늘, 4~7은 앉은 팀원이 있을 때만(CONTRACTS.md 「10」 작업 포드 표시) */
export function podsShown(seats: ReadonlyMap<string, number>): Set<number> {
  const shown = new Set<number>()
  for (let i = 0; i < ALWAYS_SHOWN_PODS; i++) shown.add(i)
  for (const i of seats.values()) shown.add(i)
  return shown
}

/**
 * Snapshot → StationScene. 순수 함수.
 * 포드 번호가 정거장 포드 수를 넘는 팀원(deskIndex 8 · 9)은 3D에 없고, 그 팀원이 대표 담당인 이슈는 도킹 베이(backlog)에 둔다 —
 * 포드가 없는 팀원의 이슈와 같다(2026-11-04 결정).
 */
export function stationSceneOf(snapshot: WorkspaceSnapshot): StationScene {
  const seats = new Map([...deskSeats(snapshot.members)].filter(([, i]) => i < PODS.length))
  const entities = buildSceneModel(snapshot).map((e) =>
    e.placeRole.startsWith('desk:') && e.kind !== 'avatar' && !seats.has(e.placeRole.slice('desk:'.length)) ? { ...e, placeRole: 'backlog' as const } : e,
  )
  const crew = snapshot.members.filter((m) => seats.has(m.id))
  return { entities: entities.filter((e) => e.kind !== 'avatar' || seats.has(e.refId ?? '')), seats, crew, pods: podsShown(seats), layout: createStationLayout(seats) }
}

let cached: { snapshot: WorkspaceSnapshot; scene: StationScene } | null = null
/** 같은 Snapshot 객체면 같은 StationScene을 돌려준다(store는 다시 읽을 때만 새 객체를 만든다) */
export function stationSceneFor(snapshot: WorkspaceSnapshot): StationScene {
  if (cached?.snapshot !== snapshot) cached = { snapshot, scene: stationSceneOf(snapshot) }
  return cached.scene
}

