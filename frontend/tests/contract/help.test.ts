// 도움 요청 (CONTRACTS_API.md 「11」, #183): 요청 검사 규칙 · Snapshot 반영 규칙과 mock.
// 권한 규칙 자체는 Spring 통합 테스트(HelpRequestIntegrationTest)가 맡는다. 여기서는 mock이 서버와 같은 흐름으로 도는지 본다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { V1_STORAGE_KEY, createV1MockDataSource } from '../../src/data/mock/v1'
import { createSeed } from '../../src/data/mock/v1/seed'
import {
  HELP_CONTENT_MAX,
  HELP_LEARNING_MAX,
  HELP_MSG,
  afterComment,
  awaitingInstructor,
  helpCloseError,
  helpCommentError,
  helpCreateError,
  helpToAgendaError,
  instructorAnswerCheck,
  instructorRequestError,
  isAgendaCandidate,
  needsInstructorCheck,
  toHelpSummary,
  unreadInstructorAnswers,
} from '../../src/data/rules/help'
import type { Change, HelpCommentDto, HelpRequestStatus } from '../../src/data/types'
import { helpRequestDetailExample, helpRequestSummaryExample } from './examples'

const TEAM_WS = 'ws_1'
const DEMO_WS = 'ws_2'
/**
 * seed 팀 사무실 — 나(김옥토)는 m_1. hr_1 = 내 요청(discussing, 50시간 전 — 안건 후보, 이삼도 코멘트 hc_1),
 * hr_2 = 박데브(m_3)의 open 요청(6시간 전), hr_3 = 최하나(m_4)의 resolved 요청(내 코멘트 hc_2가 도움이 됨)
 */
const ME = 'm_1'
const NOW = new Date('2026-11-05T03:00:00Z')

const make = () => createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => NOW })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, String(e))
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

function listen(source: ReturnType<typeof make>) {
  const changes: Change[] = []
  const off = source.subscribe(TEAM_WS, (c) => changes.push(c))
  return { changes, off }
}

describe('도움 요청 규칙', () => {
  it('글 검사 — 공백만 · 빈 값 · 길이 초과는 거부, 앞뒤 공백이 있는 값은 받는다 (CONTRACTS.md 「5」)', () => {
    for (const blank of ['', '   ', '\n\t']) {
      assert.equal(helpCreateError({ content: blank, fromStandupId: null }), HELP_MSG.content)
      assert.equal(helpCommentError({ content: blank }), HELP_MSG.comment)
      assert.equal(helpCloseError({ helpfulCommentId: null, learning: blank }), HELP_MSG.learning)
      assert.equal(helpToAgendaError({ title: blank }), HELP_MSG.agendaTitle)
    }
    assert.equal(helpCreateError({ content: 'a'.repeat(HELP_CONTENT_MAX + 1), fromStandupId: null }), HELP_MSG.content)
    assert.equal(helpCreateError({ content: 'a'.repeat(HELP_CONTENT_MAX), fromStandupId: null }), null)
    assert.equal(helpCloseError({ helpfulCommentId: null, learning: 'a'.repeat(HELP_LEARNING_MAX + 1) }), HELP_MSG.learning)
    assert.equal(helpToAgendaError({ title: 'a'.repeat(101) }), HELP_MSG.agendaTitle)
    assert.equal(helpCommentError({ content: '  있어요  ' }), null)
  })

  it('안건 후보 — open · discussing이고 만든 지 48시간부터 (FR-LRN-18)', () => {
    const created = '2026-11-03T03:00:00Z'
    assert.equal(isAgendaCandidate('open', created, new Date('2026-11-05T02:59:59Z')), false)
    assert.equal(isAgendaCandidate('open', created, NOW), true)
    assert.equal(isAgendaCandidate('discussing', created, NOW), true)
    for (const status of ['resolved', 'on_agenda', 'ended'] as const) assert.equal(isAgendaCandidate(status, created, NOW), false, status)
  })

  it('Snapshot 반영 — 상세는 요약 칸만 남기고, 첫 비요청자 코멘트만 open → discussing (강사 답변 · 요청자 코멘트는 그대로)', () => {
    assert.deepEqual(toHelpSummary(helpRequestDetailExample), { ...helpRequestSummaryExample, status: 'discussing', commentCount: 1 })
    const open = { ...helpRequestSummaryExample, status: 'open' as const }
    const by = (authorMemberId: string | null): HelpCommentDto => ({ ...helpRequestDetailExample.comments[0], authorMemberId, isInstructorAnswer: authorMemberId === null })
    assert.deepEqual([afterComment(open, by('3')).status, afterComment(open, by('3')).commentCount], ['discussing', 1])
    assert.equal(afterComment(open, by(open.requesterMemberId)).status, 'open')
    assert.equal(afterComment(open, by(null)).status, 'open')
  })
})

