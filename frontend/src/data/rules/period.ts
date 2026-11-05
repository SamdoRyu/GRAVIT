// 프로젝트 기간과 D-day (FR-PLAN-01) — 화면 계산 규칙 · 팀 설정 검사. 소유: D.
// 날짜는 한국 시간 기준 달력 날짜(LocalDate "YYYY-MM-DD" — CONTRACTS.md 「1」 · 「5」)로 비교한다.
// 브라우저 시간대와 상관없이 같은 날을 같은 날로 본다.
import type { LocalDate, TeamSettings } from '../types'

const DAY_MS = 86_400_000
/** 한국 시간은 UTC+9이고 일광 절약 시간이 없다 */
const KST_OFFSET_MS = 9 * 3_600_000
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

/** 지금 한국 시간의 달력 날짜 */
export function kstToday(now: Date = new Date()): LocalDate {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" → 그 날짜의 일 번호(UTC 자정 기준). 형식이 틀리거나 없는 날짜(2월 30일 등)면 null */
function dayNumberOf(date: string): number | null {
  if (typeof date !== 'string' || !LOCAL_DATE.test(date)) return null
  const t = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== date) return null
  return Math.round(t / DAY_MS)
}

export type ProjectPhase = 'before' | 'during' | 'end_day' | 'after'

export interface ProjectDay {
  phase: ProjectPhase
  /** 끝 날짜까지 남은 날 — 끝 날짜면 0, 지났으면 음수 */
  daysToEnd: number
  /** 기간 안이면 오늘이 몇째 날인지(시작 날짜 = 1), 기간 밖이면 null */
  dayOfProject: number | null
  /** 시작 날짜와 끝 날짜를 모두 넣은 날 수 */
  totalDays: number
}

/** 기간이 없거나 날짜가 틀리거나 끝이 시작보다 빠르면 null — 화면은 "—"를 보인다 */
export function projectDay(settings: Pick<TeamSettings, 'projectStartDate' | 'projectEndDate'>, today: LocalDate): ProjectDay | null {
  const start = dayNumberOf(settings.projectStartDate)
  const end = dayNumberOf(settings.projectEndDate)
  const now = dayNumberOf(today)
  if (start === null || end === null || now === null || end < start) return null
  const daysToEnd = end - now
  const phase: ProjectPhase = now < start ? 'before' : daysToEnd > 0 ? 'during' : daysToEnd === 0 ? 'end_day' : 'after'
  return {
    phase,
    daysToEnd,
    dayOfProject: now >= start && now <= end ? now - start + 1 : null,
    totalDays: end - start + 1,
  }
}

// ---- 팀 설정 검사 (PUT W/settings — CONTRACTS_API.md 「7」: 범위 · 날짜 순서가 틀리면 400 invalid) ----

/** 명세 문서 경로 길이 상한 (FR-REQ-01) */
export const SPEC_PATH_MAX_LENGTH = 300
/** reviewWaitHours · noCommitHours 범위 — 정수 (P9) */
export const THRESHOLD_HOURS_MIN = 1
export const THRESHOLD_HOURS_MAX = 720

export const SETTINGS_MSG = {
  invalidDate: '날짜 형식이 올바르지 않아요',
  endBeforeStart: '끝 날짜는 시작 날짜보다 빠를 수 없어요',
  invalidSpecPath: `명세 문서 경로는 1~${SPEC_PATH_MAX_LENGTH}자로 입력해 주세요`,
  invalidHours: `기준 시간은 ${THRESHOLD_HOURS_MIN}~${THRESHOLD_HOURS_MAX} 사이의 정수로 입력해 주세요`,
} as const

/** 프로젝트 기간만 검사 — 맞으면 null, 틀리면 화면에 보일 사유 */
export function periodError(projectStartDate: string, projectEndDate: string): string | null {
  const start = dayNumberOf(projectStartDate)
  const end = dayNumberOf(projectEndDate)
  if (start === null || end === null) return SETTINGS_MSG.invalidDate
  if (end < start) return SETTINGS_MSG.endBeforeStart
  return null
}

const isThresholdHours = (v: unknown) => Number.isInteger(v) && (v as number) >= THRESHOLD_HOURS_MIN && (v as number) <= THRESHOLD_HOURS_MAX

/** 팀 설정 전체 검사 — 맞으면 null, 틀리면 사유 (mock 서버 · 화면이 함께 쓴다) */
export function settingsError(s: TeamSettings): string | null {
  if (typeof s !== 'object' || s === null) return SETTINGS_MSG.invalidDate
  const period = periodError(s.projectStartDate, s.projectEndDate)
  if (period) return period
  const path = s.specDocumentPath
  if (path !== null && (typeof path !== 'string' || path.length < 1 || path.length > SPEC_PATH_MAX_LENGTH)) return SETTINGS_MSG.invalidSpecPath
  if (!isThresholdHours(s.reviewWaitHours) || !isThresholdHours(s.noCommitHours)) return SETTINGS_MSG.invalidHours
  return null
}

/** 상단 바 D-day 칸의 큰 글자 · 작은 글자 */
export function ddayText(d: ProjectDay): { value: string; label: string } {
  switch (d.phase) {
    case 'before':
      return { value: `D-${d.daysToEnd}`, label: '시작 전' }
    case 'during':
      return { value: `D-${d.daysToEnd}`, label: '종료까지' }
    case 'end_day':
      return { value: 'D-day', label: '오늘 종료' }
    case 'after':
      return { value: `D+${-d.daysToEnd}`, label: '종료됨' }
  }
}
