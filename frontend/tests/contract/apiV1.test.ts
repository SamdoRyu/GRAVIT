// v1 api DataSource — 계약 경로 · 메서드 · 상태 코드 · CSRF · 에러 매핑 · SSE를 작은 가짜 서버로 검사한다.
// 실제 Spring과의 통합은 아니다(경로 · 응답 모양은 CONTRACTS_API.md와 backend 컨트롤러 기준).
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, it } from 'node:test'
import { DataError } from '../../src/data/DataSource'
import { CSRF_HEADER, createV1ApiDataSource, type V1ApiDataSource } from '../../src/data/api/v1'
import type { Change, ErrorCode, OpenWorkspaceRequest, SyncStatus } from '../../src/data/types'
import { activityRecordExample, agendaItemExample, inboxItemExample, conventionLibraryItemExample, conventionLibraryItemRequestExample, instructorAssignmentExample, instructorCandidateExample, instructorFeedbackCreateRequestExample, helpRequestDetailExample, helpRequestSummaryExample, meResponseExample, meetingExample, retroReportExample, standupExample, standupPrefillExample, timelinePageExample, workspaceSnapshotExample } from './examples'

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
    if (r.method === 'POST' && (path === '/api/logout' || path === '/api/review-login')) {
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
    // 「10」 회의 · 안건 · 「13」 작업 마감 — 경로 · 메서드만 맞으면 예시를 돌려준다
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/meetings$/.test(path)) return sendJson(res, 201, meetingExample)
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/meetings\/[^/]+\/end$/.test(path)) return sendJson(res, 200, { ...meetingExample, status: 'ended' })
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/agenda-items$/.test(path)) return sendJson(res, 201, agendaItemExample)
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/agenda-items\/[^/]+\/(withdraw|decision|feedback-request)$/.test(path)) return sendJson(res, 200, agendaItemExample)
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/agenda-items\/[^/]+\/instructor-feedback$/.test(path)) return sendJson(res, 201, agendaItemExample.instructorFeedbacks[0])
    // 「11」 도움 요청 (#183) — 나에게서만 삭제(#316 · #333)
    if (r.method === 'PUT' && /^\/api\/workspaces\/[^/]+\/help-requests\/[^/]+\/hidden$/.test(path)) {
      res.writeHead(204)
      return res.end()
    }
    if (r.method === 'DELETE' && /^\/api\/workspaces\/[^/]+\/help-requests\/[^/]+$/.test(path)) {
      res.writeHead(204)
      return res.end()
    }
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/help-requests\/[^/]+$/.test(path)) return sendJson(res, 200, helpRequestDetailExample)
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/help-requests$/.test(path)) return sendJson(res, 201, helpRequestSummaryExample)
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/help-requests\/[^/]+\/comments$/.test(path)) return sendJson(res, 201, helpRequestDetailExample.comments[0])
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/help-requests\/[^/]+\/close$/.test(path)) return sendJson(res, 200, { ...helpRequestDetailExample, status: 'resolved' })
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/help-requests\/[^/]+\/to-agenda$/.test(path)) return sendJson(res, 201, { ...agendaItemExample, kind: 'help_request' })
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/help-requests\/[^/]+\/instructor-request$/.test(path)) return sendJson(res, 200, { ...helpRequestSummaryExample, instructorRequested: true })
    // 「12」 스탠드업 (#190)
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/standups\?date=[^&]+$/.test(path)) return sendJson(res, 200, [standupExample])
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/standups\/[^/]+\/mine\/prefill$/.test(path)) return sendJson(res, 200, standupPrefillExample)
    if (r.method === 'PUT' && /^\/api\/workspaces\/[^/]+\/standups\/[^/]+\/mine$/.test(path)) return sendJson(res, 200, { ...standupExample, ...(JSON.parse(r.body) as object) })
    // 「15」 학습 타임라인 · 회고 리포트 (#209)
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/timeline\?page=\d+&size=\d+$/.test(path)) return sendJson(res, 200, timelinePageExample)
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/reports$/.test(path)) return sendJson(res, 200, [{ id: retroReportExample.id, kind: retroReportExample.kind, createdAt: retroReportExample.createdAt }])
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/reports$/.test(path)) return sendJson(res, 201, { ...retroReportExample, ...(JSON.parse(r.body) as object) })
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/reports\/[^/]+$/.test(path)) return sendJson(res, 200, retroReportExample)
    if (r.method === 'PUT' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/reports\/[^/]+\/learning$/.test(path)) return sendJson(res, 200, { ...retroReportExample, ...(JSON.parse(r.body) as object) })
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/reports\/[^/]+\/markdown$/.test(path)) {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' })
      return res.end('# 최종 회고 리포트\n\n- 팀원 A와 함께')
    }
    // 「15」 기술 결정 카드 · 강사 꼬리질문 (#218)
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/decision-cards$/.test(path)) return sendJson(res, 200, retroReportExample.decisionCards)
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/decision-cards$/.test(path)) return sendJson(res, 201, { ...retroReportExample.decisionCards[0], ...(JSON.parse(r.body) as object) })
    if (r.method === 'PUT' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/decision-cards\/[^/]+$/.test(path)) return sendJson(res, 200, { ...retroReportExample.decisionCards[0], ...(JSON.parse(r.body) as object) })
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/decision-cards\/[^/]+\/follow-up-request$/.test(path)) return sendJson(res, 200, { ...retroReportExample.decisionCards[0], followUpRequested: true })
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/members\/[^/]+\/decision-cards\/[^/]+\/follow-up-questions$/.test(path)) return sendJson(res, 201, { id: '21', instructor: meResponseExample.user, ...(JSON.parse(r.body) as object), createdAt: '2026-11-06T02:00:00Z' })
    // 「7」 강사 지정 (#53)
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/instructors$/.test(path)) return sendJson(res, 200, [instructorAssignmentExample])
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/instructor-candidates$/.test(path)) return sendJson(res, 200, [instructorCandidateExample])
    if (r.method === 'PUT' && /^\/api\/workspaces\/[^/]+\/instructors\/[^/]+$/.test(path)) return sendJson(res, 200, instructorAssignmentExample)
    if (r.method === 'DELETE' && /^\/api\/workspaces\/[^/]+\/instructors\/[^/]+$/.test(path)) {
      res.writeHead(204)
      return res.end()
    }
    // 「16」 강사 요청함 (#224) — answered 쿼리는 빼거나 true · false
    if (r.method === 'GET' && /^\/api\/instructor\/inbox(\?answered=(true|false))?$/.test(path)) return sendJson(res, 200, [inboxItemExample])
    // 「14」 활동 기록 (#173)
    if (r.method === 'PUT' && /^\/api\/workspaces\/[^/]+\/activity-consent$/.test(path)) return sendJson(res, 200, { activityConsented: (JSON.parse(r.body) as { consented: boolean }).consented })
    if (r.method === 'GET' && /^\/api\/workspaces\/[^/]+\/activities\?/.test(path)) return sendJson(res, 200, { items: [activityRecordExample], page: 0, size: 20, totalItems: 1, totalPages: 1 })
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/activities$/.test(path)) return sendJson(res, 201, { ...activityRecordExample, ...(JSON.parse(r.body) as object), status: 'pending', confirmedByMemberIds: [] })
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/activities\/[^/]+\/confirm$/.test(path)) return sendJson(res, 200, activityRecordExample)
    // 「17」 컨벤션 라이브러리 (#225)
    if (r.method === 'GET' && path === '/api/convention-library') return sendJson(res, 200, [conventionLibraryItemExample])
    if (r.method === 'POST' && path === '/api/convention-library') return sendJson(res, 201, { ...conventionLibraryItemExample, ...(JSON.parse(r.body) as object) })
    if (r.method === 'PUT' && /^\/api\/convention-library\/[^/]+$/.test(path)) return sendJson(res, 200, { ...conventionLibraryItemExample, ...(JSON.parse(r.body) as object) })
    // 「8」 요구사항 연결 (#197)
    if (r.method === 'POST' && /^\/api\/workspaces\/[^/]+\/requirement-links$/.test(path)) return sendJson(res, 201, { id: '30', ...(JSON.parse(r.body) as object), linkedAt: '2026-11-05T02:30:00Z' })
    if (r.method === 'DELETE' && /^\/api\/workspaces\/[^/]+\/requirement-links\/[^/]+$/.test(path)) {
      res.writeHead(204)
      return res.end()
    }
    if (/^\/api\/workspaces\/[^/]+\/tasks\/[^/]+\/due-date$/.test(path)) {
      if (r.method === 'PUT') return sendJson(res, 200, { taskId: '7', dueDate: (JSON.parse(r.body) as { dueDate: string }).dueDate, updatedAt: '2026-11-05T03:10:00Z', updatedBy: meResponseExample.user })
      if (r.method === 'DELETE') {
        res.writeHead(204)
        return res.end()
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
    // 화면이 CSRF(403 invalid)를 입력 오류(400 invalid)와 나눌 수 있게 HTTP 상태를 함께 넘긴다 (#274)
    fake.next.push((_r, res) => sendError(res, 403, 'invalid'), (_r, res) => sendJson(res, 200, {}), (_r, res) => sendError(res, 403, 'invalid'))
    await assert.rejects(api.requestSync('3'), (e: unknown) => e instanceof DataError && e.code === 'invalid' && e.status === 403)
    fake.next.push((_r, res) => sendError(res, 400, 'invalid', '이유를 적어 주세요'))
    await assert.rejects(api.requestSync('3'), (e: unknown) => e instanceof DataError && e.code === 'invalid' && e.status === 400)
    fake.requests.length = 0

    fake.requests.length = 0
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '강사는 동기화할 수 없어요'))
    await rejectsWith(api.requestSync('3'), 'forbidden_role', '강사는 동기화할 수 없어요')
    assert.equal(fake.requests.length, 1)
  })

  it('심사용 로그인 — POST /api/review-login을 form 본문(username · password)과 CSRF로 보내고, 401 · 404를 그대로 (#63 · #64)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.equal(await api.reviewLogin({ username: 'review 1', password: 'p&w=d' }), undefined)
    const [req] = fake.requests
    assert.equal(`${req.method} ${req.path} ${req.csrf}`, 'POST /api/review-login tok-1')
    assert.match(req.contentType ?? '', /^application\/x-www-form-urlencoded/)
    assert.deepEqual(Object.fromEntries(new URLSearchParams(req.body)), { username: 'review 1', password: 'p&w=d' }, '특수 문자도 인코딩')
    fake.next.push((_r, res) => sendError(res, 401, 'unauthorized', '아이디나 비밀번호가 맞지 않아요'))
    await rejectsWith(api.reviewLogin({ username: 'review', password: 'x' }), 'unauthorized', '아이디나 비밀번호가 맞지 않아요')
    fake.next.push((_r, res) => sendError(res, 404, 'not_found', '없는 경로예요'))
    await rejectsWith(api.reviewLogin({ username: 'review', password: 'x' }), 'not_found', '없는 경로예요')
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

  it('회의 · 안건 · 작업 마감 — 경로 · 메서드 · CSRF · JSON 본문, DELETE 204, 409를 그대로 (#102)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    const create = { kind: 'pr' as const, sourceId: '9', title: '실패 응답 모양', background: null, tried: null, unresolvedReason: null }
    const decide = { conclusion: '고친다', learning: null, prDecision: 'revise_and_reevaluate' as const, followUpAssigneeMemberId: null, followUpDueDate: null, meetingId: '5' }
    assert.deepEqual(await api.startMeeting('3', { attendeeMemberIds: ['12'] }), meetingExample)
    assert.equal((await api.endMeeting('3', '5', { notes: '회의록' })).status, 'ended')
    assert.deepEqual(await api.createAgendaItem('3', create), agendaItemExample)
    await api.withdrawAgendaItem('3', '7')
    await api.recordDecision('3', '7', decide)
    assert.equal((await api.setDueDate('3', '7', { dueDate: '2026-11-09' })).dueDate, '2026-11-09')
    assert.equal(await api.clearDueDate('3', '7'), undefined)
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      [
        'POST /api/workspaces/3/meetings tok-1',
        'POST /api/workspaces/3/meetings/5/end tok-1',
        'POST /api/workspaces/3/agenda-items tok-1',
        'POST /api/workspaces/3/agenda-items/7/withdraw tok-1',
        'POST /api/workspaces/3/agenda-items/7/decision tok-1',
        'PUT /api/workspaces/3/tasks/7/due-date tok-1',
        'DELETE /api/workspaces/3/tasks/7/due-date tok-1',
      ],
    )
    assert.deepEqual(
      fake.requests.map((r) => (r.body ? JSON.parse(r.body) : null)),
      [{ attendeeMemberIds: ['12'] }, { notes: '회의록' }, create, null, decide, { dueDate: '2026-11-09' }, null],
    )
    fake.next.push((_r, res) => sendError(res, 409, 'conflict', '이미 진행 중인 회의가 있어요'))
    await rejectsWith(api.startMeeting('3', { attendeeMemberIds: [] }), 'conflict', '이미 진행 중인 회의가 있어요')
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '레포 관리자와 그 이슈 담당자만 마감을 바꿀 수 있어요'))
    await rejectsWith(api.clearDueDate('3', '7'), 'forbidden_role', '레포 관리자와 그 이슈 담당자만 마감을 바꿀 수 있어요')
  })

  it('강사 지정 — 읽기는 CSRF 없이 GET, 지정 PUT · 해제 DELETE 204, 400 · 409를 그대로 (#53)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.deepEqual(await api.listInstructors('3'), [instructorAssignmentExample])
    assert.deepEqual(await api.listInstructorCandidates('3'), [instructorCandidateExample])
    assert.deepEqual(await api.assignInstructor('3', '9001'), instructorAssignmentExample)
    assert.equal(await api.revokeInstructor('3', '9001'), undefined)
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'} ${r.body || '-'}`),
      [
        'GET /api/workspaces/3/instructors - -',
        'GET /api/workspaces/3/instructor-candidates - -',
        'PUT /api/workspaces/3/instructors/9001 tok-1 -',
        'DELETE /api/workspaces/3/instructors/9001 tok-1 -',
      ],
    )
    fake.next.push((_r, res) => sendError(res, 400, 'invalid', '승인된 강사 계정이 아니에요'))
    await rejectsWith(api.assignInstructor('3', '42'), 'invalid', '승인된 강사 계정이 아니에요')
    fake.next.push((_r, res) => sendError(res, 409, 'conflict', '자기 자신은 강사로 지정할 수 없어요'))
    await rejectsWith(api.assignInstructor('3', '1001'), 'conflict', '자기 자신은 강사로 지정할 수 없어요')
  })

  it('강사 요청함 — 사무실 경로 밖 GET, answered를 빼면 쿼리 없이 · true · false는 쿼리로, CSRF 없음, 403을 그대로 (#224)', async () => {
    fake = await startFake()
    const api = make()
    assert.deepEqual(await api.getInstructorInbox(), [inboxItemExample])
    assert.deepEqual(await api.getInstructorInbox(false), [inboxItemExample])
    assert.deepEqual(await api.getInstructorInbox(true), [inboxItemExample])
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      ['GET /api/instructor/inbox -', 'GET /api/instructor/inbox?answered=false -', 'GET /api/instructor/inbox?answered=true -'],
    )
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '이 작업을 할 권한이 없어요'))
    await rejectsWith(api.getInstructorInbox(), 'forbidden_role', '이 작업을 할 권한이 없어요')
  })

  it('활동 기록 — 동의 PUT은 activityConsented만 돌려주고, 목록 쿼리 · 기록 POST · 확인 POST는 CSRF와 함께, 409를 그대로 (#173)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.equal(await api.setActivityConsent('3', true), true)
    assert.equal((await api.listActivities('3')).items[0].id, '40')
    await api.listActivities('3', 'pending', 2, 10)
    const request = { kind: 'research' as const, content: '자료조사', durationMinutes: 30 }
    assert.equal((await api.createActivity('3', request)).status, 'pending')
    assert.equal((await api.confirmActivity('3', '40')).status, 'confirmed')
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'} ${r.body || '-'}`),
      [
        'PUT /api/workspaces/3/activity-consent tok-1 {"consented":true}',
        'GET /api/workspaces/3/activities?page=0&size=20 - -',
        'GET /api/workspaces/3/activities?status=pending&page=2&size=10 - -',
        `POST /api/workspaces/3/activities tok-1 ${JSON.stringify(request)}`,
        'POST /api/workspaces/3/activities/40/confirm tok-1 -',
      ],
    )
    fake.next.push((_r, res) => sendError(res, 409, 'conflict', '활동 기록 수집에 동의한 뒤 쓸 수 있어요'))
    await rejectsWith(api.createActivity('3', request), 'conflict', '활동 기록 수집에 동의한 뒤 쓸 수 있어요')
  })

  it('컨벤션 라이브러리 — 사무실 경로 밖, 읽기 GET · 등록 POST 201 · 편집 PUT 본문 그대로, 403 · 400을 그대로 (#225)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.deepEqual(await api.listConventionLibrary(), [conventionLibraryItemExample])
    assert.equal((await api.createConventionLibraryItem(conventionLibraryItemRequestExample)).target, 'branch_name')
    assert.equal((await api.updateConventionLibraryItem('3', conventionLibraryItemRequestExample)).name, '브랜치 이름')
    const body = JSON.stringify(conventionLibraryItemRequestExample)
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'} ${r.body || '-'}`),
      ['GET /api/convention-library - -', `POST /api/convention-library tok-1 ${body}`, `PUT /api/convention-library/3 tok-1 ${body}`],
    )
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '이 작업을 할 권한이 없어요'))
    await rejectsWith(api.createConventionLibraryItem(conventionLibraryItemRequestExample), 'forbidden_role', '이 작업을 할 권한이 없어요')
    fake.next.push((_r, res) => sendError(res, 400, 'invalid', '요청 값이 올바르지 않아요'))
    await rejectsWith(api.updateConventionLibraryItem('3', { ...conventionLibraryItemRequestExample, name: '' }), 'invalid')
  })

  it('요구사항 연결 — POST 본문 · DELETE 204, 경로 · CSRF, 403 · 409를 그대로 (#197)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.deepEqual(await api.linkRequirement('3', { requirementId: '5', taskId: '41' }), { id: '30', requirementId: '5', taskId: '41', linkedAt: '2026-11-05T02:30:00Z' })
    assert.equal(await api.unlinkRequirement('3', '30'), undefined)
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'} ${r.body || '-'}`),
      ['POST /api/workspaces/3/requirement-links tok-1 {"requirementId":"5","taskId":"41"}', 'DELETE /api/workspaces/3/requirement-links/30 tok-1 -'],
    )
    fake.next.push((_r, res) => sendError(res, 409, 'conflict', '지금 명세 문서에 없는 요구사항이라 새로 연결할 수 없어요'))
    await rejectsWith(api.linkRequirement('3', { requirementId: '6', taskId: '41' }), 'conflict', '지금 명세 문서에 없는 요구사항이라 새로 연결할 수 없어요')
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '요구사항 연결은 레포 관리자만 바꿀 수 있어요'))
    await rejectsWith(api.unlinkRequirement('3', '30'), 'forbidden_role', '요구사항 연결은 레포 관리자만 바꿀 수 있어요')
  })

  it('도움 요청 — 읽기는 CSRF 없이 GET, 쓰기 5개는 경로 · CSRF · JSON 본문, 403 · 409를 그대로 (#183)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    const create = { content: '세션이 끊겨요', fromStandupId: null }
    const close = { helpfulCommentId: '31', learning: 'SameSite는 쿠키 설정' }
    assert.deepEqual(await api.getHelpRequest('3', '12'), helpRequestDetailExample)
    assert.deepEqual(await api.createHelpRequest('3', create), helpRequestSummaryExample)
    assert.deepEqual(await api.addHelpComment('3', '12', { content: '확인해 보세요' }), helpRequestDetailExample.comments[0])
    assert.equal((await api.closeHelpRequest('3', '12', close)).status, 'resolved')
    assert.equal((await api.convertHelpRequestToAgenda('3', '12', { title: '세션 안건' })).kind, 'help_request')
    assert.equal((await api.requestInstructorHelp('3', '12')).instructorRequested, true)
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      [
        'GET /api/workspaces/3/help-requests/12 -',
        'POST /api/workspaces/3/help-requests tok-1',
        'POST /api/workspaces/3/help-requests/12/comments tok-1',
        'POST /api/workspaces/3/help-requests/12/close tok-1',
        'POST /api/workspaces/3/help-requests/12/to-agenda tok-1',
        'POST /api/workspaces/3/help-requests/12/instructor-request tok-1',
      ],
    )
    assert.deepEqual(
      fake.requests.map((r) => (r.body ? JSON.parse(r.body) : null)),
      [null, create, { content: '확인해 보세요' }, close, { title: '세션 안건' }, null],
    )
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '요청한 사람만 할 수 있어요'))
    await rejectsWith(api.closeHelpRequest('3', '12', close), 'forbidden_role', '요청한 사람만 할 수 있어요')
    fake.next.push((_r, res) => sendError(res, 409, 'conflict', '해결됐거나 끝난 도움 요청이에요'))
    await rejectsWith(api.addHelpComment('3', '12', { content: '늦은 코멘트' }), 'conflict', '해결됐거나 끝난 도움 요청이에요')
  })

  it('도움 요청 삭제 두 방식 — 나에게서만 삭제 PUT · 영구 삭제 DELETE는 204 + CSRF, 숨김 목록 · 해제는 없다, 403 · 404를 그대로 (#316 · #333)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.equal(await api.hideHelpRequest('3', '12'), undefined)
    assert.equal(await api.deleteHelpRequest('3', '12'), undefined)
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'} ${r.body || '-'}`),
      [
        'PUT /api/workspaces/3/help-requests/12/hidden tok-1 -',
        'DELETE /api/workspaces/3/help-requests/12 tok-1 -',
      ],
    )
    assert.equal('unhideHelpRequest' in api, false)
    assert.equal('listHiddenHelpRequests' in api, false)
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '요청한 사람만 할 수 있어요'))
    await rejectsWith(api.deleteHelpRequest('3', '12'), 'forbidden_role', '요청한 사람만 할 수 있어요')
    fake.next.push((_r, res) => sendError(res, 404, 'not_found', '도움 요청을 찾을 수 없어요'))
    await rejectsWith(api.hideHelpRequest('3', '12'), 'not_found', '도움 요청을 찾을 수 없어요')
  })

  it('강사 피드백 — 요청 POST(본문 없음) · 쓰기 POST(JSON 본문), 둘 다 CSRF, 403 · 409를 그대로 (#212)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.deepEqual(await api.requestDecisionFeedback('3', '7'), agendaItemExample)
    assert.deepEqual(await api.addInstructorFeedback('3', '7', instructorFeedbackCreateRequestExample), agendaItemExample.instructorFeedbacks[0])
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'} ${r.body || '-'}`),
      ['POST /api/workspaces/3/agenda-items/7/feedback-request tok-1 -', `POST /api/workspaces/3/agenda-items/7/instructor-feedback tok-1 ${JSON.stringify(instructorFeedbackCreateRequestExample)}`],
    )
    fake.next.push((_r, res) => sendError(res, 409, 'conflict', '결정을 기록한 안건에만 강사 피드백을 요청할 수 있어요'))
    await rejectsWith(api.requestDecisionFeedback('3', '8'), 'conflict', '결정을 기록한 안건에만 강사 피드백을 요청할 수 있어요')
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '이 작업을 할 권한이 없어요'))
    await rejectsWith(api.addInstructorFeedback('3', '8', { body: '피드백' }), 'forbidden_role', '이 작업을 할 권한이 없어요')
  })

  it('스탠드업 — 날짜 쿼리 GET · 미리 채우기 GET · 내 것 PUT(CSRF · JSON 본문), 400 · 403을 그대로 (#190)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    const save = { yesterday: '도움 요청 화면', blockers: null }
    assert.deepEqual(await api.listStandups('3', '2026-11-05'), [standupExample])
    assert.deepEqual(await api.getStandupPrefill('3', '2026-11-05'), standupPrefillExample)
    assert.equal((await api.saveMyStandup('3', '2026-11-05', save)).yesterday, '도움 요청 화면')
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      [
        'GET /api/workspaces/3/standups?date=2026-11-05 -',
        'GET /api/workspaces/3/standups/2026-11-05/mine/prefill -',
        'PUT /api/workspaces/3/standups/2026-11-05/mine tok-1',
      ],
    )
    assert.deepEqual(JSON.parse(fake.requests[2].body), save)
    fake.next.push((_r, res) => sendError(res, 400, 'invalid', '오늘 이후 날짜의 스탠드업은 쓸 수 없어요'))
    await rejectsWith(api.saveMyStandup('3', '2026-11-30', save), 'invalid', '오늘 이후 날짜의 스탠드업은 쓸 수 없어요')
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '팀원만 쓸 수 있어요'))
    await rejectsWith(api.getStandupPrefill('3', '2026-11-05'), 'forbidden_role', '팀원만 쓸 수 있어요')
  })

  it('학습 타임라인 · 회고 리포트 — 읽기 GET · 쓰기 POST/PUT(CSRF · JSON 본문) · 마크다운 본문, 400 · 403 · 404를 그대로 (#209)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    assert.deepEqual(await api.getTimeline('3', '4'), timelinePageExample)
    assert.deepEqual(await api.getTimeline('3', '4', 2, 50), timelinePageExample)
    assert.deepEqual(await api.listReports('3', '4'), [{ id: retroReportExample.id, kind: 'final', createdAt: retroReportExample.createdAt }])
    assert.equal((await api.createReport('3', '4', { kind: 'midterm' })).kind, 'midterm')
    assert.deepEqual(await api.getReport('3', '4', '6'), retroReportExample)
    assert.equal((await api.updateReportLearning('3', '4', '6', { learning: '계약 먼저' })).learning, '계약 먼저')
    assert.equal(await api.exportReportMarkdown('3', '4', '6'), '# 최종 회고 리포트\n\n- 팀원 A와 함께')
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      [
        'GET /api/workspaces/3/members/4/timeline?page=0&size=20 -',
        'GET /api/workspaces/3/members/4/timeline?page=2&size=50 -',
        'GET /api/workspaces/3/members/4/reports -',
        'POST /api/workspaces/3/members/4/reports tok-1',
        'GET /api/workspaces/3/members/4/reports/6 -',
        'PUT /api/workspaces/3/members/4/reports/6/learning tok-1',
        'GET /api/workspaces/3/members/4/reports/6/markdown -',
      ],
    )
    assert.deepEqual(JSON.parse(fake.requests[3].body), { kind: 'midterm' })
    assert.deepEqual(JSON.parse(fake.requests[5].body), { learning: '계약 먼저' })
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '본인 것만 볼 수 있어요'))
    await rejectsWith(api.getTimeline('3', '5'), 'forbidden_role', '본인 것만 볼 수 있어요')
    fake.next.push((_r, res) => sendError(res, 400, 'invalid', '내가 배운 점은 5000자까지 쓸 수 있어요'))
    await rejectsWith(api.updateReportLearning('3', '4', '6', { learning: 'x' }), 'invalid', '내가 배운 점은 5000자까지 쓸 수 있어요')
    // 마크다운도 실패는 JSON 에러 본문이다
    fake.next.push((_r, res) => sendError(res, 404, 'not_found', '리포트를 찾을 수 없어요'))
    await rejectsWith(api.exportReportMarkdown('3', '4', '99'), 'not_found', '리포트를 찾을 수 없어요')
  })

  it('기술 결정 카드 · 강사 꼬리질문 — 읽기 GET · 쓰기 POST/PUT(CSRF · JSON 본문), 400 · 403 · 409를 그대로 (#218)', async () => {
    fake = await startFake()
    fake.cookie = fake.serverToken
    const api = make()
    const card = retroReportExample.decisionCards[0]
    assert.deepEqual(await api.listDecisionCards('3', '4'), retroReportExample.decisionCards)
    assert.equal((await api.createDecisionCard('3', '4', { submissionId: '9' })).submissionId, '9')
    const update = { cells: { ...card.cells, learning: '계약 먼저' }, confirmed: true }
    assert.equal((await api.updateDecisionCard('3', '4', '8', update)).cells.learning, '계약 먼저')
    assert.equal((await api.requestFollowUp('3', '4', '8')).followUpRequested, true)
    assert.deepEqual(await api.addFollowUpQuestion('3', '4', '8', { body: '왜 그렇게 정했나요?' }), { id: '21', instructor: meResponseExample.user, body: '왜 그렇게 정했나요?', createdAt: '2026-11-06T02:00:00Z' })
    assert.deepEqual(
      fake.requests.map((r) => `${r.method} ${r.path} ${r.csrf ?? '-'}`),
      [
        'GET /api/workspaces/3/members/4/decision-cards -',
        'POST /api/workspaces/3/members/4/decision-cards tok-1',
        'PUT /api/workspaces/3/members/4/decision-cards/8 tok-1',
        'POST /api/workspaces/3/members/4/decision-cards/8/follow-up-request tok-1',
        'POST /api/workspaces/3/members/4/decision-cards/8/follow-up-questions tok-1',
      ],
    )
    assert.deepEqual(JSON.parse(fake.requests[1].body), { submissionId: '9' })
    assert.deepEqual(JSON.parse(fake.requests[2].body), update)
    assert.deepEqual(JSON.parse(fake.requests[4].body), { body: '왜 그렇게 정했나요?' })
    fake.next.push((_r, res) => sendError(res, 409, 'conflict', '이 PR의 카드가 이미 있어요'))
    await rejectsWith(api.createDecisionCard('3', '4', { submissionId: '9' }), 'conflict', '이 PR의 카드가 이미 있어요')
    fake.next.push((_r, res) => sendError(res, 400, 'invalid', '확인하려면 내가 배운 점을 써 주세요'))
    await rejectsWith(api.updateDecisionCard('3', '4', '8', { cells: card.cells, confirmed: true }), 'invalid', '확인하려면 내가 배운 점을 써 주세요')
    fake.next.push((_r, res) => sendError(res, 403, 'forbidden_role', '꼬리질문을 요청한 카드에만 쓸 수 있어요'))
    await rejectsWith(api.addFollowUpQuestion('3', '4', '8', { body: '왜요?' }), 'forbidden_role', '꼬리질문을 요청한 카드에만 쓸 수 있어요')
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
    // 응답을 받지 못함 = status 0 — 쓰기라면 결과가 불확실해 화면은 자동으로 다시 보내지 않는다 (#274)
    await assert.rejects(gone.getMe(), (e: unknown) => e instanceof DataError && e.status === 0)
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
