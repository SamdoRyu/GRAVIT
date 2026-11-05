// store의 v1 사무실(openOffice · closeOffice)과 상단 바 동기화 문구(#45 — FR-GH-05).
// mock v1과, 실패 · 알림 순서를 만들기 위한 얇은 stub으로 검사한다. 실제 서버 연결은 아니다.
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { DataError, type DataSource } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { Change, SyncStatus, WorkspaceListItem, WorkspaceSnapshot } from '../../src/data/types'
import { OFFICE_RELOAD_DELAY_MS, pickWorkspace, useOffice } from '../../src/store'
import { finiteOrNull, formatHours } from '../../src/ui/format'
import { describeSync, failureReason } from '../../src/ui/syncText'
import { workspaceSnapshotExample } from './examples'

const TEAM_WS = 'ws_1'
const SYNC_MS = 800
const office = () => useOffice.getState().office

/** v1 mock + 테스트가 직접 알림을 보내고 load 횟수 · 결과를 바꿀 수 있는 껍데기 */
function harness() {
  const base = createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], syncDurationMs: SYNC_MS, now: () => new Date('2026-11-05T03:00:00Z') })
  const listeners = new Set<(c: Change) => void>()
  let loads = 0
  let failNext: DataError | null = null
  const source: DataSource = {
    ...base,
    async load(workspaceId) {
      loads++
      if (failNext) {
        const e = failNext
        failNext = null
        throw e
      }
      return base.load(workspaceId)
    },
    subscribe(workspaceId, onChange) {
      const off = base.subscribe(workspaceId, onChange)
      listeners.add(onChange)
      return () => {
        off()
        listeners.delete(onChange)
      }
    },
  }
  return {
    source,
    push: (c: Change) => listeners.forEach((l) => l(c)),
    listenerCount: () => listeners.size,
    loads: () => loads,
    failNextLoad: (e: DataError) => {
      failNext = e
    },
  }
}

const failingSync = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  state: 'idle',
  lastSucceededAt: '2026-11-05T02:00:00Z',
  lastFailedAt: '2026-11-05T02:55:00Z',
  lastFailureCode: 'github_rate_limited',
  lastFailureMessage: null,
  isFailing: true,
  specWarnings: [],
  ...over,
})

afterEach(() => {
  useOffice.getState().closeOffice()
  mock.timers.reset()
})

describe('store — v1 사무실 열기', () => {
  it('openOffice: loading → ready, Snapshot 모양이 계약 예시와 같다', async () => {
    const h = harness()
    const opening = useOffice.getState().openOffice(h.source, TEAM_WS)
    assert.equal(office()?.status, 'loading')
    await opening
    const o = office()
    assert.equal(o?.status, 'ready')
    assert.equal(o?.workspaceId, TEAM_WS)
    assert.equal(o?.error, null)
    assert.deepEqual(Object.keys(o?.snapshot ?? {}), Object.keys(workspaceSnapshotExample))
  })

  it('첫 읽기 실패 — status error, snapshot 없음, 에러 코드 · 문구를 남긴다', async () => {
    const h = harness()
    await useOffice.getState().openOffice(h.source, 'ws_nope')
    assert.equal(office()?.status, 'error')
    assert.equal(office()?.snapshot, null)
    assert.equal(office()?.error?.code, 'not_found')
    assert.ok((office()?.error?.message ?? '').length > 0)
  })

  it('closeOffice — 구독을 끊고 비운다. 늦게 온 알림은 버린다', async () => {
    const h = harness()
    await useOffice.getState().openOffice(h.source, TEAM_WS)
    assert.equal(h.listenerCount(), 1)
    useOffice.getState().closeOffice()
    assert.equal(office(), null)
    assert.equal(h.listenerCount(), 0)
    h.push({ type: 'sync', status: failingSync() })
    assert.equal(office(), null)
  })

  it('다른 사무실을 열면 앞 사무실의 늦은 응답이 덮어쓰지 않는다', async () => {
    const h = harness()
    const first = useOffice.getState().openOffice(h.source, TEAM_WS)
    const second = useOffice.getState().openOffice(h.source, 'ws_2')
    await Promise.all([first, second])
    assert.equal(office()?.workspaceId, 'ws_2')
    assert.equal(office()?.snapshot?.workspace.id, 'ws_2')
    assert.equal(h.listenerCount(), 1, '앞 사무실 구독은 끊겼다')
  })
})

