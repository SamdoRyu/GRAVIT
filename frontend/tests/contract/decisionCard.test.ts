// 기술 결정 카드 · 강사 꼬리질문 (CONTRACTS_API.md 「15」, #218): 규칙(rules/decisionCard.ts)과 mock.
// 9칸 채우기는 서버 DecisionCardDraftTest와 같은 사례로 본다. 강사 읽기 · 꼬리질문 쓰기 자체는 Spring 통합 테스트
// (DecisionCardIntegrationTest · DecisionCardAccessIntegrationTest)가 맡는다 — mock에는 강사 계정이 없다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { V1_STORAGE_KEY, createV1MockDataSource } from '../../src/data/mock/v1'
import { createSeed } from '../../src/data/mock/v1/seed'
import {
  CARD_CELL_MAX,
  CARD_CELLS,
  CARD_MSG,
  FOLLOW_UP_QUESTION_MAX,
  cardConfirmError,
  cardCreateError,
  cardUpdateError,
  draftCardCells,
  followUpQuestionError,
  hasLearning,
  type CardMaterials,
} from '../../src/data/rules/decisionCard'
import type { Change, DecisionCardCells } from '../../src/data/types'
import { retroReportExample } from './examples'

const TEAM_WS = 'ws_1'
/** seed: 나(김옥토 m_1), 내 PR s_1(#15 — 이슈 t_2 #5 연결, 회차 r_1 추천 1 · 비추천 1), 이삼도(m_2)의 머지된 PR s_3, 최하나의 Draft s_2 */
const NOW = new Date('2026-11-05T03:00:00Z')
const ME = 'm_1'
const MY_PR = 's_1'
const PR_URL = 'https://github.com/samdoryu/a/pull/15'
const minutesLater = (m: number) => new Date(NOW.getTime() + m * 60_000)

const emptyCells = (): DecisionCardCells => ({ goal: null, initialApproach: null, feedbackReceived: null, meetingDecision: null, finalChange: null, rationale: null, blockedMoment: null, learning: null, source: null })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, String(e))
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

/** seed 그대로 */
function make() {
  const clock = { at: NOW }
  const source = createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => clock.at })
  return { source, clock }
}

/**
 * 카드를 만들 수 있는 사무실 — 내 PR s_1을 머지된 것으로 둔다. 그 이슈 t_2는 seed에서 rq_5(GitHub 로그인)에 이어져 있고, 여기서 rq_1에도
 * 나중에 잇는다 — 목표 칸이 연결 순서가 아니라 요구사항 순서(position)인지 보려고(mock의 나는 R2가 아니라 연결 API를 못 쓴다).
 * 안건 · 회의 메모 · 스탠드업은 API로 남긴다.
 */
async function makeWithMergedPr() {
  const storage = createMemoryStorage()
  const seed = createSeed(NOW, 'github')
  const team = seed.workspaces.find((w) => w.snapshot.workspace.id === TEAM_WS)!
  const pr = team.snapshot.submissions.find((s) => s.id === MY_PR)!
  Object.assign(pr, { state: 'merged', mergedAt: NOW.toISOString(), closedAt: NOW.toISOString() })
  team.snapshot.requirementLinks.push({ id: 'rl_card', requirementId: 'rq_1', taskId: 't_2', linkedAt: NOW.toISOString() })
  storage.setItem(V1_STORAGE_KEY, JSON.stringify(seed))
  const clock = { at: NOW }
  const source = createV1MockDataSource({ storage, session: 'github', latencyMs: [0, 0], now: () => clock.at })
  const title = (id: string) => team.snapshot.requirements.find((r) => r.id === id)!.title
  return { source, clock, goal: `${title('rq_1')}\n${title('rq_5')}` }
}

