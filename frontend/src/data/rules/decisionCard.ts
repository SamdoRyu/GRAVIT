// 기술 결정 카드 · 강사 꼬리질문 규칙 (CONTRACTS_API.md 「15」, FR-REP-07 · 11 · P11). 순수 함수 — mock과 화면이 같은 규칙 · 문구를 쓴다.
// 9칸 채우기는 서버 DecisionCardDraft와 같은 계산이다(재료를 시간순으로 옮길 뿐 — 요약 · AI 없음). 서버는 같은 검사를 다시 한다. #218.
import type { DecisionCardCells, FollowUpQuestionCreateRequest, Verdict } from '../types'

/** 칸 하나 — 0~2000자 */
export const CARD_CELL_MAX = 2000
/** 강사 꼬리질문 — 1~1000자 */
export const FOLLOW_UP_QUESTION_MAX = 1000

/** 9칸 — 계약 순서. 화면의 칸 이름도 여기서 (리포트 마크다운의 CELL_LABELS와 같은 이름) */
export const CARD_CELLS: readonly { key: keyof DecisionCardCells; label: string }[] = [
  { key: 'goal', label: '무엇을 하려 했나' },
  { key: 'initialApproach', label: '처음 택한 방법' },
  { key: 'feedbackReceived', label: '받은 평가' },
  { key: 'meetingDecision', label: '회의에서 정한 것' },
  { key: 'finalChange', label: '최종적으로 바꾼 것' },
  { key: 'rationale', label: '왜 그렇게 결정했나' },
  { key: 'blockedMoment', label: '막혔던 순간' },
  { key: 'learning', label: '내가 배운 점' },
  { key: 'source', label: '원본' },
]

export const CARD_MSG = {
  request: '카드를 만들 PR을 골라 주세요',
  cells: `카드 칸은 ${CARD_CELL_MAX}자까지 쓸 수 있어요`,
  question: `꼬리질문은 1~${FOLLOW_UP_QUESTION_MAX}자로 적어 주세요`,
  submissionNotFound: 'PR을 찾을 수 없어요',
  notMyPr: '내가 작성한 PR로만 카드를 만들 수 있어요',
  prOpen: '머지되거나 닫힌 PR로만 카드를 만들 수 있어요',
  duplicate: '이 PR의 카드가 이미 있어요',
  cardNotFound: '카드를 찾을 수 없어요',
  instructorOnly: '강사만 꼬리질문을 쓸 수 있어요',
  notRequested: '꼬리질문을 요청한 카드에만 쓸 수 있어요',
} as const

const chars = (s: string) => Array.from(s).length
const hasText = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== ''

/** 배운 점 칸이 비어 있지 않다 — 리포트에 고를 수 있는 카드 (서버 DecisionCardCells.hasLearning · #335) */
export const hasLearning = (cells: Pick<DecisionCardCells, 'learning'>): boolean => hasText(cells.learning)

/** `POST …/decision-cards` 검사 — submissionId 문자열 */
export function cardCreateError(req: unknown): string | null {
  const id = typeof req === 'object' && req !== null ? (req as { submissionId?: unknown }).submissionId : undefined
  return typeof id === 'string' && id !== '' ? null : CARD_MSG.request
}

/**
 * `PUT …/decision-cards/{cardId}` 본문 검사 — 9칸이 모두 있고(값은 문자열 또는 null) 각 2000자 이하. 「확인함」(confirmed)은 없다 —
 * 보내면 모르는 필드라 서버가 400을 준다(#335).
 */
export function cardUpdateError(req: unknown): string | null {
  if (typeof req !== 'object' || req === null) return CARD_MSG.cells
  const { cells, ...rest } = req as { cells?: unknown }
  if (Object.keys(rest).length > 0 || typeof cells !== 'object' || cells === null) return CARD_MSG.cells
  for (const { key } of CARD_CELLS) {
    const value = (cells as Record<string, unknown>)[key]
    if (value === undefined || (value !== null && (typeof value !== 'string' || chars(value) > CARD_CELL_MAX))) return CARD_MSG.cells
  }
  return null
}

