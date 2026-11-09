// 예외 처리 UI (#274) — 오류 code + 실패한 작업 → 화면에 보일 것(rules/errors), 상단 배너 문구(ui/systemBanners),
// store · session의 연결(onError · 세션 만료 · reloadOffice · 동기화 뒤 다시 읽기), mock의 failNext. 화면 자체는 E2E(32)가 본다.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource, type MockSession } from '../../src/data/mock/v1'
import { CSRF_NOTICE, isCsrfRejected, isUncertainWrite, officeProblem, panelProblem, writeProblem, type WriteAction } from '../../src/data/rules/errors'
import type { SyncStatus } from '../../src/data/types'
import { currentSourceForTest, resetSessionForTest, useSession } from '../../src/session'
import { OFFICE_RELOAD_DELAY_MS, useOffice } from '../../src/store'
import { connectionBanner, staleBanner, syncBanner } from '../../src/ui/systemBanners'

const TEAM_WS = 'ws_1'
const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}
const make = (session: MockSession | null = 'github', syncDurationMs = 0) => createV1MockDataSource({ storage: createMemoryStorage(), session, latencyMs: [0, 0], syncDurationMs })
const err = (code: DataErrorCode, status?: number, message = '서버 문구') => new DataError(message, code, status)
const st = () => useSession.getState()
const office = () => useOffice.getState().office

beforeEach(() => {
  mem.clear()
  resetSessionForTest()
  useOffice.setState({ toasts: [] })
})
afterEach(() => {
  useOffice.getState().closeOffice()
})

describe('폼 — 오류 code + 작업으로 문구 · 다음 행동', () => {
  const ACTIONS: WriteAction[] = ['openWorkspace', 'linkRequirement', 'evaluate', 'raiseAgenda', 'createHelp']

  it('CSRF(403 invalid)와 입력 오류(400 invalid)와 역할(403 forbidden_role)을 나눈다 — HTTP 상태만으로 고르지 않는다', () => {
    assert.equal(isCsrfRejected(err('invalid', 403)), true)
    assert.equal(isCsrfRejected(err('invalid', 400)), false)
    assert.equal(isCsrfRejected(err('forbidden_role', 403)), false)
    for (const a of ACTIONS) {
      assert.deepEqual(writeProblem(a, err('invalid', 403)), CSRF_NOTICE)
      assert.deepEqual(writeProblem(a, err('invalid', 400, '이유를 1~200자로 적어 주세요')), { kind: 'field', text: '이유를 1~200자로 적어 주세요' })
      const role = writeProblem(a, err('forbidden_role', 403))
      assert.equal(role.kind, 'notice')
      assert.equal(role.kind === 'notice' && role.tone, 'bad')
      assert.equal(role.kind === 'notice' && role.next, null, '권한 오류는 다시 해도 같다 — 다음 행동 버튼 없음')
    }
  })

  it('같은 code라도 작업마다 문구가 다르다 — 화면에 code를 보이지 않는다', () => {
    const titles = ACTIONS.map((a) => {
      const p = writeProblem(a, err('forbidden_role', 403))
      return p.kind === 'notice' ? p.title : ''
    })
    assert.equal(new Set(titles).size, ACTIONS.length)
    for (const a of ACTIONS) {
      for (const code of ['not_found', 'conflict', 'forbidden_role', 'unavailable', 'github_unauthorized', 'github_rate_limited'] as const) {
        const p = writeProblem(a, err(code, 503))
        assert.equal(p.kind, 'notice')
        if (p.kind === 'notice') assert.doesNotMatch(`${p.title} ${p.body}`, /[a-z]+_[a-z]+|\b[45]\d\d\b/, `${a} ${code}`)
      }
    }
  })

  it('대상 없음 · 충돌은 최신 상태를 확인하는 다음 행동 — 사무실 열기는 목록, 사무실 안은 Snapshot', () => {
    assert.equal((writeProblem('openWorkspace', err('conflict', 409)) as { next: string }).next, 'refreshLists')
    assert.equal((writeProblem('openWorkspace', err('not_found', 404)) as { next: string }).next, 'refreshLists')
    assert.equal((writeProblem('evaluate', err('conflict', 409)) as { next: string }).next, 'reload')
    assert.equal((writeProblem('linkRequirement', err('conflict', 409)) as { title: string }).title, '진행 중인 요구사항이 아니에요')
    assert.equal((writeProblem('evaluate', err('conflict', 409)) as { title: string }).title, '평가 회차가 바뀌었거나 PR이 닫혔어요')
  })

  it('결과가 불확실한 쓰기(응답 없음 · 5xx)는 "확인하지 못했어요" — 자동으로 다시 보내지 않는다는 안내', () => {
    assert.equal(isUncertainWrite(err('unavailable', 0)), true)
    assert.equal(isUncertainWrite(err('unavailable', 503)), true)
    assert.equal(isUncertainWrite(err('unavailable')), true, '상태를 모르면(mock) 불확실로 본다')
    const p = writeProblem('createHelp', err('unavailable', 0))
    assert.equal(p.kind === 'notice' && p.title, '제출됐는지 확인하지 못했어요')
    assert.match(p.kind === 'notice' ? p.body : '', /자동으로 다시 보내지 않았어요/)
    assert.equal(p.kind === 'notice' && p.next, 'reload')
  })

  it('세션 만료는 폼이 아니라 전체 화면이 맡는다', () => {
    assert.deepEqual(writeProblem('evaluate', err('unauthorized', 401)), { kind: 'session' })
  })
})

