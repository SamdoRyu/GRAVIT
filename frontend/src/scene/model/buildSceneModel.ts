// WorkspaceSnapshot → SceneEntity[] 순수 함수 (CONTRACTS.md 「8」). 테마를 모른다 — 좌표 · 가구 · three 없음.
// 지금은 팀원 아바타(#10 — 회의 중이면 회의 공간), 이슈 · PR의 상태별 자리(#11), 막힘 강조(#23), PR 평가 결과 배지(#21), 회의실의 안건(#30 · #26 · #31),
// 요구사항 구역(#16 · #17), 통신 허브 게시판(#205), 확인된 활동 메모지(#173)를 만든다.
// 안건 · 요구사항 연결은 원본 이슈 · PR의 자리(placeRole)를 바꾸지 않는다(CONTRACTS.md 「3」 · 「8」).
import type { ActivityNote, AgendaItemDto, AgendaKind, HelpRequestSummary, Id, MemberDto, RequirementDto, SubmissionDto, TaskDto, WorkspaceSnapshot } from '../../data/types'
import { planRequirementDeck } from './requirementDeck'
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
  /** 대기 칸의 요구사항 수 — `countBadge(BADGE.waiting, n)` (CONTRACTS.md 「8」 대기 칸) */
  waiting: 'waiting',
  /** 대기 칸 안의 빈 구역(연결 이슈 0) 수 — 있을 때만 `countBadge(BADGE.empty, k)` */
  empty: 'empty',
  /** 게시판: 열린 · 논의 중 도움 요청 수 — `countBadge(BADGE.help, n)` (CONTRACTS.md 「8」 게시판, 2026-11-06) */
  help: 'help',
  /** 게시판: 그중 48시간 안건 후보(isAgendaCandidate) 수 — 있을 때만 */
  candidate: 'candidate',
} as const

type CountBadge = typeof BADGE.recommend | typeof BADGE.notRecommend | typeof BADGE.waiting | typeof BADGE.empty | typeof BADGE.help | typeof BADGE.candidate

/** 수를 담는 배지 — `<배지>:<수>`, 예: 'recommend:2'. 그리는 쪽이 모양을 정한다. */
export const countBadge = (badge: CountBadge, count: number): string => `${badge}:${count}`

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

/**
 * 아바타는 강조만 한다 — 배지 없음(막힌 도형 쪽에 막힘 배지가 붙는다).
 * 자리: 진행 중인 회의의 참석자면 회의 공간(meeting), 아니면 자기 책상 — 아바타 이동은 회의 시작 · 종료 같은 앱 안 이벤트를
 * 따른다(CONTRACTS.md 「10」 아바타 이동). 회의가 끝나면 책상으로 돌아간다.
 */