/** `POST …/follow-up-questions` 검사 — 공백만이 아닌 1~1000자 */
export function followUpQuestionError(req: unknown): string | null {
  const body = typeof req === 'object' && req !== null ? (req as Partial<FollowUpQuestionCreateRequest>).body : undefined
  return hasText(body) && chars(body) <= FOLLOW_UP_QUESTION_MAX ? null : CARD_MSG.question
}

// ---- 9칸 채우기 (서버 DecisionCardDraft) ---------------------------------------

/** 카드 재료 — 앱이 가진 것만. 각 목록은 이미 정해진 순서다 */
export interface CardMaterials {
  /** 연결 이슈에 연결된 요구사항 제목, 요구사항 순서 */
  requirementTitles: readonly string[]
  /** 평가 이유, 회차 오름차순(회차 안은 추천 먼저) — 평가자 없음 */
  feedbacks: readonly { verdict: Verdict; reason: string }[]
  /** 이 PR 안건의 결정, 결정 시각 순. meetingNotes는 그 안건을 정한 회의의 메모(없으면 null) */
  decisions: readonly { conclusion: string; learning: string | null; meetingNotes: string | null }[]
  /** 연결 이슈 번호 */
  linkedIssueNumbers: readonly number[]
  /** 본인 스탠드업, 날짜 순 */
  standups: readonly { date: string; blockers: string | null }[]
  prUrl: string | null
  /** 연결 이슈 링크, 이슈 순 */
  linkedIssueUrls: readonly (string | null)[]
}

/**
 * 9칸의 첫 내용. 여러 재료는 한 줄에 하나씩 잇고, 빈 재료는 빼고, 남는 것이 없으면 null, 2000자(UTF-16)를 넘으면 앞에서 자른다.
 * 처음 택한 방법 · 최종 변경(재료를 앱이 저장하지 않음)과 배운 점(본인이 쓴다)은 늘 null.
 */
export function draftCardCells(m: CardMaterials): DecisionCardCells {
  return {
    goal: cell(distinct(m.requirementTitles)),
    initialApproach: null,
    feedbackReceived: cell(m.feedbacks.map((f) => (f.verdict === 'recommend' ? '추천: ' : '비추천: ') + f.reason)),
    meetingDecision: cell(m.decisions.flatMap((d) => [d.conclusion, ...(hasText(d.learning) ? [`배운 점: ${d.learning}`] : [])])),
    finalChange: null,
    // 한 회의에서 안건 여럿을 정했으면 메모는 한 번만
    rationale: cell(distinct(m.decisions.map((d) => d.meetingNotes))),
    blockedMoment: cell(blockedLines(m.standups, m.linkedIssueNumbers)),
    learning: null,
    source: cell([m.prUrl, ...m.linkedIssueUrls]),
  }
}

/** 스탠드업 "막힌 것" 가운데 연결 이슈를 #번호로 언급한 것 — `#5`는 `#50` · `a#5` · `&#5`가 아니다 */
function blockedLines(standups: CardMaterials['standups'], issueNumbers: readonly number[]): string[] {
  const mentions = issueNumbers.map((n) => new RegExp(`(?<![\\w&#])#${n}(?!\\d)`))
  return standups.filter((s) => hasText(s.blockers) && mentions.some((p) => p.test(s.blockers!))).map((s) => `${s.date}: ${s.blockers}`)
}

function cell(materials: readonly (string | null | undefined)[]): string | null {
  const lines = materials.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x !== '')
  return lines.length === 0 ? null : truncate(lines.join('\n'))
}

function distinct<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)]
}

/** 서버처럼 UTF-16 2000자까지 — 서로게이트 쌍(이모지 등)을 반으로 자르지 않는다 */
function truncate(text: string): string {
  if (text.length <= CARD_CELL_MAX) return text
  const code = text.charCodeAt(CARD_CELL_MAX - 1)
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? CARD_CELL_MAX - 1 : CARD_CELL_MAX)
}
