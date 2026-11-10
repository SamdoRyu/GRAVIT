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
  Id,
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
  closedForInstructor: '해결됐거나 끝난 도움 요청은 강사에게 요청할 수 없어요',
  noInstructor: '이 사무실에 지정된 강사가 없어요',
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

/**
 * 「11」 강사에게 요청 (#272) — 강사가 답할 수 있는 상태(코멘트를 받는 open · discussing · on_agenda)에서만, 이미 켜져
 * 있어도 닫힌 글은 안 된다. 이미 켜진 글은 그대로라 지정된 강사를 보지 않고, 새로 켤 때만 지정된 강사가 있어야 한다.
 * 시연 사무실은 심사용 강사 계정이 강사라 부르는 쪽이 hasInstructor = true를 넘긴다. null이면 켤 수 있다(이미 켜졌으면 그대로).
 * 오류는 둘 다 conflict(409)다.
 */
export function instructorRequestError(help: Pick<HelpRequestSummary, 'status' | 'instructorRequested'>, hasInstructor: boolean): string | null {
  if (!acceptsComments(help.status)) return HELP_MSG.closedForInstructor
  if (help.instructorRequested) return null
  return hasInstructor ? null : HELP_MSG.noInstructor
}

/** 48시간 안건 후보 (FR-LRN-18) — open · discussing이고 만든 지 48시간이 지났다 */
export function isAgendaCandidate(status: HelpRequestStatus, createdAt: string, now: Date): boolean {
  return isOpenForDiscussion(status) && now.getTime() - Date.parse(createdAt) >= HELP_CANDIDATE_HOURS * 3_600_000
}

/** 상세 → Snapshot 요약 (코멘트 · 도움이 된 코멘트 · 배운 점을 뺀다) */
export function toHelpSummary(detail: HelpRequestDetail): HelpRequestSummary {
  const { comments: _comments, helpfulCommentId: _helpful, learning: _learning, ...summary } = detail
  return summary
}

/**
 * 강사 답변 확인 결과(#290) — 도움 요청 상세의 `comments[].isInstructorAnswer`를 그 글의 `commentCount` 시점에 본 값.
 * 요약(Snapshot)에는 강사 답변 여부가 없어 화면이 상세를 읽어 채운다. 코멘트 수가 바뀌면 다시 읽는다.
 * `lastAnswerId` = 가장 최근 강사 답변(코멘트 ID) — 새 강사 답변 알림(빨간 점)이 "어디까지 봤나"와 견준다.
 */
export interface InstructorAnswerCheck {
  commentCount: number
  answered: boolean
  lastAnswerId: string | null
}
export type InstructorAnswerChecks = Readonly<Record<string, InstructorAnswerCheck>>
/** 도움 요청마다 이 사람이 마지막으로 본 강사 답변(코멘트 ID) — 이 브라우저에만 둔다(#290) */
export type SeenInstructorAnswers = Readonly<Record<string, string>>

/** 강사가 답할 수 있는 글 — "강사에게 요청"이 켜졌고 코멘트를 받는다(open · discussing · on_agenda — 「11」) */
const instructorMayAnswer = (h: Pick<HelpRequestSummary, 'status' | 'instructorRequested'>): boolean => h.instructorRequested && acceptsComments(h.status)
/** 강사가 답할 차례인 글 — 그중 아직 열려 있다(open · discussing). 강사 우주선이 이 글을 보고 온다 */
const waitsForInstructor = (h: Pick<HelpRequestSummary, 'status' | 'instructorRequested'>): boolean => h.instructorRequested && isOpenForDiscussion(h.status)

/** 상세를 (다시) 읽어 강사 답변을 확인해야 하는 글 — 강사가 답할 수 있는데 확인 전이거나 그 뒤로 코멘트 수가 바뀌었다 */
export function needsInstructorCheck(h: HelpRequestSummary, checks: InstructorAnswerChecks): boolean {
  return instructorMayAnswer(h) && checks[h.id]?.commentCount !== h.commentCount
}

