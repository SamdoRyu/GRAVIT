// v1 mock DataSource — 서버 없이 v1 계약 DTO로 화면 · 3D를 개발하고 테스트한다. 소유: D.
// 데이터: seed.ts → localStorage(키 V1_STORAGE_KEY). 데모 mock(../index.ts)과 상태를 나누지 않는다.
// 권한 · 개인 지표 같은 서버 규칙은 흉내 내지 않는다(CONTRACTS.md 「8」) — 다만 화면 흐름에 필요한
// 로그인 여부(unauthorized)와 "내가 들어갈 수 있는 사무실"(not_found)은 지킨다.
// 이름은 데모 mock을 지울 때 createMockDataSource로 바꾼다.
import { DataError, type DataSource } from '../../DataSource'
import { EVALUATION_MSG, evaluationError, orderReasons } from '../../rules/evaluation'
import { MEETING_MSG, agendaCreateError, blankToNull, decisionError, dueDateError, meetingEndError } from '../../rules/meeting'
import { SETTINGS_MSG, openWorkspaceError, settingsError } from '../../rules/period'
import type {
  AgendaItemDto,
  Change,
  EvaluationRoundDto,
  Id,
  Instant,
  MeResponse,
  MeetingDto,
  MemberDto,
  OpenWorkspaceRequest,
  RepositoryChoice,
  SnapshotResource,
  SubmissionDto,
  SyncStatus,
  TaskDto,
  TeamSettings,
  Viewer,
  WorkspaceSnapshot,
} from '../../types'
import { defaultStorage, type StorageLike } from '../storage'
import { MOCK_OWNERS, MOCK_STATE_VERSION, MOCK_USERS, createSeed, openedWorkspace, toInstant, type MockSession, type MockState, type MockWorkspace } from './seed'

export type { MockSession } from './seed'

export const V1_STORAGE_KEY = 'gravit.mock.v1'
const GITHUB_LOGIN_URL = '/oauth2/authorization/github'
const DEFAULT_SYNC_DURATION_MS = 800
/** 동기화가 끝났을 때 다시 읽으라고 알리는 자원 */
const SYNCED_RESOURCES = ['members', 'tasks', 'submissions'] as const

/** mock 심사용 계정 — 실제 값은 서버 설정이 정한다(#63). 로그인 화면이 mock일 때만 안내한다 */
export const MOCK_REVIEW_LOGIN = { username: 'review', password: 'review' } as const

/** mock 전용 — GitHub 로그인은 브라우저가 GitHub로 갔다 돌아오는 흐름이라 mock에서는 이 함수로 끝낸다 */
export type V1MockDataSource = DataSource & { completeGithubLogin(): void }

