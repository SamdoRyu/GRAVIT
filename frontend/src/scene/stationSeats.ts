// 데모 store 팀원 → 정거장 자리표. 소유: C.
// 화면은 아직 데모 모델(Member.deskId 'A1'…)을 쓴다. 화면이 v1 Snapshot으로 옮겨 가면 SceneModel의 deskSeats(MemberDto.deskIndex)로 바꾸고 이 파일을 지운다.
import type { Id, Member } from '../data/types'
import { OFFICE } from '../office/layout'
import { ALWAYS_SHOWN_PODS, PODS } from '../theme/station/geometry'
import { createStationLayout } from '../theme/station/stationLayout'
import type { ThemeLayout } from './model/types'

/** memberId → deskIndex. 데모 책상 순서를 자리 번호로 쓰고, 포드가 없는 번호(8 · 9)는 자리가 없는 팀원으로 본다. */
export function demoSeats(members: Record<Id, Member>): Map<Id, number> {
  const seats = new Map<Id, number>()
  for (const m of Object.values(members)) {
    const i = OFFICE.desks.findIndex((d) => d.id === m.deskId)
    if (i >= 0 && i < PODS.length) seats.set(m.id, i)
  }
  return seats
}

/** 그릴 포드: 0~3은 늘, 4~7은 앉은 팀원이 있을 때만(CONTRACTS.md 「10」) */
export function podsShown(seats: ReadonlyMap<Id, number>): Set<number> {
  const shown = new Set<number>()
  for (let i = 0; i < ALWAYS_SHOWN_PODS; i++) shown.add(i)
  for (const i of seats.values()) shown.add(i)
  return shown
}

let cached: { members: Record<Id, Member>; layout: ThemeLayout; seats: Map<Id, number> } | null = null
/** members 객체가 같으면 같은 레이아웃을 돌려준다(store는 바뀔 때만 새 객체를 만든다) */
export function stationFor(members: Record<Id, Member>): { layout: ThemeLayout; seats: Map<Id, number> } {
  if (cached?.members !== members) {
    const seats = demoSeats(members)
    cached = { members, layout: createStationLayout(seats), seats }
  }
  return cached
}