/** 상세 → 확인 결과(코멘트는 createdAt 오름차순 — 마지막 강사 답변이 가장 최근) */
export function instructorAnswerCheck(detail: HelpRequestDetail): InstructorAnswerCheck {
  const answers = detail.comments.filter((c) => c.isInstructorAnswer)
  return { commentCount: detail.commentCount, answered: answers.length > 0, lastAnswerId: answers.at(-1)?.id ?? null }
}

/**
 * 새 강사 답변이 있는 도움 요청 ID(#290) — 도움 요청 탭 · 글 · 3D 게시판의 빨간 점. 강사가 답할 수 있는 글이고, 지금 코멘트 수로
 * 확인한 마지막 강사 답변을 이 사람이 아직 보지 않았다(그 글 상세를 열면 본 것). 확인 전인 글은 넣지 않는다.
 */
export function unreadInstructorAnswers(helpRequests: readonly HelpRequestSummary[], checks: InstructorAnswerChecks, seen: SeenInstructorAnswers): string[] {
  return helpRequests
    .filter((h) => {
      const c = checks[h.id]
      return instructorMayAnswer(h) && c?.commentCount === h.commentCount && c.lastAnswerId !== null && seen[h.id] !== c.lastAnswerId
    })
    .map((h) => h.id)
}

/**
 * 강사 답변을 기다리는 도움 요청 ID(#290) — 강사가 답할 차례(open · discussing)이고, 지금 코멘트 수로 확인했는데 강사 답변이
 * 없다. 확인 전인 글은 넣지 않는다(읽는 동안 우주선이 깜빡이지 않게). 3D 강사 우주선이 이 값을 보고 오고 간다.
 */
export function awaitingInstructor(helpRequests: readonly HelpRequestSummary[], checks: InstructorAnswerChecks): string[] {
  return helpRequests.filter((h) => waitsForInstructor(h) && checks[h.id]?.commentCount === h.commentCount && !checks[h.id].answered).map((h) => h.id)
}

/** 코멘트를 단 뒤의 요약 — 요청자가 아닌 팀원의 첫 코멘트면 open → discussing, 강사 답변은 상태를 바꾸지 않는다(「11」) */
export function afterComment(help: HelpRequestSummary, comment: HelpCommentDto): HelpRequestSummary {
  const opensDiscussion = help.status === 'open' && comment.authorMemberId !== null && comment.authorMemberId !== help.requesterMemberId
  return { ...help, commentCount: help.commentCount + 1, status: opensDiscussion ? 'discussing' : help.status }
}

// ---- 도움 요청 삭제 두 방식 (#315 · #316 — CONTRACTS_API.md 「11」 도움 요청 삭제) ----

/** 원본 도움 요청이 영구 삭제된 안건에 남기는 제목 — 복사된 원문(본문 첫 줄로 미리 채운 제목)을 남기지 않는다 */
export const DELETED_HELP_REQUEST_TITLE = '삭제된 도움 요청'

/** 삭제 범위 — me = 나에게서만 삭제(숨김, 해제 가능) · everyone = 모두에게서 영구 삭제(복원 불가) */
export type HelpDeleteScope = 'me' | 'everyone'

/**
 * 고를 수 있는 범위 — 요청자는 둘 다, 그 밖의 사람(다른 팀원 · 강사)은 나에게서만. 상태와 상관없다.
 * 버튼을 숨기는 것은 권한 검사가 아니다 — 서버가 고른 범위(엔드포인트)대로 다시 검사한다.
 */
export function helpDeleteScopes(help: Pick<HelpRequestSummary, 'requesterMemberId'>, viewerMemberId: Id | null): HelpDeleteScope[] {
  return viewerMemberId !== null && viewerMemberId === help.requesterMemberId ? ['me', 'everyone'] : ['me']
}

/** 영구 삭제 경고에 보일 개수 — 요청자가 아닌 사람이 쓴 코멘트(강사 답변 제외) · 강사 답변. 둘 다 함께 지워진다 */
export function helpDeleteLoss(detail: Pick<HelpRequestDetail, 'requesterMemberId' | 'comments'>): { otherComments: number; instructorAnswers: number } {
  const instructorAnswers = detail.comments.filter((c) => c.isInstructorAnswer).length
  const otherComments = detail.comments.filter((c) => !c.isInstructorAnswer && c.authorMemberId !== detail.requesterMemberId).length
  return { otherComments, instructorAnswers }
}
