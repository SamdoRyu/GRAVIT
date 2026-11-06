// WorkspaceSnapshot → SceneEntity[] 순수 함수 (CONTRACTS.md 「8」). 테마를 모른다 — 좌표 · 가구 · three 없음.
// 지금은 팀원 아바타(#10), 이슈 · PR의 상태별 자리(#11), 막힘 강조(#23), PR 평가 결과 배지(#21), 회의실의 안건(#30 · #26)을 만든다. 안건(#26 · #30), 요구사항(#15) 등은 각 Issue에서 더한다.
// 안건 · 요구사항 연결은 원본 이슈 · PR의 자리(placeRole)를 바꾸지 않는다(CONTRACTS.md 「3」 · 「8」).
import type { AgendaItemDto, AgendaKind, MemberDto, SubmissionDto, TaskDto, WorkspaceSnapshot } from '../../data/types'
import type { PlaceRole, SceneEntity, SceneEntityKind } from './types'

/** 화면 배지 값 — 그리는 쪽이 모양을 정한다 */
export const BADGE = {
  /** 서버가 막혔다고 계산한 이슈 · PR (FR-FLOW-02) — 막혔다는 사실만, 이유 문구 없음(2026-10-29 결정) */
  blocked: 'blocked',
  /** Draft PR (구현 기본값 — 검토 공간 + Draft 배지) */
  draft: 'draft',
  /** 머지되지 않고 닫힌 PR (구현 기본값 — 완료 공간 + 미병합 종료 표시) */
  unmergedClosed: 'unmerged_closed',
  /** "계획 안 함"으로 닫힌 이슈 (구현 기본값 — 닫힘 사유로 완료 · 종료 구분) */
  notPlanned: 'not_planned',
  /** 현재 회차 추천 수 — `countBadge(BADGE.recommend, n)` 모양으로 붙는다 (FR-LRN-03) */
  recommend: 'recommend',
  /** 현재 회차 비추천 수 — `countBadge(BADGE.notRecommend, n)` */
  notRecommend: 'not_recommend',
} as const

/** 수를 담는 배지 — `<배지>:<수>`, 예: 'recommend:2'. 그리는 쪽이 모양을 정한다. */
export const countBadge = (badge: typeof BADGE.recommend | typeof BADGE.notRecommend, count: number): string => `${badge}:${count}`

const deskRole = (memberId: string): PlaceRole => `desk:${memberId}`

/** 3D에 자리가 있는 팀원 — 지금 팀원이고 책상 자리가 있다. 빠진 팀원 · 자리가 없는 팀원은 3D에 없다(CONTRACTS.md 「10」). */
export const isSeated = (m: MemberDto): boolean => m.removedAt === null && m.deskIndex !== null

/** memberId → deskIndex, 3D에 자리가 있는 팀원만. ThemeLayout이 desk:<memberId>를 자리로 바꿀 때 쓴다. */
export function deskSeats(members: readonly MemberDto[]): Map<string, number> {
  const seats = new Map<string, number>()
  for (const m of members) if (isSeated(m) && m.deskIndex !== null) seats.set(m.id, m.deskIndex)
  return seats
}

/**
 * 막힘 강조(FR-FLOW-02). 막힘은 서버 계산 값(TaskDto · SubmissionDto.isBlocked, flow.blockedMemberIds)을 그대로 쓴다 —
 * 화면이 다시 판단하지 않는다(CONTRACTS.md 「8」). 강조는 자리(placeRole)를 바꾸지 않는다.
 */
const blockedHighlight = (blocked: boolean): Pick<SceneEntity, 'highlight'> => (blocked ? { highlight: 'blocked' } : {})

/** 아바타는 강조만 한다 — 배지 없음(막힌 도형 쪽에 막힘 배지가 붙는다) */
function avatarEntity(m: MemberDto, blockedMembers: ReadonlySet<string>): SceneEntity {
  return { key: `member:${m.id}`, kind: 'avatar', refId: m.id, placeRole: deskRole(m.id), badges: [], ...blockedHighlight(blockedMembers.has(m.id)) }
}