describe('mock v1 — 도움 요청', () => {
  it('Snapshot — createdAt 오름차순, 안건 후보는 지금 시각으로 계산, 상세에 코멘트 · 도움이 된 코멘트 · 배운 점', async () => {
    const source = make()
    const snap = await source.load(TEAM_WS)
    assert.deepEqual(
      snap.helpRequests.map((h) => [h.id, h.status, h.isAgendaCandidate]),
      [
        ['hr_1', 'discussing', true],
        ['hr_3', 'resolved', false],
        ['hr_2', 'open', false],
        ['hr_4', 'open', false],
      ],
    )
    const resolved = await source.getHelpRequest(TEAM_WS, 'hr_3')
    assert.deepEqual([resolved.comments.map((c) => c.id), resolved.helpfulCommentId, resolved.learning], [['hc_2'], 'hc_2', '익명화는 내보낼 때 한 번에 한다'])
    assert.deepEqual(Object.keys(resolved), Object.keys(helpRequestDetailExample), '키 순서까지 계약 예시와 같다')
    await rejectsCode(source.getHelpRequest(TEAM_WS, 'hr_nope'), 'not_found')
  })

  it('쓰기 — open으로 생기고 Snapshot · changed(help_requests). 공백만은 invalid, 없는 스탠드업 not_found · 남의 스탠드업 forbidden_role', async () => {
    const source = make()
    const { changes, off } = listen(source)
    const created = await source.createHelpRequest(TEAM_WS, { content: '테스트 DB가 자꾸 잠겨요', fromStandupId: null })
    off()
    assert.deepEqual([created.status, created.requesterMemberId, created.commentCount, created.createdAt], ['open', ME, 0, NOW.toISOString().replace('.000', '')])
    assert.deepEqual(Object.keys(created), Object.keys(helpRequestSummaryExample))
    assert.deepEqual((await source.load(TEAM_WS)).helpRequests.at(-1), created)
    assert.deepEqual(changes, [{ type: 'changed', resources: ['help_requests'] }])
    await rejectsCode(source.createHelpRequest(TEAM_WS, { content: '   ', fromStandupId: null }), 'invalid', HELP_MSG.content)
    // seed 스탠드업: st_1 = 내 것(어제), st_2 = 이삼도 것 (#190)
    await rejectsCode(source.createHelpRequest(TEAM_WS, { content: '막혔어요', fromStandupId: 'st_nope' }), 'not_found', HELP_MSG.standupNotFound)
    await rejectsCode(source.createHelpRequest(TEAM_WS, { content: '막혔어요', fromStandupId: 'st_2' }), 'forbidden_role', HELP_MSG.notOwnStandup)
    assert.equal((await source.createHelpRequest(TEAM_WS, { content: '막혔어요', fromStandupId: 'st_1' })).fromStandupId, 'st_1')
  })

  it('코멘트 — 남의 open 요청에 첫 코멘트면 discussing, 내 요청에 단 코멘트는 그대로, 해결된 요청은 conflict', async () => {
    const source = make()
    const comment = await source.addHelpComment(TEAM_WS, 'hr_2', { content: '드래그 끝날 때 좌표를 보세요' })
    assert.deepEqual([comment.authorMemberId, comment.isInstructorAnswer, comment.author.displayName], [ME, false, '김옥토'])
    const hr2 = (await source.load(TEAM_WS)).helpRequests.find((h) => h.id === 'hr_2')!
    assert.deepEqual([hr2.status, hr2.commentCount], ['discussing', 1])
    assert.deepEqual((await source.getHelpRequest(TEAM_WS, 'hr_2')).comments, [comment])

    const mine = await source.createHelpRequest(TEAM_WS, { content: '혼자 메모', fromStandupId: null })
    await source.addHelpComment(TEAM_WS, mine.id, { content: '보충 설명' })
    assert.equal((await source.getHelpRequest(TEAM_WS, mine.id)).status, 'open', '요청자 코멘트는 상태를 바꾸지 않는다')

    await rejectsCode(source.addHelpComment(TEAM_WS, 'hr_3', { content: '늦었지만' }), 'conflict', HELP_MSG.closedForComments)
    await rejectsCode(source.addHelpComment(TEAM_WS, 'hr_2', { content: ' ' }), 'invalid', HELP_MSG.comment)
    await rejectsCode(source.addHelpComment(TEAM_WS, 'hr_nope', { content: '어디?' }), 'not_found')
  })

  it('닫기 — 요청자만, 도움이 된 코멘트는 이 글의 남의 코멘트만, 닫으면 resolved · 다시 닫기 conflict', async () => {
    const source = make()
    await rejectsCode(source.closeHelpRequest(TEAM_WS, 'hr_2', { helpfulCommentId: null, learning: '배움' }), 'forbidden_role', HELP_MSG.notRequester)
    await rejectsCode(source.closeHelpRequest(TEAM_WS, 'hr_1', { helpfulCommentId: 'hc_2', learning: '배움' }), 'invalid', HELP_MSG.helpfulNotHere)
    const own = await source.addHelpComment(TEAM_WS, 'hr_1', { content: '내가 찾은 것' })
    await rejectsCode(source.closeHelpRequest(TEAM_WS, 'hr_1', { helpfulCommentId: own.id, learning: '배움' }), 'invalid', HELP_MSG.helpfulNotAllowed)
    await rejectsCode(source.closeHelpRequest(TEAM_WS, 'hr_1', { helpfulCommentId: 'hc_1', learning: '' }), 'invalid', HELP_MSG.learning)

    const closed = await source.closeHelpRequest(TEAM_WS, 'hr_1', { helpfulCommentId: 'hc_1', learning: 'SameSite는 세션 쿠키 설정에서 바꾼다' })
    assert.deepEqual([closed.status, closed.helpfulCommentId, closed.learning, closed.closedAt, closed.isAgendaCandidate], ['resolved', 'hc_1', 'SameSite는 세션 쿠키 설정에서 바꾼다', '2026-11-05T03:00:00Z', false])
    assert.equal(closed.comments.length, 2)
    await rejectsCode(source.closeHelpRequest(TEAM_WS, 'hr_1', { helpfulCommentId: null, learning: '또' }), 'conflict', HELP_MSG.notOpen)
    await rejectsCode(source.closeHelpRequest(TEAM_WS, 'hr_nope', { helpfulCommentId: null, learning: '배움' }), 'not_found')
  })

  it('안건으로 — help_request 안건(confirmed)이 생기고 on_agenda, 코멘트는 계속, 회의 결정을 기록하면 ended (FR-LRN-19 · 20)', async () => {
    const source = make()
    const { changes, off } = listen(source)
    const item = await source.convertHelpRequestToAgenda(TEAM_WS, 'hr_1', { title: '세션이 끊기는 원인' })
    assert.deepEqual([item.kind, item.status, item.source, item.raisedByMemberId, item.title], ['help_request', 'confirmed', { type: 'help_request', id: 'hr_1' }, ME, '세션이 끊기는 원인'])
    let snap = await source.load(TEAM_WS)
    const onAgenda = snap.helpRequests.find((h) => h.id === 'hr_1')!
    assert.deepEqual([onAgenda.status, onAgenda.agendaItemId, onAgenda.isAgendaCandidate], ['on_agenda', item.id, false])
    assert.ok(snap.agendaItems.some((a) => a.id === item.id))
    await source.addHelpComment(TEAM_WS, 'hr_1', { content: '회의 전에 덧붙여요' })
    await rejectsCode(source.convertHelpRequestToAgenda(TEAM_WS, 'hr_1', { title: '다시' }), 'conflict', HELP_MSG.notOpen)

    await source.recordDecision(TEAM_WS, item.id, { conclusion: 'SameSite를 Lax로', learning: null, prDecision: null, followUpAssigneeMemberId: null, followUpDueDate: null, meetingId: null })
    off()
    snap = await source.load(TEAM_WS)
    const ended = snap.helpRequests.find((h) => h.id === 'hr_1')!
    assert.deepEqual([ended.status, ended.closedAt], ['ended', '2026-11-05T03:00:00Z'])
    await rejectsCode(source.addHelpComment(TEAM_WS, 'hr_1', { content: '끝난 뒤' }), 'conflict', HELP_MSG.closedForComments)
    assert.deepEqual(changes[0], { type: 'changed', resources: ['agenda_items', 'help_requests'] })
    assert.deepEqual(changes.at(-1), { type: 'changed', resources: ['agenda_items', 'help_requests'] })

    await rejectsCode(source.convertHelpRequestToAgenda(TEAM_WS, 'hr_2', { title: '남의 것' }), 'forbidden_role', HELP_MSG.notRequester)
    await rejectsCode(source.convertHelpRequestToAgenda(TEAM_WS, 'hr_2', { title: '  ' }), 'invalid', HELP_MSG.agendaTitle)
  })

  it('강사에게 요청 — 요청자만, 켜면 시각이 남고 다시 눌러도 그대로(처음 시각 유지)', async () => {
    const source = make()
    const on = await source.requestInstructorHelp(TEAM_WS, 'hr_1')
    assert.deepEqual([on.instructorRequested, on.instructorRequestedAt], [true, '2026-11-05T03:00:00Z'])
    const again = await source.requestInstructorHelp(TEAM_WS, 'hr_1')
    assert.deepEqual(again, on)
    assert.equal((await source.load(TEAM_WS)).helpRequests.find((h) => h.id === 'hr_1')!.instructorRequested, true)
    await rejectsCode(source.requestInstructorHelp(TEAM_WS, 'hr_2'), 'forbidden_role', HELP_MSG.notRequester)
  })

  it('강사에게 요청 (#272) — 닫힌 글은 이미 켜져 있어도 conflict, 요청자 검사가 먼저', async () => {
    const source = make()
    await source.requestInstructorHelp(TEAM_WS, 'hr_1')
    await source.closeHelpRequest(TEAM_WS, 'hr_1', { helpfulCommentId: null, learning: '스스로 해결' })
    await rejectsCode(source.requestInstructorHelp(TEAM_WS, 'hr_1'), 'conflict', HELP_MSG.closedForInstructor)
    // hr_3은 최하나의 resolved 요청 — 상태보다 요청자 검사가 먼저다
    await rejectsCode(source.requestInstructorHelp(TEAM_WS, 'hr_3'), 'forbidden_role', HELP_MSG.notRequester)
  })

  it('강사에게 요청 (#272) — 지정된 강사가 없으면 새로 켤 수 없고, 이미 켜진 글은 그대로(알림 없음)', async () => {
    const storage = createMemoryStorage()
    const seed = createSeed(NOW, 'github')
    const team = seed.workspaces.find((w) => w.snapshot.workspace.id === TEAM_WS)!
    team.instructors = []
    const mine = team.snapshot.helpRequests.find((h) => h.id === 'hr_1')!
    Object.assign(mine, { instructorRequested: true, instructorRequestedAt: '2026-11-05T01:00:00Z' })
    team.snapshot.helpRequests.push({ ...mine, id: 'hr_new', instructorRequested: false, instructorRequestedAt: null })
    storage.setItem(V1_STORAGE_KEY, JSON.stringify(seed))
    const source = createV1MockDataSource({ storage, session: 'github', latencyMs: [0, 0], now: () => NOW })
    const { changes } = listen(source)

    await rejectsCode(source.requestInstructorHelp(TEAM_WS, 'hr_new'), 'conflict', HELP_MSG.noInstructor)
    const kept = await source.requestInstructorHelp(TEAM_WS, 'hr_1')
    assert.deepEqual([kept.instructorRequested, kept.instructorRequestedAt], [true, '2026-11-05T01:00:00Z'])
    assert.deepEqual(changes, [])
  })

  it('강사에게 요청 (#272) — 시연 사무실은 지정 행 없이도 켠다(심사용 강사가 강사)', async () => {
    const source = make()
    const created = await source.createHelpRequest(DEMO_WS, { content: '시연 질문', fromStandupId: null })
    assert.equal((await source.requestInstructorHelp(DEMO_WS, created.id)).instructorRequested, true)
  })
})

