// 원본 이슈 · PR을 놓았을 때의 결과 (CONTRACTS.md 「8」 드롭 결과 — #30 · #26 · #15).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cargoDropTarget, requirementOf } from '../../src/scene/cargoDrop'

const issue = { type: 'task', id: 't_1' } as const
const pr = { type: 'submission', id: 's_1' } as const

describe('드롭 결과 — 함교 · 요구사항 판', () => {
  it('함교(meeting)는 이슈 · PR 모두 안건 올리기', () => {
    assert.equal(cargoDropTarget('meeting', issue), 'meeting')
    assert.equal(cargoDropTarget('meeting', pr), 'meeting')
  })

  it('요구사항 판은 이슈만 연결 — PR(삼각기둥)은 아무 일도 없다 (연결은 요구사항 ↔ 이슈)', () => {
    assert.equal(cargoDropTarget('requirement:rq_1', issue), 'requirement:rq_1')
    assert.equal(cargoDropTarget('requirement:rq_1', pr), null)
    assert.equal(requirementOf('requirement:rq_1'), 'rq_1')
  })

  it('대기 칸은 대기 목록(D — #197 다음 PR)이 나오기 전까지 드롭 대상이 아니다, 그 밖 · 빈 판도 아무 일 없음', () => {
    assert.equal(cargoDropTarget('requirement:waiting', issue), null)
    assert.equal(requirementOf('requirement:waiting'), null)
    for (const zone of [null, 'backlog', 'review', 'done', 'board', 'desk:m_1'] as const) assert.equal(cargoDropTarget(zone, issue), null, String(zone))
    assert.equal(requirementOf('meeting'), null)
    assert.equal(requirementOf(null), null)
  })
})