function avatarEntity(m: MemberDto, blockedMembers: ReadonlySet<string>, inMeeting: ReadonlySet<string>): SceneEntity {
  return {
    key: `member:${m.id}`,
    kind: 'avatar',
    refId: m.id,
    placeRole: inMeeting.has(m.id) ? 'meeting' : deskRole(m.id),
    badges: [],
    ...blockedHighlight(blockedMembers.has(m.id)),
  }
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

/** 원본 ID가 없는 요구사항의 묶음 키 */
export const UNGROUPED = '미분류'

/** 요구사항 종류(CONTRACTS.md 「3」): 원본 ID에서 끝 번호를 뺀 접두사 — 'FR-AUTH-01' → 'FR-AUTH'. 원본 ID가 없으면 "미분류". */
export function requirementGroupKey(sourceKey: string | null): string {
  if (!sourceKey) return UNGROUPED
  const cut = sourceKey.lastIndexOf('-')
  return cut > 0 ? sourceKey.slice(0, cut) : sourceKey
}

/** 대기 칸(CONTRACTS.md 「8」): 판에 못 오른 요구사항이 기다리는 마지막 판 */
export const REQUIREMENT_WAITING_KEY = 'requirement-group:waiting'
export const REQUIREMENT_WAITING_ROLE: PlaceRole = 'requirement:waiting'

const isEmptyRequirement = (r: RequirementDto) => r.linkedTaskCount === 0

function requirementEntity(r: RequirementDto): SceneEntity {
  return {
    key: `requirement:${r.id}`,
    kind: 'requirement',
    refId: r.id,
    placeRole: `requirement:${r.id}`,
    badges: [],
    groupKey: requirementGroupKey(r.sourceKey),
    ...(isEmptyRequirement(r) ? { highlight: 'dim' as const } : {}),
  }
}

/**
 * 요구사항 구역(FR-REQ-02 · 05 · 06): 판에 오른 `active` 요구사항마다 하나, 판 순서대로(planRequirementDeck). `missing` ·
 * `needs_review`는 3D에 없다(「3」). 연결된 이슈가 없는 구역(빈 구역 — FR-REQ-06)은 `dim`. 진행률은 그리는 쪽이 Snapshot의
 * 서버 계산 값(doneTaskCount / linkedTaskCount)을 읽는다. 판에 못 오른 요구사항이 있으면 대기 칸 하나(배지 waiting:N · empty:k).
 */
function requirementEntities(requirements: readonly RequirementDto[], deckOrder: readonly Id[] | null): SceneEntity[] {
  const { shown, waiting } = planRequirementDeck(requirements, deckOrder)
  const entities = shown.map(requirementEntity)
  if (waiting.length > 0) {
    const empty = waiting.filter(isEmptyRequirement).length
    entities.push({
      key: REQUIREMENT_WAITING_KEY,
      kind: 'requirementGroup',
      refId: null,
      placeRole: REQUIREMENT_WAITING_ROLE,
      badges: [countBadge(BADGE.waiting, waiting.length), ...(empty > 0 ? [countBadge(BADGE.empty, empty)] : [])],
    })
  }
  return entities
}

export const BOARD_KEY = 'board'

/**
 * 통신 허브 게시판(CONTRACTS.md 「8」 게시판 — 2026-11-06 결정): 오브젝트 하나. 배지는 열린 · 논의 중 도움 요청 수(help:N)와 그중
 * 48시간 안건 후보 수(candidate:k), 0이면 붙이지 않는다. 회의 결정 기록 · 강사 피드백 · 배운 점은 세지 않는다. 도움 요청마다 도형을
 * 두지 않는다 — 내용은 HUD. 팀원 · 강사 모두 같은 값이고 사람별 값은 없다.
 */
function boardEntity(helpRequests: readonly HelpRequestSummary[]): SceneEntity {
  const live = helpRequests.filter((h) => h.status === 'open' || h.status === 'discussing')
  const candidates = live.filter((h) => h.isAgendaCandidate).length
  const badges: string[] = []
  if (live.length > 0) badges.push(countBadge(BADGE.help, live.length))
  if (candidates > 0) badges.push(countBadge(BADGE.candidate, candidates))
  return { key: BOARD_KEY, kind: 'board', refId: null, placeRole: 'board', badges }
}

/**
 * 활동 메모지(FR-ACT-03 — #173): Snapshot `activityNotes`(확인된 활동만, 시간 · 내용 없음)마다 하나, key는 `activity:<id>`.
 * 자리는 작성자의 책상(desk:<작성자>) — 이슈 상자가 대표 담당자 책상에 놓이는 것과 같은 규칙(2026-11-08 결정). 작성자에게
 * 책상 자리가 없으면(빠진 팀원 · 자리 없는 팀원) 게시판(board). 배지는 활동 유형 하나 — 그리는 쪽이 아이콘으로 보인다.
 * 시간 합계 · 사람별 개수 같은 수치는 만들지 않는다(P6).
 */
function activityEntity(n: ActivityNote, seated: ReadonlySet<string>): SceneEntity {
  return { key: `activity:${n.id}`, kind: 'activity', refId: n.id, placeRole: seated.has(n.authorMemberId) ? deskRole(n.authorMemberId) : 'board', badges: [n.kind] }
}

/**
 * @param deckOrder 요구사항 대기 칸 교환 결과(판에 올린 요구사항 ID 목록) — 스토어가 사무실별로 내준다(CONTRACTS.md 「8」).
 * 없으면 position 순서.
 */
export function buildSceneModel(snapshot: WorkspaceSnapshot, deckOrder: readonly Id[] | null = null): SceneEntity[] {
  const seatedMembers = snapshot.members.filter(isSeated)
  const seated = new Set(seatedMembers.map((m) => m.id))
  const blockedMembers = new Set(snapshot.flow.blockedMemberIds)
  const inMeeting = new Set(snapshot.meetings.find((mt) => mt.status === 'ongoing')?.attendeeMemberIds ?? [])
  return [
    ...seatedMembers.map((m) => avatarEntity(m, blockedMembers, inMeeting)),
    ...snapshot.tasks.map((t) => taskEntity(t, seated)),
    ...snapshot.submissions.map(submissionEntity),
    ...snapshot.agendaItems.filter((a) => a.status === 'confirmed').map(agendaEntity),
    ...requirementEntities(snapshot.requirements, deckOrder),
    boardEntity(snapshot.helpRequests),
    ...snapshot.activityNotes.map((n) => activityEntity(n, seated)),
  ]
}
