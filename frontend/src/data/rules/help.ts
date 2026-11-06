// 도움 요청 요청 검사 · 상태 규칙 (CONTRACTS_API.md 「11」 · CONTRACTS.md 「3」). 순수 함수 — mock과 화면이 같은 규칙 ·
// 문구를 쓴다. 서버는 같은 규칙으로 다시 검사한다(400 invalid — 공백만인 글도 거부, CONTRACTS.md 「5」). 소유: A (#183).
import type {
  HelpCommentCreateRequest,
  HelpCommentDto,
  HelpRequestCloseRequest,
  HelpRequestCreateRequest,
  HelpRequestDetail,
  HelpRequestStatus,
  HelpRequestSummary,
  HelpRequestToAgendaRequest,
} from '../types'
import { AGENDA_TITLE_MAX } from './meeting'

export const HELP_CONTENT_MAX = 2000
export const HELP_LEARNING_MAX = 200
/** 만든 지 이만큼 지난 open · discussing 도움 요청은 안건 후보 (FR-LRN-18) */
export const HELP_CANDIDATE_HOURS = 48

export const HELP_MSG = {
  content: `도움 요청은 1~${HELP_CONTENT_MAX}자로 적어 주세요`,
  comment: `코멘트는 1~${HELP_CONTENT_MAX}자로 적어 주세요`,
  learning: `배운 점은 1~${HELP_LEARNING_MAX}자로 적어 주세요`,
  agendaTitle: `안건 제목은 1~${AGENDA_TITLE_MAX}자로 적어 주세요`,
  // 상태 · 권한 (mock이 쓰는 문구 — 서버 문구는 서버가 정한다)
  notFound: '도움 요청을 찾을 수 없어요',
  notRequester: '요청한 사람만 할 수 있어요',
  notOwnStandup: '내 스탠드업에서만 도움 요청을 만들 수 있어요',
  standupNotFound: '스탠드업을 찾을 수 없어요',
  closedForComments: '해결됐거나 끝난 도움 요청에는 코멘트를 달 수 없어요',
  notOpen: '열려 있거나 논의 중인 도움 요청만 할 수 있어요',
  helpfulNotHere: '도움이 된 코멘트는 이 도움 요청의 코멘트여야 해요',
  helpfulNotAllowed: '강사 답변이나 내 코멘트는 도움이 된 코멘트로 고를 수 없어요',
} as const

/** 공백이 아닌 글자가 있고, 길이(코드 포인트)가 max 이하 */
const textOk = (s: unknown, max: number): boolean => typeof s === 'string' && s.trim() !== '' && Array.from(s).length <= max

export function helpCreateError(req: HelpRequestCreateRequest): string | null {
  return textOk(req?.content, HELP_CONTENT_MAX) ? null : HELP_MSG.content
}

export function helpCommentError(req: HelpCommentCreateRequest): string | null {
  return textOk(req?.content, HELP_CONTENT_MAX) ? null : HELP_MSG.comment
}

export function helpCloseError(req: HelpRequestCloseRequest): string | null {
  return textOk(req?.learning, HELP_LEARNING_MAX) ? null : HELP_MSG.learning
}

export function helpToAgendaError(req: HelpRequestToAgendaRequest): string | null {
  return textOk(req?.title, AGENDA_TITLE_MAX) ? null : HELP_MSG.agendaTitle
}

/** 닫기 · 안건으로 전환은 open · discussing에서만 */
export const isOpenForDiscussion = (status: HelpRequestStatus): boolean => status === 'open' || status === 'discussing'

/** 코멘트는 해결(resolved) · 종료(ended) 전까지 — 안건으로 올라간 뒤에도 단다 */
export const acceptsComments = (status: HelpRequestStatus): boolean => status !== 'resolved' && status !== 'ended'

/** 48시간 안건 후보 (FR-LRN-18) — open · discussing이고 만든 지 48시간이 지났다 */
export function isAgendaCandidate(status: HelpRequestStatus, createdAt: string, now: Date): boolean {
  return isOpenForDiscussion(status) && now.getTime() - Date.parse(createdAt) >= HELP_CANDIDATE_HOURS * 3_600_000
}

/** 상세 → Snapshot 요약 (코멘트 · 도움이 된 코멘트 · 배운 점을 뺀다) */
export function toHelpSummary(detail: HelpRequestDetail): HelpRequestSummary {
  const { comments: _comments, helpfulCommentId: _helpful, learning: _learning, ...summary } = detail
  return summary
}

/** 코멘트를 단 뒤의 요약 — 요청자가 아닌 팀원의 첫 코멘트면 open → discussing, 강사 답변은 상태를 바꾸지 않는다(「11」) */
export function afterComment(help: HelpRequestSummary, comment: HelpCommentDto): HelpRequestSummary {
  const opensDiscussion = help.status === 'open' && comment.authorMemberId !== null && comment.authorMemberId !== help.requesterMemberId
  return { ...help, commentCount: help.commentCount + 1, status: opensDiscussion ? 'discussing' : help.status }
}
