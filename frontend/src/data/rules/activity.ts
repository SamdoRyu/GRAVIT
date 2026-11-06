// 활동 기록 규칙 (#173 — FR-ACT-01 ~ 03 · P12, CONTRACTS_API.md 「14」). 화면 · mock이 같이 쓴다. 소유: A(리뷰 D).
import type { ActivityCreateRequest, ActivityKind, ActivityRecordDto, Id, Viewer } from '../types'

export const ACTIVITY_CONTENT_MAX = 500
export const ACTIVITY_MINUTES_MIN = 1
export const ACTIVITY_MINUTES_MAX = 1440
export const ACTIVITY_PAGE_SIZE = 20

/** 계약 enum 순서 — 고르기 목록 · 리포트 분포 순서 */
export const ACTIVITY_KINDS: readonly ActivityKind[] = ['planning', 'research', 'design', 'presentation', 'mentor_question']

export const ACTIVITY_MSG = {
  content: `내용은 1~${ACTIVITY_CONTENT_MAX}자로 써 주세요`,
  minutes: `걸린 시간은 ${ACTIVITY_MINUTES_MIN}~${ACTIVITY_MINUTES_MAX}분으로 적어 주세요`,
  kind: '활동 유형을 골라 주세요',
  notConsented: '활동 기록 수집에 동의한 뒤 쓸 수 있어요',
  ownRecord: '내가 쓴 활동은 다른 팀원이 확인해요',
  notFound: '활동 기록을 찾을 수 없어요',
  status: '목록 조건이 맞지 않아요',
} as const

/** POST W/activities 400 규칙 — 서버 ActivityCreateRequest와 같다(공백뿐인 내용은 빈 것) */
export function activityCreateError(r: ActivityCreateRequest): string | null {
  if (!ACTIVITY_KINDS.includes(r.kind)) return ACTIVITY_MSG.kind
  if (r.content.trim() === '' || r.content.length > ACTIVITY_CONTENT_MAX) return ACTIVITY_MSG.content
  if (!Number.isInteger(r.durationMinutes) || r.durationMinutes < ACTIVITY_MINUTES_MIN || r.durationMinutes > ACTIVITY_MINUTES_MAX) return ACTIVITY_MSG.minutes
  return null
}

/** 회고 리포트 activityDistribution — 확인된 활동만 유형별 분 합계, 계약 enum 순서, 없는 유형은 빠진다(서버 confirmedMinutesByKind) */
export function activityMinutesByKind(records: readonly ActivityRecordDto[]): { kind: ActivityKind; totalMinutes: number }[] {
  return ACTIVITY_KINDS.flatMap((kind) => {
    const mine = records.filter((r) => r.status === 'confirmed' && r.kind === kind)
    return mine.length === 0 ? [] : [{ kind, totalMinutes: mine.reduce((sum, r) => sum + r.durationMinutes, 0) }]
  })
}

/** 쓰기는 팀원만(강사 403) — 숨김은 편의이고 서버가 다시 검사한다 */
export const canWriteActivity = (viewer: Viewer) => viewer.role !== 'instructor' && viewer.memberId !== null

/** 확인 버튼 — 작성자가 아닌 팀원이고 아직 확인하지 않았을 때 (FR-ACT-02) */
export function canConfirmActivity(record: ActivityRecordDto, viewer: Viewer): boolean {
  return canWriteActivity(viewer) && record.authorMemberId !== viewer.memberId && !record.confirmedByMemberIds.includes(viewer.memberId as Id)
}