const MSG = {
  unauthorized: '로그인이 필요해요',
  reviewLoginFailed: '아이디나 비밀번호가 맞지 않아요',
  reviewLoginDisabled: '이 환경에서는 심사용 로그인을 쓸 수 없어요',
  workspaceNotFound: '사무실을 찾을 수 없어요',
  repoNotFound: '레포를 찾을 수 없어요',
  notRepoAdmin: '레포 관리자만 사무실을 열 수 있어요',
  alreadyOpen: '이미 열린 사무실이에요',
  syncRunning: '이미 동기화 중이에요',
  invalidRequest: '요청 내용이 올바르지 않아요',
  notSettingsAdmin: '레포 관리자만 팀 설정을 바꿀 수 있어요',
  ...SETTINGS_MSG,
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

export function createV1MockDataSource(opts: V1MockOptions = {}): V1MockDataSource {
  const storage = opts.storage ?? defaultStorage()
  const random = opts.random ?? Math.random
  const now = opts.now ?? (() => new Date())
  const [minLatency, maxLatency] = opts.latencyMs ?? [50, 150]
  const reviewLoginEnabled = opts.reviewLoginEnabled ?? true
  const syncDurationMs = opts.syncDurationMs ?? DEFAULT_SYNC_DURATION_MS

  let state = readState(storage, () => createSeed(now(), 'github'))
  if (opts.session !== undefined) state.session = opts.session
  save()

  const listeners = new Map<Id, Set<(change: Change) => void>>()
  /** 이 인스턴스가 시작해 아직 끝나지 않은 동기화 (사무실 ID) */
  const activeSyncs = new Set<Id>()

  // 다른 탭이 저장하면 그 상태를 받아 쓴다 — 탭마다 따로 들고 있다가 서로 덮어쓰지 않게(나중에 저장한 탭이 이기는 문제).
  // 받은 값의 running은 그 탭의 진행 중인 동기화일 수 있으니 되돌리지 않고, 이 탭이 진행 중인 동기화는 running으로 둔다.
  storage.subscribe?.(V1_STORAGE_KEY, (raw) => {
    const next = parseState(raw)
    if (!next) return // 지워졌거나 읽을 수 없는 값 — 지금 상태를 유지하고 다음 저장 때 다시 쓴다
    for (const ws of next.workspaces) {
      if (activeSyncs.has(ws.snapshot.workspace.id)) ws.snapshot.sync = { ...ws.snapshot.sync, state: 'running' }
    }
    state = next
  })

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

  /**
   * 요청자 기준 현재 회차 — seed 이유(평가자 없음)에 팀원이 남긴 평가를 합쳐 수 · 이유를 다시 센다.
   * 이유는 추천 먼저, 그 안에서 저장 순서. myEvaluation은 요청자 것만, canEvaluate는 열린 PR · 작성자 아님.
   */
  function roundFor(ws: MockWorkspace, sub: SubmissionDto, me: MemberDto): EvaluationRoundDto | null {
    return sub.currentRound ? viewRound(ws, sub, sub.currentRound, me, true) : null
  }

  /** 저장된 회차 하나를 요청자 기준으로 — 지난 회차는 평가할 수 없다 */
  function viewRound(ws: MockWorkspace, sub: SubmissionDto, round: EvaluationRoundDto, me: MemberDto, isCurrent: boolean): EvaluationRoundDto {
    const given = (ws.evaluations ?? []).filter((e) => e.submissionId === sub.id && e.roundId === round.id)
    const reasons = orderReasons([...round.reasons, ...given.map((e) => ({ verdict: e.verdict, reason: e.reason }))])
    const mine = given.find((e) => e.memberId === me.id)
    return {
      ...round,
      recommendCount: reasons.filter((r) => r.verdict === 'recommend').length,
      notRecommendCount: reasons.filter((r) => r.verdict === 'not_recommend').length,
      reasons,
      myEvaluation: mine ? { verdict: mine.verdict, reason: mine.reason, updatedAt: mine.updatedAt } : null,
      canEvaluate: isCurrent && (sub.state === 'open' || sub.state === 'draft') && sub.authorMemberId !== me.id,
    }
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
    for (const sub of s.submissions) sub.currentRound = roundFor(ws, sub, me)
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
    activeSyncs.add(workspaceId)
    save()
    emit(workspaceId, { type: 'sync', status: ws.snapshot.sync })
    setTimeout(() => {
      activeSyncs.delete(workspaceId)
      // 그 사이 다른 탭의 상태로 바뀌었을 수 있으니 붙잡아 둔 객체가 아니라 지금 상태에서 다시 찾는다
      const current = state.workspaces.find((w) => w.snapshot.workspace.id === workspaceId)
      if (!current) return
      // 시연 사무실도 GitHub를 부르지 않고 같은 방식으로 바로 성공한다(CONTRACTS.md 「4」)
      current.snapshot.sync = succeededSync(current.snapshot.sync, toInstant(now()))
      save()
      emit(workspaceId, { type: 'sync', status: current.snapshot.sync })
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

    // 값이 틀리면 어느 값인지 말하지 않는다(401). 꺼진 환경이면 경로가 없다(404)
    async reviewLogin(request) {
      await wait()
      if (!reviewLoginEnabled) throw new DataError(MSG.reviewLoginDisabled, 'not_found')
      if (request?.username !== MOCK_REVIEW_LOGIN.username || request?.password !== MOCK_REVIEW_LOGIN.password) throw new DataError(MSG.reviewLoginFailed, 'unauthorized')
      state.session = 'review'
      save()
    },

    completeGithubLogin() {
      state.session = 'github'
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

    async getSettings(workspaceId) {
      await wait()
      return structuredClone(accessible(workspaceId, requireUser()).snapshot.settings)
    },

    async updateSettings(workspaceId, settings) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      // R2만 — 화면이 편집 버튼을 R2에게만 보이므로 mock도 같은 흐름을 지킨다
      if (!currentMember(ws, user)?.isRepoAdmin) throw new DataError(MSG.notSettingsAdmin, 'forbidden_role')
      const error = settingsError(settings)
      if (error) throw new DataError(error, 'invalid')
      ws.snapshot.settings = pickSettings(settings)
      save()
      emit(workspaceId, { type: 'changed', resources: ['settings'] })
      return structuredClone(ws.snapshot.settings)
    },

    // 현재 회차 + 회의 결정(revise_and_reevaluate)으로 닫힌 지난 회차 — 회차 번호 내림차순
    async listRounds(workspaceId, submissionId) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      const sub = findSubmission(ws, submissionId)
      const me = currentMember(ws, user)!
      const current = roundFor(ws, sub, me)
      const past = (ws.pastRounds ?? []).filter((p) => p.submissionId === sub.id).map((p) => viewRound(ws, sub, p.round, me, false))
      return [...(current ? [current] : []), ...past].sort((a, b) => b.roundNumber - a.roundNumber)
    },

    // 검사 순서: 로그인 → 사무실 · PR(404) → 요청(400) → 작성자(403) → PR 상태 · 회차(409)
    async evaluate(workspaceId, submissionId, request) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      const sub = findSubmission(ws, submissionId)
      const me = currentMember(ws, user)!
      const error = evaluationError(request)
      if (error) throw new DataError(error, 'invalid')
      if (sub.authorMemberId === me.id) throw new DataError(EVALUATION_MSG.ownSubmission, 'forbidden_role')
      if (sub.state !== 'open' && sub.state !== 'draft') throw new DataError(EVALUATION_MSG.closedSubmission, 'conflict')
      if (!sub.currentRound || sub.currentRound.id !== request.roundId) throw new DataError(EVALUATION_MSG.staleRound, 'conflict')

      const roundId = sub.currentRound.id
      const others = (ws.evaluations ?? []).filter((e) => !(e.submissionId === sub.id && e.roundId === roundId && e.memberId === me.id))
      ws.evaluations = [...others, { submissionId: sub.id, roundId, memberId: me.id, verdict: request.verdict, reason: request.reason.trim(), updatedAt: toInstant(now()) }]
      save()
      // 추천 · 비추천 수와 이유는 Snapshot의 PR에 있다
      emit(workspaceId, { type: 'changed', resources: ['submissions'] })
      return structuredClone(roundFor(ws, sub, me)!)
    },

    // ---- 「10」 회의 · 안건 — 검사 순서: 로그인 → 사무실 · 대상(404) → 요청(400) → 권한(403) → 상태(409) ----

    async startMeeting(workspaceId, request) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      const ids = Array.isArray(request?.attendeeMemberIds) ? request.attendeeMemberIds : null
      if (!ids || !ids.every((id) => isCurrentMember(ws, id))) throw new DataError(MEETING_MSG.attendeeNotMember, 'invalid')
      if (ws.snapshot.meetings.some((m) => m.status === 'ongoing')) throw new DataError(MEETING_MSG.meetingOngoing, 'conflict')
      const meeting: MeetingDto = { id: nextId('mt'), status: 'ongoing', startedAt: toInstant(now()), endedAt: null, attendeeMemberIds: [...new Set(ids)], notes: null, discussedAgendaItemIds: [] }
      ws.snapshot.meetings.push(meeting)
      save()
      emit(workspaceId, { type: 'changed', resources: ['meetings'] })
      return structuredClone(meeting)
    },

    async endMeeting(workspaceId, meetingId, request) {
      await wait()
      const ws = accessible(workspaceId, requireUser())
      const meeting = ws.snapshot.meetings.find((m) => m.id === meetingId)
      if (!meeting) throw new DataError(MEETING_MSG.meetingNotFound, 'not_found')
      const error = meetingEndError(request)
      if (error) throw new DataError(error, 'invalid')
      if (meeting.status === 'ended') throw new DataError(MEETING_MSG.meetingEnded, 'conflict')
      meeting.status = 'ended'
      meeting.endedAt = toInstant(now())
      meeting.notes = request.notes
      save()
      emit(workspaceId, { type: 'changed', resources: ['meetings'] })
      return structuredClone(meeting)
    },

    async createAgendaItem(workspaceId, request) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      const error = agendaCreateError(request)
      if (error) throw new DataError(error, 'invalid')
      let source: AgendaItemDto['source'] = null
      let evaluationRoundId: Id | null = null
      if (request.kind === 'issue') {
        if (!ws.snapshot.tasks.some((t) => t.id === request.sourceId)) throw new DataError(MEETING_MSG.agendaSourceNotFound, 'not_found')
        source = { type: 'task', id: request.sourceId! }
      } else if (request.kind === 'pr') {
        const sub = ws.snapshot.submissions.find((s) => s.id === request.sourceId)
        if (!sub) throw new DataError(MEETING_MSG.agendaSourceNotFound, 'not_found')
        source = { type: 'submission', id: sub.id }
        evaluationRoundId = sub.currentRound?.id ?? null // 올린 때의 현재 회차를 기억한다
      }
      const item: AgendaItemDto = {
        id: nextId('ag'),
        kind: request.kind,
        status: 'confirmed',
        title: request.title.trim(),
        background: blankToNull(request.background),
        tried: blankToNull(request.tried),
        unresolvedReason: blankToNull(request.unresolvedReason),
        source,
        evaluationRoundId,
        raisedByMemberId: currentMember(ws, user)!.id,
        raisedAt: toInstant(now()),
        decision: null,
        feedbackRequested: false,
        feedbackRequestedAt: null,
        instructorFeedbacks: [],
      }
      ws.snapshot.agendaItems.push(item)
      save()
      emit(workspaceId, { type: 'changed', resources: ['agenda_items'] })
      return structuredClone(item)
    },

    async withdrawAgendaItem(workspaceId, agendaItemId) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      const item = findAgendaItem(ws, agendaItemId)
      if (item.raisedByMemberId !== currentMember(ws, user)!.id) throw new DataError(MEETING_MSG.withdrawNotOwner, 'forbidden_role')
      if (item.status !== 'confirmed') throw new DataError(MEETING_MSG.agendaNotConfirmed, 'conflict')
      item.status = 'withdrawn'
      save()
      emit(workspaceId, { type: 'changed', resources: ['agenda_items'] })
      return structuredClone(item)
    },

    async recordDecision(workspaceId, agendaItemId, request) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      const item = findAgendaItem(ws, agendaItemId)
      const error = decisionError(request, item.kind)
      if (error) throw new DataError(error, 'invalid')
      if (request.followUpAssigneeMemberId !== null && !isCurrentMember(ws, request.followUpAssigneeMemberId)) throw new DataError(MEETING_MSG.followUpNotMember, 'invalid')
      const meeting = request.meetingId === null ? null : ws.snapshot.meetings.find((m) => m.id === request.meetingId)
      if (meeting === undefined) throw new DataError(MEETING_MSG.meetingNotFound, 'invalid')
      if (item.status !== 'confirmed') throw new DataError(MEETING_MSG.agendaNotConfirmed, 'conflict')
      const sub = item.source?.type === 'submission' ? ws.snapshot.submissions.find((s) => s.id === item.source!.id) : undefined
      const reevaluate = request.prDecision === 'revise_and_reevaluate'
      // 머지 · 닫힌 PR에 다시 평가는 결정 기록 전체를 거부한다(CONTRACTS.md 「3」 평가 회차 — 2026-11-05)
      if (reevaluate && sub && sub.state !== 'open' && sub.state !== 'draft') throw new DataError(MEETING_MSG.reevaluateClosed, 'conflict')

      const at = toInstant(now())
      const me = currentMember(ws, user)!
      item.status = 'discussed'
      item.decision = {
        conclusion: request.conclusion.trim(),
        learning: blankToNull(request.learning),
        prDecision: request.prDecision,
        followUpAssigneeMemberId: request.followUpAssigneeMemberId,
        followUpDueDate: request.followUpDueDate,
        meetingId: request.meetingId,
        decidedByMemberId: me.id,
        decidedAt: at,
      }
      const resources: SnapshotResource[] = ['agenda_items']
      if (meeting && !meeting.discussedAgendaItemIds.includes(item.id)) {
        meeting.discussedAgendaItemIds.push(item.id)
        resources.push('meetings')
      }
      // 새 평가 회차(meeting_reevaluate) — 지금 회차는 닫혀 지난 회차가 된다
      if (reevaluate && sub?.currentRound) {
        const prev = sub.currentRound
        ws.pastRounds = [...(ws.pastRounds ?? []), { submissionId: sub.id, round: { ...prev, closedAt: at } }]
        sub.currentRound = {
          id: nextId('r'),
          roundNumber: prev.roundNumber + 1,
          headSha: sub.headSha,
          openedReason: 'meeting_reevaluate',
          openedAt: at,
          closedAt: null,
          recommendCount: 0,
          notRecommendCount: 0,
          reasons: [],
          myEvaluation: null,
          canEvaluate: false,
        }
        resources.push('submissions')
      }
      save()
      emit(workspaceId, { type: 'changed', resources })
      return structuredClone(item)
    },

    // ---- 「13」 작업 마감 — R2 또는 그 이슈의 담당자(P14) ----

    async setDueDate(workspaceId, taskId, request) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      const task = findTaskFor(ws, taskId, currentMember(ws, user)!)
      const error = dueDateError(request?.dueDate)
      if (error) throw new DataError(error, 'invalid')
      task.dueDate = request.dueDate
      save()
      emit(workspaceId, { type: 'changed', resources: ['tasks'] })
      return { taskId: task.id, dueDate: request.dueDate, updatedAt: toInstant(now()), updatedBy: structuredClone(user.user) }
    },

    async clearDueDate(workspaceId, taskId) {
      await wait()
      const user = requireUser()
      const ws = accessible(workspaceId, user)
      const task = findTaskFor(ws, taskId, currentMember(ws, user)!)
      if (task.dueDate === null) return // 마감이 없으면 그대로 204
      task.dueDate = null
      save()
      emit(workspaceId, { type: 'changed', resources: ['tasks'] })
    },
  }
}

