// 회의 결정 기록 · 강사 피드백 (CONTRACTS_API.md 「10」, #212 — FR-LRN-22): 요청 검사 규칙과 mock.
// 강사 피드백 쓰기의 성공 경로(지정된 강사 · 요청이 켜진 결정 기록)는 mock에 강사 계정이 없어 Spring 통합 테스트와 ?source=api가 맡는다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import { INSTRUCTOR_FEEDBACK_MAX, MEETING_MSG, decisionRecords, instructorFeedbackError } from '../../src/data/rules/meeting'
import type { AgendaItemCreateRequest, Change, DecisionRequest } from '../../src/data/types'
import { agendaItemExample, instructorFeedbackCreateRequestExample } from './examples'

const TEAM_WS = 'ws_1'
const NOW = new Date('2026-11-05T03:00:00Z')

function make() {
  const clock = { at: NOW }
  const source = createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => clock.at })
  return { source, clock }
}

const agenda = (over: Partial<AgendaItemCreateRequest> = {}): AgendaItemCreateRequest => ({ kind: 'learning', sourceId: null, title: '테스트 전략 공유', background: null, tried: null, unresolvedReason: null, ...over })
const decision = (over: Partial<DecisionRequest> = {}): DecisionRequest => ({ conclusion: '이대로 간다', learning: null, prDecision: null, followUpAssigneeMemberId: null, followUpDueDate: null, meetingId: null, ...over })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, String(e))
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

/** 결정까지 기록한 안건 하나 */
async function decided(source: ReturnType<typeof make>['source']) {
  const item = await source.createAgendaItem(TEAM_WS, agenda())
  return source.recordDecision(TEAM_WS, item.id, decision())
}

describe('강사 피드백 요청 규칙', () => {
  it('본문 — 앞뒤 공백을 뺀 1~2000자, 공백만 · 문자열이 아님은 invalid. 계약 예시는 통과', () => {
    assert.equal(instructorFeedbackError(instructorFeedbackCreateRequestExample), null)
    assert.equal(instructorFeedbackError({ body: '가'.repeat(INSTRUCTOR_FEEDBACK_MAX) }), null)
    assert.equal(instructorFeedbackError({ body: `  ${'가'.repeat(INSTRUCTOR_FEEDBACK_MAX)}  ` }), null)
    assert.equal(instructorFeedbackError({ body: '가'.repeat(INSTRUCTOR_FEEDBACK_MAX + 1) }), MEETING_MSG.feedbackBody)
    assert.equal(instructorFeedbackError({ body: '   ' }), MEETING_MSG.feedbackBody)
    assert.equal(instructorFeedbackError({ body: null as never }), MEETING_MSG.feedbackBody)
  })
})

describe('결정 기록 목록 규칙', () => {
  it('다룬 안건(discussed)만, 결정 시각 최신 것부터 — 결정 전 · 거둔 안건은 빠진다', () => {
    const at = (id: string, status: 'confirmed' | 'discussed' | 'withdrawn', decidedAt: string | null) => ({
      ...agendaItemExample,
      id,
      status,
      decision: decidedAt ? { ...agendaItemExample.decision, decidedAt } : null,
    })
    const items = [at('a', 'discussed', '2026-11-05T01:00:00Z'), at('b', 'confirmed', null), at('c', 'discussed', '2026-11-05T03:00:00Z'), at('d', 'withdrawn', null)]
    assert.deepEqual(decisionRecords(items).map((r) => r.id), ['c', 'a'])
  })
})

describe('mock v1 — 강사 피드백 요청 · 쓰기', () => {
  it('결정 기록에 피드백 요청 — feedbackRequested가 켜지고 agenda_items 알림 한 번, 모양은 계약 예시와 같다', async () => {
    const { source, clock } = make()
    const item = await decided(source)
    assert.deepEqual([item.feedbackRequested, item.feedbackRequestedAt], [false, null])
    const changes: Change[] = []
    const off = source.subscribe(TEAM_WS, (c) => changes.push(c))
    clock.at = new Date('2026-11-05T03:10:00Z')
    const requested = await source.requestDecisionFeedback(TEAM_WS, item.id)
    assert.deepEqual(Object.keys(requested), Object.keys(agendaItemExample))
    assert.deepEqual([requested.feedbackRequested, requested.feedbackRequestedAt, requested.status, requested.decision], [true, '2026-11-05T03:10:00Z', 'discussed', item.decision])
    // 이미 켜져 있으면 그대로 — 시각도 그대로, 알림도 없다
    clock.at = new Date('2026-11-05T04:00:00Z')
    assert.equal((await source.requestDecisionFeedback(TEAM_WS, item.id)).feedbackRequestedAt, '2026-11-05T03:10:00Z')
    off()
    assert.deepEqual(changes, [{ type: 'changed', resources: ['agenda_items'] }])
    // Snapshot의 agendaItems에도 실린다(팀 전체가 본다)
    const inSnapshot = (await source.load(TEAM_WS)).agendaItems.find((a) => a.id === item.id)!
    assert.deepEqual([inSnapshot.feedbackRequested, inSnapshot.feedbackRequestedAt], [true, '2026-11-05T03:10:00Z'])
  })

  it('결정 기록 전(confirmed · withdrawn)은 conflict, 없는 안건 · 남의 사무실은 not_found', async () => {
    const { source } = make()
    const confirmed = await source.createAgendaItem(TEAM_WS, agenda())
    await rejectsCode(source.requestDecisionFeedback(TEAM_WS, confirmed.id), 'conflict', MEETING_MSG.feedbackNotDiscussed)
    const withdrawn = await source.withdrawAgendaItem(TEAM_WS, (await source.createAgendaItem(TEAM_WS, agenda({ title: '거둘 안건' }))).id)
    await rejectsCode(source.requestDecisionFeedback(TEAM_WS, withdrawn.id), 'conflict', MEETING_MSG.feedbackNotDiscussed)
    await rejectsCode(source.requestDecisionFeedback(TEAM_WS, 'ag_nope'), 'not_found', MEETING_MSG.agendaNotFound)
    await rejectsCode(source.requestDecisionFeedback('ws_nope', confirmed.id), 'not_found')
  })

  it('피드백 쓰기 — 본문이 틀리면 invalid가 먼저, 학생(mock 사용자)은 forbidden_role, 안건 · 결정 상태는 그대로', async () => {
    const { source } = make()
    const item = await source.requestDecisionFeedback(TEAM_WS, (await decided(source)).id)
    await rejectsCode(source.addInstructorFeedback(TEAM_WS, item.id, { body: '   ' }), 'invalid', MEETING_MSG.feedbackBody)
    await rejectsCode(source.addInstructorFeedback(TEAM_WS, item.id, { body: '가'.repeat(INSTRUCTOR_FEEDBACK_MAX + 1) }), 'invalid', MEETING_MSG.feedbackBody)
    await rejectsCode(source.addInstructorFeedback(TEAM_WS, item.id, { body: '좋은 결정이에요' }), 'forbidden_role', MEETING_MSG.feedbackInstructorOnly)
    await rejectsCode(source.addInstructorFeedback('ws_nope', item.id, { body: '좋은 결정이에요' }), 'not_found')
    const after = (await source.load(TEAM_WS)).agendaItems.find((a) => a.id === item.id)!
    assert.deepEqual([after.status, after.decision, after.feedbackRequested, after.instructorFeedbacks], ['discussed', item.decision, true, []])
  })
})