describe('강사에게 요청 규칙 (#272 — 「11」, 서버 HelpRequestInstructorRequestTest와 같은 순서)', () => {
  const at = (status: HelpRequestStatus, instructorRequested = false) => ({ status, instructorRequested })

  it('강사가 답할 수 있는 open · discussing · on_agenda만 — 지정된 강사가 있으면 켤 수 있다', () => {
    for (const status of ['open', 'discussing', 'on_agenda'] as const) assert.equal(instructorRequestError(at(status), true), null)
  })

  it('resolved · ended는 이미 켜져 있어도 안 된다 — 강사 유무보다 먼저', () => {
    for (const status of ['resolved', 'ended'] as const) {
      assert.equal(instructorRequestError(at(status), true), HELP_MSG.closedForInstructor)
      assert.equal(instructorRequestError(at(status, true), false), HELP_MSG.closedForInstructor)
    }
  })

  it('지정된 강사가 없으면 새로 켤 수 없고, 이미 켜진 글은 그대로', () => {
    assert.equal(instructorRequestError(at('open'), false), HELP_MSG.noInstructor)
    assert.equal(instructorRequestError(at('discussing', true), false), null)
  })
})

describe('강사 답변 대기 · 새 강사 답변 (#290 — 3D 강사 우주선 · 도움 요청 탭 점)', () => {
  const help = (id: string, status: HelpRequestStatus, instructorRequested: boolean, commentCount: number) => ({ ...helpRequestSummaryExample, id, status, instructorRequested, commentCount })
  const comment = (id: string, isInstructorAnswer: boolean): HelpCommentDto => ({ ...helpRequestDetailExample.comments[0], id, isInstructorAnswer })
  const check = (commentCount: number, lastAnswerId: string | null) => ({ commentCount, answered: lastAnswerId !== null, lastAnswerId })

  it('확인 대상은 강사가 답할 수 있는 글(강사에게 요청 · open · discussing · on_agenda)이고, 확인 전이거나 코멘트 수가 바뀌면 다시 읽는다', () => {
    assert.equal(needsInstructorCheck(help('a', 'open', true, 0), {}), true)
    assert.equal(needsInstructorCheck(help('a', 'open', true, 0), { a: check(0, null) }), false)
    assert.equal(needsInstructorCheck(help('a', 'discussing', true, 2), { a: check(1, null) }), true)
    assert.equal(needsInstructorCheck(help('a', 'on_agenda', true, 0), {}), true) // 안건이 된 뒤에도 강사가 답할 수 있다
    assert.equal(needsInstructorCheck(help('a', 'open', false, 0), {}), false) // 강사에게 요청 안 함 — 강사가 답할 수 없다
    assert.equal(needsInstructorCheck(help('a', 'resolved', true, 0), {}), false)
  })

  it('확인 결과는 상세의 강사 답변 여부 · 가장 최근 강사 답변 · 그때 코멘트 수', () => {
    const detail = { ...helpRequestDetailExample, commentCount: 3, comments: [comment('c1', true), comment('c2', false), comment('c3', true)] }
    assert.deepEqual(instructorAnswerCheck(detail), check(3, 'c3'))
    assert.deepEqual(instructorAnswerCheck({ ...detail, comments: [comment('c2', false)] }), check(3, null))
  })

  it('대기(우주선) = 강사가 답할 차례(open · discussing)인데 지금 코멘트 수로 확인한 강사 답변이 없다 — 확인 전 · 답변 있음 · 안건 · 닫힌 글은 빠진다', () => {
    const list = [help('wait', 'open', true, 0), help('stale', 'discussing', true, 3), help('done', 'discussing', true, 1), help('unchecked', 'open', true, 0), help('agenda', 'on_agenda', true, 0), help('closed', 'resolved', true, 0)]
    const checks = { wait: check(0, null), stale: check(2, null), done: check(1, 'c1'), agenda: check(0, null), closed: check(0, null) }
    assert.deepEqual(awaitingInstructor(list, checks), ['wait'])
    assert.deepEqual(awaitingInstructor(list, {}), [])
  })

  it('새 강사 답변(빨간 점) = 확인한 가장 최근 강사 답변을 이 사람이 아직 안 봤다 — 열어 보면(본 답변 ID) 꺼지고, 더 새 답변이 오면 다시 켜진다', () => {
    const list = [help('new', 'open', true, 1), help('seen', 'discussing', true, 2), help('newer', 'on_agenda', true, 3), help('none', 'open', true, 0), help('stale', 'open', true, 2), help('closed', 'resolved', true, 1)]
    const checks = { new: check(1, 'a1'), seen: check(2, 'b1'), newer: check(3, 'c2'), none: check(0, null), stale: check(1, 'd1'), closed: check(1, 'e1') }
    const seen = { seen: 'b1', newer: 'c1' }
    assert.deepEqual(unreadInstructorAnswers(list, checks, seen), ['new', 'newer'])
    assert.deepEqual(unreadInstructorAnswers(list, checks, { ...seen, new: 'a1', newer: 'c2' }), [])
    assert.deepEqual(unreadInstructorAnswers(list, {}, {}), [])
  })

  it('mock seed — hr_2는 강사 답변을 기다리고, hr_4에는 강사 답변(hc_3)이 있다', async () => {
    const source = make()
    const snap = await source.load(TEAM_WS)
    const hr2 = snap.helpRequests.find((h) => h.id === 'hr_2')!
    const hr4 = snap.helpRequests.find((h) => h.id === 'hr_4')!
    assert.equal(hr2.instructorRequested, true)
    assert.equal(needsInstructorCheck(hr2, {}), true)
    assert.deepEqual(instructorAnswerCheck(await source.getHelpRequest(TEAM_WS, 'hr_2')), check(0, null))
    assert.deepEqual(instructorAnswerCheck(await source.getHelpRequest(TEAM_WS, 'hr_4')), check(1, 'hc_3'))
    assert.equal(hr4.status, 'open') // 강사 답변은 상태를 바꾸지 않는다(「11」)
  })
})
