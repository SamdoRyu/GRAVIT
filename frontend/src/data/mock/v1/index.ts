// v1 mock DataSource — 서버 없이 v1 계약 DTO로 화면 · 3D를 개발하고 테스트한다. 소유: D.
// 데이터: seed.ts → localStorage(키 V1_STORAGE_KEY). 데모 mock(../index.ts)과 상태를 나누지 않는다.
// 권한 · 개인 지표 같은 서버 규칙은 흉내 내지 않는다(CONTRACTS.md 「8」) — 다만 화면 흐름에 필요한
// 로그인 여부(unauthorized)와 "내가 들어갈 수 있는 사무실"(not_found)은 지킨다.
// 이름은 데모 mock을 지울 때 createMockDataSource로 바꾼다.
import { DataError, type DataSource } from '../../DataSource'
import type { Change, Id, MeResponse, OpenWorkspaceRequest, RepositoryChoice, SyncStatus, Viewer, WorkspaceSnapshot } from '../../types'
import { defaultStorage, type StorageLike } from '../storage'
import { MOCK_OWNERS, MOCK_STATE_VERSION, MOCK_USERS, createSeed, idleSync, openedWorkspace, toInstant, type MockSession, type MockState, type MockWorkspace } from './seed'

export type { MockSession } from './seed'

export const V1_STORAGE_KEY = 'gravit.mock.v1'
const GITHUB_LOGIN_URL = '/oauth2/authorization/github'
const DEFAULT_SYNC_DURATION_MS = 800
const SPEC_PATH_MAX_LENGTH = 300
/** 동기화가 끝났을 때 다시 읽으라고 알리는 자원 */
const SYNCED_RESOURCES = ['members', 'tasks', 'submissions'] as const

const MSG = {
  unauthorized: '로그인이 필요해요',
  workspaceNotFound: '사무실을 찾을 수 없어요',
  repoNotFound: '레포를 찾을 수 없어요',
  notRepoAdmin: '레포 관리자만 사무실을 열 수 있어요',
  alreadyOpen: '이미 열린 사무실이에요',
  syncRunning: '이미 동기화 중이에요',
  invalidRequest: '요청 내용이 올바르지 않아요',
  invalidDate: '날짜 형식이 올바르지 않아요',
  endBeforeStart: '끝 날짜는 시작 날짜보다 빠를 수 없어요',
  invalidSpecPath: `명세 문서 경로는 1~${SPEC_PATH_MAX_LENGTH}자로 입력해 주세요`,
} as const

export interface V1MockOptions {
  /** localStorage 같은 저장소. 기본: 브라우저 localStorage, 없으면 메모리 */
  storage?: StorageLike
  /** 흉내 낸 네트워크 지연 [최소, 최대] ms. 기본 [50, 150]. 테스트는 [0, 0] */
  latencyMs?: [number, number]
  random?: () => number
  now?: () => Date
  /** 세션을 이 값으로 시작한다(저장된 세션보다 우선). 생략하면 저장된 세션, 처음이면 'github' */
  session?: MockSession | null
  /** LoginOptions.reviewLoginEnabled. 기본 true */
  reviewLoginEnabled?: boolean
  /** 동기화가 running에서 idle이 되기까지의 시간(ms). 기본 800 */
  syncDurationMs?: number
}

