// 강사 요청함 (#224 — FR-LRN-23, CONTRACTS_API.md 「16」). 규칙(rules/inbox) · mock · 세션(session.loadInstructorInbox)을 함께 본다.
// mock에는 강사 계정이 없다 — GitHub · 심사용 사용자 모두 forbidden_role. 강사가 받는 목록은 api 테스트(apiV1)와 E2E(24)가 본다.
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { DataError, type DataErrorCode, type DataSource } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource, type MockSession } from '../../src/data/mock/v1'
import { DEFAULT_INBOX_FILTER, INBOX_FILTERS, INBOX_KIND_LABEL, INBOX_MSG, answeredParam, canUseInbox, inboxDestination } from '../../src/data/rules/inbox'
import type { InboxItem, MeResponse } from '../../src/data/types'
import { resetSessionForTest, useSession } from '../../src/session'
import { useOffice } from '../../src/store'
import { inboxItemExample, meResponseExample } from './examples'

// 세션이 지난번 사무실을 기억하는 저장소(localStorage) — Node에는 없어 메모리로 흉내 낸다
const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}

const make = (session: MockSession | null) => createV1MockDataSource({ storage: createMemoryStorage(), session, latencyMs: [0, 0], syncDurationMs: 0 })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, `expected DataError, got ${String(e)}`)
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

beforeEach(() => {
  mem.clear()
  resetSessionForTest()
  useOffice.setState({ toasts: [] })
})

describe('강사 요청함 — 규칙', () => {
  it('강사에게만 보인다 — 로그인 전(null)도 아니다', () => {
    assert.equal(canUseInbox({ isInstructor: true }), true)
    assert.equal(canUseInbox({ isInstructor: false }), false)
    assert.equal(canUseInbox(null), false)
  })

  it('고르기 → answered 쿼리: 답할 것 false · 답한 것 true · 전부는 뺀다. 처음은 답할 것', () => {
    assert.equal(answeredParam('unanswered'), false)
    assert.equal(answeredParam('answered'), true)
    assert.equal(answeredParam('all'), undefined)
    assert.equal(DEFAULT_INBOX_FILTER, 'unanswered')
    assert.deepEqual(
      INBOX_FILTERS.map((f) => f.id),
      ['unanswered', 'answered', 'all'],
    )
  })

  it('종류 세 값마다 이름 · 갈 곳 — 도움 요청 탭 · 결정 기록 탭 · 회고 탭의 카드 주인', () => {
    assert.deepEqual(Object.keys(INBOX_KIND_LABEL).sort(), ['decision_feedback', 'follow_up_question', 'help_request'])
    const item = (kind: InboxItem['kind']) => ({ kind, targetId: 't9', ownerMemberId: 'm4' })
    assert.deepEqual(inboxDestination(item('help_request')), { tab: 'help', helpRequestId: 't9' })
    assert.deepEqual(inboxDestination(item('decision_feedback')), { tab: 'decisions', agendaItemId: 't9' })
    assert.deepEqual(inboxDestination(item('follow_up_question')), { tab: 'retro', memberId: 'm4' })
  })
})

describe('강사 요청함 — mock', () => {
  it('mock 사용자는 강사가 아니라 forbidden_role (GitHub · 심사용 모두, 쿼리와 상관없이)', async () => {
    for (const session of ['github', 'review'] as const) {
      const src = make(session)
      await rejectsCode(src.getInstructorInbox(), 'forbidden_role', INBOX_MSG.notInstructor)
      await rejectsCode(src.getInstructorInbox(false), 'forbidden_role')
      await rejectsCode(src.getInstructorInbox(true), 'forbidden_role')
    }
  })

  it('로그인 전이면 unauthorized', async () => {
    await rejectsCode(make(null).getInstructorInbox(), 'unauthorized')
  })
})

describe('강사 요청함 — 세션', () => {
  it('사무실을 열지 않아도 읽는다 — 강사면 목록, answered를 그대로 넘긴다', async () => {
    const asked: (boolean | undefined)[] = []
    const instructor: MeResponse = { ...meResponseExample, isInstructor: true }
    const src = {
      label: 'stub',
      getMe: async () => instructor,
      getInstructorInbox: async (answered?: boolean) => {
        asked.push(answered)
        return [inboxItemExample]
      },
    } as unknown as DataSource
    await useSession.getState().start(src)
    assert.equal(useOffice.getState().office, null)
    assert.deepEqual(await useSession.getState().loadInstructorInbox(), [inboxItemExample])
    assert.deepEqual(await useSession.getState().loadInstructorInbox(false), [inboxItemExample])
    assert.deepEqual(asked, [undefined, false])
  })

  it('강사가 아니면 알림으로 사유를 보이고 null', async () => {
    await useSession.getState().start(make('github'))
    assert.equal(await useSession.getState().loadInstructorInbox(), null)
    assert.deepEqual(
      useOffice.getState().toasts.map((t) => [t.level, t.text]),
      [['bad', INBOX_MSG.notInstructor]],
    )
  })
})