describe('패널 — 권한 · GitHub 연결 · 요청 한도 · 조회 실패', () => {
  it('GitHub 연결 오류(다시 로그인)와 요청 한도(잠시 뒤 다시 불러오기)를 나눈다', () => {
    const auth = panelProblem('repositories', err('github_unauthorized', 503))
    const rate = panelProblem('repositories', err('github_rate_limited', 503))
    assert.equal(auth.kind === 'state' && auth.action, 'reconnectGithub')
    assert.equal(auth.kind === 'state' && auth.title, 'GitHub 연결이 끊겼어요')
    assert.equal(rate.kind === 'state' && rate.action, 'retry')
    assert.equal(rate.kind === 'state' && rate.title, 'GitHub 요청 한도를 넘었어요')
  })

  it('권한 오류는 다시 불러오기 버튼이 없고, 조회 실패만 다시 불러온다', () => {
    for (const panel of ['repositories', 'timeline', 'inbox', 'conventionLibrary'] as const) {
      const denied = panelProblem(panel, err('forbidden_role', 403))
      const failed = panelProblem(panel, err('unavailable', 503))
      assert.equal(denied.kind === 'state' && denied.action, null, panel)
      assert.equal(failed.kind === 'state' && failed.action, 'retry', panel)
      assert.match(failed.kind === 'state' ? failed.title : '', /불러오지 못했어요$/)
    }
    assert.equal((panelProblem('timeline', err('forbidden_role', 403)) as { title: string }).title, '이 기록을 볼 권한이 없어요')
    assert.equal((panelProblem('inbox', err('forbidden_role', 403)) as { title: string }).title, '강사 계정만 열 수 있어요')
    assert.deepEqual(panelProblem('inbox', err('unauthorized', 401)), { kind: 'session' })
  })
})

describe('전체 화면 — 사무실 Snapshot 실패', () => {
  it('404는 없음 · 접근 없음을 같은 "열 수 없음", 첫 읽기 실패는 다시 시도, 받은 데이터가 있으면 배너', () => {
    assert.equal(officeProblem(null, false), null)
    assert.equal(officeProblem({ code: 'not_found' }, false), 'closed')
    assert.equal(officeProblem({ code: 'not_found' }, true), 'closed', '쓰던 중에 접근이 없어져도')
    assert.equal(officeProblem({ code: 'unauthorized' }, true), 'session')
    assert.equal(officeProblem({ code: 'unavailable' }, false), 'boot')
    assert.equal(officeProblem({ code: 'unavailable' }, true), 'stale')
  })
})

