// v1 api DataSource — Spring `/api/**`(CONTRACTS_API.md)을 부르는 실제 서버 구현. 소유: D.
// REST는 fetch, 변경 알림은 `GET W/events`(SSE)를 fetch + ReadableStream으로 읽는다(브라우저 · Node 테스트 모두).
// 쓰기 요청은 CSRF 토큰(쿠키 XSRF-TOKEN → 헤더 X-XSRF-TOKEN — CONTRACTS_API.md 「2」)을 붙인다.
// 데모 api(../index.ts)와 상태를 나누지 않는다. 이름은 데모 api를 지울 때 createApiDataSource로 바꾼다.
import { DataError, type DataErrorCode, type DataSource } from '../../DataSource'
import type {
  Change,
  ConnectionStatus,
  AgendaItemCreateRequest,
  AgendaItemDto,
  DecisionRequest,
  EndMeetingRequest,
  ErrorCode,
  MeetingDto,
  StartMeetingRequest,
  TaskDueDateDto,
  TaskDueDateRequest,
  RequirementLinkCreateRequest,
  RequirementLinkDto,
  EvaluateRequest,
  EvaluationRoundDto,
  HelpCommentCreateRequest,
  HelpCommentDto,
  HelpRequestCloseRequest,
  HelpRequestCreateRequest,
  HelpRequestDetail,
  HelpRequestSummary,
  HelpRequestToAgendaRequest,
  Id,
  LoginOptions,
  MeResponse,
  OpenWorkspaceRequest,
  RepositoryChoiceResponse,
  ReviewLoginRequest,
  SnapshotResource,
  StandupDto,
  StandupPrefill,
  StandupSaveRequest,
  SyncStatus,
  TeamSettings,
  WorkspaceListItem,
  WorkspaceSnapshot,
  WorkspaceSummary,
} from '../../types'
import { createSseParser } from '../sse'

export const CSRF_COOKIE = 'XSRF-TOKEN'
export const CSRF_HEADER = 'X-XSRF-TOKEN'

const DEFAULT_TIMING = {
  backoffStartMs: 1000,
  backoffMaxMs: 10_000,
  /** 서버는 30초마다 `: ping`을 보낸다(WorkspaceEventHub). 이만큼 조용하면 끊긴 것으로 본다 */
  idleLimitMs: 75_000,
}

const ERROR_CODES: readonly ErrorCode[] = [
  'invalid',
  'not_found',
  'conflict',
  'unavailable',
  'unauthorized',
  'forbidden_role',
  'github_unauthorized',
  'github_rate_limited',
]
const UNREACHABLE = '서버에 연결할 수 없어요'

export interface V1ApiOptions {
  /** API 주소 앞부분. 기본 ''(같은 출처 — 개발 때는 Vite가 /api를 Spring으로 넘긴다) */
  baseUrl?: string
  /** 지금 CSRF 토큰. 기본: 브라우저 쿠키 XSRF-TOKEN. 테스트(Node)는 직접 넘긴다 */
  csrfToken?: () => string | null
  /** 재연결 · 끊김 판단 시간(ms). 테스트용 */
  timing?: Partial<typeof DEFAULT_TIMING>
}

/** v1 DataSource와, 테스트 · 핫 리로드용 정리 함수 */
export type V1ApiDataSource = DataSource & { close(): void }

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

/** 본문 없이 실패했을 때 상태 코드로 짐작하는 에러 코드 */
function codeForStatus(status: number): DataErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden_role'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status >= 500) return 'unavailable'
  return 'invalid'
}

/** 실패 응답 → DataError. 본문은 `{ error: { code, message } }`(CONTRACTS.md 「6」) */
async function toError(res: Response): Promise<DataError> {
  const fallback = res.status >= 500 ? '서버에서 문제가 생겼어요' : '요청을 처리하지 못했어요'
  try {
    const body: unknown = await res.json()
    const e = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
    if (typeof e === 'object' && e !== null) {
      const { code, message } = e as { code?: unknown; message?: unknown }
      const known = ERROR_CODES.includes(code as ErrorCode) ? (code as ErrorCode) : codeForStatus(res.status)
      return new DataError(typeof message === 'string' && message ? message : fallback, known)
    }
  } catch {
    // 본문이 JSON이 아니면 상태 코드로만 판단한다
  }
  return new DataError(fallback, codeForStatus(res.status))
}

