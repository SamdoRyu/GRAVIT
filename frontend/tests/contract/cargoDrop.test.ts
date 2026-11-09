// 원본 이슈 · PR을 놓았을 때의 결과 (CONTRACTS.md 「8」 드롭 결과 — #30 · #26 · #15)와 회의실 쓰레기통에 안건을 놓았을 때(#291 — FR-LRN-14).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgendaItemDto, Viewer } from '../../src/data/types'
import { MEETING_MSG } from '../../src/data/rules/meeting'
import { agendaDropTarget, cargoDropTarget, isWaitingTarget, requirementOf, TRASH_TARGET, withdrawRefusal, withinTrash } from '../../src/scene/cargoDrop'

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

  it('대기 칸은 이슈만 — 놓으면 대기 목록에서 요구사항을 고른다(바로 연결하지 않음, #197)', () => {
    assert.equal(cargoDropTarget('requirement:waiting', issue), 'requirement:waiting')
    assert.equal(cargoDropTarget('requirement:waiting', pr), null)
    assert.equal(isWaitingTarget('requirement:waiting'), true)
    assert.equal(isWaitingTarget('requirement:rq_1'), false)
    assert.equal(requirementOf('requirement:waiting'), null, '대기 칸은 요구사항 ID가 아니다')
  })

  it('그 밖 · 빈 판은 아무 일 없음', () => {
    for (const zone of [null, 'backlog', 'review', 'done', 'board', 'desk:m_1'] as const) assert.equal(cargoDropTarget(zone, issue), null, String(zone))
    assert.equal(requirementOf('meeting'), null)
    assert.equal(requirementOf(null), null)
  })
})

const viewer = (memberId: string | null) => ({ userId: 'u', role: memberId ? 'participant' : 'instructor', memberId, activityConsented: false }) as Viewer
const item = (raisedBy: string, status: AgendaItemDto['status']) => ({ id: 'ag_1', raisedByMemberId: raisedBy, status }) as AgendaItemDto

describe('회의실 쓰레기통 — 안건 철회 (#291)', () => {
  it('끌고 있는 안건은 쓰레기통 범위 안에서만 철회 대상 — 회의실 자체 · 다른 곳은 아무 일 없음', () => {
    assert.equal(agendaDropTarget(true), TRASH_TARGET)
    assert.equal(agendaDropTarget(false), null)
  })

  it('놓을 수 있는 범위는 쓰레기통 중심에서 catchRadius 안(경계 포함)', () => {
    const c = { x: 10, z: 20 }
    assert.equal(withinTrash(10, 20, c, 1), true)
    assert.equal(withinTrash(11, 20, c, 1), true)
    assert.equal(withinTrash(10.8, 20.8, c, 1), false)
  })

  it('철회는 내가 올린 결정 전(confirmed) 안건만 — 남의 안건 · 결정 · 거둔 안건 · 강사는 이유와 함께 거절', () => {
    assert.equal(withdrawRefusal(viewer('m_1'), item('m_1', 'confirmed')), null)
    assert.equal(withdrawRefusal(viewer('m_1'), item('m_2', 'confirmed')), MEETING_MSG.withdrawNotOwner)
    assert.equal(withdrawRefusal(viewer('m_1'), item('m_1', 'discussed')), MEETING_MSG.agendaNotConfirmed)
    assert.equal(withdrawRefusal(viewer('m_1'), item('m_1', 'withdrawn')), MEETING_MSG.agendaNotConfirmed)
    assert.equal(withdrawRefusal(viewer(null), item('m_1', 'confirmed')), MEETING_MSG.withdrawNotOwner)
    assert.equal(withdrawRefusal(viewer('m_1'), undefined), MEETING_MSG.agendaNotConfirmed, '이미 사라진 안건')
  })
})