describe('상단 배너 문구', () => {
  const now = Date.parse('2026-11-05T03:10:00Z')
  const sync = (over: Partial<SyncStatus> = {}): SyncStatus => ({
    state: 'idle',
    lastSucceededAt: '2026-11-05T03:00:00Z',
    lastFailedAt: null,
    lastFailureCode: null,
    lastFailureMessage: null,
    isFailing: false,
    specWarnings: [],
    ...over,
  })

  it('동기화 중 · 실패 · 연결 끊김을 따로 — 성공한 동기화는 배너 없음', () => {
    assert.equal(syncBanner(sync(), null, true, now), null)
    assert.equal(syncBanner(sync({ state: 'running' }), null, true, now)?.title, 'GitHub와 동기화하고 있어요')
    assert.equal(syncBanner(sync(), 'applying', true, now)?.title, '동기화를 마쳤어요')
    const failed = syncBanner(sync({ isFailing: true, lastFailedAt: '2026-11-05T03:09:00Z', lastFailureCode: 'github_rate_limited' }), null, true, now)
    assert.equal(failed?.title, '동기화하지 못했어요')
    assert.equal(failed?.tone, 'bad')
    assert.match(failed?.body ?? '', /^GitHub 요청 한도를 넘었어요\. 지금 보이는 내용은 10분 전 기준이에요/)
    assert.deepEqual(failed?.action, { kind: 'sync', label: '다시 동기화' })
    assert.equal(syncBanner(sync({ isFailing: true }), null, false, now)?.action, null, '강사는 동기화하지 않는다')
    assert.equal(connectionBanner('offline')?.title, '실시간 연결을 복구하고 있어요')
    assert.deepEqual(connectionBanner('offline')?.action, { kind: 'reload', label: '지금 새로고침' })
    assert.equal(connectionBanner('applying')?.title, '실시간 연결이 복구됐어요')
    assert.equal(connectionBanner(null), null)
  })

  it('최신 데이터를 못 받음 — 받은 데이터가 있을 때만, 끊김 · 세션 만료 · 열 수 없음이면 다른 화면이 맡는다', () => {
    const e = { code: 'unavailable' as const, message: 'x' }
    assert.equal(staleBanner(e, true, false)?.title, '최신 내용을 받지 못했어요')
    assert.equal(staleBanner(e, false, false), null)
    assert.equal(staleBanner(e, true, true), null)
    assert.equal(staleBanner({ code: 'not_found', message: 'x' }, true, false), null)
    assert.equal(staleBanner(null, true, false), null)
  })
})

describe('mock failNext — 개발 · E2E에서 예외 화면을 띄운다', () => {
  it('다음 한 번만 그 오류로 거절하고 데이터는 건드리지 않는다', async () => {
    const source = make()
    source.failNext('listWorkspaces', err('unavailable', 0))
    await assert.rejects(source.listWorkspaces(), (e: unknown) => e instanceof DataError && e.code === 'unavailable' && e.status === 0)
    assert.equal((await source.listWorkspaces()).length > 0, true)
  })
})

