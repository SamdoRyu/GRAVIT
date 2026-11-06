// v1 mock DataSource — P0 메서드의 성공 · 실패 경로와 Snapshot 모양(계약 예시와 같은 최상위 키).
// 권한 규칙 자체는 Spring 통합 테스트가 맡는다(CONTRACTS.md 「8」 · 「9」). 여기서는 mock이 화면 흐름에 맞게 도는지 본다.
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage, createSharedMemoryStorage, type StorageLike } from '../../src/data/mock'
import { createV1MockDataSource, V1_STORAGE_KEY, type MockSession } from '../../src/data/mock/v1'
import { MOCK_STATE_VERSION } from '../../src/data/mock/v1/seed'
import type { Change, OpenWorkspaceRequest } from '../../src/data/types'
import { workspaceSnapshotExample } from './examples'

const TEAM_WS = 'ws_1'
const DEMO_WS = 'ws_2'
const ADMIN_REPO_ID = '880001300' // team-samdo/side-lab — 아직 열리지 않음, 내가 레포 관리자
const PARTICIPANT_REPO_ID = '880002001' // bootcamp-lab/final-project — 참여자
const OPEN_REPO_ID = '880001234' // team-samdo/gitvillage — 이미 열림

const make = (session: MockSession | null = 'github', storage: StorageLike = createMemoryStorage()) =>
  createV1MockDataSource({ storage, session, latencyMs: [0, 0], syncDurationMs: 0, now: () => new Date('2026-11-05T03:00:00Z') })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, `expected DataError, got ${String(e)}`)
    assert.equal(e.code, code)
    assert.ok(e.message.length > 0, 'message')
    return true
  })
}

const openRequest = (patch: Partial<OpenWorkspaceRequest> = {}): OpenWorkspaceRequest => ({
  githubRepoId: ADMIN_REPO_ID,
  projectStartDate: '2026-11-04',
  projectEndDate: '2026-11-17',
  specDocumentPath: 'docs/requirements.md',
  activityConsent: true,
  ...patch,
})