describe('기술 결정 카드 규칙 — 9칸 채우기 (서버 DecisionCardDraftTest와 같은 사례)', () => {
  const materials = (over: Partial<CardMaterials> = {}): CardMaterials => ({
    requirementTitles: [],
    feedbacks: [],
    decisions: [],
    linkedIssueNumbers: [],
    standups: [],
    prUrl: PR_URL,
    linkedIssueUrls: [],
    ...over,
  })

  it('재료가 없으면 원본(PR 링크)만 채운다', () => {
    assert.deepEqual(draftCardCells(materials()), { ...emptyCells(), source: PR_URL })
  })

  it('앱이 저장하지 않는 재료의 칸 · 배운 점은 늘 null', () => {
    const cells = draftCardCells(
      materials({
        requirementTitles: ['로그인'],
        feedbacks: [{ verdict: 'recommend', reason: '좋아요' }],
        decisions: [{ conclusion: '고친다', learning: '배움', meetingNotes: '메모' }],
        linkedIssueNumbers: [12],
        standups: [{ date: '2026-11-02', blockers: '#12 막힘' }],
        linkedIssueUrls: ['https://github.com/samdoryu/a/issues/12'],
      }),
    )
    assert.deepEqual([cells.initialApproach, cells.finalChange, cells.learning], [null, null, null])
  })

  it('목표 = 연결된 요구사항 제목, 같은 제목은 한 번', () => {
    assert.equal(draftCardCells(materials({ requirementTitles: ['GitHub 로그인', '세션 만료', 'GitHub 로그인'] })).goal, 'GitHub 로그인\n세션 만료')
  })

  it('받은 평가 = 모든 이유를 순서대로(같은 이유도 둘 다), 평가자 없음', () => {
    const cells = draftCardCells(
      materials({
        feedbacks: [
          { verdict: 'not_recommend', reason: '실패 응답 모양이 계약과 달라요' },
          { verdict: 'not_recommend', reason: '실패 응답 모양이 계약과 달라요' },
          { verdict: 'recommend', reason: '고친 뒤 좋아요' },
        ],
      }),
    )
    assert.equal(cells.feedbackReceived, '비추천: 실패 응답 모양이 계약과 달라요\n비추천: 실패 응답 모양이 계약과 달라요\n추천: 고친 뒤 좋아요')
  })

  it('회의에서 정한 것 · 왜 = 이 PR 안건의 결정과 그 회의 메모(같은 메모는 한 번, 메모 없는 결정은 빠짐)', () => {
    const cells = draftCardCells(
      materials({
        decisions: [
          { conclusion: '에러 응답을 계약 모양으로 맞춘다', learning: '에러는 한 곳에서', meetingNotes: '전역 예외 처리로 가자' },
          { conclusion: '다시 평가받는다', learning: ' ', meetingNotes: '전역 예외 처리로 가자' },
          { conclusion: '머지한다', learning: null, meetingNotes: null },
        ],
      }),
    )
    assert.equal(cells.meetingDecision, '에러 응답을 계약 모양으로 맞춘다\n배운 점: 에러는 한 곳에서\n다시 평가받는다\n머지한다')
    assert.equal(cells.rationale, '전역 예외 처리로 가자')
  })

  it('막혔던 순간 = 내 스탠드업 "막힌 것" 중 연결 이슈를 #번호로 언급한 것(#123 · a#12는 아님)', () => {
    const cells = draftCardCells(
      materials({
        linkedIssueNumbers: [12, 7],
        standups: [
          { date: '2026-11-02', blockers: '#12 에러 모양을 모르겠다' },
          { date: '2026-11-03', blockers: '#123 다른 이슈' },
          { date: '2026-11-04', blockers: 'a#12 처럼 붙은 것' },
          { date: '2026-11-05', blockers: null },
          { date: '2026-11-06', blockers: '어제 #7, 오늘도 막힘' },
        ],
      }),
    )
    assert.equal(cells.blockedMoment, '2026-11-02: #12 에러 모양을 모르겠다\n2026-11-06: 어제 #7, 오늘도 막힘')
  })

  it('원본 = PR 링크, 연결 이슈 링크 순(링크가 없는 이슈는 빠짐)', () => {
    const cells = draftCardCells(materials({ linkedIssueNumbers: [3, 4], linkedIssueUrls: ['https://github.com/samdoryu/a/issues/3', null, 'https://github.com/samdoryu/a/issues/4'] }))
    assert.equal(cells.source, `${PR_URL}\nhttps://github.com/samdoryu/a/issues/3\nhttps://github.com/samdoryu/a/issues/4`)
    // 시연 사무실처럼 링크가 하나도 없으면 원본도 null
    assert.equal(draftCardCells(materials({ prUrl: null })).source, null)
  })

  it('칸 길이 한도에서 자르고, 이모지(서로게이트 쌍)를 반으로 자르지 않는다', () => {
    const long = draftCardCells(materials({ decisions: [{ conclusion: '결론', learning: null, meetingNotes: '가'.repeat(CARD_CELL_MAX + 500) }] }))
    assert.equal(long.rationale!.length, CARD_CELL_MAX)
    const emoji = draftCardCells(materials({ decisions: [{ conclusion: '결론', learning: null, meetingNotes: '가'.repeat(CARD_CELL_MAX - 1) + '😀끝' }] }))
    assert.equal(emoji.rationale, '가'.repeat(CARD_CELL_MAX - 1))
  })
})