const workspacePath = (workspaceId: Id) => `/api/workspaces/${encodeURIComponent(workspaceId)}`
const submissionPath = (workspaceId: Id, submissionId: Id) => `${workspacePath(workspaceId)}/submissions/${encodeURIComponent(submissionId)}`
const agendaPath = (workspaceId: Id, agendaItemId: Id) => `${workspacePath(workspaceId)}/agenda-items/${encodeURIComponent(agendaItemId)}`
const taskPath = (workspaceId: Id, taskId: Id) => `${workspacePath(workspaceId)}/tasks/${encodeURIComponent(taskId)}`
const helpPath = (workspaceId: Id, helpRequestId: Id) => `${workspacePath(workspaceId)}/help-requests/${encodeURIComponent(helpRequestId)}`
const standupPath = (workspaceId: Id, date: string) => `${workspacePath(workspaceId)}/standups/${encodeURIComponent(date)}`

/** 한 사무실의 SSE 연결 — 구독자가 있는 동안만 돈다 */
interface Stream {
  listeners: Set<(c: Change) => void>
  controller: AbortController
  status: ConnectionStatus | null
}

export function createV1ApiDataSource(opts: V1ApiOptions = {}): V1ApiDataSource {
  const base = (opts.baseUrl ?? '').replace(/\/+$/, '')
  const csrfToken = opts.csrfToken ?? (() => readCookie(CSRF_COOKIE))
  const timing = { ...DEFAULT_TIMING, ...opts.timing }
  const streams = new Map<Id, Stream>()

  // ---- REST ------------------------------------------------------------------

  async function send(method: string, path: string, payload?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    // 심사용 로그인만 form(application/x-www-form-urlencoded), 나머지는 JSON (CONTRACTS_API.md 「2」)
    const form = payload instanceof URLSearchParams
    if (payload !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded;charset=UTF-8' : 'application/json; charset=utf-8'
    if (method !== 'GET') {
      const token = csrfToken()
      if (token) headers[CSRF_HEADER] = token
    }
    try {
      return await fetch(base + path, { method, headers, body: payload === undefined ? undefined : form ? payload.toString() : JSON.stringify(payload) })
    } catch {
      throw new DataError(UNREACHABLE, 'unavailable')
    }
  }

  /** 읽기 — 실패면 DataError */
  async function read(path: string): Promise<Response> {
    const res = await send('GET', path)
    if (!res.ok) throw await toError(res)
    return res
  }

  /** CSRF 쿠키를 받는다 — 로그인 화면용 공개 API가 쿠키를 함께 준다(CONTRACTS_API.md 「2」) */
  async function primeCsrf(): Promise<void> {
    await read('/api/login-options')
  }

  /**
   * 쓰기 — CSRF 토큰을 붙인다. 토큰이 없으면 먼저 받아 오고, 로그인 · 로그아웃으로 토큰이 바뀌어
   * `403 invalid`가 오면 한 번만 새 토큰으로 다시 보낸다.
   */
  async function write(method: 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown): Promise<Response> {
    if (!csrfToken()) await primeCsrf()
    let res = await send(method, path, payload)
    if (res.status === 403) {
      const err = await toError(res)
      if (err.code !== 'invalid') throw err
      await primeCsrf()
      res = await send(method, path, payload)
    }
    if (!res.ok) throw await toError(res)
    return res
  }

  async function json<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T
    } catch {
      throw new DataError('서버 응답을 읽을 수 없어요', 'unavailable')
    }
  }

  // ---- 변경 알림 (SSE) -------------------------------------------------------------

  /** 구독자 하나에게 알린다 — 구독자의 오류가 연결 · 다른 구독자 · subscribe 호출부로 번지지 않게 */
  function deliver(listener: (c: Change) => void, change: Change) {
    try {
      listener(change)
    } catch (e) {
      console.error('v1 api: listener failed', e)
    }
  }

  function emit(stream: Stream, change: Change) {
    for (const l of [...stream.listeners]) deliver(l, change)
  }

  function setStatus(stream: Stream, next: ConnectionStatus) {
    if (stream.status === next) return
    stream.status = next
    emit(stream, { type: 'connection', status: next })
  }

  /** SSE 이벤트 → Change. 모양이 다르면 null(버린다) */
  function toChange(event: string, data: string): Change | null {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return null
    }
    if (typeof parsed !== 'object' || parsed === null) return null
    if (event === 'change') {
      const resources = (parsed as { resources?: unknown }).resources
      if (!Array.isArray(resources) || !resources.every((r) => typeof r === 'string')) return null
      return { type: 'changed', resources: resources as SnapshotResource[] }
    }
    if (event === 'sync') {
      const state = (parsed as { state?: unknown }).state
      if (state !== 'idle' && state !== 'running') return null
      return { type: 'sync', status: parsed as SyncStatus }
    }
    return null
  }

  const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(done, ms)
      signal.addEventListener('abort', done, { once: true })
      function done() {
        clearTimeout(t)
        signal.removeEventListener('abort', done)
        resolve()
      }
    })

  /** 끊기면 backoff로 다시 붙는다. 놓친 알림은 재생되지 않으므로 화면은 online에서 Snapshot을 다시 읽는다 */
  async function runStream(workspaceId: Id, stream: Stream) {
    const signal = stream.controller.signal
    let backoff = timing.backoffStartMs
    while (!signal.aborted) {
      // connecting은 첫 시도에만 — 끊긴 뒤에는 다시 붙을 때까지 offline
      if (stream.status === null) setStatus(stream, 'connecting')
      const link = new AbortController()
      const abortLink = () => link.abort()
      signal.addEventListener('abort', abortLink, { once: true })
      let idle: ReturnType<typeof setTimeout> | null = null
      const touchIdle = () => {
        if (idle !== null) clearTimeout(idle)
        idle = setTimeout(() => link.abort(), timing.idleLimitMs)
      }
      try {
        const res = await fetch(`${base}${workspacePath(workspaceId)}/events`, {
          headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
          signal: link.signal,
        })
        const type = res.headers.get('content-type') ?? ''
        if (!res.ok || !res.body || !type.toLowerCase().includes('text/event-stream')) {
          await res.body?.cancel().catch(() => {})
          throw new Error(`events ${res.status}`)
        }
        setStatus(stream, 'online')
        backoff = timing.backoffStartMs
        touchIdle()
        const parser = createSseParser(
          (e) => {
            const change = toChange(e.event, e.data)
            if (change) emit(stream, change)
          },
          () => touchIdle(),
        )
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done || link.signal.aborted) break
          touchIdle()
          parser.push(decoder.decode(value, { stream: true }))
        }
      } catch {
        // 끊김 · 거절 · 중단 — 아래에서 offline으로 알리고 다시 시도한다
      } finally {
        if (idle !== null) clearTimeout(idle)
        signal.removeEventListener('abort', abortLink)
      }
      if (signal.aborted) return
      setStatus(stream, 'offline')
      await sleep(backoff, signal)
      backoff = Math.min(timing.backoffMaxMs, backoff * 2)
    }
  }

  // ---- DataSource -------------------------------------------------------------------

  return {
    label: 'Spring 서버',

    getLoginOptions: async () => json<LoginOptions>(await read('/api/login-options')),
    getMe: async () => json<MeResponse>(await read('/api/me')),
    async logout() {
      await write('POST', '/api/logout')
    },
    async reviewLogin(request: ReviewLoginRequest) {
      await write('POST', '/api/review-login', new URLSearchParams({ username: request.username, password: request.password }))
    },

    listRepositories: async () => json<RepositoryChoiceResponse>(await read('/api/repositories')),
    listWorkspaces: async () => json<WorkspaceListItem[]>(await read('/api/workspaces')),
    openWorkspace: async (request: OpenWorkspaceRequest) => json<WorkspaceSummary>(await write('POST', '/api/workspaces', request)),

    load: async (workspaceId) => json<WorkspaceSnapshot>(await read(`${workspacePath(workspaceId)}/snapshot`)),

    subscribe(workspaceId, onChange) {
      let stream = streams.get(workspaceId)
      if (!stream) {
        stream = { listeners: new Set(), controller: new AbortController(), status: null }
        streams.set(workspaceId, stream)
        stream.listeners.add(onChange)
        void runStream(workspaceId, stream)
      } else {
        stream.listeners.add(onChange)
        if (stream.status) deliver(onChange, { type: 'connection', status: stream.status })
      }
      const mine = stream
      return () => {
        mine.listeners.delete(onChange)
        if (mine.listeners.size === 0 && streams.get(workspaceId) === mine) {
          mine.controller.abort()
          streams.delete(workspaceId)
        }
      }
    },

    requestSync: async (workspaceId) => json<SyncStatus>(await write('POST', `${workspacePath(workspaceId)}/sync`)),
    getSyncStatus: async (workspaceId) => json<SyncStatus>(await read(`${workspacePath(workspaceId)}/sync-status`)),

    getSettings: async (workspaceId) => json<TeamSettings>(await read(`${workspacePath(workspaceId)}/settings`)),
    updateSettings: async (workspaceId, settings) => json<TeamSettings>(await write('PUT', `${workspacePath(workspaceId)}/settings`, settings)),

    listRounds: async (workspaceId, submissionId) => json<EvaluationRoundDto[]>(await read(`${submissionPath(workspaceId, submissionId)}/rounds`)),
    evaluate: async (workspaceId, submissionId, request: EvaluateRequest) =>
      json<EvaluationRoundDto>(await write('PUT', `${submissionPath(workspaceId, submissionId)}/evaluations/mine`, request)),

    startMeeting: async (workspaceId, request: StartMeetingRequest) => json<MeetingDto>(await write('POST', `${workspacePath(workspaceId)}/meetings`, request)),
    endMeeting: async (workspaceId, meetingId, request: EndMeetingRequest) =>
      json<MeetingDto>(await write('POST', `${workspacePath(workspaceId)}/meetings/${encodeURIComponent(meetingId)}/end`, request)),
    createAgendaItem: async (workspaceId, request: AgendaItemCreateRequest) => json<AgendaItemDto>(await write('POST', `${workspacePath(workspaceId)}/agenda-items`, request)),
    withdrawAgendaItem: async (workspaceId, agendaItemId) => json<AgendaItemDto>(await write('POST', `${agendaPath(workspaceId, agendaItemId)}/withdraw`)),
    recordDecision: async (workspaceId, agendaItemId, request: DecisionRequest) => json<AgendaItemDto>(await write('POST', `${agendaPath(workspaceId, agendaItemId)}/decision`, request)),

    getHelpRequest: async (workspaceId, helpRequestId) => json<HelpRequestDetail>(await read(helpPath(workspaceId, helpRequestId))),
    createHelpRequest: async (workspaceId, request: HelpRequestCreateRequest) => json<HelpRequestSummary>(await write('POST', `${workspacePath(workspaceId)}/help-requests`, request)),
    addHelpComment: async (workspaceId, helpRequestId, request: HelpCommentCreateRequest) => json<HelpCommentDto>(await write('POST', `${helpPath(workspaceId, helpRequestId)}/comments`, request)),
    closeHelpRequest: async (workspaceId, helpRequestId, request: HelpRequestCloseRequest) => json<HelpRequestDetail>(await write('POST', `${helpPath(workspaceId, helpRequestId)}/close`, request)),
    convertHelpRequestToAgenda: async (workspaceId, helpRequestId, request: HelpRequestToAgendaRequest) =>
      json<AgendaItemDto>(await write('POST', `${helpPath(workspaceId, helpRequestId)}/to-agenda`, request)),
    requestInstructorHelp: async (workspaceId, helpRequestId) => json<HelpRequestSummary>(await write('POST', `${helpPath(workspaceId, helpRequestId)}/instructor-request`)),

    listStandups: async (workspaceId, date) => json<StandupDto[]>(await read(`${workspacePath(workspaceId)}/standups?date=${encodeURIComponent(date)}`)),
    getStandupPrefill: async (workspaceId, date) => json<StandupPrefill>(await read(`${standupPath(workspaceId, date)}/mine/prefill`)),
    saveMyStandup: async (workspaceId, date, request: StandupSaveRequest) => json<StandupDto>(await write('PUT', `${standupPath(workspaceId, date)}/mine`, request)),

    linkRequirement: async (workspaceId, request: RequirementLinkCreateRequest) => json<RequirementLinkDto>(await write('POST', `${workspacePath(workspaceId)}/requirement-links`, request)),
    async unlinkRequirement(workspaceId, linkId) {
      await write('DELETE', `${workspacePath(workspaceId)}/requirement-links/${encodeURIComponent(linkId)}`)
    },

    setDueDate: async (workspaceId, taskId, request: TaskDueDateRequest) => json<TaskDueDateDto>(await write('PUT', `${taskPath(workspaceId, taskId)}/due-date`, request)),
    async clearDueDate(workspaceId, taskId) {
      await write('DELETE', `${taskPath(workspaceId, taskId)}/due-date`)
    },

    close() {
      for (const s of streams.values()) {
        s.listeners.clear()
        s.controller.abort()
      }
      streams.clear()
    },
  }
}
