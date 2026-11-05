// 회의 · 안건 · 작업 마감 요청 검사 (CONTRACTS_API.md 「10」 · 「13」). 순수 함수 — mock과 화면(C의 회의 대화상자 ·
// 일정판)이 같은 규칙 · 문구를 쓴다. 서버는 같은 규칙으로 다시 검사한다(400 invalid). 소유: D.
import type { AgendaItemCreateRequest, AgendaKind, DecisionRequest, EndMeetingRequest } from '../types'
import { isLocalDate } from './period'

export const AGENDA_TITLE_MAX = 100
export const AGENDA_TEXT_MAX = 2000
export const DECISION_TEXT_MAX = 2000
export const MEETING_NOTES_MAX = 5000

export const MEETING_MSG = {
  agendaKind: '안건 종류가 올바르지 않아요',
  agendaHelpRequest: '도움 요청은 도움 요청 화면에서 안건으로 올려요',
  agendaSourceRequired: '이슈 · PR 안건은 원본을 골라 주세요',
  agendaSourceNotAllowed: '배운 점 · 기타 안건에는 원본이 없어요',
  agendaTitle: `안건 제목은 1~${AGENDA_TITLE_MAX}자로 적어 주세요`,
  agendaText: `배경 · 해 본 것 · 막힌 이유는 ${AGENDA_TEXT_MAX}자까지 쓸 수 있어요`,
  conclusion: `결론은 1~${DECISION_TEXT_MAX}자로 적어 주세요`,
  learning: `배운 점은 ${DECISION_TEXT_MAX}자까지 쓸 수 있어요`,
  prDecisionRequired: 'PR 안건은 PR 결정을 골라 주세요',
  prDecisionNotAllowed: 'PR 결정은 PR 안건에만 고를 수 있어요',
  followUpDate: '후속 기한 날짜 형식이 올바르지 않아요',
  notes: `회의록은 ${MEETING_NOTES_MAX}자까지 쓸 수 있어요`,
  dueDate: '마감 날짜 형식이 올바르지 않아요',
  // 상태 · 권한 (mock이 쓰는 문구 — 서버 문구는 서버가 정한다)
  meetingOngoing: '이미 진행 중인 회의가 있어요',
  meetingEnded: '이미 끝난 회의예요',
  meetingNotFound: '회의를 찾을 수 없어요',
  attendeeNotMember: '참석자는 이 사무실 팀원이어야 해요',
  followUpNotMember: '후속 담당자는 이 사무실 팀원이어야 해요',
  agendaNotFound: '안건을 찾을 수 없어요',
  agendaSourceNotFound: '안건의 원본을 찾을 수 없어요',
  agendaNotConfirmed: '이미 결정했거나 거둔 안건이에요',
  withdrawNotOwner: '올린 사람만 안건을 거둘 수 있어요',
  reevaluateClosed: '머지되거나 닫힌 PR은 다시 평가할 수 없어요',
  taskNotFound: '이슈를 찾을 수 없어요',
  dueDateForbidden: '레포 관리자와 그 이슈 담당자만 마감을 바꿀 수 있어요',
} as const

/** 앞뒤 공백을 뺀 글자 수(코드 포인트) */
const len = (s: string) => Array.from(s.trim()).length
const optionalTextOk = (s: string | null | undefined, max: number) => s === null || s === undefined || (typeof s === 'string' && len(s) <= max)

const CREATABLE_KINDS: readonly AgendaKind[] = ['issue', 'pr', 'learning', 'other']

/** `POST W/agenda-items` 요청 검사 — 원본이 실제로 있는지는 서버(mock)가 본다 */
export function agendaCreateError(req: AgendaItemCreateRequest): string | null {
  if ((req.kind as AgendaKind) === 'help_request') return MEETING_MSG.agendaHelpRequest
  if (!CREATABLE_KINDS.includes(req.kind)) return MEETING_MSG.agendaKind
  const needsSource = req.kind === 'issue' || req.kind === 'pr'
  if (needsSource && (typeof req.sourceId !== 'string' || req.sourceId === '')) return MEETING_MSG.agendaSourceRequired
  if (!needsSource && req.sourceId !== null) return MEETING_MSG.agendaSourceNotAllowed
  if (typeof req.title !== 'string' || len(req.title) < 1 || len(req.title) > AGENDA_TITLE_MAX) return MEETING_MSG.agendaTitle
  if (![req.background, req.tried, req.unresolvedReason].every((t) => optionalTextOk(t, AGENDA_TEXT_MAX))) return MEETING_MSG.agendaText
  return null
}

/** `POST W/agenda-items/{id}/decision` 요청 검사. kind는 그 안건의 종류 — PR 안건이면 prDecision이 필수 */
export function decisionError(req: DecisionRequest, kind: AgendaKind): string | null {
  if (typeof req.conclusion !== 'string' || len(req.conclusion) < 1 || len(req.conclusion) > DECISION_TEXT_MAX) return MEETING_MSG.conclusion
  if (!optionalTextOk(req.learning, DECISION_TEXT_MAX)) return MEETING_MSG.learning
  if (kind === 'pr' && req.prDecision === null) return MEETING_MSG.prDecisionRequired
  if (kind !== 'pr' && req.prDecision !== null) return MEETING_MSG.prDecisionNotAllowed
  if (req.prDecision !== null && !['revise_and_reevaluate', 'merge_as_is', 'close_pr'].includes(req.prDecision)) return MEETING_MSG.prDecisionRequired
  if (req.followUpDueDate !== null && !isLocalDate(req.followUpDueDate)) return MEETING_MSG.followUpDate
  return null
}

/** `POST W/meetings/{id}/end` 요청 검사 — 회의록 0~5000자 */
export function meetingEndError(req: EndMeetingRequest): string | null {
  if (req.notes !== null && (typeof req.notes !== 'string' || Array.from(req.notes).length > MEETING_NOTES_MAX)) return MEETING_MSG.notes
  return null
}

/** `PUT W/tasks/{id}/due-date` 요청 검사 */
export function dueDateError(dueDate: unknown): string | null {
  return isLocalDate(dueDate) ? null : MEETING_MSG.dueDate
}

/** 빈 칸(공백만)은 null로 — 선택 입력을 보낼 때 */
export const blankToNull = (s: string | null | undefined): string | null => (s === null || s === undefined || s.trim() === '' ? null : s.trim())
