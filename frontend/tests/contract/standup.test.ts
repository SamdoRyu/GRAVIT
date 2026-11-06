// 스탠드업 (CONTRACTS_API.md 「12」, #190): 요청 검사 규칙과 mock. 권한 규칙 자체는 Spring 통합 테스트가 맡는다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import { STANDUP_MSG, STANDUP_TEXT_MAX, kstDayRange, prefillText, standupSaveError } from '../../src/data/rules/standup'
import { kstToday } from '../../src/data/rules/period'
import type { Change } from '../../src/data/types'
import { standupExample, standupPrefillExample } from './examples'

const TEAM_WS = 'ws_1'
/** 2026-11-05 03:00Z = 한국 시간 2026-11-05 12:00. seed: 어제(11-04) 내 것 st_1, 오늘(11-05) 이삼도 st_2 · 박데브 st_3 */
const NOW = new Date('2026-11-05T03:00:00Z')
const TODAY = '2026-11-05'
const ME = 'm_1'

const make = () => createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => NOW })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, String(e))
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

describe('스탠드업 규칙', () => {
  it('저장 검사 — 날짜 형식 · 한국 시간 오늘 뒤 · 각 2000자. 빈 "어제 한 일"과 null "막힌 것"은 된다', () => {
    const ok = { yesterday: '', blockers: null }
    assert.equal(standupSaveError(TODAY, ok, TODAY), null)
    assert.equal(standupSaveError('2026-11-5', ok, TODAY), STANDUP_MSG.date)
    assert.equal(standupSaveError('2026-11-06', ok, TODAY), STANDUP_MSG.futureDate)
    // UTC로는 아직 11-05지만 한국 시간으로는 11-06 — 11-06은 오늘이다
    assert.equal(standupSaveError('2026-11-06', ok, kstToday(new Date('2026-11-05T15:30:00Z'))), null)
    assert.equal(standupSaveError(TODAY, { yesterday: 'a'.repeat(STANDUP_TEXT_MAX + 1), blockers: null }, TODAY), STANDUP_MSG.yesterday)
    assert.equal(standupSaveError(TODAY, { yesterday: '', blockers: 'a'.repeat(STANDUP_TEXT_MAX + 1) }, TODAY), STANDUP_MSG.blockers)
  })

  it('한국 시간 하루 범위 · 미리 채우기 초안 문장', () => {
    const { from, to } = kstDayRange('2026-11-05')
    assert.deepEqual([new Date(from).toISOString(), new Date(to).toISOString()], ['2026-11-04T15:00:00.000Z', '2026-11-05T15:00:00.000Z'])
    assert.equal(
      prefillText({ date: TODAY, items: [{ kind: 'pr_merged', title: '로그인', githubNumber: 12, occurredAt: '2026-11-04T05:00:00Z' }, { kind: 'commit', title: '오타 고침', githubNumber: null, occurredAt: '2026-11-04T06:00:00Z' }] }),
      '- PR 머지 #12 로그인\n- 커밋 오타 고침',
    )
  })
})

describe('mock v1 — 스탠드업', () => {
  it('날짜로 읽기 — 그날 쓴 팀원 것만, memberId 순, 모양은 계약 예시와 같다. 날짜 형식이 틀리면 invalid', async () => {
    const source = make()
    const today = await source.listStandups(TEAM_WS, TODAY)
    assert.deepEqual(today.map((s) => [s.id, s.memberId]), [['st_2', 'm_2'], ['st_3', 'm_3']])
    assert.deepEqual(Object.keys(today[0]), Object.keys(standupExample))
    assert.deepEqual((await source.listStandups(TEAM_WS, '2026-11-04')).map((s) => s.id), ['st_1'])
    assert.deepEqual(await source.listStandups(TEAM_WS, '2026-10-01'), [])
    await rejectsCode(source.listStandups(TEAM_WS, 'yesterday'), 'invalid', STANDUP_MSG.date)
  })

  it('내 스탠드업 쓰기 — 없으면 만들고 있으면 고친다, changed(standups). 미래 날짜 · 2000자 초과는 invalid', async () => {
    const source = make()
    const changes: Change[] = []
    const off = source.subscribe(TEAM_WS, (c) => changes.push(c))
    const created = await source.saveMyStandup(TEAM_WS, TODAY, { yesterday: '도움 요청 화면', blockers: '세션이 끊겨요' })
    const updated = await source.saveMyStandup(TEAM_WS, TODAY, { yesterday: '도움 요청 화면 마무리', blockers: null })
    off()
    assert.deepEqual([created.memberId, created.date, created.blockers], [ME, TODAY, '세션이 끊겨요'])
    assert.deepEqual([updated.id, updated.yesterday, updated.blockers], [created.id, '도움 요청 화면 마무리', null])
    assert.deepEqual(Object.keys(updated), Object.keys(standupExample))
    assert.deepEqual((await source.listStandups(TEAM_WS, TODAY)).map((s) => s.memberId), [ME, 'm_2', 'm_3'])
    assert.deepEqual(changes, [
      { type: 'changed', resources: ['standups'] },
      { type: 'changed', resources: ['standups'] },
    ])
    await rejectsCode(source.saveMyStandup(TEAM_WS, '2026-11-06', { yesterday: '', blockers: null }), 'invalid', STANDUP_MSG.futureDate)
    await rejectsCode(source.saveMyStandup(TEAM_WS, TODAY, { yesterday: 'a'.repeat(STANDUP_TEXT_MAX + 1), blockers: null }), 'invalid', STANDUP_MSG.yesterday)
  })

  it('미리 채우기 — 전날(한국 시간) 내 활동만 시각 순, 모양은 계약 예시와 같다', async () => {
    const source = make()
    const prefill = await source.getStandupPrefill(TEAM_WS, TODAY)
    assert.equal(prefill.date, TODAY)
    assert.deepEqual(Object.keys(prefill), Object.keys(standupPrefillExample))
    const { from, to } = kstDayRange('2026-11-04')
    for (const it of prefill.items) {
      const at = Date.parse(it.occurredAt)
      assert.ok(at >= from && at < to, `${it.kind} ${it.occurredAt}는 전날`)
      assert.deepEqual(Object.keys(it), Object.keys(standupPrefillExample.items[0]))
    }
    assert.deepEqual(prefill.items.map((i) => i.occurredAt), [...prefill.items.map((i) => i.occurredAt)].sort())
    // seed: 내가 41시간 전에 남긴 리뷰(11-03 19:00 KST)는 11-04의 전날 몫이다
    assert.ok((await source.getStandupPrefill(TEAM_WS, '2026-11-04')).items.some((i) => i.kind === 'review_submitted'))
    await rejectsCode(source.getStandupPrefill(TEAM_WS, 'x'), 'invalid', STANDUP_MSG.date)
  })
})