function isCurrentMember(ws: MockWorkspace, memberId: unknown): boolean {
  return ws.snapshot.members.some((m) => m.id === memberId && m.removedAt === null)
}

function findAgendaItem(ws: MockWorkspace, agendaItemId: Id): AgendaItemDto {
  const item = ws.snapshot.agendaItems.find((a) => a.id === agendaItemId)
  if (!item) throw new DataError(MEETING_MSG.agendaNotFound, 'not_found')
  return item
}

/** 마감을 바꿀 이슈 — 없으면 not_found, R2도 담당자도 아니면 forbidden_role */
function findTaskFor(ws: MockWorkspace, taskId: Id, me: MemberDto): TaskDto {
  const task = ws.snapshot.tasks.find((t) => t.id === taskId)
  if (!task) throw new DataError(MEETING_MSG.taskNotFound, 'not_found')
  if (!me.isRepoAdmin && !task.assigneeMemberIds.includes(me.id)) throw new DataError(MEETING_MSG.dueDateForbidden, 'forbidden_role')
  return task
}

function findSubmission(ws: MockWorkspace, submissionId: Id): SubmissionDto {
  const sub = ws.snapshot.submissions.find((s) => s.id === submissionId)
  if (!sub) throw new DataError(EVALUATION_MSG.submissionNotFound, 'not_found')
  return sub
}

