// 관리 패널 칸반 · 목록의 v1 항목 규칙 (#102 T5-c-2). 열은 CONTRACTS.md 「3」 표시 상태.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardItems, dueLabel, matchesQuery, sortItems, submissionColumn, taskColumn, type BoardItem } from '../../src/data/rules/board'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { MemberDto, SubmissionDto, TaskDto, WorkspaceSnapshot } from '../../src/data/types'
import { workspaceSnapshotExample } from './examples'

const example = workspaceSnapshotExample as unknown as WorkspaceSnapshot
const baseTask = example.tasks[0]
const baseSub = example.submissions[0]
const task = (over: Partial<TaskDto>): TaskDto => ({ ...baseTask, linkedSubmissionIds: [], isBlocked: false, priority: null, dueDate: null, labels: [], ...over })
const sub = (over: Partial<SubmissionDto>): SubmissionDto => ({ ...baseSub, linkedTaskIds: [], isBlocked: false, priority: null, labels: [], ...over })
const member = (id: string, displayName: string, githubLogin: string | null): MemberDto => ({ ...example.members[0], id, displayName, githubLogin })

describe('칸반 열 — 표시 상태', () => {
  it('이슈: 닫힘 → 완료, 열림 · 담당자 있음 → 작업 중, 없음 → 대기', () => {
    assert.equal(taskColumn({ state: 'closed', assigneeMemberIds: ['m1'] }), 'done')
    assert.equal(taskColumn({ state: 'open', assigneeMemberIds: ['m1', 'm2'] }), 'working')
    assert.equal(taskColumn({ state: 'open', assigneeMemberIds: [] }), 'waiting')
  })
  it('PR: 열림 · Draft → 검토, 머지 · 닫힘 → 완료', () => {
    assert.equal(submissionColumn({ state: 'open' }), 'review')
    assert.equal(submissionColumn({ state: 'draft' }), 'review')
    assert.equal(submissionColumn({ state: 'merged' }), 'done')
    assert.equal(submissionColumn({ state: 'closed' }), 'done')
  })
})

describe('boardItems', () => {
  it('Snapshot의 이슈 · PR 전부, 번호 순 · 같은 번호면 이슈 먼저, 키가 겹치지 않는다', () => {
    const items = boardItems({
      tasks: [task({ id: '1', githubIssueNumber: 7 }), task({ id: '2', githubIssueNumber: 3 })],
      submissions: [sub({ id: '1', githubPrNumber: 7 }), sub({ id: '9', githubPrNumber: 5 })],
    })
    assert.deepEqual(
      items.map((i) => i.key),
      ['task:2', 'submission:9', 'task:1', 'submission:1'],
    )
  })
  it('표시 — 막힘 · Draft · 미병합 종료 · 계획 안 함', () => {
    const [blocked, notPlanned] = boardItems({ tasks: [task({ id: 'a', githubIssueNumber: 1, isBlocked: true }), task({ id: 'b', githubIssueNumber: 2, state: 'closed', closedReason: 'not_planned' })], submissions: [] })
    assert.deepEqual(blocked.flags, ['blocked'])
    assert.deepEqual(notPlanned.flags, ['not_planned'])
    const [draft, closed, merged] = boardItems({ tasks: [], submissions: [sub({ id: 'd', githubPrNumber: 1, state: 'draft' }), sub({ id: 'c', githubPrNumber: 2, state: 'closed' }), sub({ id: 'm', githubPrNumber: 3, state: 'merged' })] })
    assert.deepEqual(draft.flags, ['draft'])
    assert.deepEqual(closed.flags, ['unmerged_closed'])
    assert.deepEqual(merged.flags, [])
  })
  it('사람 — 이슈는 담당자 전원(대표 먼저), PR은 팀원 작성자만', () => {
    const [t, mine, outsider] = boardItems({
      tasks: [task({ githubIssueNumber: 1, assigneeMemberIds: ['m2', 'm1'] })],
      submissions: [sub({ id: 's1', githubPrNumber: 2, authorMemberId: 'm3' }), sub({ id: 's2', githubPrNumber: 3, authorMemberId: null })],
    })
    assert.deepEqual(t.memberIds, ['m2', 'm1'])
    assert.deepEqual(mine.memberIds, ['m3'])
    assert.deepEqual(outsider.memberIds, [])
    assert.equal(outsider.dueDate, null, 'PR에는 마감이 없다')
  })
  it('mock 팀 사무실 Snapshot — 이슈 · PR 수가 맞고 열마다 들어간다', async () => {
    const src = createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0] })
    const snap = await src.load('ws_1')
    const items = boardItems(snap)
    assert.equal(items.length, snap.tasks.length + snap.submissions.length)
    assert.equal(new Set(items.map((i) => i.key)).size, items.length)
    for (const c of ['waiting', 'working', 'review', 'done'] as const) assert.ok(items.some((i) => i.column === c), c)
  })
})