/**
 * 이슈의 자리(CONTRACTS.md 「3」): 닫힘 → done, 열림 · 담당자 없음 → backlog, 열림 · 담당자 있음 → 대표 담당자의 책상.
 * 대표 담당자 = assigneeMemberIds[0](서버가 정렬해 보낸다 — 화면은 GitHub ID를 비교하지 않는다).
 * 대표 담당자에게 책상 자리가 없으면 backlog(2026-11-04 결정).
 */
export function taskPlaceRole(task: TaskDto, seated: ReadonlySet<string>): PlaceRole {
  if (task.state === 'closed') return 'done'
  const lead = task.assigneeMemberIds[0]
  return lead !== undefined && seated.has(lead) ? deskRole(lead) : 'backlog'
}

/** PR의 자리(CONTRACTS.md 「3」): 열림 · Draft → review, 머지 · 닫힘 → done */
export function submissionPlaceRole(submission: SubmissionDto): PlaceRole {
  return submission.state === 'open' || submission.state === 'draft' ? 'review' : 'done'
}

function taskEntity(t: TaskDto, seated: ReadonlySet<string>): SceneEntity {
  const badges: string[] = []
  if (t.isBlocked) badges.push(BADGE.blocked)
  if (t.state === 'closed' && t.closedReason === 'not_planned') badges.push(BADGE.notPlanned)
  return { key: `task:${t.id}`, kind: 'issue', refId: t.id, placeRole: taskPlaceRole(t, seated), badges, ...blockedHighlight(t.isBlocked) }
}

function submissionEntity(s: SubmissionDto): SceneEntity {
  const badges: string[] = []
  if (s.isBlocked) badges.push(BADGE.blocked)
  if (s.state === 'draft') badges.push(BADGE.draft)
  if (s.state === 'closed') badges.push(BADGE.unmergedClosed)
  // 평가 결과(FR-LRN-03): 현재 회차의 추천 · 비추천 수만. 이전 회차 · 이유 · 평가자는 담지 않는다(익명 — CONTRACTS.md 「5」).
  // 닫힌 PR도 마지막 회차를 보인다(currentRound가 그대로 온다). 회차가 없으면 배지가 없다.
  const round = s.currentRound
  if (round) badges.push(countBadge(BADGE.recommend, round.recommendCount), countBadge(BADGE.notRecommend, round.notRecommendCount))
  return { key: `submission:${s.id}`, kind: 'pr', refId: s.id, placeRole: submissionPlaceRole(s), badges, ...blockedHighlight(s.isBlocked) }
}

/** 안건 종류 → 회의실에 놓일 모양의 종류 (CONTRACTS.md 「8」 — 이슈 안건은 issue 모양) */
const AGENDA_SHAPE: Record<AgendaKind, SceneEntityKind> = { issue: 'issue', pr: 'pr', help_request: 'help', learning: 'learning', other: 'other' }

/**
 * 회의실의 안건(CONTRACTS.md 「8」): 결정 전(`confirmed`) 안건마다 하나, key는 `agenda:<agendaItemId>`, 자리는 meeting.
 * 원본 이슈 · PR의 엔티티는 따로 제자리에 있다 — 안건은 원본의 자리를 바꾸지 않는다. 결정했거나 거둔 안건은 회의실에 없다.
 */
function agendaEntity(a: AgendaItemDto): SceneEntity {
  return { key: `agenda:${a.id}`, kind: AGENDA_SHAPE[a.kind], refId: a.id, placeRole: 'meeting', badges: [] }
}

export function buildSceneModel(snapshot: WorkspaceSnapshot): SceneEntity[] {
  const seatedMembers = snapshot.members.filter(isSeated)
  const seated = new Set(seatedMembers.map((m) => m.id))
  const blockedMembers = new Set(snapshot.flow.blockedMemberIds)
  return [
    ...seatedMembers.map((m) => avatarEntity(m, blockedMembers)),
    ...snapshot.tasks.map((t) => taskEntity(t, seated)),
    ...snapshot.submissions.map(submissionEntity),
    ...snapshot.agendaItems.filter((a) => a.status === 'confirmed').map(agendaEntity),
  ]
}