describe('기술 결정 카드 규칙 — 요청 검사', () => {
  it('만들기 — submissionId 문자열', () => {
    assert.equal(cardCreateError({ submissionId: 's_1' }), null)
    for (const bad of [null, {}, { submissionId: '' }, { submissionId: 7 }]) assert.equal(cardCreateError(bad), CARD_MSG.request)
  })

  it('고치기 — 9칸이 모두 있고(문자열 또는 null) 각 2000자, confirmed는 boolean', () => {
    assert.equal(cardUpdateError({ cells: emptyCells(), confirmed: false }), null)
    assert.equal(cardUpdateError({ cells: { ...emptyCells(), learning: '가'.repeat(CARD_CELL_MAX) }, confirmed: true }), null)
    assert.equal(cardUpdateError({ cells: { ...emptyCells(), goal: '가'.repeat(CARD_CELL_MAX + 1) }, confirmed: false }), CARD_MSG.cells)
    const { source: _omitted, ...missing } = emptyCells()
    for (const bad of [null, { cells: emptyCells() }, { cells: emptyCells(), confirmed: 'yes' }, { cells: missing, confirmed: false }, { cells: { ...emptyCells(), goal: 3 }, confirmed: false }]) {
      assert.equal(cardUpdateError(bad), CARD_MSG.cells)
    }
    assert.deepEqual(CARD_CELLS.map((c) => c.key), Object.keys(retroReportExample.decisionCards[0].cells), '9칸 = 계약 순서')
  })

  it('확인 — 배운 점이 공백뿐이면 안 된다', () => {
    assert.equal(cardConfirmError({ cells: { ...emptyCells(), learning: '  ' }, confirmed: true }), CARD_MSG.learningRequired)
    assert.equal(cardConfirmError({ cells: emptyCells(), confirmed: false }), null)
    assert.equal(hasLearning({ learning: '배운 점' }), true)
  })

  it('꼬리질문 — 공백만이 아닌 1~1000자', () => {
    assert.equal(followUpQuestionError({ body: '왜 그 방법을 골랐나요?' }), null)
    assert.equal(followUpQuestionError({ body: '가'.repeat(FOLLOW_UP_QUESTION_MAX) }), null)
    for (const bad of [null, { body: '' }, { body: '   ' }, { body: '가'.repeat(FOLLOW_UP_QUESTION_MAX + 1) }]) assert.equal(followUpQuestionError(bad), CARD_MSG.question)
  })
})