describe('검색', () => {
  const members = new Map([
    ['m1', member('m1', '김옥토', 'octo-kim')],
    ['m2', member('m2', '이삼도', 'samdo-lee')],
  ])
  const [item] = boardItems({ tasks: [task({ githubIssueNumber: 42, title: 'Login Form 만들기', labels: ['area:auth'], assigneeMemberIds: ['m1'] })], submissions: [] })
  const hit = (q: string) => matchesQuery(item, members, q)

  it('빈 검색어 · 공백은 모두 맞다', () => {
    assert.ok(hit(''))
    assert.ok(hit('   '))
  })
  it('제목(대소문자 무시) · #번호 · 라벨 · 담당자 이름 · GitHub 로그인', () => {
    assert.ok(hit('login'))
    assert.ok(hit('#42'))
    assert.ok(hit('area:auth'))
    assert.ok(hit('김옥토'))
    assert.ok(hit('OCTO'))
  })
  it('낱말이 모두 맞아야 한다 · 다른 사람 이름은 안 맞는다', () => {
    assert.ok(hit('login 김옥토'))
    assert.ok(!hit('login 이삼도'))
    assert.ok(!hit('#43'))
  })
})

describe('목록 정렬', () => {
  const members = new Map([
    ['m1', member('m1', '가나', null)],
    ['m2', member('m2', '다라', null)],
  ])
  const items = boardItems({
    tasks: [
      task({ id: 'a', githubIssueNumber: 1, priority: 'low', assigneeMemberIds: ['m2'], dueDate: '2026-11-10' }),
      task({ id: 'b', githubIssueNumber: 2, priority: null, assigneeMemberIds: [], dueDate: null }),
      task({ id: 'c', githubIssueNumber: 3, priority: 'high', assigneeMemberIds: ['m1'], dueDate: '2026-11-08' }),
    ],
    submissions: [sub({ id: 'p', githubPrNumber: 4, priority: 'medium', authorMemberId: null })],
  })
  const order = (key: Parameters<typeof sortItems>[1], dir: 'asc' | 'desc') => sortItems(items, key, dir, members).map((i) => i.number)

  it('우선순위 오름차순 = 높은 것 먼저, 없는 것은 어느 방향이든 뒤', () => {
    assert.deepEqual(order('priority', 'asc'), [3, 4, 1, 2])
    assert.deepEqual(order('priority', 'desc'), [1, 4, 3, 2])
  })
  it('담당 · 마감 — 없는 값은 뒤, 같으면 번호 순', () => {
    assert.deepEqual(order('member', 'asc'), [3, 1, 2, 4])
    assert.deepEqual(order('due', 'asc'), [3, 1, 2, 4])
    assert.deepEqual(order('due', 'desc'), [1, 3, 2, 4])
  })
  it('번호 · 상태', () => {
    assert.deepEqual(order('number', 'desc'), [4, 3, 2, 1])
    assert.deepEqual(order('column', 'asc'), [2, 1, 3, 4])
  })
  it('원본 배열을 바꾸지 않는다', () => {
    const before = items.map((i) => i.key)
    sortItems(items, 'title', 'desc', members)
    assert.deepEqual(
      items.map((i) => i.key),
      before,
    )
  })
})

describe('마감 표시 (한국 날짜 오늘 기준)', () => {
  const at = (dueDate: string | null, column: BoardItem['column'] = 'working') => dueLabel({ dueDate, column }, '2026-11-05')
  it('지남 · 오늘 · 2일 이내 · 그 뒤', () => {
    assert.deepEqual(at('2026-11-03'), { text: '2일 지남', tone: 'bad' })
    assert.deepEqual(at('2026-11-05'), { text: '오늘 마감', tone: 'warn' })
    assert.deepEqual(at('2026-11-07'), { text: '2일 남음', tone: 'warn' })
    assert.deepEqual(at('2026-11-08'), { text: '3일 남음', tone: 'dim' })
  })
  it('완료는 날짜만 흐리게, 마감 없음 · 깨진 날짜는 null', () => {
    assert.deepEqual(at('2026-11-03', 'done'), { text: '11월 3일', tone: 'dim' })
    assert.equal(at(null), null)
    assert.equal(at('2026-13-99'), null)
  })
})
