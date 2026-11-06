// 스탠드업 요청 검사 · 날짜 규칙 (CONTRACTS_API.md 「12」). 순수 함수 — mock과 화면이 같은 규칙 · 문구를 쓴다.
// 서버는 같은 규칙으로 다시 검사한다(400 invalid). 날짜는 한국 시간 달력 날짜다. 소유: A (#190).
import type { LocalDate, StandupPrefill, StandupSaveRequest } from '../types'
import { isLocalDate } from './period'

export const STANDUP_TEXT_MAX = 2000

export const STANDUP_MSG = {
  date: '날짜 형식이 올바르지 않아요',
  futureDate: '오늘 이후 날짜의 스탠드업은 쓸 수 없어요',
  yesterday: `어제 한 일은 ${STANDUP_TEXT_MAX}자까지 쓸 수 있어요`,
  blockers: `막힌 것은 ${STANDUP_TEXT_MAX}자까지 쓸 수 있어요`,
} as const

const within = (s: string) => Array.from(s).length <= STANDUP_TEXT_MAX

/** `PUT W/standups/{date}/mine` 검사 — 날짜 형식 · 미래 날짜(today = 한국 시간 오늘, kstToday) · 각 0~2000자 */
export function standupSaveError(date: unknown, req: StandupSaveRequest, today: LocalDate): string | null {
  if (!isLocalDate(date)) return STANDUP_MSG.date
  if (date > today) return STANDUP_MSG.futureDate
  if (typeof req?.yesterday !== 'string' || !within(req.yesterday)) return STANDUP_MSG.yesterday
  if (req.blockers !== null && (typeof req.blockers !== 'string' || !within(req.blockers))) return STANDUP_MSG.blockers
  return null
}

/** 그 날짜(한국 시간) 하루의 시작 · 끝 — [from, to) */
export function kstDayRange(date: LocalDate): { from: number; to: number } {
  const from = Date.parse(`${date}T00:00:00+09:00`)
  return { from, to: from + 86_400_000 }
}

const PREFILL_LABEL: Record<StandupPrefill['items'][number]['kind'], string> = {
  commit: '커밋',
  pr_opened: 'PR 열기',
  pr_merged: 'PR 머지',
  issue_closed: '이슈 닫기',
  review_submitted: '리뷰',
}

/** 미리 채우기 항목 → "어제 한 일" 초안 한 줄씩 — 예: "- PR 머지 #12 로그인 화면" */
export function prefillText(prefill: StandupPrefill): string {
  return prefill.items.map((it) => `- ${PREFILL_LABEL[it.kind]}${it.githubNumber !== null ? ` #${it.githubNumber}` : ''} ${it.title}`).join('\n')
}
