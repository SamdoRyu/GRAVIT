// v1 api DataSource — 계약 경로 · 메서드 · 상태 코드 · CSRF · 에러 매핑 · SSE를 작은 가짜 서버로 검사한다.
// 실제 Spring과의 통합은 아니다(경로 · 응답 모양은 CONTRACTS_API.md와 backend 컨트롤러 기준).
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, it } from 'node:test'
import { DataError } from '../../src/data/DataSource'
import { CSRF_HEADER, createV1ApiDataSource, type V1ApiDataSource } from '../../src/data/api/v1'
import type { Change, ErrorCode, OpenWorkspaceRequest, SyncStatus } from '../../src/data/types'
import { meResponseExample, workspaceSnapshotExample } from './examples'

interface Req {
  method: string
  path: string
  csrf: string | undefined
  contentType: string | undefined
  body: string
}

interface Fake {
  url: string
  requests: Req[]
  /** 서버가 지금 받는 CSRF 토큰. login-options를 받으면 브라우저 쿠키(cookie)에도 들어간다 */
  serverToken: string
  cookie: string | null
  /** 다음 요청 하나를 이 함수가 대신 처리한다 (에러 시나리오) */
  next: ((req: Req, res: ServerResponse) => void)[]
  /** 열려 있는 SSE 연결 */
  streams: { path: string; res: ServerResponse; closed: boolean }[]
  /** events 요청을 SSE 대신 이 함수로 처리 (거절 시나리오) */
  onEvents: ((res: ServerResponse) => void) | null
  push(text: string): void
  close(): Promise<void>
}

const sync = (state: SyncStatus['state']): SyncStatus => ({
  state,
  lastSucceededAt: '2026-11-05T03:00:00Z',
  lastFailedAt: null,
  lastFailureCode: null,
  lastFailureMessage: null,
  isFailing: false,
  specWarnings: [],
})

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}
const sendError = (res: ServerResponse, status: number, code: ErrorCode, message = `${code} 메시지`) => sendJson(res, status, { error: { code, message } })

async function startFake(): Promise<Fake> {
  const fake: Fake = {
    url: '',
    requests: [],
    serverToken: 'tok-1',
    cookie: null,
    next: [],
    streams: [],
    onEvents: null,
    push(text) {
      for (const s of fake.streams) if (!s.closed) s.res.write(text)
    },
    close: () =>
      new Promise((resolve) => {
        for (const s of fake.streams) if (!s.closed) s.res.end()
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const r: Req = {
        method: req.method ?? '',
        path: req.url ?? '',
        csrf: req.headers[CSRF_HEADER.toLowerCase()] as string | undefined,
        contentType: req.headers['content-type'],
        body,
      }
      fake.requests.push(r)
      const override = fake.next.shift()
      if (override) return override(r, res)
      route(r, res)
    })
  })
  function route(r: Req, res: ServerResponse) {
    const writing = r.method !== 'GET'
    if (writing && r.csrf !== fake.serverToken) return sendError(res, 403, 'invalid', 'CSRF 토큰이 없거나 맞지 않아요')
    const path = r.path
    if (r.method === 'GET' && path === '/api/login-options') {
      fake.cookie = fake.serverToken // Set-Cookie: XSRF-TOKEN
      return sendJson(res, 200, { githubLoginUrl: '/oauth2/authorization/github', reviewLoginEnabled: false })
    }
    if (r.method === 'GET' && path === '/api/me') return sendJson(res, 200, meResponseExample)
    if (r.method === 'GET' && path === '/api/repositories') return sendJson(res, 200, { organizations: [] })
    if (r.method === 'GET' && path === '/api/workspaces') return sendJson(res, 200, [{ ...workspaceSnapshotExample.workspace, myRole: 'participant' }])
    if (r.method === 'POST' && path === '/api/workspaces') return sendJson(res, 201, workspaceSnapshotExample.workspace)
    if (r.method === 'POST' && path === '/api/logout') {
      res.writeHead(204)
      return res.end()
    }
    const ws = /^\/api\/workspaces\/([^/]+)\/(snapshot|sync-status|sync|events|settings)$/.exec(path)
    if (ws) {
      const [, , what] = ws
      if (r.method === 'GET' && what === 'snapshot') return sendJson(res, 200, workspaceSnapshotExample)
      if (r.method === 'GET' && what === 'settings') return sendJson(res, 200, workspaceSnapshotExample.settings)
      if (r.method === 'PUT' && what === 'settings') return sendJson(res, 200, JSON.parse(r.body))
      if (r.method === 'GET' && what === 'sync-status') return sendJson(res, 200, sync('idle'))
      if (r.method === 'POST' && what === 'sync') return sendJson(res, 202, sync('running'))
      if (r.method === 'GET' && what === 'events') {
        if (fake.onEvents) return fake.onEvents(res)
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
        res.flushHeaders()
        const s = { path, res, closed: false }
        res.on('close', () => (s.closed = true))
        fake.streams.push(s)
        return
      }
    }
    const sub = /^\/api\/workspaces\/([^/]+)\/submissions\/([^/]+)\/(rounds|evaluations\/mine)$/.exec(path)
    if (sub) {
      const round = workspaceSnapshotExample.submissions[0].currentRound
      if (r.method === 'GET' && sub[3] === 'rounds') return sendJson(res, 200, [round])
      if (r.method === 'PUT' && sub[3] === 'evaluations/mine') {
        const { verdict, reason } = JSON.parse(r.body) as { verdict: string; reason: string }
        return sendJson(res, 200, { ...round, myEvaluation: { verdict, reason, updatedAt: '2026-11-05T03:10:00Z' } })
      }
    }
    sendError(res, 404, 'not_found', '없는 경로예요')
  }
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return fake
}