describe('store — 알림 반영', () => {
  it('sync 알림은 동기화 상태만 바꾸고 나머지 데이터는 그대로 둔다', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = harness()
    await useOffice.getState().openOffice(h.source, TEAM_WS)
    const before = office()!.snapshot!
    await h.source.requestSync(TEAM_WS) // mock이 sync(running)을 보낸다
    const during = office()!.snapshot!
    assert.equal(during.sync.state, 'running')
    assert.equal(during.tasks, before.tasks, '이슈 목록은 같은 값')
    assert.equal(during.members, before.members)
  })

  it('동기화가 실패해도 마지막 데이터를 유지하고 실패 상태만 보인다 (NFR-09)', async () => {
    const h = harness()
    await useOffice.getState().openOffice(h.source, TEAM_WS)
    const before = office()!.snapshot!
    h.push({ type: 'sync', status: failingSync() })
    const after = office()!.snapshot!
    assert.equal(after.sync.isFailing, true)
    assert.equal(after.sync.lastFailureCode, 'github_rate_limited')
    assert.equal(after.tasks, before.tasks)
    assert.equal(after.submissions, before.submissions)
    assert.equal(office()?.status, 'ready')
  })

  it('changed 알림은 짧게 모아 Snapshot을 한 번만 다시 읽는다', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = harness()
    await useOffice.getState().openOffice(h.source, TEAM_WS)
    assert.equal(h.loads(), 1)
    h.push({ type: 'changed', resources: ['tasks'] })
    h.push({ type: 'changed', resources: ['submissions'] })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS - 1)
    h.push({ type: 'changed', resources: ['members'] })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS - 1)
    assert.equal(h.loads(), 1, '아직 모으는 중')
    mock.timers.tick(1)
    assert.equal(h.loads(), 2, '한 번만 다시 읽음')
  })

  it('다시 읽기가 실패해도 마지막 snapshot을 지우지 않고 에러만 남긴다. 다음 성공에서 에러가 지워진다', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = harness()
    await useOffice.getState().openOffice(h.source, TEAM_WS)
    const before = office()!.snapshot!
    h.failNextLoad(new DataError('서버에 연결할 수 없어요', 'unavailable'))
    h.push({ type: 'changed', resources: ['tasks'] })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS)
    await new Promise<void>((r) => setImmediate(r))
    assert.equal(office()?.status, 'ready')
    assert.equal(office()?.snapshot, before)
    assert.deepEqual(office()?.error, { code: 'unavailable', message: '서버에 연결할 수 없어요' })

    h.push({ type: 'changed', resources: ['tasks'] })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS)
    await new Promise<void>((r) => setImmediate(r))
    assert.equal(office()?.error, null)
  })

  it('다시 연결(connection online)되면 Snapshot을 다시 읽는다', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = harness()
    await useOffice.getState().openOffice(h.source, TEAM_WS)
    h.push({ type: 'connection', status: 'offline' })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS)
    assert.equal(h.loads(), 1, 'offline은 다시 읽지 않는다')
    h.push({ type: 'connection', status: 'online' })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS)
    assert.equal(h.loads(), 2)
  })

  /** load를 하나씩 붙잡아 두었다가 원하는 순서로 풀 수 있는 source */
  function gatedLoads(h: ReturnType<typeof harness>) {
    const gates: { release: () => void; promise: Promise<WorkspaceSnapshot> }[] = []
    const source: DataSource = {
      ...h.source,
      load: (id) => {
        let release = () => {}
        const promise = h.source.load(id).then((s) => new Promise<WorkspaceSnapshot>((r) => (release = () => r(s))))
        const gate = { release: () => release(), promise }
        gates.push(gate)
        return promise
      },
    }
    return { source, gates }
  }
  const flush = () => new Promise<void>((r) => setImmediate(r))

  it('다시 읽는 중에 온 sync 알림을 늦게 온 읽기 응답이 되돌리지 않는다', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = harness()
    const g = gatedLoads(h)
    const opening = useOffice.getState().openOffice(g.source, TEAM_WS)
    await flush()
    g.gates[0].release()
    await opening
    h.push({ type: 'changed', resources: ['tasks'] })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS) // 다시 읽기 시작 (응답은 붙잡아 둠 — 실패 알림 전의 상태)
    await flush()
    h.push({ type: 'sync', status: failingSync() }) // 그 사이 동기화 실패 알림
    assert.equal(office()?.snapshot?.sync.isFailing, true)
    g.gates[1].release()
    await flush()
    assert.equal(office()?.snapshot?.sync.isFailing, true, '옛 응답이 실패 상태를 지우지 않는다')
  })

  it('겹친 다시 읽기는 마지막에 보낸 요청의 응답만 반영한다', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = harness()
    const g = gatedLoads(h)
    const opening = useOffice.getState().openOffice(g.source, TEAM_WS)
    await flush()
    g.gates[0].release()
    await opening
    h.push({ type: 'changed', resources: ['tasks'] })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS) // 읽기 2 (느림)
    await flush()
    await h.source.requestSync(TEAM_WS) // 서버 쪽 상태가 running으로 바뀜
    h.push({ type: 'changed', resources: ['tasks'] })
    mock.timers.tick(OFFICE_RELOAD_DELAY_MS) // 읽기 3 — running을 담은 새 응답
    await flush()
    g.gates[2].release()
    await flush()
    assert.equal(office()?.snapshot?.sync.state, 'running')
    g.gates[1].release() // 먼저 보냈던 읽기 2가 늦게 도착
    await flush()
    assert.equal(office()?.snapshot?.sync.state, 'running', '늦게 온 옛 응답은 버린다')
  })

  it('첫 읽기 중에 온 sync 알림은 읽기가 끝난 뒤 반영된다', async () => {
    const h = harness()
    let release: () => void = () => {}
    const base = h.source.load
    let first = true
    const source: DataSource = {
      ...h.source,
      load: (id) => {
        if (!first) return base(id)
        first = false
        return base(id).then((s) => new Promise<WorkspaceSnapshot>((r) => (release = () => r(s))))
      },
    }
    const opening = useOffice.getState().openOffice(source, TEAM_WS)
    await new Promise<void>((r) => setImmediate(r))
    h.push({ type: 'sync', status: failingSync() })
    release()
    await opening
    assert.equal(office()?.snapshot?.sync.isFailing, true)
  })
})

