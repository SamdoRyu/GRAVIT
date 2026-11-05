// 회의 대화상자 규칙 (#102 T5-c-2 · CONTRACTS_API.md 「10」). v1 mock Snapshot과 mock 회의 · 안건 동작을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { AgendaItemDto, Viewer } from '../../src/data/types'
import { canRunMeeting, canWithdraw, confirmedAgenda, decidedIn, endedMeetings, ongoingMeetingOf, prDecisionsFor, sourceText } from '../../src/ui/meetingView'

const source = () => createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') })
const viewer = (role: Viewer['role'], memberId: string | null) => ({ userId: 'u', role, memberId, activityConsented: false }) as Viewer

describe('meetingView — 회의 흐름', () => {
  it('확정 안건만 결정 대상이고, 결정한 안건은 그 회의의 결정으로 남는다. 결정 안 한 안건은 다음 회의로', async () => {
    const ds = source()
    let snap = await ds.load('ws_1')
    const t = snap.tasks.find((x) => x.state === 'open')!
    const a = await ds.createAgendaItem('ws_1', { kind: 'issue', sourceId: t.id, title: '로그인 방식', background: null, tried: null, unresolvedReason: null })
    const b = await ds.createAgendaItem('ws_1', { kind: 'learning', sourceId: null, title: '테스트 팁', background: null, tried: null, unresolvedReason: null })
    const meeting = await ds.startMeeting('ws_1', { attendeeMemberIds: [] })
    snap = await ds.load('ws_1')
    assert.equal(ongoingMeetingOf(snap)?.id, meeting.id)
    assert.deepEqual(confirmedAgenda(snap).map((x) => x.id), [a.id, b.id])

    await ds.recordDecision('ws_1', a.id, { conclusion: 'OAuth로', learning: null, prDecision: null, followUpAssigneeMemberId: null, followUpDueDate: null, meetingId: meeting.id })
    await ds.endMeeting('ws_1', meeting.id, { notes: '메모' })
    snap = await ds.load('ws_1')
    const ended = endedMeetings(snap)[0]
    assert.equal(ended.id, meeting.id)
    assert.deepEqual(decidedIn(snap, ended).map((x) => x.id), [a.id])
    assert.deepEqual(confirmedAgenda(snap).map((x) => x.id), [b.id], '결정 안 한 안건은 확정 그대로')
    assert.equal(ongoingMeetingOf(snap), null)
  })

  it('끝난 회의는 최근 것부터', async () => {
    const ds = source()
    for (let i = 0; i < 3; i++) {
      const m = await ds.startMeeting('ws_1', { attendeeMemberIds: [] })
      await ds.endMeeting('ws_1', m.id, { notes: null })
    }
    const snap = await ds.load('ws_1')
    const list = endedMeetings(snap)
    const keys = list.map((m) => m.endedAt ?? m.startedAt)
    assert.deepEqual(keys, [...keys].sort().reverse())
    assert.equal(endedMeetings(snap, 2).length, 2)
  })
})

describe('meetingView — 표시 · 권한', () => {
  it('원본 표시: 이슈 #번호 · PR #번호 · 원본 없는 안건은 종류', async () => {
    const snap = await source().load('ws_1')
    const t = snap.tasks[0]
    const p = snap.submissions[0]
    const item = (over: Partial<AgendaItemDto>) => ({ kind: 'other', source: null, ...over }) as AgendaItemDto
    assert.equal(sourceText(snap, item({ kind: 'issue', source: { type: 'task', id: t.id } })), `#${t.githubIssueNumber}`)
    assert.equal(sourceText(snap, item({ kind: 'pr', source: { type: 'submission', id: p.id } })), `PR #${p.githubPrNumber}`)
    assert.equal(sourceText(snap, item({ kind: 'learning' })), '배운 점')
  })

  it('PR 결정: 열린 PR은 셋 다, 머지 · 닫힌 PR은 다시 평가 없음(409), PR이 아닌 안건은 없음', async () => {
    const snap = await source().load('ws_1')
    const p = snap.submissions[0]
    const item = { kind: 'pr', source: { type: 'submission', id: p.id } } as AgendaItemDto
    const withState = (state: 'open' | 'draft' | 'merged' | 'closed') => ({ ...snap, submissions: [{ ...p, state }] })
    assert.deepEqual(prDecisionsFor(withState('open'), item), ['revise_and_reevaluate', 'merge_as_is', 'close_pr'])
    assert.deepEqual(prDecisionsFor(withState('draft'), item), ['revise_and_reevaluate', 'merge_as_is', 'close_pr'])
    assert.deepEqual(prDecisionsFor(withState('merged'), item), ['merge_as_is', 'close_pr'])
    assert.deepEqual(prDecisionsFor(withState('closed'), item), ['merge_as_is', 'close_pr'])
    assert.deepEqual(prDecisionsFor(snap, { kind: 'issue', source: null } as AgendaItemDto), [])
  })

  it('거두기는 올린 사람만 · 결정 전만, 강사는 회의를 열거나 결정하지 않는다', () => {
    const mine = { status: 'confirmed', raisedByMemberId: 'm_1' } as AgendaItemDto
    assert.equal(canWithdraw(viewer('participant', 'm_1'), mine), true)
    assert.equal(canWithdraw(viewer('repo_admin', 'm_2'), mine), false, '레포 관리자라도 올린 사람이 아니면 안 된다')
    assert.equal(canWithdraw(viewer('participant', 'm_1'), { ...mine, status: 'discussed' }), false)
    assert.equal(canRunMeeting(viewer('participant', 'm_1')), true)
    assert.equal(canRunMeeting(viewer('instructor', null)), false)
  })
})
