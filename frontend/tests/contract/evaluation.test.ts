// PR 추천 · 비추천 평가 (#19 · #20 — FR-LRN-01 · 02, CONTRACTS_API.md 「9」): 규칙과 mock.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage, type StorageLike } from '../../src/data/mock'
import { createV1MockDataSource, type MockSession } from '../../src/data/mock/v1'
import { EVALUATION_MSG, EVALUATION_REASON_MAX, cannotEvaluateReason, evaluationError, orderReasons, reasonLength, sameAsMine } from '../../src/data/rules/evaluation'
import type { Change, EvaluationRoundDto } from '../../src/data/types'

const TEAM_WS = 'ws_1'
/** seed 팀 사무실: s_1 = #15 열림(작성자 = 나 김옥토), s_2 = #16 Draft(최하나), s_3 = #10 머지됨 */
const MINE = 's_1'
const OTHERS = 's_2'
const MERGED = 's_3'

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

async function currentRound(source: ReturnType<typeof make>, id: string): Promise<EvaluationRoundDto> {
  const sub = (await source.load(TEAM_WS)).submissions.find((s) => s.id === id)
  assert.ok(sub?.currentRound, id)
  return sub.currentRound
}

describe('평가 규칙', () => {
  it('이유는 앞뒤 공백을 뺀 뒤 1~200자, 판정은 둘 중 하나', () => {
    assert.equal(evaluationError({ verdict: 'recommend', reason: '좋아요' }), null)
    assert.equal(evaluationError({ verdict: 'recommend', reason: '   ' }), EVALUATION_MSG.reasonRequired)
    assert.equal(evaluationError({ verdict: 'recommend', reason: '' }), EVALUATION_MSG.reasonRequired)
    assert.equal(evaluationError({ verdict: 'recommend', reason: 'a'.repeat(EVALUATION_REASON_MAX) }), null)
    assert.equal(evaluationError({ verdict: 'recommend', reason: ` ${'a'.repeat(EVALUATION_REASON_MAX)} ` }), null, '공백은 세지 않는다')
    assert.equal(evaluationError({ verdict: 'not_recommend', reason: 'a'.repeat(EVALUATION_REASON_MAX + 1) }), EVALUATION_MSG.reasonTooLong)
    assert.equal(evaluationError({ verdict: 'maybe' as never, reason: '좋아요' }), EVALUATION_MSG.invalidVerdict)
  })
  it('글자 수는 코드 포인트 — 이모지 하나는 한 글자', () => {
    assert.equal(reasonLength(' 👍좋아요 '), 4)
    assert.equal(evaluationError({ verdict: 'recommend', reason: '👍'.repeat(EVALUATION_REASON_MAX) }), null)
  })
  it('이유 순서 — 추천 먼저, 그 안에서 들어온 순서', () => {
    const r = (verdict: 'recommend' | 'not_recommend', reason: string) => ({ verdict, reason })
    assert.deepEqual(orderReasons([r('not_recommend', 'a'), r('recommend', 'b'), r('not_recommend', 'c'), r('recommend', 'd')]), [
      r('recommend', 'b'),
      r('recommend', 'd'),
      r('not_recommend', 'a'),
      r('not_recommend', 'c'),
    ])
  })
  it('평가 못 하는 이유 문구 — 회차 없음 · 닫힘 · 강사 · 내 PR, 평가할 수 있으면 null', () => {
    const round = { canEvaluate: false } as EvaluationRoundDto
    assert.equal(cannotEvaluateReason({ state: 'open', authorMemberId: 'm1', currentRound: null }, 'm2'), '아직 평가 회차가 없어요')
    assert.equal(cannotEvaluateReason({ state: 'open', authorMemberId: 'm1', currentRound: { ...round, canEvaluate: true } }, 'm2'), null)
    assert.equal(cannotEvaluateReason({ state: 'merged', authorMemberId: 'm1', currentRound: round }, 'm2'), EVALUATION_MSG.closedSubmission)
    assert.equal(cannotEvaluateReason({ state: 'open', authorMemberId: 'm1', currentRound: round }, null), '강사는 평가하지 않아요')
    assert.equal(cannotEvaluateReason({ state: 'draft', authorMemberId: 'm1', currentRound: round }, 'm1'), EVALUATION_MSG.ownSubmission)
  })
  it('내 평가와 같은 입력(공백 무시)은 보낼 필요가 없다', () => {
    const mine = { verdict: 'recommend' as const, reason: '좋아요', updatedAt: '2026-11-05T00:00:00Z' }
    assert.equal(sameAsMine(mine, 'recommend', ' 좋아요 '), true)
    assert.equal(sameAsMine(mine, 'not_recommend', '좋아요'), false)
    assert.equal(sameAsMine(null, 'recommend', '좋아요'), false)
  })
})

