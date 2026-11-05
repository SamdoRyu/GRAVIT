// v1 상세 패널 규칙 (#102 T5-c-2 · #12 FR-OFF-05) — 읽기 전용 표시 값.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { monthDay } from '../../src/data/rules/board'
import { latestReviews, memberWork, pick, taskStateLabel } from '../../src/data/rules/detail'
import type { GithubReviewDto, SubmissionDto, TaskDto, WorkspaceSnapshot } from '../../src/data/types'
import { workspaceSnapshotExample } from './examples'

const example = workspaceSnapshotExample as unknown as WorkspaceSnapshot
const task = (over: Partial<TaskDto>): TaskDto => ({ ...example.tasks[0], assigneeMemberIds: [], ...over })
const sub = (over: Partial<SubmissionDto>): SubmissionDto => ({ ...example.submissions[0], authorMemberId: null, reviewRequestedMemberIds: [], ...over })
const review = (over: Partial<GithubReviewDto>): GithubReviewDto => ({ reviewerMemberId: null, reviewerGithubLogin: 'someone', state: 'commented', submittedAt: '2026-11-05T01:00:00Z', ...over })

describe('이슈 상태 문구', () => {
  it('열림 · 완료로 닫힘 · 계획 안 함으로 닫힘(닫힘 사유가 없으면 완료로 본다)', () => {
    assert.equal(taskStateLabel({ state: 'open', closedReason: null }), '열림')
    assert.equal(taskStateLabel({ state: 'closed', closedReason: 'completed' }), '완료로 닫힘')
    assert.equal(taskStateLabel({ state: 'closed', closedReason: 'not_planned' }), '계획 안 함으로 닫힘')
    assert.equal(taskStateLabel({ state: 'closed', closedReason: null }), '완료로 닫힘')
  })
})

describe('리뷰 — 리뷰어마다 최근 하나', () => {
  it('같은 팀원의 여러 리뷰는 가장 최근 것만, 최근 리뷰가 먼저', () => {
    const out = latestReviews([
      review({ reviewerMemberId: 'm1', reviewerGithubLogin: 'kim', state: 'changes_requested', submittedAt: '2026-11-05T01:00:00Z' }),
      review({ reviewerMemberId: 'm2', reviewerGithubLogin: 'lee', state: 'commented', submittedAt: '2026-11-05T02:00:00Z' }),
      review({ reviewerMemberId: 'm1', reviewerGithubLogin: 'kim', state: 'approved', submittedAt: '2026-11-05T03:00:00Z' }),
    ])
    assert.deepEqual(
      out.map((r) => [r.reviewerMemberId, r.state]),
      [
        ['m1', 'approved'],
        ['m2', 'commented'],
      ],
    )
  })
  it('팀원이 아닌 리뷰어는 GitHub 로그인으로 묶는다(대소문자 무시)', () => {
    const out = latestReviews([
      review({ reviewerGithubLogin: 'Outside', state: 'commented', submittedAt: '2026-11-05T01:00:00Z' }),
      review({ reviewerGithubLogin: 'outside', state: 'approved', submittedAt: '2026-11-05T02:00:00Z' }),
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].state, 'approved')
  })
  it('리뷰가 없으면 빈 목록, 원본을 바꾸지 않는다', () => {
    assert.deepEqual(latestReviews([]), [])
    const src = [review({ submittedAt: '2026-11-05T01:00:00Z' }), review({ reviewerGithubLogin: 'b', submittedAt: '2026-11-05T02:00:00Z' })]
    const copy = structuredClone(src)
    latestReviews(src)
    assert.deepEqual(src, copy)
  })
})

describe('팀원이 맡은 일', () => {
  const snapshot = {
    tasks: [
      task({ id: 't3', githubIssueNumber: 3, assigneeMemberIds: ['m2', 'm1'] }),
      task({ id: 't1', githubIssueNumber: 1, assigneeMemberIds: ['m1'] }),
      task({ id: 't2', githubIssueNumber: 2, assigneeMemberIds: ['m1'], state: 'closed', closedReason: 'completed' }),
      task({ id: 't4', githubIssueNumber: 4, assigneeMemberIds: ['m2'] }),
    ],
    submissions: [
      sub({ id: 's2', githubPrNumber: 12, authorMemberId: 'm1', state: 'draft' }),
      sub({ id: 's1', githubPrNumber: 11, authorMemberId: 'm1', state: 'open', reviewRequestedMemberIds: ['m2'] }),
      sub({ id: 's3', githubPrNumber: 13, authorMemberId: 'm1', state: 'merged', reviewRequestedMemberIds: ['m2'] }),
      sub({ id: 's4', githubPrNumber: 14, authorMemberId: 'm2', state: 'open', reviewRequestedMemberIds: ['m1'] }),
    ],
  }
  it('열린 이슈는 대표가 아니어도 담당이면 들어가고, 닫힌 이슈는 빠진다 — 번호 순', () => {
    assert.deepEqual(
      memberWork(snapshot, 'm1').openTasks.map((t) => t.id),
      ['t1', 't3'],
    )
  })
  it('연 PR은 열림 · Draft만, 리뷰 요청은 열린 PR만', () => {
    const m1 = memberWork(snapshot, 'm1')
    assert.deepEqual(
      m1.openSubmissions.map((s) => s.id),
      ['s1', 's2'],
    )
    assert.deepEqual(
      m1.reviewRequests.map((s) => s.id),
      ['s4'],
    )
    assert.deepEqual(
      memberWork(snapshot, 'm2').reviewRequests.map((s) => s.id),
      ['s1'],
    )
  })
  it('아무것도 없는 팀원', () => {
    assert.deepEqual(memberWork(snapshot, 'm9'), { openTasks: [], openSubmissions: [], reviewRequests: [] })
  })
})

describe('ID로 찾기 · 날짜 표시', () => {
  it('pick — 목록 순서대로, Snapshot에 없는 ID는 건너뛴다', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    assert.deepEqual(
      pick(list, ['c', 'x', 'a']).map((x) => x.id),
      ['c', 'a'],
    )
    assert.deepEqual(pick(list, []), [])
  })
  it('monthDay — 앞의 0 없이 월 · 일', () => {
    assert.equal(monthDay('2026-11-07'), '11월 7일')
    assert.equal(monthDay('2027-01-31'), '1월 31일')
  })
})