// ---- 검사 · 저장 ---------------------------------------------------------------

function validateOpenRequest(r: OpenWorkspaceRequest): void {
  if (typeof r !== 'object' || r === null || typeof r.githubRepoId !== 'string' || typeof r.activityConsent !== 'boolean') {
    throw new DataError(MSG.invalidRequest, 'invalid')
  }
  // 기간 · 명세 문서 경로는 화면과 같은 규칙(rules/period)
  const error = openWorkspaceError(r)
  if (error) throw new DataError(error, 'invalid')
}

/** 전체 교체 — 계약의 칸만, 계약 순서대로 저장한다(요청에 다른 칸이 섞여 와도 남기지 않는다) */
function pickSettings(s: TeamSettings): TeamSettings {
  return {
    projectStartDate: s.projectStartDate,
    projectEndDate: s.projectEndDate,
    specDocumentPath: s.specDocumentPath,
    reviewWaitHours: s.reviewWaitHours,
    noCommitHours: s.noCommitHours,
  }
}

/**
 * 동기화 성공 — 마지막 실패 기록(lastFailed*)은 남긴다. 실패 중인지는 isFailing이 말한다(CONTRACTS_API.md 「4」).
 * mock은 명세 문서를 읽지 않으므로 경고는 없다.
 */
function succeededSync(prev: SyncStatus, at: Instant): SyncStatus {
  return { ...prev, state: 'idle', lastSucceededAt: at, isFailing: false, specWarnings: [] }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Snapshot에서 배열이어야 하는 칸 */
const SNAPSHOT_LISTS = ['members', 'tasks', 'submissions', 'requirements', 'requirementLinks', 'agendaItems', 'meetings', 'helpRequests', 'activityNotes'] as const

/** 저장된 사무실 한 개의 뼈대 검사 — 이 파일이 읽는 칸이 있는지만 본다(값 하나하나는 검사하지 않는다). */
function isMockWorkspace(v: unknown): v is MockWorkspace {
  if (!isRecord(v) || !Array.isArray(v.consentedUserIds) || !isRecord(v.snapshot)) return false
  const s = v.snapshot
  return (
    isRecord(s.workspace) &&
    typeof s.workspace.id === 'string' &&
    isRecord(s.settings) &&
    isRecord(s.sync) &&
    (s.sync.state === 'idle' || s.sync.state === 'running') &&
    isRecord(s.flow) &&
    SNAPSHOT_LISTS.every((key) => Array.isArray(s[key]))
  )
}

function isMockState(v: unknown): v is MockState {
  if (!isRecord(v)) return false
  return (
    v.version === MOCK_STATE_VERSION &&
    typeof v.nextId === 'number' &&
    (v.session === null || v.session === 'github' || v.session === 'review') &&
    Array.isArray(v.workspaces) &&
    v.workspaces.every(isMockWorkspace)
  )
}

/** 저장된 문자열 → 상태. 없거나 JSON이 아니거나 모양이 다르면 null (이유는 경고로 남긴다). */
function parseState(raw: string | null): MockState | null {
  if (raw === null) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (isMockState(data)) return data
    console.warn('mock v1: 저장된 데이터 모양이 달라요')
  } catch (e) {
    console.warn('mock v1: 저장된 데이터가 JSON이 아니에요', e)
  }
  return null
}