export function createV1MockDataSource(opts: V1MockOptions = {}): DataSource {
  const storage = opts.storage ?? defaultStorage()
  const random = opts.random ?? Math.random
  const now = opts.now ?? (() => new Date())
  const [minLatency, maxLatency] = opts.latencyMs ?? [50, 150]
  const reviewLoginEnabled = opts.reviewLoginEnabled ?? true
  const syncDurationMs = opts.syncDurationMs ?? DEFAULT_SYNC_DURATION_MS

  const state = readState(storage, () => createSeed(now(), 'github'))
  if (opts.session !== undefined) state.session = opts.session
  save()

  const listeners = new Map<Id, Set<(change: Change) => void>>()

  async function wait(): Promise<void> {
    const ms = maxLatency <= 0 ? 0 : minLatency + random() * (maxLatency - minLatency)
    if (ms <= 0) {
      await Promise.resolve()
      return
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  function save(): void {
    try {
      storage.setItem(V1_STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
      console.warn('mock v1: 저장하지 못해 메모리에서만 이어 가요', e)
    }
  }

  function emit(workspaceId: Id, change: Change): void {
    for (const listener of listeners.get(workspaceId) ?? []) {
      try {
        listener(structuredClone(change))
      } catch (e) {
        console.error('mock v1: listener failed', e)
      }
    }
  }

  function requireUser(): MeResponse {
    if (state.session === null) throw new DataError(MSG.unauthorized, 'unauthorized')
    return MOCK_USERS[state.session]
  }

  function currentMember(ws: MockWorkspace, user: MeResponse) {
    return ws.snapshot.members.find((m) => m.userId === user.user.userId && m.removedAt === null)
  }

  /** 들어갈 수 있는 사무실만 — 없거나 권한이 없으면 같은 not_found (존재를 숨긴다) */
  function accessible(workspaceId: Id, user: MeResponse): MockWorkspace {
    const ws = state.workspaces.find((w) => w.snapshot.workspace.id === workspaceId)
    if (!ws || !currentMember(ws, user)) throw new DataError(MSG.workspaceNotFound, 'not_found')
    return ws
  }

  function toSnapshot(ws: MockWorkspace, user: MeResponse): WorkspaceSnapshot {
    const me = currentMember(ws, user)
    if (!me) throw new DataError(MSG.workspaceNotFound, 'not_found')
    const s = structuredClone(ws.snapshot)
    const viewer: Viewer = {
      userId: user.user.userId,
      role: me.isRepoAdmin ? 'repo_admin' : 'participant',
      memberId: me.id,
      activityConsented: ws.consentedUserIds.includes(user.user.userId),
    }
    for (const sub of s.submissions) {
      if (sub.currentRound) sub.currentRound.canEvaluate = (sub.state === 'open' || sub.state === 'draft') && sub.authorMemberId !== me.id
    }
    // 키 순서는 계약 표 그대로
    return {
      workspace: s.workspace,
      viewer,
      settings: s.settings,
      sync: s.sync,
      members: s.members,
      tasks: s.tasks,
      submissions: s.submissions,
      requirements: s.requirements,
      requirementLinks: s.requirementLinks,
      agendaItems: s.agendaItems,
      meetings: s.meetings,
      helpRequests: s.helpRequests,
      activityNotes: s.activityNotes,
      flow: s.flow,
      generatedAt: toInstant(now()),
    }
  }

  function startSync(ws: MockWorkspace): SyncStatus {
    const workspaceId = ws.snapshot.workspace.id
    ws.snapshot.sync = { ...ws.snapshot.sync, state: 'running' }
    save()
    emit(workspaceId, { type: 'sync', status: ws.snapshot.sync })
    setTimeout(() => {
      // 시연 사무실도 GitHub를 부르지 않고 같은 방식으로 바로 성공한다(CONTRACTS.md 「4」)
      ws.snapshot.sync = idleSync(toInstant(now()))
      save()
      emit(workspaceId, { type: 'sync', status: ws.snapshot.sync })
      emit(workspaceId, { type: 'changed', resources: [...SYNCED_RESOURCES] })
    }, syncDurationMs)
    return structuredClone(ws.snapshot.sync)
  }

  function nextId(prefix: string): Id {
    return `${prefix}_${state.nextId++}`
  }

  return {
    label: '로컬 mock 데이터 (v1)',

    async getLoginOptions() {
      await wait()
      return { githubLoginUrl: GITHUB_LOGIN_URL, reviewLoginEnabled }
    },

    async getMe() {
      await wait()
      return structuredClone(requireUser())
    },

    async logout() {
      await wait()
      state.session = null
      save()
    },

    async listRepositories() {
      await wait()
      const user = requireUser()
      // 강사 · 심사용 계정은 레포를 고르지 않는다(GET /api/workspaces만 쓴다)
      if (user.accountType === 'review' || user.isInstructor) return { organizations: [] }
      const workspaceIdOf = (githubRepoId: string) => state.workspaces.find((w) => w.snapshot.workspace.githubRepoId === githubRepoId)?.snapshot.workspace.id ?? null
      return {
        organizations: MOCK_OWNERS.map((o) => ({
          ...structuredClone(o),
          repositories: o.repositories.map((r): RepositoryChoice => ({ ...structuredClone(r), workspaceId: workspaceIdOf(r.githubRepoId) })),
        })),
      }
    },

    async listWorkspaces() {
      await wait()
      const user = requireUser()
      return state.workspaces
        .flatMap((ws) => {
          const me = currentMember(ws, user)
          return me ? [{ ...structuredClone(ws.snapshot.workspace), myRole: me.isRepoAdmin ? ('repo_admin' as const) : ('participant' as const) }] : []
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
    },

    async openWorkspace(request: OpenWorkspaceRequest) {
      await wait()
      const user = requireUser()
      validateOpenRequest(request)
      const repo = user.accountType === 'github' ? MOCK_OWNERS.flatMap((o) => o.repositories).find((r) => r.githubRepoId === request.githubRepoId) : undefined
      if (!repo) throw new DataError(MSG.repoNotFound, 'not_found')
      if (repo.myRole !== 'repo_admin') throw new DataError(MSG.notRepoAdmin, 'forbidden_role')
      if (state.workspaces.some((w) => w.snapshot.workspace.githubRepoId === repo.githubRepoId)) throw new DataError(MSG.alreadyOpen, 'conflict')

      const ws = openedWorkspace({
        id: nextId('ws'),
        memberId: nextId('m'),
        repo,
        user,
        settings: {
          projectStartDate: request.projectStartDate,
          projectEndDate: request.projectEndDate,
          specDocumentPath: request.specDocumentPath,
          reviewWaitHours: 48,
          noCommitHours: 48,
        },
        activityConsent: request.activityConsent,
        now: now(),
      })
      state.workspaces.push(ws)
      startSync(ws) // 사무실을 열면 첫 동기화를 시작한다
      return structuredClone(ws.snapshot.workspace)
    },

    async load(workspaceId) {
      await wait()
      const user = requireUser()
      return toSnapshot(accessible(workspaceId, user), user)
    },

    subscribe(workspaceId, onChange) {
      let set = listeners.get(workspaceId)
      if (!set) {
        set = new Set()
        listeners.set(workspaceId, set)
      }
      set.add(onChange)
      return () => {
        listeners.get(workspaceId)?.delete(onChange)
      }
    },

    async requestSync(workspaceId) {
      await wait()
      const ws = accessible(workspaceId, requireUser())
      if (ws.snapshot.sync.state === 'running') throw new DataError(MSG.syncRunning, 'conflict')
      return startSync(ws)
    },

    async getSyncStatus(workspaceId) {
      await wait()
      return structuredClone(accessible(workspaceId, requireUser()).snapshot.sync)
    },
  }
}

// ---- 검사 · 저장 ---------------------------------------------------------------

function isLocalDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function validateOpenRequest(r: OpenWorkspaceRequest): void {
  if (typeof r !== 'object' || r === null || typeof r.githubRepoId !== 'string' || typeof r.activityConsent !== 'boolean') {
    throw new DataError(MSG.invalidRequest, 'invalid')
  }
  if (!isLocalDate(r.projectStartDate) || !isLocalDate(r.projectEndDate)) throw new DataError(MSG.invalidDate, 'invalid')
  if (r.projectEndDate < r.projectStartDate) throw new DataError(MSG.endBeforeStart, 'invalid')
  if (r.specDocumentPath !== null && (typeof r.specDocumentPath !== 'string' || r.specDocumentPath.length < 1 || r.specDocumentPath.length > SPEC_PATH_MAX_LENGTH)) {
    throw new DataError(MSG.invalidSpecPath, 'invalid')
  }
}

function isMockState(v: unknown): v is MockState {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Partial<MockState>
  return s.version === MOCK_STATE_VERSION && typeof s.nextId === 'number' && Array.isArray(s.workspaces) && (s.session === null || s.session === 'github' || s.session === 'review')
}

/** 저장된 상태를 읽는다. 없으면 seed, 읽을 수 없으면 경고를 남기고 seed로 다시 시작한다. */
function readState(storage: StorageLike, seed: () => MockState): MockState {
  let raw: string | null
  try {
    raw = storage.getItem(V1_STORAGE_KEY)
  } catch (e) {
    console.warn('mock v1: 저장소를 읽지 못해 seed로 시작해요', e)
    return seed()
  }
  if (raw === null) return seed()
  try {
    const data: unknown = JSON.parse(raw)
    if (isMockState(data)) return data
  } catch (e) {
    console.warn('mock v1: 저장된 데이터가 JSON이 아니에요', e)
  }
  console.warn('mock v1: 저장된 데이터 모양이 달라 seed로 다시 시작해요')
  return seed()
}
