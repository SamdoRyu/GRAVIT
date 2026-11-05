// PR 추천 · 비추천 평가 규칙 (#19 · #20 — FR-LRN-01 · 02, CONTRACTS_API.md 「9」). 순수 함수. 소유: D.
// 화면 입력 검사와 mock이 같은 규칙을 쓴다 — 서버는 같은 규칙으로 다시 검사한다(400 invalid).
import type { EvaluateRequest, EvaluationReason, MyEvaluation, SubmissionDto, Verdict } from '../types'

/** 이유 길이 — 앞뒤 공백을 뺀 뒤 1~200자 */
export const EVALUATION_REASON_MAX = 200

export const VERDICT_LABEL: Record<Verdict, string> = { recommend: '추천', not_recommend: '비추천' }

export const EVALUATION_MSG = {
  reasonRequired: '한 줄 이유를 적어 주세요',
  reasonTooLong: `이유는 ${EVALUATION_REASON_MAX}자까지 쓸 수 있어요`,
  invalidVerdict: '추천 · 비추천 중 하나를 골라 주세요',
  ownSubmission: '내 PR은 평가할 수 없어요',
  closedSubmission: '머지되거나 닫힌 PR은 평가할 수 없어요',
  staleRound: '그 사이 새 평가 회차가 열렸어요 — 다시 확인해 주세요',
  submissionNotFound: 'PR을 찾을 수 없어요',
} as const

/** 글자 수 — 이모지 같은 문자도 한 글자로 센다(서버의 코드 포인트 기준과 맞춘다) */
export const reasonLength = (reason: string) => Array.from(reason.trim()).length

/** 요청 검사 — 틀리면 문구, 맞으면 null. 순서: 판정 → 이유 */
export function evaluationError(req: Pick<EvaluateRequest, 'verdict' | 'reason'>): string | null {
  if (req.verdict !== 'recommend' && req.verdict !== 'not_recommend') return EVALUATION_MSG.invalidVerdict
  if (typeof req.reason !== 'string') return EVALUATION_MSG.reasonRequired
  const n = reasonLength(req.reason)
  if (n === 0) return EVALUATION_MSG.reasonRequired
  if (n > EVALUATION_REASON_MAX) return EVALUATION_MSG.reasonTooLong
  return null
}

/** 이유 목록 순서 — 추천 먼저, 그 안에서 저장 순서(계약 「9」) */
export function orderReasons(reasons: readonly EvaluationReason[]): EvaluationReason[] {
  return [...reasons.filter((r) => r.verdict === 'recommend'), ...reasons.filter((r) => r.verdict === 'not_recommend')]
}

/** 평가 입력을 못 보이는 이유(화면 안내). 평가할 수 있으면 null. canEvaluate는 서버 값을 그대로 쓴다 */
export function cannotEvaluateReason(sub: Pick<SubmissionDto, 'state' | 'authorMemberId' | 'currentRound'>, viewerMemberId: string | null): string | null {
  if (!sub.currentRound) return '아직 평가 회차가 없어요'
  if (sub.currentRound.canEvaluate) return null
  if (sub.state === 'merged' || sub.state === 'closed') return EVALUATION_MSG.closedSubmission
  if (viewerMemberId === null) return '강사는 평가하지 않아요'
  if (sub.authorMemberId === viewerMemberId) return EVALUATION_MSG.ownSubmission
  return '이 PR은 평가할 수 없어요'
}

/** 내 평가와 입력이 같으면 보낼 필요가 없다 */
export const sameAsMine = (mine: MyEvaluation | null, verdict: Verdict, reason: string) => mine !== null && mine.verdict === verdict && mine.reason === reason.trim()