describe('상단 바 동기화 문구', () => {
  const ok: SyncStatus = { state: 'idle', lastSucceededAt: '2026-11-05T03:00:00Z', lastFailedAt: null, lastFailureCode: null, lastFailureMessage: null, isFailing: false, specWarnings: [] }
  const at = (iso: string) => Date.parse(iso)

  it('성공 — 마지막 성공을 상대 시간으로', () => {
    const t = describeSync(ok, at('2026-11-05T03:03:00Z'))
    assert.equal(t.tone, 'ok')
    assert.equal(t.label, '3분 전 동기화')
    assert.equal(t.reason, null)
    assert.match(t.detail, /^마지막 성공 /)
  })

  it('진행 중 — 직전 실패가 있으면 설명에 함께', () => {
    assert.equal(describeSync({ ...ok, state: 'running' }).tone, 'running')
    assert.equal(describeSync({ ...ok, state: 'running' }).label, '동기화 중')
    const t = describeSync(failingSync({ state: 'running' }))
    assert.equal(t.tone, 'running')
    assert.match(t.detail, /직전 동기화는 실패했어요\(GitHub 요청 한도를 넘었어요\)/)
  })

  it('실패 — 사유를 늘 보이고, 마지막 데이터 유지를 알린다', () => {
    const t = describeSync(failingSync())
    assert.equal(t.tone, 'failing')
    assert.equal(t.label, '동기화 실패')
    assert.equal(t.reason, 'GitHub 요청 한도를 넘었어요')
    assert.match(t.detail, /마지막 성공 .+ · 화면은 마지막으로 받은 데이터예요/)
  })

  it('실패 사유 — 서버 문구가 있으면 그대로, 없으면 코드별 기본 문구', () => {
    assert.equal(failureReason(failingSync({ lastFailureMessage: '  설치 토큰이 만료됐어요 ' })), '설치 토큰이 만료됐어요')
    assert.equal(failureReason(failingSync({ lastFailureCode: 'github_unauthorized' })), 'GitHub 권한이 없거나 만료됐어요')
    assert.equal(failureReason(failingSync({ lastFailureCode: 'unavailable' })), 'GitHub에 연결하지 못했어요')
    assert.equal(failureReason(failingSync({ lastFailureCode: null })), '알 수 없는 이유로 실패했어요')
  })

  it('한 번도 성공하지 않음 — 실패면 실패, 아니면 동기화 전', () => {
    assert.equal(describeSync({ ...ok, lastSucceededAt: null }).tone, 'never')
    assert.equal(describeSync({ ...ok, lastSucceededAt: null }).label, '동기화 전')
    const t = describeSync(failingSync({ lastSucceededAt: null }))
    assert.equal(t.tone, 'failing')
    assert.match(t.detail, /아직 성공한 동기화가 없어요/)
  })
})

