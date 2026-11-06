// 팀 지표 규칙 — 평균 리뷰 대기 (FR-FLOW-05, CONTRACTS.md 「3」 「막힘 신호 · 평균 리뷰 대기」 · CONTRACTS_API.md 「5」). 순수 함수. 소유: D (#24).
// 서버(B)가 같은 규칙으로 Snapshot `flow`에 채운다 — mock도 고정값 대신 이 규칙으로 응답 시각에 계산한다.
// "리뷰 대기 시작" · "센 리뷰"의 정의는 막힘 판정(BlockedRule)과 같다.
import type { Instant, SubmissionDto } from '../types'

const HOUR_MS = 3_600_000

/** 리뷰 대기 시작 — 열린 시각(`stateChangedAt`)과 마지막 커밋(`lastCommitAt`) 중 늦은 것 */
export function reviewWaitStart(s: Pick<SubmissionDto, 'stateChangedAt' | 'lastCommitAt'>): number {
  const opened = Date.parse(s.stateChangedAt)
  const commit = s.lastCommitAt === null ? Number.NEGATIVE_INFINITY : Date.parse(s.lastCommitAt)
  return Math.max(opened, commit)
}

/** 센 리뷰인가 — 리뷰 대기 시작 뒤에 제출됐고, 작성자 본인(GitHub 로그인, 대소문자 무시)도 `dismissed`도 아니다 */
function counts(s: SubmissionDto, review: SubmissionDto['reviews'][number], start: number): boolean {
  if (review.state === 'dismissed') return false
  if (s.authorGithubLogin !== null && s.authorGithubLogin.toLowerCase() === review.reviewerGithubLogin.toLowerCase()) return false
  return Date.parse(review.submittedAt) > start
}

/**
 * 평균 리뷰 대기(시간, 소수 첫째 자리). 열린 PR(Draft 제외)마다 리뷰 대기 시작부터 첫 센 리뷰(없으면 응답 시각 `now`)까지,
 * 그 평균. 열린 PR이 없으면 null
 */
export function averageReviewWaitHours(submissions: readonly SubmissionDto[], now: Instant | Date): number | null {
  const at = typeof now === 'string' ? Date.parse(now) : now.getTime()
  const waits: number[] = []
  for (const s of submissions) {
    if (s.state !== 'open') continue
    const start = reviewWaitStart(s)
    let end = at
    for (const r of s.reviews) if (counts(s, r, start)) end = Math.min(end, Date.parse(r.submittedAt))
    // 시계가 어긋나 시작이 응답 시각보다 늦으면 0으로 센다(음수 대기 없음)
    waits.push(Math.max(0, end - start) / HOUR_MS)
  }
  if (waits.length === 0) return null
  const mean = waits.reduce((a, b) => a + b, 0) / waits.length
  return Math.round(mean * 10) / 10
}
