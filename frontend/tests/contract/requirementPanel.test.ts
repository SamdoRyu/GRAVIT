// 요구사항 패널 표시 규칙 (#197 — FR-REQ-04 · 05 · 06 · 07). 상태로 나누기 · 연결된 이슈 순서 · 진행 표시 · R2만 연결 끊기.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RequirementDto, RequirementLinkDto, TaskDto } from '../../src/data/types'
import { canEditRequirementLinks, progressRatio, progressText, requirementName, requirementSections } from '../../src/data/rules/requirements'
import { workspaceSnapshotExample } from './examples'

const baseTask = workspaceSnapshotExample.tasks[0]
const task = (id: string, n: number, state: TaskDto['state'] = 'open'): TaskDto => ({ ...baseTask, id, githubIssueNumber: n, title: `이슈 ${n}`, state })
const req = (id: string, position: number, status: RequirementDto['status'] = 'active', patch: Partial<RequirementDto> = {}): RequirementDto => ({
  id,
  sourceKey: `FR-${id}`,
  title: id,
  position,
  status,
  linkedTaskCount: 0,
  doneTaskCount: 0,
  lastSeenAt: null,
  ...patch,
})
const link = (id: string, requirementId: string, taskId: string): RequirementLinkDto => ({ id, requirementId, taskId, linkedAt: '2026-11-05T00:00:00Z' })

describe('요구사항 패널 — 나누기 · 순서', () => {
  it('문서에 있는 것(active)과 확인이 필요한 것(missing · needs_review)으로 나누고, 각각 문서 순서(position)', () => {
    const s = requirementSections({
      requirements: [req('c', 2), req('m', 1, 'missing'), req('a', 0), req('n', 3, 'needs_review')],
      requirementLinks: [],
      tasks: [],
    })
    assert.deepEqual(s.active.map((r) => r.requirement.id), ['a', 'c'])
    assert.deepEqual(s.others.map((r) => r.requirement.id), ['m', 'n'])
  })

  it('연결된 이슈 — 열린 것 먼저, 그 안에서 이슈 번호 순. Snapshot에 없는 이슈는 task null로 맨 뒤', () => {
    const s = requirementSections({
      requirements: [req('a', 0)],
      requirementLinks: [link('1', 'a', 't9'), link('2', 'a', 'gone'), link('3', 'a', 't2'), link('4', 'a', 't5')],
      tasks: [task('t9', 9, 'closed'), task('t2', 2, 'closed'), task('t5', 5)],
    })
    assert.deepEqual(
      s.active[0].issues.map((i) => i.task?.id ?? null),
      ['t5', 't2', 't9', null],
    )
  })

  it('missing · needs_review 요구사항의 연결도 그대로 보인다(연결 보존 확인용)', () => {
    const s = requirementSections({ requirements: [req('m', 0, 'missing')], requirementLinks: [link('1', 'm', 't1')], tasks: [task('t1', 1)] })
    assert.equal(s.others[0].issues.length, 1)
  })
})

describe('요구사항 패널 — 표시', () => {
  it('진행 표시 — 연결이 없으면 "연결 없음"(빈 구역), 아니면 닫힌 수 / 연결 수', () => {
    assert.equal(progressText({ linkedTaskCount: 0, doneTaskCount: 0 }), '연결 없음')
    assert.equal(progressText({ linkedTaskCount: 3, doneTaskCount: 1 }), '1/3 닫힘')
    assert.equal(progressRatio({ linkedTaskCount: 0, doneTaskCount: 0 }), 0)
    assert.equal(progressRatio({ linkedTaskCount: 4, doneTaskCount: 1 }), 0.25)
    assert.equal(progressRatio({ linkedTaskCount: 2, doneTaskCount: 5 }), 1, '1을 넘지 않는다')
  })

  it('이름 — 원본 ID가 있으면 "ID · 제목", 없으면 제목만', () => {
    assert.equal(requirementName({ sourceKey: 'FR-AUTH-01', title: 'GitHub 로그인' }), 'FR-AUTH-01 · GitHub 로그인')
    assert.equal(requirementName({ sourceKey: null, title: '동기화 상태 표시' }), '동기화 상태 표시')
  })

  it('연결 끊기는 레포 관리자(R2)만', () => {
    assert.equal(canEditRequirementLinks({ role: 'repo_admin' }), true)
    assert.equal(canEditRequirementLinks({ role: 'participant' }), false)
    assert.equal(canEditRequirementLinks({ role: 'instructor' }), false)
  })
})