let fake: Fake
let source: V1ApiDataSource | null = null
const make = () => {
  source = createV1ApiDataSource({ baseUrl: fake.url, csrfToken: () => fake.cookie, timing: { backoffStartMs: 20, backoffMaxMs: 40, idleLimitMs: 300 } })
  return source
}
afterEach(async () => {
  source?.close()
  source = null
  await fake?.close()
})

async function rejectsWith(p: Promise<unknown>, code: ErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, `DataError가 아님: ${String(e)}`)
    assert.equal(e.code, code)
    if (message !== undefined) assert.equal(e.message, message)
    return true
  })
}

async function until(pred: () => boolean, label: string, ms = 2000) {
  const end = Date.now() + ms
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timeout: ${label}`)
    await new Promise((r) => setTimeout(r, 5))
  }
}

const openRequest: OpenWorkspaceRequest = { githubRepoId: '880001234', projectStartDate: '2026-11-04', projectEndDate: '2026-11-17', specDocumentPath: null, activityConsent: true }

describe('v1 api — 읽기', () => {
  it('계약 경로를 GET으로 부르고 응답을 그대로 돌려준다. 읽기에는 CSRF 헤더를 붙이지 않는다', async () => {
    fake = await startFake()
    const api = make()
    assert.deepEqual(await api.getMe(), meResponseExample)
    assert.equal((await api.getLoginOptions()).githubLoginUrl, '/oauth2/authorization/github')
    assert.deepEqual(await api.listRepositories(), { organizations: [] })
    assert.equal((await api.listWorkspaces())[0].myRole, 'participant')
    assert.deepEqual(await api.load('3'), workspaceSnapshotExample)
    assert.equal((await api.getSyncStatus('3')).state, 'idle')
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path}`),
      ['GET /api/me', 'GET /api/login-options', 'GET /api/repositories', 'GET /api/workspaces', 'GET /api/workspaces/3/snapshot', 'GET /api/workspaces/3/sync-status'],
    )
    assert.ok(fake.requests.every((r) => r.csrf === undefined))
  })

  it('사무실 ID는 불투명한 문자열 — 경로에 넣을 때 인코딩한다', async () => {
    fake = await startFake()
    await make().load('a/b c')
    assert.equal(fake.requests[0].path, '/api/workspaces/a%2Fb%20c/snapshot', '슬래시 · 공백이 경로를 바꾸지 않는다')
  })
})