/** 조건을 만족하는 변경이 올 때까지 모은다 */
function collect(source: ReturnType<typeof make>, workspaceId: string) {
  const changes: Change[] = []
  let notify = () => {}
  const unsubscribe = source.subscribe(workspaceId, (c) => {
    changes.push(c)
    notify()
  })
  const until = (pred: (cs: Change[]) => boolean) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout: ${JSON.stringify(changes)}`)), 1000)
      notify = () => {
        if (pred(changes)) {
          clearTimeout(timer)
          resolve()
        }
      }
      notify()
    })
  return { changes, until, unsubscribe }
}

describe('mock v1 — 로그인 · 세션', () => {
  it('getLoginOptions는 로그인 없이 된다', async () => {
    const opts = await make(null).getLoginOptions()
    assert.deepEqual(opts, { githubLoginUrl: '/oauth2/authorization/github', reviewLoginEnabled: true })
  })

  it('getMe — GitHub 사용자 · 심사용 계정 · 세션 없음', async () => {
    const gh = await make('github').getMe()
    assert.equal(gh.accountType, 'github')
    assert.equal(typeof gh.githubUserId, 'string')
    const review = await make('review').getMe()
    assert.equal(review.accountType, 'review')
    assert.equal(review.githubUserId, null)
    assert.equal(review.user.githubLogin, null)
    await rejectsCode(make(null).getMe(), 'unauthorized')
  })

  it('logout 뒤에는 unauthorized, 다시 만들어도(새로 고침) 로그아웃이 유지된다. 세션이 없어도 logout은 성공', async () => {
    const storage = createMemoryStorage()
    const source = make('github', storage)
    await source.logout()
    await rejectsCode(source.getMe(), 'unauthorized')
    await rejectsCode(source.listWorkspaces(), 'unauthorized')
    await rejectsCode(source.load(TEAM_WS), 'unauthorized')
    const reloaded = createV1MockDataSource({ storage, latencyMs: [0, 0] })
    await rejectsCode(reloaded.getMe(), 'unauthorized')
    await reloaded.logout()
  })

  it('저장된 값이 깨져 있으면 seed로 다시 시작한다', async () => {
    const storage = createMemoryStorage()
    storage.setItem(V1_STORAGE_KEY, '{not json')
    const warn = console.warn
    console.warn = () => {}
    try {
      const source = createV1MockDataSource({ storage, latencyMs: [0, 0] })
      assert.equal((await source.getMe()).accountType, 'github')
    } finally {
      console.warn = warn
    }
  })
})

describe('mock v1 — 레포 · 사무실', () => {
  it('listRepositories — 레포마다 workspaceId, 심사용 계정은 빈 목록', async () => {
    const res = await make('github').listRepositories()
    const repos = res.organizations.flatMap((o) => o.repositories)
    assert.equal(repos.find((r) => r.githubRepoId === OPEN_REPO_ID)?.workspaceId, TEAM_WS)
    assert.equal(repos.find((r) => r.githubRepoId === ADMIN_REPO_ID)?.workspaceId, null)
    assert.ok(res.organizations.some((o) => !o.appInstalled && o.installUrl !== null), '앱 미설치 조직')
    assert.deepEqual(await make('review').listRepositories(), { organizations: [] })
  })

  it('listWorkspaces — displayName 오름차순, 심사용 계정은 시연 사무실만', async () => {
    const gh = await make('github').listWorkspaces()
    assert.deepEqual(
      gh.map((w) => w.displayName),
      [...gh.map((w) => w.displayName)].sort((a, b) => a.localeCompare(b)),
    )
    assert.deepEqual(gh.map((w) => w.id).sort(), [DEMO_WS, TEAM_WS].sort())
    const review = await make('review').listWorkspaces()
    assert.deepEqual(
      review.map((w) => [w.id, w.kind]),
      [[DEMO_WS, 'demo']],
    )
  })

  it('openWorkspace — 실패 경로', async () => {
    const source = make('github')
    await rejectsCode(source.openWorkspace(openRequest({ projectEndDate: '2026-11-01' })), 'invalid')
    await rejectsCode(source.openWorkspace(openRequest({ projectStartDate: '2026-02-30' })), 'invalid')
    await rejectsCode(source.openWorkspace(openRequest({ specDocumentPath: '' })), 'invalid')
    await rejectsCode(source.openWorkspace(openRequest({ githubRepoId: '999' })), 'not_found')
    await rejectsCode(source.openWorkspace(openRequest({ githubRepoId: PARTICIPANT_REPO_ID })), 'forbidden_role')
    // 이미 열린 레포라도 레포 관리자가 아니면 역할 검사가 먼저다(conflict는 아래 테스트에서)
    await rejectsCode(source.openWorkspace(openRequest({ githubRepoId: OPEN_REPO_ID })), 'forbidden_role')
    await rejectsCode(make('review').openWorkspace(openRequest()), 'not_found')
  })

  it('openWorkspace — 열면 목록에 나오고, 첫 동기화가 돌고, 다시 열면 conflict', async () => {
    const source = make('github')
    const summary = await source.openWorkspace(openRequest({ specDocumentPath: null }))
    assert.equal(summary.kind, 'github')
    assert.equal(summary.displayName, 'team-samdo/side-lab')
    assert.equal(summary.htmlUrl, 'https://github.com/team-samdo/side-lab')

    const listed = (await source.listWorkspaces()).find((w) => w.id === summary.id)
    assert.equal(listed?.myRole, 'repo_admin')
    const repo = (await source.listRepositories()).organizations.flatMap((o) => o.repositories).find((r) => r.githubRepoId === ADMIN_REPO_ID)
    assert.equal(repo?.workspaceId, summary.id)

    assert.equal((await source.getSyncStatus(summary.id)).state, 'running', '열자마자 첫 동기화')
    const snap = await source.load(summary.id)
    assert.equal(snap.viewer.role, 'repo_admin')
    assert.equal(snap.settings.specDocumentPath, null)
    assert.equal(snap.members.length, 1)
    await rejectsCode(source.openWorkspace(openRequest()), 'conflict')
  })
})

describe('mock v1 — Snapshot', () => {
  it('최상위 키가 계약 예시와 같은 순서로 같다', async () => {
    const snap = await make('github').load(TEAM_WS)
    assert.deepEqual(Object.keys(snap), Object.keys(workspaceSnapshotExample))
  })

  it('팀원 · 이슈 · PR이 있고, 아직 다루지 않는 목록은 비어 있다', async () => {
    const snap = await make('github').load(TEAM_WS)
    assert.ok(snap.members.length > 0 && snap.tasks.length > 0 && snap.submissions.length > 0)
    assert.ok(snap.helpRequests.length > 0, '도움 요청 seed (#183 — help.test.ts)')
    assert.ok(snap.requirements.length > 0 && snap.requirementLinks.length > 0, '요구사항 seed (#197 — requirements.test.ts)')
    for (const key of ['agendaItems', 'meetings', 'activityNotes'] as const) {
      assert.deepEqual(snap[key], [], key)
    }
  })

  it('참조하는 팀원 ID가 모두 members에 있고, 정렬이 계약대로다', async () => {
    const snap = await make('github').load(TEAM_WS)
    const memberIds = new Set(snap.members.map((m) => m.id))
    for (const t of snap.tasks) for (const id of t.assigneeMemberIds) assert.ok(memberIds.has(id), `task ${t.id} assignee ${id}`)
    for (const s of snap.submissions) if (s.authorMemberId !== null) assert.ok(memberIds.has(s.authorMemberId), `submission ${s.id} author`)
    assert.ok(memberIds.has(snap.viewer.memberId ?? ''), 'viewer.memberId')

    const nums = snap.tasks.map((t) => t.githubIssueNumber)
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b), 'tasks: githubIssueNumber 오름차순')
    const prs = snap.submissions.map((s) => s.githubPrNumber)
    assert.deepEqual(prs, [...prs].sort((a, b) => a - b), 'submissions: githubPrNumber 오름차순')
    // 지금 팀원 deskIndex 순, 그 뒤 빠진 팀원
    const current = snap.members.filter((m) => m.removedAt === null)
    assert.deepEqual(snap.members.slice(0, current.length), current)
    assert.ok(current.every((m, i) => i === 0 || (m.deskIndex ?? -1) > (current[i - 1].deskIndex ?? -1)))
    assert.ok(snap.members.filter((m) => m.removedAt !== null).every((m) => m.deskIndex === null))
  })

  it('canEvaluate — 내 PR은 false, 다른 사람의 열린 PR은 true, 머지된 PR은 false', async () => {
    const snap = await make('github').load(TEAM_WS)
    for (const s of snap.submissions) {
      const expected = (s.state === 'open' || s.state === 'draft') && s.authorMemberId !== snap.viewer.memberId
      assert.equal(s.currentRound?.canEvaluate, expected, `submission ${s.id}`)
    }
    assert.ok(snap.submissions.some((s) => s.currentRound?.canEvaluate === true))
    assert.ok(snap.submissions.some((s) => s.authorMemberId === snap.viewer.memberId && s.currentRound?.canEvaluate === false))
  })

  it('시연 사무실 — kind demo, GitHub 링크 null', async () => {
    const snap = await make('review').load(DEMO_WS)
    assert.equal(snap.workspace.kind, 'demo')
    assert.equal(snap.workspace.htmlUrl, null)
    assert.ok([...snap.tasks, ...snap.submissions].every((x) => x.htmlUrl === null))
  })

  it('들어갈 수 없는 · 없는 사무실은 not_found', async () => {
    await rejectsCode(make('review').load(TEAM_WS), 'not_found')
    await rejectsCode(make('github').load('ws_nope'), 'not_found')
    await rejectsCode(make('review').getSyncStatus(TEAM_WS), 'not_found')
    await rejectsCode(make('review').requestSync(TEAM_WS), 'not_found')
  })

  it('load는 사본을 준다 — 받은 값을 고쳐도 다음 load에 남지 않는다', async () => {
    const source = make('github')
    const a = await source.load(TEAM_WS)
    a.tasks[0].title = 'changed'
    const b = await source.load(TEAM_WS)
    assert.notEqual(b.tasks[0].title, 'changed')
  })
})

describe('mock v1 — 동기화', () => {
  it('requestSync — running을 돌려주고, 진행 중엔 conflict, 끝나면 sync(idle) · changed 알림', async () => {
    const source = createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], syncDurationMs: 20 })
    const c = collect(source, TEAM_WS)
    const before = await source.getSyncStatus(TEAM_WS)
    assert.equal(before.state, 'idle')

    const started = await source.requestSync(TEAM_WS)
    assert.equal(started.state, 'running')
    assert.equal((await source.getSyncStatus(TEAM_WS)).state, 'running')
    await rejectsCode(source.requestSync(TEAM_WS), 'conflict')

    await c.until((cs) => cs.some((x) => x.type === 'changed'))
    assert.deepEqual(
      c.changes.map((x) => (x.type === 'sync' ? `sync:${x.status.state}` : x.type)),
      ['sync:running', 'sync:idle', 'changed'],
    )
    const done = await source.getSyncStatus(TEAM_WS)
    assert.equal(done.state, 'idle')
    assert.equal(done.isFailing, false)
    assert.ok(done.lastSucceededAt !== null && done.lastSucceededAt.endsWith('Z'))
    assert.deepEqual((await source.load(TEAM_WS)).sync, done)
    c.unsubscribe()
  })

  describe('새로 고침으로 끊긴 동기화 (fake timer)', () => {
    const SYNC_MS = 800
    const FIXED_NOW = () => new Date('2026-11-05T03:00:00Z')
    const instance = (storage: StorageLike) => createV1MockDataSource({ storage, session: 'github', latencyMs: [0, 0], syncDurationMs: SYNC_MS, now: FIXED_NOW })

    afterEach(() => mock.timers.reset())

    it('A — 끝나기 전에 새로 만든 인스턴스는 running을 이어받지 않고, 동기화 전 상태로 돌아가 새 동기화를 시작할 수 있다', async () => {
      mock.timers.enable({ apis: ['setTimeout'] })
      const storage = createMemoryStorage()
      const before = instance(storage)
      const pre = await before.getSyncStatus(TEAM_WS)
      assert.equal((await before.requestSync(TEAM_WS)).state, 'running')
      // 타이머가 돌기 전에 같은 저장소로 새 인스턴스 = 새로 고침 (이전 탭의 타이머는 사라진 것으로 본다)
      const reloaded = instance(storage)
      assert.deepEqual(await reloaded.getSyncStatus(TEAM_WS), pre, '동기화 전 상태 그대로 (lastSucceededAt 보존)')
      assert.equal((await reloaded.requestSync(TEAM_WS)).state, 'running', 'conflict 없이 새로 시작')
      mock.timers.tick(SYNC_MS)
      const done = await reloaded.getSyncStatus(TEAM_WS)
      assert.equal(done.state, 'idle')
      assert.equal(done.lastSucceededAt, '2026-11-05T03:00:00Z')
    })

    it('B — 같은 인스턴스의 정상 동기화는 running을 유지하다 타이머가 돌면 끝난다', async () => {
      mock.timers.enable({ apis: ['setTimeout'] })
      const source = instance(createMemoryStorage())
      assert.equal((await source.requestSync(TEAM_WS)).state, 'running')
      mock.timers.tick(SYNC_MS - 1)
      assert.equal((await source.getSyncStatus(TEAM_WS)).state, 'running', '끝나기 전')
      await rejectsCode(source.requestSync(TEAM_WS), 'conflict')
      mock.timers.tick(1)
      const done = await source.getSyncStatus(TEAM_WS)
      assert.equal(done.state, 'idle')
      assert.equal(done.lastSucceededAt, '2026-11-05T03:00:00Z')
      assert.equal(done.isFailing, false)
    })

    it('C — 끊긴 동기화를 되돌려도 다른 사무실과 그 사무실의 다른 데이터는 그대로다', async () => {
      mock.timers.enable({ apis: ['setTimeout'] })
      const storage = createMemoryStorage()
      const before = instance(storage)
      const demoBefore = await before.load(DEMO_WS)
      const teamBefore = await before.load(TEAM_WS)
      await before.requestSync(TEAM_WS)

      const reloaded = instance(storage)
      assert.deepEqual(await reloaded.load(DEMO_WS), demoBefore, '시연 사무실 전체')
      const teamAfter = await reloaded.load(TEAM_WS)
      assert.deepEqual(teamAfter, teamBefore, '팀 사무실 — sync가 동기화 전 상태로 돌아가 나머지와 함께 같다')
    })
  })

  describe('여러 탭 · 저장값 (fake timer)', () => {
    const SYNC_MS = 800
    const FIXED_NOW = () => new Date('2026-11-05T03:00:00Z')
    const tab = (storage: StorageLike, session?: MockSession | null) =>
      createV1MockDataSource({ storage, session, latencyMs: [0, 0], syncDurationMs: SYNC_MS, now: FIXED_NOW })
    const quiet = <T>(fn: () => T): T => {
      const warn = console.warn
      console.warn = () => {}
      try {
        return fn()
      } finally {
        console.warn = warn
      }
    }

    afterEach(() => mock.timers.reset())

    it('다른 탭이 연 사무실은 이 탭이 나중에 저장해도 사라지지 않는다', async () => {
      mock.timers.enable({ apis: ['setTimeout'] })
      const shared = createSharedMemoryStorage()
      const a = tab(shared.view(), 'github')
      const b = tab(shared.view())
      const opened = await b.openWorkspace(openRequest({ specDocumentPath: null }))
      await a.requestSync(TEAM_WS)
      mock.timers.tick(SYNC_MS) // A · B 동기화가 끝나며 각자 저장
      const reloaded = tab(shared.view())
      assert.ok((await reloaded.listWorkspaces()).some((w) => w.id === opened.id), 'B가 연 사무실')
      assert.ok((await a.listWorkspaces()).some((w) => w.id === opened.id), 'A도 본다')
    })

    it('한 탭에서 로그아웃하면 다른 탭도 로그인 안 됨이 된다', async () => {
      const shared = createSharedMemoryStorage()
      const a = tab(shared.view(), 'github')
      const b = tab(shared.view())
      await a.logout()
      await rejectsCode(b.getMe(), 'unauthorized')
    })

    it('새 탭의 끊긴 동기화 복구가 다른 탭에서 진행 중인 동기화를 끊지 않는다', async () => {
      mock.timers.enable({ apis: ['setTimeout'] })
      const shared = createSharedMemoryStorage()
      const a = tab(shared.view(), 'github')
      await a.requestSync(TEAM_WS)
      const b = tab(shared.view()) // 만들 때 저장된 running을 되돌리고 저장한다
      assert.equal((await b.getSyncStatus(TEAM_WS)).state, 'idle', '새 탭은 이어받지 않는다')
      assert.equal((await a.getSyncStatus(TEAM_WS)).state, 'running', 'A는 아직 진행 중')
      await rejectsCode(a.requestSync(TEAM_WS), 'conflict')
      mock.timers.tick(SYNC_MS)
      assert.equal((await a.getSyncStatus(TEAM_WS)).state, 'idle')
      assert.equal((await b.getSyncStatus(TEAM_WS)).state, 'idle', 'A의 완료가 B에도 보인다')
    })

    it('동기화가 성공해도 마지막 실패 기록은 남고 isFailing은 false가 된다', async () => {
      mock.timers.enable({ apis: ['setTimeout'] })
      const storage = createMemoryStorage()
      tab(storage, 'github')
      const saved = JSON.parse(storage.getItem(V1_STORAGE_KEY) ?? 'null')
      const failure = { lastFailedAt: '2026-11-05T02:50:00Z', lastFailureCode: 'github_rate_limited', lastFailureMessage: 'GitHub 요청 한도를 넘었어요', isFailing: true }
      saved.workspaces[0].snapshot.sync = { ...saved.workspaces[0].snapshot.sync, ...failure }
      storage.setItem(V1_STORAGE_KEY, JSON.stringify(saved))

      const source = tab(storage)
      await source.requestSync(TEAM_WS)
      mock.timers.tick(SYNC_MS)
      const done = await source.getSyncStatus(TEAM_WS)
      assert.equal(done.state, 'idle')
      assert.equal(done.lastSucceededAt, '2026-11-05T03:00:00Z')
      assert.equal(done.isFailing, false)
      assert.deepEqual([done.lastFailedAt, done.lastFailureCode, done.lastFailureMessage], [failure.lastFailedAt, failure.lastFailureCode, failure.lastFailureMessage])
    })

    it('버전은 맞지만 사무실 항목이 깨진 저장값은 TypeError 없이 seed로 다시 시작한다', async () => {
      for (const broken of [[{}], [{ snapshot: { workspace: { id: 'ws_x' } }, consentedUserIds: [] }], ['nope']]) {
        const storage = createMemoryStorage()
        storage.setItem(V1_STORAGE_KEY, JSON.stringify({ version: MOCK_STATE_VERSION, session: 'github', nextId: 100, workspaces: broken }))
        const source = quiet(() => tab(storage))
        assert.deepEqual((await source.listWorkspaces()).map((w) => w.id).sort(), [DEMO_WS, TEAM_WS].sort(), JSON.stringify(broken))
      }
    })

    it('저장 버전이 다른(옛) 데이터는 읽지 않고 지금 seed로 다시 시작한다', async () => {
      const storage = createMemoryStorage()
      tab(storage, 'github')
      const saved = JSON.parse(storage.getItem(V1_STORAGE_KEY) ?? 'null')
      saved.version = MOCK_STATE_VERSION - 1
      saved.workspaces[0].snapshot.workspace.displayName = '옛 사무실' // 옛 seed 표시
      storage.setItem(V1_STORAGE_KEY, JSON.stringify(saved))
      const source = quiet(() => tab(storage))
      assert.equal((await source.load(TEAM_WS)).workspace.displayName, 'team-samdo/gitvillage')
    })
  })

  it('구독을 끊으면 더 받지 않고, 다른 사무실의 알림은 오지 않는다', async () => {
    const source = make('github')
    const team = collect(source, TEAM_WS)
    const demo = collect(source, DEMO_WS)
    demo.unsubscribe()
    await source.requestSync(DEMO_WS)
    await source.requestSync(TEAM_WS)
    await team.until((cs) => cs.some((x) => x.type === 'changed'))
    assert.deepEqual(demo.changes, [])
    team.unsubscribe()
  })
})

describe('mock v1 — 팀 설정 (#38)', () => {
  /** 내가 R2인 사무실을 하나 연다 */
  async function adminWorkspace(source: ReturnType<typeof make>) {
    return (await source.openWorkspace(openRequest())).id
  }

  it('getSettings — Snapshot의 settings와 같고, 들어갈 수 없는 사무실은 not_found', async () => {
    const source = make('github')
    assert.deepEqual(await source.getSettings(TEAM_WS), (await source.load(TEAM_WS)).settings)
    await rejectsCode(make('review').getSettings(TEAM_WS), 'not_found')
  })

  it('updateSettings — R2는 전체를 바꾸고, Snapshot에 남고, changed(settings) 알림이 온다', async () => {
    const source = make('github')
    const id = await adminWorkspace(source)
    const c = collect(source, id)
    const next = { projectStartDate: '2026-11-06', projectEndDate: '2026-11-20', specDocumentPath: 'docs/spec.md', reviewWaitHours: 24, noCommitHours: 72 }
    assert.deepEqual(await source.updateSettings(id, { ...next, extra: 'x' } as typeof next), next, '계약의 칸만 저장한다')
    assert.deepEqual((await source.load(id)).settings, next)
    await c.until((cs) => cs.some((x) => x.type === 'changed' && x.resources.includes('settings')))
    c.unsubscribe()
  })

  it('updateSettings — 끝이 시작보다 빠름 · 없는 날짜 · 범위 밖 기준 시간 · 빈 경로는 invalid, 값은 그대로', async () => {
    const source = make('github')
    const id = await adminWorkspace(source)
    const before = await source.getSettings(id)
    await rejectsCode(source.updateSettings(id, { ...before, projectStartDate: '2026-11-17', projectEndDate: '2026-11-04' }), 'invalid')
    await rejectsCode(source.updateSettings(id, { ...before, projectEndDate: '2026-02-30' }), 'invalid')
    await rejectsCode(source.updateSettings(id, { ...before, reviewWaitHours: 0 }), 'invalid')
    await rejectsCode(source.updateSettings(id, { ...before, noCommitHours: 721 }), 'invalid')
    await rejectsCode(source.updateSettings(id, { ...before, reviewWaitHours: 1.5 }), 'invalid')
    await rejectsCode(source.updateSettings(id, { ...before, specDocumentPath: '' }), 'invalid')
    assert.deepEqual(await source.getSettings(id), before)
  })

  it('updateSettings — 하루짜리 기간(시작 = 끝)은 된다', async () => {
    const source = make('github')
    const id = await adminWorkspace(source)
    const before = await source.getSettings(id)
    const saved = await source.updateSettings(id, { ...before, projectStartDate: '2026-11-10', projectEndDate: '2026-11-10' })
    assert.equal(saved.projectEndDate, '2026-11-10')
  })

  it('updateSettings — R2가 아니면 forbidden_role, 들어갈 수 없는 사무실은 not_found', async () => {
    const source = make('github') // 팀 사무실(ws_1)에서는 참여자
    const before = await source.getSettings(TEAM_WS)
    await rejectsCode(source.updateSettings(TEAM_WS, { ...before, projectEndDate: '2026-12-01' }), 'forbidden_role')
    assert.deepEqual(await source.getSettings(TEAM_WS), before)
    await rejectsCode(make('review').updateSettings(TEAM_WS, before), 'not_found')
  })
})