describe('상단 바 팀 지표 (#24 — FR-FLOW-05)', () => {
  it('평균 리뷰 대기는 서버가 준 소수 첫째 자리 시간 그대로', () => {
    assert.equal(formatHours(6.5), '6.5시간')
    assert.equal(formatHours(2), '2.0시간')
    assert.equal(formatHours(0), '0.0시간')
  })

  it('보일 수 없는 값은 null — "NaN시간" 같은 표시를 막는다', () => {
    assert.equal(finiteOrNull(6.5), 6.5)
    assert.equal(finiteOrNull(0), 0)
    for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '6.5' as unknown as number]) {
      assert.equal(finiteOrNull(bad), null, String(bad))
    }
  })

  it('store에 연 사무실의 flow가 팀 지표의 값이다 — 팀 단위 값만 있다', async () => {
    const h = harness()
    await useOffice.getState().openOffice(h.source, TEAM_WS)
    const flow = office()!.snapshot!.flow
    const subs = office()!.snapshot!.submissions
    assert.equal(flow.openSubmissionCount, subs.filter((s) => s.state === 'open' || s.state === 'draft').length)
    assert.equal(flow.averageReviewWaitHours, 6.5, 'mock 예시 값')
    // 사람별 합계 · 순위 칸이 없다 (FR-FLOW-06) — 계약 예시와 같은 키만
    assert.deepEqual(Object.keys(flow), Object.keys(workspaceSnapshotExample.flow))
  })
})

describe('store — 팀 설정 바꾸기 (#38 — FR-PLAN-01)', () => {
  const openAdminOffice = async (h: ReturnType<typeof harness>) => {
    const ws = await h.source.openWorkspace({ githubRepoId: '880001300', projectStartDate: '2026-11-04', projectEndDate: '2026-11-17', specDocumentPath: null, activityConsent: true })
    await useOffice.getState().openOffice(h.source, ws.id)
    return ws.id
  }

  it('R2 — 성공하면 snapshot.settings가 응답으로 바뀌고 나머지 설정은 그대로', async () => {
    const h = harness()
    await openAdminOffice(h)
    const before = office()!.snapshot!.settings
    const ok = await useOffice.getState().updateOfficeSettings({ ...before, projectEndDate: '2026-11-30' })
    assert.equal(ok, true)
    assert.deepEqual(office()?.snapshot?.settings, { ...before, projectEndDate: '2026-11-30' })
  })

  it('R2가 아니면 false · 실패 알림, 마지막 값은 그대로', async () => {
    const h = harness()
    await useOffice.getState().openOffice(h.source, TEAM_WS)
    const before = office()!.snapshot!.settings
    const toasts = useOffice.getState().toasts.length
    assert.equal(await useOffice.getState().updateOfficeSettings({ ...before, projectEndDate: '2026-12-01' }), false)
    assert.deepEqual(office()?.snapshot?.settings, before)
    const last = useOffice.getState().toasts.at(-1)
    assert.equal(useOffice.getState().toasts.length, toasts + 1)
    assert.equal(last?.level, 'bad')
  })

  it('사무실이 없으면 보내지 않고 false, 응답 전에 닫으면 응답을 버린다', async () => {
    assert.equal(await useOffice.getState().updateOfficeSettings({ projectStartDate: '2026-11-04', projectEndDate: '2026-11-17', specDocumentPath: null, reviewWaitHours: 48, noCommitHours: 48 }), false)
    const h = harness()
    await openAdminOffice(h)
    const before = office()!.snapshot!.settings
    const saving = useOffice.getState().updateOfficeSettings({ ...before, projectEndDate: '2026-11-30' })
    useOffice.getState().closeOffice()
    assert.equal(await saving, true)
    assert.equal(office(), null)
  })
})