describe('store · session 연결', () => {
  it('onError를 넘기면 알림 없이 그 오류를 받고, 실패해도 Snapshot은 그대로', async () => {
    await st().start(make(), { preferredWorkspace: TEAM_WS })
    const source = currentSourceForTest() as ReturnType<typeof make>
    const before = office()?.snapshot?.helpRequests.length
    source.failNext('createHelpRequest', err('forbidden_role', 403))
    let got: DataError | null = null
    assert.equal(await useOffice.getState().createHelpRequest({ content: '막혔어요', fromStandupId: null }, (e) => (got = e)), null)
    assert.equal((got as DataError | null)?.code, 'forbidden_role')
    assert.equal(useOffice.getState().toasts.length, 0)
    assert.equal(office()?.snapshot?.helpRequests.length, before)
  })

  it('사무실 API가 401을 받으면 "다시 로그인해 주세요" — 사무실을 닫고 돌아갈 사무실을 기억한다', async () => {
    await st().start(make(), { preferredWorkspace: TEAM_WS })
    const source = currentSourceForTest() as ReturnType<typeof make>
    source.failNext('load', err('unauthorized', 401))
    assert.equal(await useOffice.getState().reloadOffice(), false)
    await new Promise<void>((r) => setImmediate(r))
    assert.equal(st().status, 'signed_out')
    assert.deepEqual(st().expired, { place: 'gitvillage' })
    assert.equal(office(), null)
    // 다시 로그인(mock GitHub)하면 그 사무실로
    st().loginWithGithub()
    await new Promise<void>((r) => setTimeout(r, 0))
    await new Promise<void>((r) => setTimeout(r, 0))
    assert.equal(st().status, 'signed_in')
    assert.equal(st().expired, null)
    assert.equal(office()?.workspaceId, TEAM_WS)
  })

  it('세션이 없는 채로 앱을 열면 보통 로그인 화면(expired 없음)', async () => {
    await st().start(make(null))
    assert.equal(st().status, 'signed_out')
    assert.equal(st().expired, null)
  })

  it('보안 확인 — 공개 API로 토큰을 받고 세션을 확인한다. 다시 보내지는 않는다', async () => {
    await st().start(make(), { preferredWorkspace: TEAM_WS })
    assert.equal(await st().confirmSecurity(), true)
    const source = currentSourceForTest() as ReturnType<typeof make>
    source.failNext('getMe', err('unauthorized', 401))
    assert.equal(await st().confirmSecurity(), false)
    assert.equal(st().status, 'signed_out')
    assert.notEqual(st().expired, null)
  })

  it('사무실 목록 실패를 화면이 받으면 알림 대신 그것만', async () => {
    await st().start(make())
    const source = currentSourceForTest() as ReturnType<typeof make>
    source.failNext('listWorkspaces', err('unavailable', 503))
    let code: string | null = null
    assert.equal(await st().listWorkspaces((e) => (code = e.code)), null)
    assert.equal(code, 'unavailable')
    assert.equal(useOffice.getState().toasts.length, 0)
  })

  it('reloadOffice — 첫 읽기 실패 뒤 다시 시도하면 열린다. loadedAt이 바뀐다', async () => {
    const source = make()
    await st().start(source)
    source.failNext('load', err('unavailable', 503))
    await st().enterWorkspace(TEAM_WS)
    assert.equal(office()?.status, 'error')
    assert.equal(officeProblem(office()!.error, false), 'boot')
    assert.equal(await useOffice.getState().reloadOffice(), true)
    assert.equal(office()?.status, 'ready')
    assert.equal(typeof office()?.loadedAt, 'number')
  })

  it('동기화가 running → idle로 끝나면 Snapshot을 한 번 다시 읽는다(배너가 최신 데이터 반영 뒤 닫히게)', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      const source = make('github', 50)
      await st().start(source, { preferredWorkspace: TEAM_WS })
      const first = office()?.loadedAt
      assert.equal(await useOffice.getState().requestOfficeSync(), true)
      assert.equal(office()?.snapshot?.sync.state, 'running')
      mock.timers.tick(50) // mock 동기화 끝 → sync idle 알림
      await new Promise<void>((r) => setImmediate(r))
      mock.timers.tick(OFFICE_RELOAD_DELAY_MS)
      await new Promise<void>((r) => setImmediate(r))
      await new Promise<void>((r) => setImmediate(r))
      assert.equal(office()?.snapshot?.sync.state, 'idle')
      assert.notEqual(office()?.loadedAt, first)
    } finally {
      mock.timers.reset()
    }
  })
})
