// 주간 일정판 규칙 (#39 · FR-PLAN-02 · P14). v1 mock Snapshot을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { TaskDto, Viewer, WorkspaceSnapshot } from '../../src/data/types'
import { canEditDueDate, LATE_COLUMN, NO_LEAD_ROW, weekCells, WEEKEND_COLUMN } from '../../src/ui/weekPlan'

const load = (workspaceId: string) =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load(workspaceId)

/** 2026-11-02(월) 주 */
const MON = '2026-11-02'

function withTasks(snap: WorkspaceSnapshot, tasks: Partial<TaskDto>[]): WorkspaceSnapshot {
  const base = { ...snap.tasks[0], state: 'open' as const, closedReason: null, priority: null, dueDate: null }
  return { ...snap, tasks: tasks.map((t, i) => ({ ...base, id: `x_${i}`, githubIssueNumber: 100 + i, assigneeMemberIds: [], ...t })) }
}

describe('weekPlan — 칸 배치', () => {
  it('대표 담당자(첫 번째) 행 × 마감 날짜 칸, 주말은 한 칸, 지난 마감은 이번 주에만 지연 칸', async () => {
    const snap = await load('ws_1')
    const [a, b] = snap.members.filter((m) => m.removedAt === null)
    const s = withTasks(snap, [
      { id: 'wed', dueDate: '2026-11-04', assigneeMemberIds: [b.id, a.id] },
      { id: 'sat', dueDate: '2026-11-07', assigneeMemberIds: [a.id] },
      { id: 'sun', dueDate: '2026-11-08', assigneeMemberIds: [a.id] },
      { id: 'late', dueDate: '2026-10-30', assigneeMemberIds: [a.id] },
      { id: 'next', dueDate: '2026-11-10', assigneeMemberIds: [a.id] },
    ])
    const ids = (cells: Map<string, TaskDto[]>, key: string) => (cells.get(key) ?? []).map((t) => t.id)
    const now = weekCells(s, MON, true).cells
    assert.deepEqual(ids(now, `${b.id}|2026-11-04`), ['wed'], '대표 담당자 = assigneeMemberIds[0]')
    assert.deepEqual(ids(now, `${a.id}|${WEEKEND_COLUMN}`), ['sat', 'sun'])
    assert.deepEqual(ids(now, `${a.id}|${LATE_COLUMN}`), ['late'])
    assert.ok(![...now.values()].flat().some((t) => t.id === 'next'), '다음 주 마감은 이 주에 없다')
    assert.ok(!weekCells(s, MON, false).cells.has(`${a.id}|${LATE_COLUMN}`), '다른 주에는 지연 칸이 없다')
  })

  it('담당자 없음 · 대표 담당자가 빠진 팀원이면 미배정 행', async () => {
    const snap = await load('ws_1')
    const removed = snap.members.find((m) => m.removedAt !== null)
    assert.ok(removed)
    const s = withTasks(snap, [
      { id: 'none', dueDate: '2026-11-03' },
      { id: 'left', dueDate: '2026-11-03', assigneeMemberIds: [removed.id] },
    ])
    assert.deepEqual((weekCells(s, MON, true).cells.get(`${NO_LEAD_ROW}|2026-11-03`) ?? []).map((t) => t.id), ['none', 'left'])
  })

  it('닫힌 이슈는 없고, 마감 없는 열린 이슈는 따로 모은다. 칸 안은 우선순위 → 번호 순', async () => {
    const snap = await load('ws_1')
    const s = withTasks(snap, [
      { id: 'closed', state: 'closed', closedReason: 'completed', dueDate: '2026-11-03' },
      { id: 'nodue', dueDate: null },
      { id: 'low', dueDate: '2026-11-03', priority: 'low' },
      { id: 'none', dueDate: '2026-11-03', priority: null },
      { id: 'high', dueDate: '2026-11-03', priority: 'high' },
    ])
    const { cells, noDue } = weekCells(s, MON, true)
    assert.deepEqual((cells.get(`${NO_LEAD_ROW}|2026-11-03`) ?? []).map((t) => t.id), ['high', 'low', 'none'])
    assert.deepEqual(noDue.map((t) => t.id), ['nodue'])
  })

  it('사람별 합계 · 수치를 만들지 않는다 — 결과는 칸과 마감 없는 목록뿐', async () => {
    const snap = await load('ws_1')
    assert.deepEqual(Object.keys(weekCells(snap, MON, true)).sort(), ['cells', 'noDue'])
  })
})

describe('weekPlan — 마감을 바꿀 수 있는 사람 (P14)', () => {
  const task = { assigneeMemberIds: ['m_1', 'm_2'] } as TaskDto
  const viewer = (role: Viewer['role'], memberId: string | null) => ({ userId: 'u', role, memberId, activityConsented: false }) as Viewer

  it('레포 관리자(R2)는 누구 이슈든, 참여자는 그 이슈 담당자일 때만', () => {
    assert.equal(canEditDueDate(viewer('repo_admin', 'm_9'), task), true)
    assert.equal(canEditDueDate(viewer('participant', 'm_2'), task), true, '두 번째 담당자도 담당자')
    assert.equal(canEditDueDate(viewer('participant', 'm_9'), task), false)
  })

  it('강사는 바꿀 수 없다', () => {
    assert.equal(canEditDueDate(viewer('instructor', null), task), false)
  })
})