describe('store — 첫 사무실 열기 (#102 T5-c-1)', () => {
  const item = (id: string, kind: WorkspaceListItem['kind'], displayName: string): WorkspaceListItem => ({
    id,
    kind,
    displayName,
    githubOwner: null,
    githubRepo: null,
    githubRepoId: null,
    htmlUrl: null,
    openedAt: '2026-11-01T00:00:00Z',
    myRole: 'participant',
  })

  it('pickWorkspace — 고른 ID가 목록에 있으면 그것, 아니면 GitHub 팀 사무실, 없으면 첫째, 빈 목록은 null', () => {
    const list = [item('ws_d', 'demo', 'A 시연'), item('ws_g', 'github', 'B 팀'), item('ws_h', 'github', 'C 팀')]
    assert.equal(pickWorkspace(list, 'ws_h'), 'ws_h')
    assert.equal(pickWorkspace(list, 'ws_none'), 'ws_g', '목록에 없는 ID는 무시한다')
    assert.equal(pickWorkspace(list), 'ws_g')
    assert.equal(pickWorkspace([item('ws_d', 'demo', 'A 시연')]), 'ws_d')
    assert.equal(pickWorkspace([]), null)
  })

  it('mock 기본 세션 — 팀 사무실(ws_1)을 열고 Snapshot을 받는다', async () => {
    const h = harness()
    await useOffice.getState().openDefaultOffice(h.source)
    assert.equal(office()?.status, 'ready')
    assert.equal(office()?.snapshot?.workspace.id, TEAM_WS)
  })

  it('?workspace로 고른 사무실을 연다', async () => {
    const h = harness()
    const list = await h.source.listWorkspaces()
    const other = list.find((w) => w.id !== TEAM_WS)
    assert.ok(other, 'mock 사용자는 사무실이 둘 이상이다')
    await useOffice.getState().openDefaultOffice(h.source, other.id)
    assert.equal(office()?.snapshot?.workspace.id, other.id)
  })

  it('로그인 전(목록 unauthorized)이면 열지 않고 알림도 없다', async () => {
    const source = createV1MockDataSource({ storage: createMemoryStorage(), session: null, latencyMs: [0, 0] })
    const toasts = useOffice.getState().toasts.length
    await useOffice.getState().openDefaultOffice(source)
    assert.equal(office(), null)
    assert.equal(useOffice.getState().toasts.length, toasts)
  })

  it('두 번 불러도(StrictMode) 한 번만 연다 — 구독 하나', async () => {
    const h = harness()
    await Promise.all([useOffice.getState().openDefaultOffice(h.source), useOffice.getState().openDefaultOffice(h.source)])
    assert.equal(office()?.status, 'ready')
    assert.equal(h.listenerCount(), 1)
    assert.equal(h.loads(), 1)
  })

  it('이미 연 사무실이 있으면 바꾸지 않는다', async () => {
    const h = harness()
    const list = await h.source.listWorkspaces()
    const other = list.find((w) => w.id !== TEAM_WS)!
    await useOffice.getState().openOffice(h.source, other.id)
    await useOffice.getState().openDefaultOffice(h.source)
    assert.equal(office()?.workspaceId, other.id)
  })
})