/**
 * 이전 실행에서 끝나지 못한 동기화를 동기화 전 상태로 되돌린다. 완료 타이머(startSync)는 메모리에만 있어
 * 새로 고침 · 탭 종료와 함께 사라지므로, 저장된 running은 다시 끝나지 않는다. 인스턴스를 만들 때만 부르므로
 * 이 인스턴스가 시작한 동기화는 건드리지 않는다. startSync가 이전 상태에 state만 바꿔 저장하므로
 * state만 되돌리면 마지막 성공 · 실패 기록이 그대로 남는다. running이 아닌 사무실은 바꾸지 않는다.
 */
function stopInterruptedSyncs(state: MockState): MockState {
  for (const ws of state.workspaces) {
    if (ws.snapshot.sync.state === 'running') ws.snapshot.sync = { ...ws.snapshot.sync, state: 'idle' }
  }
  return state
}

/** 저장된 상태를 읽는다. 없으면 seed, 읽을 수 없으면 경고를 남기고 seed로 다시 시작한다. 끊긴 동기화는 되돌린다. */
function readState(storage: StorageLike, seed: () => MockState): MockState {
  let raw: string | null
  try {
    raw = storage.getItem(V1_STORAGE_KEY)
  } catch (e) {
    console.warn('mock v1: 저장소를 읽지 못해 seed로 시작해요', e)
    return seed()
  }
  if (raw === null) return seed()
  const parsed = parseState(raw)
  if (parsed) return stopInterruptedSyncs(parsed)
  console.warn('mock v1: 저장된 데이터를 쓸 수 없어 seed로 다시 시작해요')
  return seed()
}