describe('mock v1 — 기술 결정 카드', () => {
  it('머지된 내 PR로 만들기 — 9칸을 재료에서 채우고(평가자 없음), 모양은 계약 예시와 같다', async () => {
    const { source, clock, goal } = await makeWithMergedPr()
    // 이 PR 안건을 회의에서 정하고(메모), 스탠드업 "막힌 것"에 #5를 남긴다
    const item = await source.createAgendaItem(TEAM_WS, { kind: 'pr', sourceId: MY_PR, title: '세션 쿠키 설정', background: null, tried: null, unresolvedReason: null })
    const meeting = await source.startMeeting(TEAM_WS, { attendeeMemberIds: [ME] })
    clock.at = minutesLater(10)
    await source.recordDecision(TEAM_WS, item.id, { conclusion: 'SameSite=Lax로 간다', learning: 'OAuth 콜백에는 Lax', prDecision: 'merge_as_is', followUpAssigneeMemberId: null, followUpDueDate: null, meetingId: meeting.id })
    await source.endMeeting(TEAM_WS, meeting.id, { notes: 'Strict면 콜백에 쿠키가 안 실린다' })
    await source.saveMyStandup(TEAM_WS, '2026-11-05', { yesterday: '로그인', blockers: '#5 세션이 끊겨요' })
    clock.at = minutesLater(20)

    const card = await source.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR })
    assert.deepEqual(Object.keys(card), Object.keys(retroReportExample.decisionCards[0]))
    assert.deepEqual(Object.keys(card.cells), Object.keys(retroReportExample.decisionCards[0].cells))
    assert.deepEqual(card.cells, {
      // 연결 이슈 t_2의 요구사항 — 요구사항 순서(rq_1 → rq_5)
      goal,
      initialApproach: null,
      // 회차 r_1의 이유 — 추천 먼저, 평가자 없음
      feedbackReceived: '추천: 세션 만료 처리가 명확해요\n비추천: 실패 응답 모양이 계약과 달라요',
      meetingDecision: 'SameSite=Lax로 간다\n배운 점: OAuth 콜백에는 Lax',
      finalChange: null,
      rationale: 'Strict면 콜백에 쿠키가 안 실린다',
      blockedMoment: '2026-11-05: #5 세션이 끊겨요',
      learning: null,
      source: 'https://github.com/team-samdo/gitvillage/pull/15\nhttps://github.com/team-samdo/gitvillage/issues/5',
    })
    assert.deepEqual(
      [card.memberId, card.submissionId, card.confirmed, card.confirmedAt, card.followUpRequested, card.followUpRequestedAt, card.followUpQuestions, card.createdAt, card.updatedAt],
      [ME, MY_PR, false, null, false, null, [], '2026-11-05T03:20:00Z', '2026-11-05T03:20:00Z'],
    )
    assert.deepEqual(await source.listDecisionCards(TEAM_WS, ME), [card])
  })

  it('만들기 검사 순서 — 본문 400 → 팀원 404 → 본인 403 → PR 404 → 내 PR 아님 403 → 열린 PR · 같은 PR 409', async () => {
    const seedOnly = make().source
    await rejectsCode(seedOnly.createDecisionCard(TEAM_WS, 'm_404', { submissionId: '' }), 'invalid', CARD_MSG.request)
    await rejectsCode(seedOnly.createDecisionCard(TEAM_WS, 'm_404', { submissionId: MY_PR }), 'not_found')
    await rejectsCode(seedOnly.createDecisionCard(TEAM_WS, 'm_2', { submissionId: 's_3' }), 'forbidden_role')
    await rejectsCode(seedOnly.createDecisionCard(TEAM_WS, ME, { submissionId: 's_404' }), 'not_found', CARD_MSG.submissionNotFound)
    await rejectsCode(seedOnly.createDecisionCard(TEAM_WS, ME, { submissionId: 's_3' }), 'forbidden_role', CARD_MSG.notMyPr)
    await rejectsCode(seedOnly.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR }), 'conflict', CARD_MSG.prOpen)

    const { source } = await makeWithMergedPr()
    await source.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR })
    await rejectsCode(source.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR }), 'conflict', CARD_MSG.duplicate)
  })

  it('고치기 · 확인 — 통째로 바꾸고, 확인하려면 배운 점, 확인 시각은 처음 것을 두고 끄면 지운다', async () => {
    const { source, clock } = await makeWithMergedPr()
    const card = await source.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR })
    const cells = { ...card.cells, goal: '세션을 오래 유지한다' }

    await rejectsCode(source.updateDecisionCard(TEAM_WS, ME, card.id, { cells: { ...cells, goal: '가'.repeat(CARD_CELL_MAX + 1) }, confirmed: false }), 'invalid', CARD_MSG.cells)
    await rejectsCode(source.updateDecisionCard(TEAM_WS, ME, 'dc_404', { cells, confirmed: true }), 'not_found', CARD_MSG.cardNotFound)
    await rejectsCode(source.updateDecisionCard(TEAM_WS, ME, card.id, { cells, confirmed: true }), 'invalid', CARD_MSG.learningRequired)

    clock.at = minutesLater(30)
    const draft = await source.updateDecisionCard(TEAM_WS, ME, card.id, { cells, confirmed: false })
    assert.deepEqual([draft.cells.goal, draft.confirmed, draft.confirmedAt, draft.updatedAt], ['세션을 오래 유지한다', false, null, '2026-11-05T03:30:00Z'])

    clock.at = minutesLater(40)
    const confirmed = await source.updateDecisionCard(TEAM_WS, ME, card.id, { cells: { ...cells, learning: '쿠키 속성은 콜백 흐름으로 정한다' }, confirmed: true })
    assert.deepEqual([confirmed.confirmed, confirmed.confirmedAt], [true, '2026-11-05T03:40:00Z'])
    clock.at = minutesLater(50)
    const again = await source.updateDecisionCard(TEAM_WS, ME, card.id, { cells: confirmed.cells, confirmed: true })
    assert.deepEqual([again.confirmedAt, again.updatedAt], ['2026-11-05T03:40:00Z', '2026-11-05T03:50:00Z'])
    const off = await source.updateDecisionCard(TEAM_WS, ME, card.id, { cells: confirmed.cells, confirmed: false })
    assert.equal(off.confirmedAt, null)
  })

  it('강사 꼬리질문 요청 — 본인만, 다시 눌러도 처음 시각 그대로, 수정 시각은 바꾸지 않는다', async () => {
    const { source, clock } = await makeWithMergedPr()
    const card = await source.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR })
    clock.at = minutesLater(30)
    const on = await source.requestFollowUp(TEAM_WS, ME, card.id)
    assert.deepEqual([on.followUpRequested, on.followUpRequestedAt, on.updatedAt], [true, '2026-11-05T03:30:00Z', card.updatedAt])
    clock.at = minutesLater(40)
    assert.equal((await source.requestFollowUp(TEAM_WS, ME, card.id)).followUpRequestedAt, '2026-11-05T03:30:00Z')
    await rejectsCode(source.requestFollowUp(TEAM_WS, 'm_2', card.id), 'forbidden_role')
    await rejectsCode(source.requestFollowUp(TEAM_WS, ME, 'dc_404'), 'not_found')
  })

  it('꼬리질문 쓰기 — 본문 400 → 팀원 404 → 강사가 아니면 403(mock에는 강사가 없다)', async () => {
    const { source } = await makeWithMergedPr()
    const card = await source.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR })
    await source.requestFollowUp(TEAM_WS, ME, card.id)
    await rejectsCode(source.addFollowUpQuestion(TEAM_WS, ME, card.id, { body: '  ' }), 'invalid', CARD_MSG.question)
    await rejectsCode(source.addFollowUpQuestion(TEAM_WS, 'm_404', card.id, { body: '왜요?' }), 'not_found')
    await rejectsCode(source.addFollowUpQuestion(TEAM_WS, ME, card.id, { body: '왜요?' }), 'forbidden_role', CARD_MSG.instructorOnly)
  })

  it('목록 · 읽기는 본인만(mock) — 다른 팀원 403, 없는 팀원 404', async () => {
    const { source } = make()
    assert.deepEqual(await source.listDecisionCards(TEAM_WS, ME), [])
    await rejectsCode(source.listDecisionCards(TEAM_WS, 'm_2'), 'forbidden_role')
    await rejectsCode(source.listDecisionCards(TEAM_WS, 'm_404'), 'not_found')
  })

  it('회고 리포트의 decisionCards — 본인이 확인한 카드만 (P11)', async () => {
    const { source } = await makeWithMergedPr()
    const card = await source.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR })
    const report = await source.createReport(TEAM_WS, ME, { kind: 'final' })
    assert.deepEqual((await source.getReport(TEAM_WS, ME, report.id)).decisionCards, [])
    const confirmed = await source.updateDecisionCard(TEAM_WS, ME, card.id, { cells: { ...card.cells, learning: '배운 점' }, confirmed: true })
    assert.deepEqual((await source.getReport(TEAM_WS, ME, report.id)).decisionCards, [confirmed])
    assert.ok((await source.exportReportMarkdown(TEAM_WS, ME, report.id)).includes('- 내가 배운 점: 배운 점\n'))
  })

  it('개인 데이터라 Snapshot · SSE에 실리지 않는다 — 만들기 · 고치기 · 요청에 알림이 없다', async () => {
    const { source } = await makeWithMergedPr()
    const changes: Change[] = []
    const off = source.subscribe(TEAM_WS, (c) => changes.push(c))
    const card = await source.createDecisionCard(TEAM_WS, ME, { submissionId: MY_PR })
    await source.updateDecisionCard(TEAM_WS, ME, card.id, { cells: card.cells, confirmed: false })
    await source.requestFollowUp(TEAM_WS, ME, card.id)
    off()
    assert.deepEqual(changes, [])
    assert.ok(!('decisionCards' in (await source.load(TEAM_WS))))
  })
})
