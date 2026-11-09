// 진입 흐름 — 로그인 · 사무실 고르기 (#64 · #68 화면 몫, CONTRACTS_API.md 「2」 · 「3」). mock DataSource로 확인한다.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { DataError, type DataSource } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { MOCK_REVIEW_LOGIN, createV1MockDataSource, type MockSession } from '../../src/data/mock/v1'
import { resetSessionForTest, useSession } from '../../src/session'
import { useOffice } from '../../src/store'

const TEAM_WS = 'ws_1'
const DEMO_WS = 'ws_2'

// 지난번 사무실 기억(localStorage) — Node에는 없어 메모리로 흉내 낸다
const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}

const make = (session: MockSession | null = 'github', reviewLoginEnabled = true) =>
  createV1MockDataSource({ storage: createMemoryStorage(), session, latencyMs: [0, 0], reviewLoginEnabled })
const st = () => useSession.getState()
const office = () => useOffice.getState().office

beforeEach(() => {
  mem.clear()
  resetSessionForTest()
})
afterEach(() => {
  useOffice.getState().closeOffice()
})

describe('세션 시작', () => {
  it('로그인돼 있고 ?workspace로 고른 사무실에 들어갈 수 있으면 바로 연다', async () => {
    await st().start(make(), { preferredWorkspace: DEMO_WS })
    assert.equal(st().status, 'signed_in')
    assert.equal(st().me?.user.userId, 'u_1')
    assert.equal(office()?.workspaceId, DEMO_WS)
    assert.equal(office()?.status, 'ready')
  })

  it('고른 사무실도 지난번 사무실도 없으면 사무실 고르기(사무실 닫힘)', async () => {
    await st().start(make())
    assert.equal(st().status, 'signed_in')
    assert.equal(office(), null)
  })

  it('들어갈 수 없는 사무실을 고르면 열지 않고 고르기로', async () => {
    await st().start(make(), { preferredWorkspace: 'ws_nope' })
    assert.equal(st().status, 'signed_in')
    assert.equal(office(), null)
  })

  it('지난번 사무실을 기억했다가 다음 시작에 연다 — 사무실 바꾸기를 누르면 잊는다', async () => {
    const source = make()
    await st().start(source)
    await st().enterWorkspace(TEAM_WS)
    assert.equal(office()?.workspaceId, TEAM_WS)

    useOffice.getState().closeOffice()
    resetSessionForTest()
    await st().start(source)
    assert.equal(office()?.workspaceId, TEAM_WS, '기억한 사무실')

    st().leaveWorkspace()
    assert.equal(office(), null)
    resetSessionForTest()
    await st().start(source)
    assert.equal(office(), null, '바꾸기를 누른 뒤에는 고르기부터')
  })

  it('로그인 전이면 로그인 화면 — 로그인 옵션을 받는다', async () => {
    await st().start(make(null))
    assert.equal(st().status, 'signed_out')
    assert.equal(st().me, null)
    assert.deepEqual(st().loginOptions, { githubLoginUrl: '/oauth2/authorization/github', reviewLoginEnabled: true })
    assert.equal(st().mock, true)
  })

  it('같은 source로 두 번 시작해도(StrictMode) 세션은 한 번만 확인한다', async () => {
    const base = make()
    let calls = 0
    const source: DataSource = {
      ...base,
      async getMe() {
        calls++
        return base.getMe()
      },
    }
    await Promise.all([st().start(source), st().start(source)])
    assert.equal(calls, 1)
  })

  it('서버에 닿지 못하면 error, 다시 시도로 회복한다', async () => {
    const base = make()
    let down = true
    const source: DataSource = {
      ...base,
      async getMe() {
        if (down) throw new DataError('서버에 연결할 수 없어요', 'unavailable')
        return base.getMe()
      },
    }
    await st().start(source)
    assert.deepEqual([st().status, st().error], ['error', '서버에 연결할 수 없어요'])
    down = false
    await st().retry()
    assert.equal(st().status, 'signed_in')
  })
})

describe('로그인 · 로그아웃', () => {
  it('GitHub 로그인(mock) — 바로 로그인돼 고르기로', async () => {
    await st().start(make(null))
    st().loginWithGithub()
    await new Promise((r) => setImmediate(r))
    for (let i = 0; i < 5 && st().status !== 'signed_in'; i++) await new Promise((r) => setImmediate(r))
    assert.equal(st().status, 'signed_in')
    assert.equal(st().me?.accountType, 'github')
  })

  it('심사용 로그인 — 틀리면 문구(어느 값인지 말하지 않음), 맞으면 심사용 계정으로 로그인', async () => {
    await st().start(make(null))
    assert.equal(await st().loginForReview('review', 'wrong'), '아이디나 비밀번호가 맞지 않아요')
    assert.equal(st().status, 'signed_out')
    assert.equal(await st().loginForReview(MOCK_REVIEW_LOGIN.username, MOCK_REVIEW_LOGIN.password), null)
    assert.equal(st().status, 'signed_in')
    assert.equal(st().me?.accountType, 'review')
    // 심사용 계정은 시연 사무실만
    assert.deepEqual(
      (await st().listWorkspaces())?.map((w) => w.id),
      [DEMO_WS],
    )
  })

  it('심사용 로그인이 꺼진 환경 — 경로가 없다(not_found)', async () => {
    const source = make(null, false)
    await assert.rejects(source.reviewLogin({ username: 'review', password: 'review' }), (e: unknown) => e instanceof DataError && e.code === 'not_found')
    await st().start(source)
    assert.equal(st().loginOptions?.reviewLoginEnabled, false)
  })

  it('로그아웃 — 사무실을 닫고 로그인 화면으로', async () => {
    await st().start(make(), { preferredWorkspace: TEAM_WS })
    assert.ok(office())
    await st().logout()
    assert.equal(office(), null)
    assert.equal(st().status, 'signed_out')
    assert.equal(st().me, null)
  })

  it('세션이 끝난 뒤 목록을 읽으면 로그인 화면으로', async () => {
    const source = make()
    await st().start(source)
    await source.logout() // 다른 탭에서 로그아웃
    assert.equal(await st().listWorkspaces(), null)
    assert.equal(st().status, 'signed_out')
  })
})

