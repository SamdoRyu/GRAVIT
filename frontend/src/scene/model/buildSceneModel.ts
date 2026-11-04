// WorkspaceSnapshot → SceneEntity[] 순수 함수 (CONTRACTS.md 「8」). 테마를 모른다 — 좌표 · 가구 · three 없음.
// 지금은 팀원 아바타(#10)만 만든다. 이슈 · PR(#11), 안건(#26 · #30), 요구사항(#15) 등은 각 Issue에서 더한다.
import type { MemberDto, WorkspaceSnapshot } from '../../data/types'
import type { PlaceRole, SceneEntity } from './types'

const deskRole = (memberId: string): PlaceRole => `desk:${memberId}`

/** 3D에 자리가 있는 팀원 — 지금 팀원이고 책상 자리가 있다. 빠진 팀원 · 자리가 없는 팀원은 3D에 없다(CONTRACTS.md 「10」). */
export const isSeated = (m: MemberDto): boolean => m.removedAt === null && m.deskIndex !== null

/** memberId → deskIndex, 3D에 자리가 있는 팀원만. ThemeLayout이 desk:<memberId>를 자리로 바꿀 때 쓴다. */
export function deskSeats(members: readonly MemberDto[]): Map<string, number> {
  const seats = new Map<string, number>()
  for (const m of members) if (isSeated(m) && m.deskIndex !== null) seats.set(m.id, m.deskIndex)
  return seats
}

function avatarEntity(m: MemberDto): SceneEntity {
  return { key: `member:${m.id}`, kind: 'avatar', refId: m.id, placeRole: deskRole(m.id), badges: [] }
}

export function buildSceneModel(snapshot: WorkspaceSnapshot): SceneEntity[] {
  return snapshot.members.filter(isSeated).map(avatarEntity)
}
