// 평균 리뷰 대기 규칙 (FR-FLOW-05 · #24, CONTRACTS.md 「3」 「막힘 신호 · 평균 리뷰 대기」 · CONTRACTS_API.md 「5」).
// 열린 PR(Draft 제외)마다 리뷰 대기 시작(열린 시각 · 마지막 커밋 중 늦은 것) → 첫 센 리뷰(없으면 응답 시각), 평균을 소수 첫째 자리로.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { averageReviewWaitHours, reviewWaitStart } from '../../src/data/rules/flow'
import type { GithubReviewDto, SubmissionDto } from '../../src/data/types'
import { workspaceSnapshotExample } from './examples'

const NOW = '2026-11-06T12:00:00Z'
/** NOW에서 h시간 전 */
const ago = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')

const base = workspaceSnapshotExample.submissions[0]
function pr(p: Partial<SubmissionDto> & { openedHoursAgo: number; commitHoursAgo?: number | null }): SubmissionDto {
  const { openedHoursAgo, commitHoursAgo = null, ...rest } = p
  return {
    ...base,
    state: 'open',
    authorGithubLogin: 'octo-kim',
    reviews: [],
    stateChangedAt: ago(openedHoursAgo),
    lastCommitAt: commitHoursAgo === null ? null : ago(commitHoursAgo),
    ...rest,
  }
}
const review = (login: string, hoursAgo: number, state: GithubReviewDto['state'] = 'commented'): GithubReviewDto => ({
  reviewerMemberId: null,
  reviewerGithubLogin: login,
  state,
  submittedAt: ago(hoursAgo),
})

describe('평균 리뷰 대기', () => {
  it('열린 PR이 없으면 null — Draft · 머지 · 닫힘은 세지 않는다', () => {
    assert.equal(averageReviewWaitHours([], NOW), null)
    const others = (['draft', 'merged', 'closed'] as const).map((state) => pr({ state, openedHoursAgo: 10 }))
    assert.equal(averageReviewWaitHours(others, NOW), null)
  })

  it('리뷰가 없으면 리뷰 대기 시작부터 응답 시각까지', () => {
    assert.equal(averageReviewWaitHours([pr({ openedHoursAgo: 19 })], NOW), 19)
  })

  it('리뷰 대기 시작은 열린 시각과 마지막 커밋 중 늦은 것', () => {
    assert.equal(reviewWaitStart(pr({ openedHoursAgo: 10, commitHoursAgo: 4 })), Date.parse(ago(4)))
    assert.equal(reviewWaitStart(pr({ openedHoursAgo: 10, commitHoursAgo: 12 })), Date.parse(ago(10)))
    assert.equal(averageReviewWaitHours([pr({ openedHoursAgo: 10, commitHoursAgo: 4 })], NOW), 4)
  })

  it('첫 센 리뷰까지 — 시작 전 리뷰 · 작성자 본인(대소문자 무시) · dismissed는 세지 않는다', () => {
    const p = pr({
      openedHoursAgo: 10,
      commitHoursAgo: 8,
      reviews: [
        review('samdo-lee', 9, 'approved'), // 마지막 커밋 전 — 세지 않음
        review('Octo-Kim', 7), // 작성자 본인
        review('dev-park', 6, 'dismissed'),
        review('hana-choi', 3, 'changes_requested'), // 첫 센 리뷰
        review('samdo-lee', 1, 'approved'),
      ],
    })
    assert.equal(averageReviewWaitHours([p], NOW), 5)
  })

  it('PR마다의 대기를 평균해 소수 첫째 자리로 반올림', () => {
    const subs = [
      pr({ openedHoursAgo: 2 }), // 2
      pr({ openedHoursAgo: 3, reviews: [review('samdo-lee', 2.75)] }), // 0.25
      pr({ openedHoursAgo: 30, state: 'draft' }), // 빠짐
    ]
    // (2 + 0.25) / 2 = 1.125 → 1.1
    assert.equal(averageReviewWaitHours(subs, NOW), 1.1)
  })

  it('작성자가 팀원이 아니어도(로그인 없음) 리뷰를 센다 · 시작이 응답 시각보다 늦으면 0', () => {
    assert.equal(averageReviewWaitHours([pr({ authorGithubLogin: null, openedHoursAgo: 6, reviews: [review('octo-kim', 4)] })], NOW), 2)
    assert.equal(averageReviewWaitHours([pr({ openedHoursAgo: -1 })], NOW), 0)
  })
})