describe('v1 api — 쓰기 · CSRF', () => {
  it('쓰기에는 쿠키의 CSRF 토큰을 헤더로 붙이고, 계약의 상태 코드(201 · 202 · 204)를 받는다', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.deepEqual(await api.openWorkspace(openRequest), workspaceSnapshotExample.workspace)
    assert.equal((await api.requestSync('3')).state, 'running')
    assert.equal(await api.logout(), undefined)
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf}`),
      ['POST /api/workspaces tok-1', 'POST /api/workspaces/3/sync tok-1', 'POST /api/logout tok-1'],
    )
    assert.deepEqual(JSON.parse(fake.requests[0].body), openRequest)
    assert.match(fake.requests[0].contentType ?? '', /^application\/json/)
  })

  it('토큰이 없으면 login-options로 먼저 받아 온 뒤 보낸다', async () => {
    fake = await startFake()
    await make().requestSync('3')
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      ['GET /api/login-options -', 'POST /api/workspaces/3/sync tok-1'],
    )
  })

  it('토큰이 바뀌어(로그인 · 로그아웃) 403 invalid면 새 토큰을 받아 한 번만 다시 보낸다', async () => {
    fake = await startFake()
    fake.cookie = 'old-token'
    assert.equal((await make().requestSync('3')).state, 'running')
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      ['POST /api/workspaces/3/sync old-token', 'GET /api/login-options -', 'POST /api/workspaces/3/sync tok-1'],
    )
  })

  it('다시 보내도 403 invalid면 그대로 실패한다(무한 재시도 없음). forbidden_role은 다시 보내지 않는다', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    fake.next.push((_r, res) => sendError(res, 403, 'invalid'), (_r, res) => sendJson(res, 200, {}), (_r, res) => sendError(res, 403, 'invalid', '출처가 맞지 않아요'))
    await rejectsWith(api.requestSync('3'), 'invalid', '출처가 맞지 않아요')
    assert.equal(fake.requests.length, 3)

    fake.requests.length = 0
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '강사는 동기화할 수 없어요'))
    await rejectsWith(api.requestSync('3'), 'forbidden_role', '강사는 동기화할 수 없어요')
    assert.equal(fake.requests.length, 1)
  })

  it('팀 설정 — GET · PUT W/settings, PUT은 전체를 JSON 본문으로 보내고 400 · 403을 그대로 돌려준다 (#38)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    const next = { ...workspaceSnapshotExample.settings, projectEndDate: '2026-11-20' }
    assert.deepEqual(await api.getSettings('3'), workspaceSnapshotExample.settings)
    assert.deepEqual(await api.updateSettings('3', next), next)
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      ['GET /api/workspaces/3/settings -', 'PUT /api/workspaces/3/settings tok-1'],
    )
    assert.deepEqual(JSON.parse(fake.requests[1].body), next)
    assert.match(fake.requests[1].contentType ?? '', /^application\/json/)

    fake.next.push((_r, res) => sendError(res, 400, 'invalid', '끝 날짜는 시작 날짜보다 빠를 수 없어요'))
    await rejectsWith(api.updateSettings('3', { ...next, projectEndDate: '2026-11-01' }), 'invalid', '끝 날짜는 시작 날짜보다 빠를 수 없어요')
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '레포 관리자만 바꿀 수 있어요'))
    await rejectsWith(api.updateSettings('3', next), 'forbidden_role', '레포 관리자만 바꿀 수 있어요')
  })

  it('PR 평가 — GET rounds · PUT evaluations/mine, PUT은 CSRF와 JSON 본문, 400 · 403 · 409를 그대로 (#19 · #20)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    const round = workspaceSnapshotExample.submissions[0].currentRound
    const request = { roundId: round.id, verdict: 'not_recommend' as const, reason: '실패 응답 모양이 계약과 달라요' }
    assert.deepEqual(await api.listRounds('3', '9'), [round])
    const saved = await api.evaluate('3', '9', request)
    assert.deepEqual(saved.myEvaluation, { verdict: request.verdict, reason: request.reason, updatedAt: '2026-11-05T03:10:00Z' })
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      ['GET /api/workspaces/3/submissions/9/rounds -', 'PUT /api/workspaces/3/submissions/9/evaluations/mine tok-1'],
    )
    assert.deepEqual(JSON.parse(fake.requests[1].body), request)
    assert.match(fake.requests[1].contentType ?? '', /^application\/json/)

    for (const [status, code, message] of [
      [400, 'invalid', '한 줄 이유를 적어 주세요'],
      [403, 'forbidden_role', '내 PR은 평가할 수 없어요'],
      [409, 'conflict', '그 사이 새 평가 회차가 열렸어요'],
    ] as const) {
      fake.next.push((_r, res) => sendError(res, status, code, message))
      await rejectsWith(api.evaluate('3', '9', request), code, message)
    }
  })
})

describe('v1 api — 에러', () => {
  it('에러 본문의 8개 code와 문구를 그대로 DataError로', async () => {
    fake = await startFake()
    const api = make()
    const codes: [ErrorCode, number][] = [
      ['invalid', 400],
      ['unauthorized', 401],
      ['forbidden_role', 403],
      ['not_found', 404],
      ['conflict', 409],
      ['unavailable', 503],
      ['github_unauthorized', 503],
      ['github_rate_limited', 503],
    ]
    for (const [code, status] of codes) {
      fake.next.push((_r, res) => sendError(res, status, code, `문구 ${code}`))
      await rejectsWith(api.getMe(), code, `문구 ${code}`)
    }
  })

  it('본문이 없거나 모르는 code면 상태 코드로 짐작한다', async () => {
    fake = await startFake()
    const api = make()
    const cases: [number, ErrorCode][] = [
      [400, 'invalid'],
      [401, 'unauthorized'],
      [403, 'forbidden_role'],
      [404, 'not_found'],
      [409, 'conflict'],
      [500, 'unavailable'],
      [502, 'unavailable'],
    ]
    for (const [status, code] of cases) {
      fake.next.push((_r, res) => {
        res.writeHead(status, { 'Content-Type': 'text/html' })
        res.end('<html>error</html>')
      })
      await rejectsWith(api.getMe(), code)
    }
    fake.next.push((_r, res) => sendJson(res, 409, { error: { code: 'brand_new_code', message: '새 코드' } }))
    await rejectsWith(api.getMe(), 'conflict', '새 코드')
  })

  it('서버에 닿지 않으면 unavailable, 성공인데 JSON이 아니면 unavailable', async () => {
    fake = await startFake()
    const api = make()
    fake.next.push((_r, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{not json')
    })
    await rejectsWith(api.getMe(), 'unavailable', '서버 응답을 읽을 수 없어요')
    const url = fake.url
    await fake.close()
    const gone = createV1ApiDataSource({ baseUrl: url, csrfToken: () => null })
    await rejectsWith(gone.getMe(), 'unavailable', '서버에 연결할 수 없어요')
    fake = await startFake() // afterEach가 닫을 서버
  })
})

describe('v1 api — 변경 알림 (SSE)', () => {
  const collect = (api: V1ApiDataSource, workspaceId: string) => {
    const got: Change[] = []
    const off = api.subscribe(workspaceId, (c) => got.push(c))
    return { got, off }
  }
  const kinds = (got: Change[]) => got.map((c) => (c.type === 'connection' ? `connection:${c.status}` : c.type === 'sync' ? `sync:${c.status.state}` : `changed:${c.resources.join(',')}`))

  it('connecting → online, change · sync 이벤트를 Change로. ping · 모르는 이벤트 · 깨진 데이터는 버린다', async () => {
    fake = await startFake()
    const api = make()
    const c = collect(api, '3')
    await until(() => fake.streams.length === 1 && kinds(c.got).includes('connection:online'), 'online')
    assert.equal(fake.streams[0].path, '/api/workspaces/3/events')
    fake.push(': ping\n\n')
    fake.push('event: change\ndata: {"resources":["tasks","submissions"],"at":"2026-11-05T03:00:05Z"}\n\n')
    fake.push(`event: sync\ndata: ${JSON.stringify(sync('running'))}\n\n`)
    fake.push('event: hello\ndata: {}\n\n')
    fake.push('event: change\ndata: {not json\n\n')
    fake.push('event: change\ndata: {"resources":"tasks"}\n\n')
    fake.push('event: sync\ndata: {"state":"weird"}\n\n')
    await until(() => c.got.length >= 4, 'events')
    await new Promise((r) => setTimeout(r, 30))
    assert.deepEqual(kinds(c.got), ['connection:connecting', 'connection:online', 'changed:tasks,submissions', 'sync:running'])
  })

  it('끊기면 offline을 알리고 다시 붙어 online — 화면은 이때 Snapshot을 다시 읽는다', async () => {
    fake = await startFake()
    const c = collect(make(), '3')
    await until(() => fake.streams.length === 1 && kinds(c.got).includes('connection:online'), 'online')
    fake.streams[0].res.end() // 서버가 연결을 끊음
    await until(() => fake.streams.length === 2 && !fake.streams[1].closed, 'reconnect')
    await until(() => kinds(c.got).filter((k) => k === 'connection:online').length === 2, 'online again')
    assert.deepEqual(kinds(c.got), ['connection:connecting', 'connection:online', 'connection:offline', 'connection:online'])
  })

  it('ping도 데이터도 없이 오래 조용하면 끊긴 것으로 보고 다시 붙는다', async () => {
    fake = await startFake()
    const c = collect(make(), '3')
    await until(() => fake.streams.length === 1, 'first')
    await until(() => fake.streams.length === 2, 'reconnect after idle', 3000)
    assert.ok(kinds(c.got).includes('connection:offline'))
  })

  it('events가 SSE가 아니면(401 등) offline으로 두고 backoff로 다시 시도한다', async () => {
    fake = await startFake()
    let refused = 0
    fake.onEvents = (res) => {
      refused++
      sendError(res, 401, 'unauthorized')
    }
    const c = collect(make(), '3')
    await until(() => refused >= 3, 'retries')
    assert.deepEqual([...new Set(kinds(c.got))], ['connection:connecting', 'connection:offline'])
  })

  it('같은 사무실의 두 번째 구독자는 지금 연결 상태를 바로 받고, 마지막 구독을 끊으면 연결을 닫는다', async () => {
    fake = await startFake()
    const api = make()
    const a = collect(api, '3')
    await until(() => kinds(a.got).includes('connection:online'), 'online')
    const b = collect(api, '3')
    assert.deepEqual(kinds(b.got), ['connection:online'])
    assert.equal(fake.streams.length, 1, '같은 사무실은 연결 하나')
    a.off()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(fake.streams[0].closed, false, '구독자가 남아 있으면 유지')
    b.off()
    await until(() => fake.streams[0].closed, 'closed')
  })

  it('구독자 하나가 오류를 던져도 subscribe 호출부 · 다른 구독자 · 연결로 번지지 않는다', async () => {
    fake = await startFake()
    const api = make()
    const a = collect(api, '3')
    await until(() => kinds(a.got).includes('connection:online'), 'online')
    const error = console.error
    const logged: unknown[] = []
    console.error = (...args: unknown[]) => logged.push(args)
    try {
      assert.doesNotThrow(() =>
        api.subscribe('3', () => {
          throw new Error('listener bug')
        }),
      )
      fake.push('event: change\ndata: {"resources":["tasks"],"at":"2026-11-05T03:00:05Z"}\n\n')
      await until(() => kinds(a.got).includes('changed:tasks'), 'a still receives')
      assert.ok(logged.length >= 2, '오류는 삼키지 않고 기록한다')
      assert.equal(fake.streams[0].closed, false)
    } finally {
      console.error = error
    }
  })

  it('사무실마다 따로 연결하고, 알림은 그 사무실 구독자에게만 간다. close()는 모두 끊는다', async () => {
    fake = await startFake()
    const api = make()
    const a = collect(api, '3')
    const b = collect(api, '4')
    await until(() => fake.streams.length === 2 && kinds(a.got).includes('connection:online') && kinds(b.got).includes('connection:online'), 'both online')
    const s3 = fake.streams.find((s) => s.path === '/api/workspaces/3/events')!
    s3.res.write('event: change\ndata: {"resources":["tasks"],"at":"2026-11-05T03:00:05Z"}\n\n')
    await until(() => kinds(a.got).includes('changed:tasks'), 'a changed')
    await new Promise((r) => setTimeout(r, 30))
    assert.ok(!kinds(b.got).includes('changed:tasks'))
    api.close()
    await until(() => fake.streams.every((s) => s.closed), 'all closed')
  })
})