describe('레포에서 사무실 열기 (#13 · #68)', () => {
  const request = (githubRepoId: string) => ({ githubRepoId, projectStartDate: '2026-11-05', projectEndDate: '2026-11-18', specDocumentPath: 'docs/req.md', activityConsent: true })

  it('레포 목록 — GitHub 사용자는 조직 · 레포(열린 사무실 ID 포함), 심사용 계정은 비어 있다', async () => {
    await st().start(make())
    const repos = await st().listRepositories()
    assert.deepEqual(
      repos?.organizations.map((o) => [o.login, o.appInstalled, o.repositories.map((r) => [r.name, r.myRole, r.workspaceId])]),
      [
        ['team-samdo', true, [['gitvillage', 'participant', 'ws_1'], ['side-lab', 'repo_admin', null]]],
        ['bootcamp-lab', false, [['final-project', 'participant', null]]],
      ],
    )
    resetSessionForTest()
    await st().start(make('review'))
    assert.deepEqual(await st().listRepositories(), { organizations: [] })
  })

  it('R2가 열면 사무실이 생기고 바로 들어간다 — 기간 · 명세 문서 경로가 팀 설정에 남는다', async () => {
    await st().start(make())
    assert.equal(await st().openNewWorkspace(request('880001300')), null)
    const o = office()
    assert.equal(o?.status, 'ready')
    assert.equal(o?.snapshot?.workspace.displayName, 'team-samdo/side-lab')
    assert.equal(o?.snapshot?.viewer.role, 'repo_admin')
    assert.deepEqual([o?.snapshot?.settings.projectEndDate, o?.snapshot?.settings.specDocumentPath], ['2026-11-18', 'docs/req.md'])
    // 다시 열면 이미 열림, 목록에는 새 사무실
    assert.equal(await st().openNewWorkspace(request('880001300')), '이미 열린 사무실이에요')
    assert.ok((await st().listWorkspaces())?.some((w) => w.displayName === 'team-samdo/side-lab'))
  })

  it('거부 문구 — 참여자 레포 · 끝 날짜가 시작보다 빠름 · 없는 레포, 사무실은 열리지 않는다', async () => {
    await st().start(make())
    assert.equal(await st().openNewWorkspace(request('880002001')), '레포 관리자만 사무실을 열 수 있어요')
    assert.equal(await st().openNewWorkspace({ ...request('880001300'), projectEndDate: '2026-11-01' }), '끝 날짜는 시작 날짜보다 빠를 수 없어요')
    assert.equal(await st().openNewWorkspace(request('999')), '레포를 찾을 수 없어요')
    assert.equal(office(), null)
  })
})

describe('도착 장면 (로그인 디자인 전환 A)', () => {
  it('계정마다 처음 사무실을 고를 때 한 번 — 두 번째 고르기 · 앱을 열 때 자동으로 들어가기는 장면 없이', async () => {
    const source = make()
    await st().start(source, { preferredWorkspace: TEAM_WS })
    assert.equal(st().landing, false, '?workspace로 바로 들어가면 장면 없이')

    st().leaveWorkspace()
    await st().enterWorkspace(DEMO_WS)
    assert.equal(st().landing, true, '처음 고르면 장면')
    st().finishLanding()
    assert.equal(st().landing, false)

    st().leaveWorkspace()
    await st().enterWorkspace(TEAM_WS)
    assert.equal(st().landing, false, '두 번째 고르기는 장면 없이')

    useOffice.getState().closeOffice()
    resetSessionForTest()
    await st().start(source)
    assert.equal(office()?.workspaceId, TEAM_WS)
    assert.equal(st().landing, false, '지난번 사무실로 자동으로 들어가면 장면 없이')
  })

  it('다른 계정은 따로 한 번 · 사무실을 나가거나 로그아웃하면 장면을 끈다', async () => {
    await st().start(make())
    await st().enterWorkspace(TEAM_WS)
    assert.equal(st().landing, true)
    st().leaveWorkspace()
    assert.equal(st().landing, false, '사무실 바꾸기로 나가면 끈다')

    await st().logout()
    assert.equal(st().landing, false)
    assert.equal(await st().loginForReview(MOCK_REVIEW_LOGIN.username, MOCK_REVIEW_LOGIN.password), null)
    await st().enterWorkspace(DEMO_WS)
    assert.equal(st().landing, true, '심사 계정은 처음 — 장면')
    await st().logout()
    assert.equal(st().landing, false, '로그아웃하면 끈다')
  })
})

describe('우주선으로 다른 사무실로 옮기기 (scene/DockShip.tsx)', () => {
  it('사무실 안에서 바로 다른 사무실을 열고 기억한다 — 처음이어도 도착 장면은 없다(우주선 비행이 도착 연출)', async () => {
    const source = make()
    await st().start(source, { preferredWorkspace: TEAM_WS })
    await st().travelToWorkspace(DEMO_WS)
    assert.equal(office()?.workspaceId, DEMO_WS)
    assert.equal(st().landing, false)

    useOffice.getState().closeOffice()
    resetSessionForTest()
    await st().start(source)
    assert.equal(office()?.workspaceId, DEMO_WS, '다음에 앱을 열면 옮겨 간 사무실로')
  })
})
