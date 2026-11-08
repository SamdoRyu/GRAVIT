// v1 사무실 Snapshot → 3D가 그릴 것 (#102 T5-c-2 · #10 · #11 · 요구사항 데크 #16 · #17). 소유: C.
// 도메인 데이터 → SceneModel(buildSceneModel) → 정거장 ThemeLayout(createStationLayout) — 그리기는 각 컴포넌트가 한다.
import type { Id, MemberDto, WorkspaceSnapshot } from '../data/types'
import { ALWAYS_SHOWN_PODS, PODS } from '../theme/station/geometry'
import { createStationLayout } from '../theme/station/stationLayout'
import { deskSeats, buildSceneModel, REQUIREMENT_WAITING_ROLE } from './model/buildSceneModel'
import { DECK_MIN_PLATES } from './model/requirementDeck'
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
  /** 요구사항 데크의 판 배치 */
  deck: DeckPlan
  layout: ThemeLayout
}

/**
 * 요구사항 데크의 판: SceneModel이 판 순서로 낸 요구사항 구역(`requirement:<id>`)과 대기 칸(`requirement:waiting`)을 판 자리
 * 0번부터 놓는다(판 수 · 순서 · 대기 칸 규칙은 SceneModel planRequirementDeck). 남는 자리는 빈 판 — 판 수는 최소 DECK_MIN_PLATES.
 * places = 판 자리 순서의 placeRole 꼬리(요구사항 ID 또는 'waiting'), slots = 그릴 판 자리 수.
 */
export interface DeckPlan {
  slots: number
  places: string[]
}

export function deckPlan(entities: readonly SceneEntity[]): DeckPlan {
  const places = entities
    .filter((e) => e.kind === 'requirement' || e.placeRole === REQUIREMENT_WAITING_ROLE)
    .map((e) => e.placeRole.slice('requirement:'.length))
  return { slots: Math.max(DECK_MIN_PLATES, places.length), places }
}

/** 그릴 포드: 0~3은 늘, 4~7은 앉은 팀원이 있을 때만(CONTRACTS.md 「10」 작업 포드 표시) */
export function podsShown(seats: ReadonlyMap<string, number>): Set<number> {
  const shown = new Set<number>()
  for (let i = 0; i < ALWAYS_SHOWN_PODS; i++) shown.add(i)
  for (const i of seats.values()) shown.add(i)
  return shown
}

/**
 * Snapshot → StationScene. 순수 함수. `deckOrder` = 보는 사람의 요구사항 대기 칸 교환 결과(스토어 requirementDeckOrder — 버리는 규칙은
 * 스토어가 이미 적용, CONTRACTS.md 「8」 요구사항 판 배치). SceneModel 입력으로 그대로 넘긴다.
 * 포드 번호가 정거장 포드 수를 넘는 팀원(deskIndex 8 · 9)은 3D에 없고, 그 팀원이 대표 담당인 이슈는 도킹 베이(backlog)에 둔다 —
 * 포드가 없는 팀원의 이슈와 같다(2026-11-04 결정). 그 팀원의 활동 메모지는 게시판(board)으로 — SceneModel의 자리 없는 작성자 규칙(#173).
 */
export function stationSceneOf(snapshot: WorkspaceSnapshot, deckOrder: readonly Id[] | null = null): StationScene {
  const seats = new Map([...deskSeats(snapshot.members)].filter(([, i]) => i < PODS.length))
  const entities = buildSceneModel(snapshot, deckOrder).map((e) =>
    e.placeRole.startsWith('desk:') && e.kind !== 'avatar' && !seats.has(e.placeRole.slice('desk:'.length))
      ? { ...e, placeRole: e.kind === 'activity' ? ('board' as const) : ('backlog' as const) }
      : e,
  )
  const crew = snapshot.members.filter((m) => seats.has(m.id))
  const deck = deckPlan(entities)
  return {
    entities: entities.filter((e) => e.kind !== 'avatar' || seats.has(e.refId ?? '')),
    seats,
    crew,
    pods: podsShown(seats),
    deck,
    layout: createStationLayout(seats, deck.places),
  }
}

let cached: { snapshot: WorkspaceSnapshot; deckOrder: readonly Id[] | null; scene: StationScene } | null = null
/** 같은 Snapshot · 교환 결과 객체면 같은 StationScene을 돌려준다(store는 바뀔 때만 새 객체를 만든다) */
export function stationSceneFor(snapshot: WorkspaceSnapshot, deckOrder: readonly Id[] | null = null): StationScene {
  if (cached?.snapshot !== snapshot || cached.deckOrder !== deckOrder) cached = { snapshot, deckOrder, scene: stationSceneOf(snapshot, deckOrder) }
  return cached.scene
}