describe('mock v1 — 평가 (#19 · #20)', () => {
  it('Snapshot의 canEvaluate — 남의 열린 · Draft PR만, 내 PR · 머지된 PR은 false', async () => {
    const source = make()
    assert.equal((await currentRound(source, OTHERS)).canEvaluate, true)
    assert.equal((await currentRound(source, MINE)).canEvaluate, false)
    assert.equal((await currentRound(source, MERGED)).canEvaluate, false)
  })

  it('evaluate — 이유를 다듬어 저장하고, 수 · 이유 · myEvaluation이 바뀌고, changed(submissions) 알림이 온다', async () => {
    const source = make()
    const before = await currentRound(source, OTHERS)
    const changes: Change[] = []
    const off = source.subscribe(TEAM_WS, (c) => changes.push(c))
    const round = await source.evaluate(TEAM_WS, OTHERS, { roundId: before.id, verdict: 'not_recommend', reason: '  테스트가 없어요  ' })
    off()
    assert.deepEqual(round.myEvaluation, { verdict: 'not_recommend', reason: '테스트가 없어요', updatedAt: '2026-11-05T03:00:00Z' })
    assert.equal(round.notRecommendCount, before.notRecommendCount + 1)
    assert.equal(round.recommendCount, before.recommendCount)
    assert.deepEqual(round.reasons.at(-1), { verdict: 'not_recommend', reason: '테스트가 없어요' })
    assert.deepEqual(changes, [{ type: 'changed', resources: ['submissions'] }])
    assert.deepEqual(await currentRound(source, OTHERS), round, 'Snapshot도 같은 회차')
    assert.deepEqual(await source.listRounds(TEAM_WS, OTHERS), [round])
  })

  it('다시 평가하면 바꾼다 — 사람당 하나, 수 합계는 그대로', async () => {
    const source = make()
    const { id } = await currentRound(source, OTHERS)
    const first = await source.evaluate(TEAM_WS, OTHERS, { roundId: id, verdict: 'not_recommend', reason: '처음' })
    const second = await source.evaluate(TEAM_WS, OTHERS, { roundId: id, verdict: 'recommend', reason: '고쳐졌어요' })
    assert.equal(second.recommendCount + second.notRecommendCount, first.recommendCount + first.notRecommendCount)
    assert.equal(second.myEvaluation?.verdict, 'recommend')
    assert.ok(!second.reasons.some((r) => r.reason === '처음'))
    assert.equal(second.reasons[0].verdict, 'recommend', '추천이 먼저')
  })

  it('저장소에 남아 다른 인스턴스(새로 고침)에서도 보인다', async () => {
    const storage = createMemoryStorage()
    const a = make('github', storage)
    const { id } = await currentRound(a, OTHERS)
    await a.evaluate(TEAM_WS, OTHERS, { roundId: id, verdict: 'recommend', reason: '좋아요' })
    assert.equal((await currentRound(make('github', storage), OTHERS)).myEvaluation?.reason, '좋아요')
  })

  it('거부 — 이유 없음 · 200자 초과 invalid, 내 PR forbidden_role, 머지된 PR · 지난 회차 conflict, 없는 PR not_found', async () => {
    const source = make()
    const others = await currentRound(source, OTHERS)
    await rejectsCode(source.evaluate(TEAM_WS, OTHERS, { roundId: others.id, verdict: 'recommend', reason: ' ' }), 'invalid', EVALUATION_MSG.reasonRequired)
    await rejectsCode(source.evaluate(TEAM_WS, OTHERS, { roundId: others.id, verdict: 'recommend', reason: 'a'.repeat(201) }), 'invalid', EVALUATION_MSG.reasonTooLong)
    const mine = await currentRound(source, MINE)
    await rejectsCode(source.evaluate(TEAM_WS, MINE, { roundId: mine.id, verdict: 'recommend', reason: '셀프' }), 'forbidden_role', EVALUATION_MSG.ownSubmission)
    const merged = await currentRound(source, MERGED)
    await rejectsCode(source.evaluate(TEAM_WS, MERGED, { roundId: merged.id, verdict: 'recommend', reason: '늦었어요' }), 'conflict', EVALUATION_MSG.closedSubmission)
    await rejectsCode(source.evaluate(TEAM_WS, OTHERS, { roundId: 'r_old', verdict: 'recommend', reason: '옛 회차' }), 'conflict', EVALUATION_MSG.staleRound)
    await rejectsCode(source.evaluate(TEAM_WS, 's_nope', { roundId: others.id, verdict: 'recommend', reason: '?' }), 'not_found')
    await rejectsCode(source.listRounds(TEAM_WS, 's_nope'), 'not_found')
    // 거부된 요청은 아무것도 바꾸지 않는다
    assert.deepEqual(await currentRound(source, OTHERS), others)
  })

  it('로그인 전 unauthorized, 들어갈 수 없는 사무실 not_found', async () => {
    await rejectsCode(make(null).evaluate(TEAM_WS, OTHERS, { roundId: 'r_2', verdict: 'recommend', reason: '좋아요' }), 'unauthorized')
    await rejectsCode(make('review').listRounds(TEAM_WS, OTHERS), 'not_found')
  })
})
