// 강사 요청함 규칙 (FR-LRN-23, CONTRACTS_API.md 「16」). 순수 함수 — mock · 화면 · 테스트가 같이 쓴다. 소유: B (#224 — 리뷰 D).
// 목록 · 정렬 · 범위(지금 지정된 사무실만)는 서버가 정한다. 여기는 보기 · 고르기 · 어디로 갈지만.
import type { Id, InboxItem, InboxKind, MeResponse } from '../types'

export const INBOX_MSG = {
  /** 서버 forbidden_role 기본 문구와 같다 */
  notInstructor: '이 작업을 할 권한이 없어요',
} as const

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  help_request: '도움 요청',
  decision_feedback: '결정 피드백',
  follow_up_question: '꼬리질문',
}

/** 화면의 고르기 — answered 쿼리와 1:1. 'all'은 쿼리를 빼고 보낸다 */
export type InboxFilter = 'unanswered' | 'answered' | 'all'
export const INBOX_FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'unanswered', label: '답할 것' },
  { id: 'answered', label: '답한 것' },
  { id: 'all', label: '전부' },
]
/** 처음 고르기 — 아직 답하지 않은 것 [구현 기본값] */
export const DEFAULT_INBOX_FILTER: InboxFilter = 'unanswered'

/** 고르기 → `answered` 쿼리 값(undefined = 빼기) */
export const answeredParam = (filter: InboxFilter): boolean | undefined => (filter === 'all' ? undefined : filter === 'answered')

/** 강사 요청함을 보일 사람 — 화면 표시용, 서버가 다시 검사한다(403) */
export const canUseInbox = (me: Pick<MeResponse, 'isInstructor'> | null) => me?.isInstructor === true

/** 항목을 누르면 갈 곳 — 관리 패널 탭과 그 안의 대상 */
export type InboxDestination =
  | { tab: 'help'; helpRequestId: Id }
  | { tab: 'decisions'; agendaItemId: Id }
  /** 카드는 회고 탭에서 그 카드 주인을 골라 "기술 결정 카드" 보기로 연다 */
  | { tab: 'retro'; memberId: Id; view: 'cards' }

export function inboxDestination(item: Pick<InboxItem, 'kind' | 'targetId' | 'ownerMemberId'>): InboxDestination {
  switch (item.kind) {
    case 'help_request':
      return { tab: 'help', helpRequestId: item.targetId }
    case 'decision_feedback':
      return { tab: 'decisions', agendaItemId: item.targetId }
    case 'follow_up_question':
      return { tab: 'retro', memberId: item.ownerMemberId, view: 'cards' }
  }
}
