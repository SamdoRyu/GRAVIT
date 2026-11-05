// 회의 · 안건 · 작업 마감 (CONTRACTS_API.md 「10」 · 「13」, #102 T5-c-2): 요청 검사 규칙과 mock.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage, type StorageLike } from '../../src/data/mock'
import { V1_STORAGE_KEY, createV1MockDataSource, type MockSession } from '../../src/data/mock/v1'
import { AGENDA_TITLE_MAX, MEETING_MSG, MEETING_NOTES_MAX, agendaCreateError, blankToNull, decisionError, dueDateError, meetingEndError } from '../../src/data/rules/meeting'
import type { AgendaItemCreateRequest, Change, DecisionRequest } from '../../src/data/types'

const TEAM_WS = 'ws_1'
/** seed 팀 사무실 — 나(김옥토)는 m_1, 참여자(R2 아님). t_2 = #5(담당 m_1), t_6 = #11(담당 m_3), s_2 = #16 Draft(r_2), s_3 = #10 머지됨 */
const ME = 'm_1'

const make = (session: MockSession | null = 'github', storage: StorageLike = createMemoryStorage()) =>
  createV1MockDataSource({ storage, session, latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, String(e))
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

const agenda = (over: Partial<AgendaItemCreateRequest> = {}): AgendaItemCreateRequest => ({ kind: 'learning', sourceId: null, title: '테스트 전략 공유', background: null, tried: null, unresolvedReason: null, ...over })
const decision = (over: Partial<DecisionRequest> = {}): DecisionRequest => ({ conclusion: '이대로 간다', learning: null, prDecision: null, followUpAssigneeMemberId: null, followUpDueDate: null, meetingId: null, ...over })

function listen(source: ReturnType<typeof make>) {
  const changes: Change[] = []
  const off = source.subscribe(TEAM_WS, (c) => changes.push(c))
  return { changes, off }
}

describe('회의 · 안건 요청 규칙', () => {
  it('안건 — 도움 요청 종류 · 원본 짝 · 제목 1~100자 · 글 2000자', () => {
    assert.equal(agendaCreateError(agenda()), null)
    assert.equal(agendaCreateError(agenda({ kind: 'issue', sourceId: 't_1' })), null)
    assert.equal(agendaCreateError(agenda({ kind: 'help_request' as never })), MEETING_MSG.agendaHelpRequest)
    assert.equal(agendaCreateError(agenda({ kind: 'nope' as never })), MEETING_MSG.agendaKind)
    assert.equal(agendaCreateError(agenda({ kind: 'pr', sourceId: null })), MEETING_MSG.agendaSourceRequired)
    assert.equal(agendaCreateError(agenda({ kind: 'other', sourceId: 't_1' })), MEETING_MSG.agendaSourceNotAllowed)
    assert.equal(agendaCreateError(agenda({ title: '   ' })), MEETING_MSG.agendaTitle)
    assert.equal(agendaCreateError(agenda({ title: 'a'.repeat(AGENDA_TITLE_MAX) })), null)
    assert.equal(agendaCreateError(agenda({ title: 'a'.repeat(AGENDA_TITLE_MAX + 1) })), MEETING_MSG.agendaTitle)
    assert.equal(agendaCreateError(agenda({ tried: 'a'.repeat(2001) })), MEETING_MSG.agendaText)
  })
  it('결정 — 결론 필수, PR 안건만 PR 결정(필수), 후속 기한 날짜', () => {
    assert.equal(decisionError(decision(), 'other'), null)
    assert.equal(decisionError(decision({ conclusion: ' ' }), 'other'), MEETING_MSG.conclusion)
    assert.equal(decisionError(decision({ learning: 'a'.repeat(2001) }), 'other'), MEETING_MSG.learning)
    assert.equal(decisionError(decision(), 'pr'), MEETING_MSG.prDecisionRequired)
    assert.equal(decisionError(decision({ prDecision: 'merge_as_is' }), 'pr'), null)
    assert.equal(decisionError(decision({ prDecision: 'close_pr' }), 'issue'), MEETING_MSG.prDecisionNotAllowed)
    assert.equal(decisionError(decision({ followUpDueDate: '2026-02-30' }), 'other'), MEETING_MSG.followUpDate)
    assert.equal(decisionError(decision({ followUpDueDate: '2026-11-10' }), 'other'), null)
  })
  it('회의록 0~5000자 · 마감 날짜 형식 · 빈 칸은 null', () => {
    assert.equal(meetingEndError({ notes: null }), null)
    assert.equal(meetingEndError({ notes: 'a'.repeat(MEETING_NOTES_MAX) }), null)
    assert.equal(meetingEndError({ notes: 'a'.repeat(MEETING_NOTES_MAX + 1) }), MEETING_MSG.notes)
    assert.equal(dueDateError('2026-11-07'), null)
    assert.equal(dueDateError('2026/11/07'), MEETING_MSG.dueDate)
    assert.equal(dueDateError(null), MEETING_MSG.dueDate)
    assert.equal(blankToNull('  '), null)
    assert.equal(blankToNull(' 배경 '), '배경')
  })
})

describe('mock v1 — 회의', () => {
  it('시작 · 끝 — Snapshot meetings에 남고 changed(meetings), 진행 중이면 다시 시작 conflict, 끝난 회의 다시 끝내기 conflict', async () => {
    const source = make()
    const { changes, off } = listen(source)
    const meeting = await source.startMeeting(TEAM_WS, { attendeeMemberIds: [ME, 'm_2', ME] })
    assert.equal(meeting.status, 'ongoing')
    assert.deepEqual(meeting.attendeeMemberIds, [ME, 'm_2'], '중복은 한 번')
    await rejectsCode(source.startMeeting(TEAM_WS, { attendeeMemberIds: [] }), 'conflict', MEETING_MSG.meetingOngoing)
    const ended = await source.endMeeting(TEAM_WS, meeting.id, { notes: '회의록' })
    assert.deepEqual([ended.status, ended.notes, ended.endedAt], ['ended', '회의록', '2026-11-05T03:00:00Z'])
    await rejectsCode(source.endMeeting(TEAM_WS, meeting.id, { notes: null }), 'conflict', MEETING_MSG.meetingEnded)
    off()
    assert.deepEqual((await source.load(TEAM_WS)).meetings, [ended])
    assert.deepEqual(changes, [
      { type: 'changed', resources: ['meetings'] },
      { type: 'changed', resources: ['meetings'] },
    ])
    // 끝났으니 새 회의를 시작할 수 있다(참석자 없어도 됨)
    assert.equal((await source.startMeeting(TEAM_WS, { attendeeMemberIds: [] })).status, 'ongoing')
  })
  it('거부 — 팀원이 아닌 참석자 · 빠진 팀원 invalid, 없는 회의 not_found, 회의록 5000자 초과 invalid', async () => {
    const source = make()
    await rejectsCode(source.startMeeting(TEAM_WS, { attendeeMemberIds: ['m_nope'] }), 'invalid', MEETING_MSG.attendeeNotMember)
    await rejectsCode(source.startMeeting(TEAM_WS, { attendeeMemberIds: ['m_5'] }), 'invalid', MEETING_MSG.attendeeNotMember)
    await rejectsCode(source.endMeeting(TEAM_WS, 'mt_nope', { notes: null }), 'not_found')
    const m = await source.startMeeting(TEAM_WS, { attendeeMemberIds: [] })
    await rejectsCode(source.endMeeting(TEAM_WS, m.id, { notes: 'a'.repeat(MEETING_NOTES_MAX + 1) }), 'invalid', MEETING_MSG.notes)
    assert.equal((await source.load(TEAM_WS)).meetings[0].status, 'ongoing', '거부된 요청은 바꾸지 않는다')
  })
})

describe('mock v1 — 안건', () => {
  it('올리기 — 이슈 · PR(그때의 현재 회차 기억) · 배운 점, 빈 칸은 null, changed(agenda_items)', async () => {
    const source = make()
    const { changes, off } = listen(source)
    const issue = await source.createAgendaItem(TEAM_WS, agenda({ kind: 'issue', sourceId: 't_2', title: ' 로그인 방식 ', background: '  ' }))
    const pr = await source.createAgendaItem(TEAM_WS, agenda({ kind: 'pr', sourceId: 's_2', title: 'PR 방향' }))
    const learning = await source.createAgendaItem(TEAM_WS, agenda())
    off()
    assert.deepEqual([issue.status, issue.title, issue.background, issue.source, issue.raisedByMemberId], ['confirmed', '로그인 방식', null, { type: 'task', id: 't_2' }, ME])
    assert.deepEqual([pr.source, pr.evaluationRoundId], [{ type: 'submission', id: 's_2' }, 'r_2'])
    assert.deepEqual([learning.source, learning.evaluationRoundId, learning.decision], [null, null, null])
    assert.deepEqual(
      (await source.load(TEAM_WS)).agendaItems.map((a) => a.id),
      [issue.id, pr.id, learning.id],
    )
    assert.equal(changes.length, 3)
    assert.deepEqual(changes[0], { type: 'changed', resources: ['agenda_items'] })
  })
  it('올리기 거부 — 요청 규칙 invalid, 없는 원본 not_found', async () => {
    const source = make()
    await rejectsCode(source.createAgendaItem(TEAM_WS, agenda({ kind: 'help_request' as never })), 'invalid', MEETING_MSG.agendaHelpRequest)
    await rejectsCode(source.createAgendaItem(TEAM_WS, agenda({ kind: 'issue', sourceId: 't_nope' })), 'not_found', MEETING_MSG.agendaSourceNotFound)
    await rejectsCode(source.createAgendaItem(TEAM_WS, agenda({ kind: 'pr', sourceId: 't_2' })), 'not_found', MEETING_MSG.agendaSourceNotFound)
    assert.deepEqual((await source.load(TEAM_WS)).agendaItems, [])
  })
  it('거두기 — 올린 사람만(forbidden_role), 결정 전만(conflict)', async () => {
    const storage = createMemoryStorage()
    const source = make('github', storage)
    const mine = await source.createAgendaItem(TEAM_WS, agenda())
    const withdrawn = await source.withdrawAgendaItem(TEAM_WS, mine.id)
    assert.equal(withdrawn.status, 'withdrawn')
    await rejectsCode(source.withdrawAgendaItem(TEAM_WS, mine.id), 'conflict', MEETING_MSG.agendaNotConfirmed)
    await rejectsCode(source.withdrawAgendaItem(TEAM_WS, 'ag_nope'), 'not_found')
    // 다른 팀원이 올린 안건 — 저장값을 바꿔 만든다(mock 팀 사무실의 로그인 사용자는 한 명)
    const other = await source.createAgendaItem(TEAM_WS, agenda({ title: '남의 안건' }))
    const saved = JSON.parse(storage.getItem(V1_STORAGE_KEY)!)
    saved.workspaces[0].snapshot.agendaItems.find((a: { id: string }) => a.id === other.id).raisedByMemberId = 'm_2'
    storage.setItem(V1_STORAGE_KEY, JSON.stringify(saved))
    await rejectsCode(make('github', storage).withdrawAgendaItem(TEAM_WS, other.id), 'forbidden_role', MEETING_MSG.withdrawNotOwner)
  })
  it('결정 — 결론 · 배운 점 · 후속, 회의에 묶으면 그 회의 discussedAgendaItemIds에 들어간다', async () => {
    const source = make()
    const meeting = await source.startMeeting(TEAM_WS, { attendeeMemberIds: [ME] })
    const item = await source.createAgendaItem(TEAM_WS, agenda({ kind: 'issue', sourceId: 't_2' }))
    const { changes, off } = listen(source)
    const decided = await source.recordDecision(TEAM_WS, item.id, decision({ conclusion: ' OAuth로 간다 ', learning: ' 세션 쿠키 ', followUpAssigneeMemberId: 'm_2', followUpDueDate: '2026-11-07', meetingId: meeting.id }))
    off()
    assert.equal(decided.status, 'discussed')
    assert.deepEqual(decided.decision, { conclusion: 'OAuth로 간다', learning: '세션 쿠키', prDecision: null, followUpAssigneeMemberId: 'm_2', followUpDueDate: '2026-11-07', meetingId: meeting.id, decidedByMemberId: ME, decidedAt: '2026-11-05T03:00:00Z' })
    assert.deepEqual((await source.load(TEAM_WS)).meetings[0].discussedAgendaItemIds, [item.id])
    assert.deepEqual(changes, [{ type: 'changed', resources: ['agenda_items', 'meetings'] }])
    await rejectsCode(source.recordDecision(TEAM_WS, item.id, decision()), 'conflict', MEETING_MSG.agendaNotConfirmed)
  })
  it('PR 결정 revise_and_reevaluate — 새 평가 회차(meeting_reevaluate)가 열리고 지난 회차는 닫혀 rounds에 남는다', async () => {
    const source = make()
    const before = (await source.load(TEAM_WS)).submissions.find((s) => s.id === 's_2')!.currentRound!
    await source.evaluate(TEAM_WS, 's_2', { roundId: before.id, verdict: 'recommend', reason: '좋아요' })
    const item = await source.createAgendaItem(TEAM_WS, agenda({ kind: 'pr', sourceId: 's_2' }))
    const { changes, off } = listen(source)
    await source.recordDecision(TEAM_WS, item.id, decision({ prDecision: 'revise_and_reevaluate' }))
    off()
    const now = (await source.load(TEAM_WS)).submissions.find((s) => s.id === 's_2')!.currentRound!
    assert.deepEqual([now.roundNumber, now.openedReason, now.recommendCount, now.notRecommendCount, now.myEvaluation, now.canEvaluate], [before.roundNumber + 1, 'meeting_reevaluate', 0, 0, null, true])
    const rounds = await source.listRounds(TEAM_WS, 's_2')
    assert.deepEqual(
      rounds.map((r) => [r.roundNumber, r.closedAt === null, r.canEvaluate]),
      [
        [before.roundNumber + 1, true, true],
        [before.roundNumber, false, false],
      ],
    )
    assert.equal(rounds[1].myEvaluation?.reason, '좋아요', '지난 회차의 내 평가는 그 회차에 남는다')
    assert.deepEqual(changes, [{ type: 'changed', resources: ['agenda_items', 'submissions'] }])
  })
  it('결정 거부 — PR 결정 누락 · 팀원 아닌 후속 담당 · 없는 회의 invalid, 머지된 PR에 다시 평가 conflict(기록 안 됨)', async () => {
    const source = make()
    const pr = await source.createAgendaItem(TEAM_WS, agenda({ kind: 'pr', sourceId: 's_2' }))
    await rejectsCode(source.recordDecision(TEAM_WS, pr.id, decision()), 'invalid', MEETING_MSG.prDecisionRequired)
    await rejectsCode(source.recordDecision(TEAM_WS, pr.id, decision({ prDecision: 'merge_as_is', followUpAssigneeMemberId: 'm_nope' })), 'invalid', MEETING_MSG.followUpNotMember)
    await rejectsCode(source.recordDecision(TEAM_WS, pr.id, decision({ prDecision: 'merge_as_is', meetingId: 'mt_nope' })), 'invalid', MEETING_MSG.meetingNotFound)
    const merged = await source.createAgendaItem(TEAM_WS, agenda({ kind: 'pr', sourceId: 's_3' }))
    await rejectsCode(source.recordDecision(TEAM_WS, merged.id, decision({ prDecision: 'revise_and_reevaluate' })), 'conflict', MEETING_MSG.reevaluateClosed)
    const items = (await source.load(TEAM_WS)).agendaItems
    assert.ok(items.every((a) => a.status === 'confirmed' && a.decision === null))
    // 머지된 PR이라도 merge_as_is · close_pr은 기록한다
    assert.equal((await source.recordDecision(TEAM_WS, merged.id, decision({ prDecision: 'close_pr' }))).status, 'discussed')
  })
})

describe('mock v1 — 작업 마감', () => {
  it('담당자는 마감을 정하고 지운다 — Snapshot에 남고 changed(tasks), 없는 마감 지우기도 성공', async () => {
    const source = make()
    const { changes, off } = listen(source)
    const saved = await source.setDueDate(TEAM_WS, 't_2', { dueDate: '2026-11-09' })
    assert.deepEqual([saved.taskId, saved.dueDate, saved.updatedAt, saved.updatedBy.userId], ['t_2', '2026-11-09', '2026-11-05T03:00:00Z', 'u_1'])
    assert.equal((await source.load(TEAM_WS)).tasks.find((t) => t.id === 't_2')!.dueDate, '2026-11-09')
    await source.clearDueDate(TEAM_WS, 't_2')
    await source.clearDueDate(TEAM_WS, 't_2')
    off()
    assert.equal((await source.load(TEAM_WS)).tasks.find((t) => t.id === 't_2')!.dueDate, null)
    assert.equal(changes.length, 2, '이미 없는 마감을 지우면 알림 없음')
  })
  it('거부 — 담당자도 R2도 아님 forbidden_role, 날짜 형식 invalid, 없는 이슈 not_found', async () => {
    const source = make()
    await rejectsCode(source.setDueDate(TEAM_WS, 't_6', { dueDate: '2026-11-09' }), 'forbidden_role', MEETING_MSG.dueDateForbidden)
    await rejectsCode(source.clearDueDate(TEAM_WS, 't_6'), 'forbidden_role')
    await rejectsCode(source.setDueDate(TEAM_WS, 't_2', { dueDate: '11/09' }), 'invalid', MEETING_MSG.dueDate)
    await rejectsCode(source.setDueDate(TEAM_WS, 't_nope', { dueDate: '2026-11-09' }), 'not_found')
  })
  it('로그인 전 unauthorized, 들어갈 수 없는 사무실 not_found', async () => {
    await rejectsCode(make(null).startMeeting(TEAM_WS, { attendeeMemberIds: [] }), 'unauthorized')
    await rejectsCode(make('review').createAgendaItem(TEAM_WS, agenda()), 'not_found')
  })
})
