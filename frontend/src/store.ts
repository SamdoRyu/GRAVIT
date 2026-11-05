// App state + actions. Owned by the architect.
// Entities mirror the DemoDataSource; every mutation goes through an action here
// (optimistic update → DemoDataSource call → reconcile / roll back with a toast).
import { create } from 'zustand'
import { DataError, type DataErrorCode, type DataSource, type DemoDataSource } from './data/DataSource'
import type { Activity, AgendaItemCreateRequest, AgendaItemDto, Change, DecisionRequest, DemoChange, ConnectionStatus, EvaluateRequest, EvaluationRoundDto, Id, LocalDate, MeetingDto, Meeting, MeetingEnd, MeetingStart, Member, MemberInput, MemberPatch, Project, Reassign, SyncStatus, Task, TaskInput, TaskPatch, TaskStatus, TeamSettings, Workspace, WorkspaceListItem, WorkspaceSnapshot } from './data/types'
import { EMPTY_FILTERS, type Filters } from './data/selectors'

export type Selection = { kind: 'task'; id: Id } | { kind: 'member'; id: Id }
/** v1 사무실에서 고른 것 — 이슈(task) · PR(submission) · 팀원(member) */
export type OfficeSelection = { kind: 'task' | 'submission' | 'member'; id: Id }

/** 고른 것이 snapshot에 아직 있으면 그대로, 없으면 null */
export function aliveInOffice(snapshot: WorkspaceSnapshot, sel: OfficeSelection | null): OfficeSelection | null {
  if (!sel) return null
  const list = sel.kind === 'task' ? snapshot.tasks : sel.kind === 'submission' ? snapshot.submissions : snapshot.members
  return list.some((x) => x.id === sel.id) ? sel : null
}
/** 3D 오버레이. 사람별 업무량 오버레이는 v1에서 뺐다(FR-FLOW-06 — #102 T5-c-2) */
export type Overlay = 'none' | 'deadline' | 'project'
export type PanelView = 'kanban' | 'list'

export type Dialog =
  | { kind: 'task'; taskId?: Id; defaults?: Partial<TaskInput> }
  | { kind: 'member'; memberId?: Id }
  | { kind: 'removeMember'; memberId: Id }
  | { kind: 'deleteTask'; taskId: Id }
  | { kind: 'confirmReset' }
  | { kind: 'startMeeting' }
  | { kind: 'endMeeting'; meetingId: Id }
  /** v1 사무실의 프로젝트 기간 (#38 — FR-PLAN-01, R2만) */
  | { kind: 'projectPeriod' }

/** Where a dragged task would land if released now. Set by whoever is under the pointer. */
export type DropTarget =
  | { kind: 'member'; id: Id }
  | { kind: 'backlog' }
  | { kind: 'status'; status: TaskStatus }
  /** The meeting-room table: put the task on the next meeting's agenda. */
  | { kind: 'agenda' }

export interface Toast {
  id: number
  level: 'info' | 'good' | 'warn' | 'bad'
  text: string
}

/** v1 사무실 — 지금 연 사무실의 WorkspaceSnapshot과 읽기 상태 (CONTRACTS.md 「8」). */
export interface OfficeView {
  workspaceId: Id
  /** loading = 첫 Snapshot을 읽는 중, ready = snapshot 있음, error = 첫 읽기부터 실패 */
  status: 'loading' | 'ready' | 'error'
  /** 다시 읽기에 실패해도 마지막 값을 그대로 둔다 (NFR-09) */
  snapshot: WorkspaceSnapshot | null
  /** 마지막 읽기 실패. 다음에 읽기에 성공하면 null */
  error: { code: DataErrorCode; message: string } | null
}

/** 'changed' 알림을 이만큼 모아서 Snapshot을 한 번 다시 읽는다 (CONTRACTS_API.md 「6」 "짧게 모아서") */
export const OFFICE_RELOAD_DELAY_MS = 300

interface OfficeState {
  // ---- data (mirrors the DemoDataSource) ----
  status: 'idle' | 'loading' | 'ready' | 'error'
  sourceLabel: string
  canDemo: boolean
  canReset: boolean
  /** Link state for remote sources (null for local ones). */
  connection: ConnectionStatus | null
  projects: Record<Id, Project>
  members: Record<Id, Member>
  tasks: Record<Id, Task>
  /** Ongoing meeting (if any) + recent ended ones. Use ongoingMeeting() to find the live one. */
  meetings: Record<Id, Meeting>
  /** Newest last, capped at 100. */
  activity: Activity[]

  // ---- v1 사무실 (WorkspaceSnapshot) — 위 데모 칸과 따로 둔다. 화면이 v1으로 옮겨 가면 데모 칸을 지운다 ----
  /** 지금 연 사무실. null = 열지 않음 */
  office: OfficeView | null
  /**
   * 사무실을 열어 Snapshot을 읽고 변경 알림을 구독한다. 이미 연 사무실이 있으면 닫고 연다.
   * 어느 사무실을 열지는 진입 흐름(로그인 · 사무실 고르기 — #64 · #68)이 정해 부른다.
   */
  openOffice: (source: DataSource, workspaceId: Id) => Promise<void>
  /**
   * 진입 흐름이 생기기 전의 임시 진입(#102 T5-c-1) — 들어갈 수 있는 사무실 목록에서 pickWorkspace로 골라 연다.
   * 이미 연 사무실이 있거나, 목록을 읽지 못했거나(로그인 전 등), 열 사무실이 없으면 열지 않는다(상단 바는 데모 지표 그대로).
   */
  openDefaultOffice: (source: DataSource, preferredId?: Id | null) => Promise<void>
  /** 구독을 끊고 office를 비운다 */
  closeOffice: () => void
  /**
   * 팀 설정을 바꾼다(PUT W/settings — R2만). 성공하면 snapshot.settings를 응답으로 바꾸고 true,
   * 실패하면 마지막 값을 그대로 두고 사유를 알림으로 보인 뒤 false.
   */
  updateOfficeSettings: (settings: TeamSettings) => Promise<boolean>
  /**
   * PR 추천 · 비추천 평가(PUT evaluations/mine — #19 · #20). 성공하면 snapshot의 그 PR currentRound를 응답으로 바꾸고 회차를 돌려준다.
   * 실패하면 사유를 알림으로 보이고 null. 회차가 바뀌었거나 PR이 닫혔으면(conflict) Snapshot을 다시 읽는다.
   */
  evaluateSubmission: (submissionId: Id, request: EvaluateRequest) => Promise<EvaluationRoundDto | null>
  /** PR의 평가 회차 전부(GET rounds — 현재 회차가 처음). 실패하면 알림 후 null */
  loadRounds: (submissionId: Id) => Promise<EvaluationRoundDto[] | null>

  // ---- 회의 · 안건 · 작업 마감 (#102 T5-c-2 — C의 회의 대화상자 · 일정판이 부른다) ----
  // 모두: 사무실이 없으면 보내지 않고 null(false). 성공하면 응답을 snapshot에 바로 반영하고 결과를 돌려준다.
  // 실패하면 사유를 알림으로 보이고 null(false). conflict(이미 진행 중 · 이미 결정됨 등)면 Snapshot을 다시 읽는다.
  // 이름이 데모 액션(startMeeting · endMeeting · setAgenda …)과 겹치지 않게 했다 — 데모 코드를 지울 때 정리한다.
  /** POST W/meetings — 참석자는 비어도 됨 */
  startOfficeMeeting: (attendeeMemberIds: Id[]) => Promise<MeetingDto | null>
  /** POST W/meetings/{id}/end — 회의록 0~5000자(null 가능) */
  endOfficeMeeting: (meetingId: Id, notes: string | null) => Promise<MeetingDto | null>
  /** POST W/agenda-items — 이슈 · PR · 배운 점 · 기타 안건 올리기 */
  raiseAgendaItem: (request: AgendaItemCreateRequest) => Promise<AgendaItemDto | null>
  /** POST W/agenda-items/{id}/withdraw — 올린 사람만, 결정 전만 */
  withdrawAgendaItem: (agendaItemId: Id) => Promise<AgendaItemDto | null>
  /** POST W/agenda-items/{id}/decision — 결론 · 배운 점 · PR 결정 · 후속 담당 */
  recordAgendaDecision: (agendaItemId: Id, request: DecisionRequest) => Promise<AgendaItemDto | null>
  /** PUT W/tasks/{id}/due-date — R2 또는 그 이슈 담당자 */
  setTaskDueDate: (taskId: Id, dueDate: LocalDate) => Promise<boolean>
  /** DELETE W/tasks/{id}/due-date */
  clearTaskDueDate: (taskId: Id) => Promise<boolean>
  /**
   * v1 사무실에서 고른 이슈 · PR · 팀원 — 상세 서랍이 연다 (#102 T5-c-2).
   * 데모 selection과 ID가 겹칠 수 있어 따로 둔다. 한쪽을 고르면 다른 쪽은 비운다. Snapshot에서 사라지면 null.
   */
  officeSelection: OfficeSelection | null
  selectInOffice: (s: OfficeSelection | null) => void

  // ---- view state ----
  selection: Selection | null
  select: (s: Selection | null) => void
  /** Hovered thing in either the 3D view or the panel; both highlight it. */
  hover: Selection | null
  setHover: (s: Selection | null) => void
  filters: Filters
  setFilters: (patch: Partial<Filters>) => void
  clearFilters: () => void
  overlay: Overlay
  setOverlay: (o: Overlay) => void
  panelView: PanelView
  setPanelView: (v: PanelView) => void
  dialog: Dialog | null
  openDialog: (d: Dialog | null) => void
  /** Camera fly-to request. Scene resolves the target's position, then clears it. */
  focus: { target: Selection; key: number } | null
  focusOn: (target: Selection) => void
  clearFocus: () => void
  demoMode: boolean
  setDemoMode: (on: boolean) => void

  // ---- drag & drop (3D ↔ panel) ----
  drag: { taskId: Id; from: 'scene' | 'panel' } | null
  dropTarget: DropTarget | null
  startDrag: (taskId: Id, from: 'scene' | 'panel') => void
  setDropTarget: (t: DropTarget | null) => void
  /** Apply the drop (if any) and clear drag state. Called on pointerup anywhere. */
  endDrag: () => void
  cancelDrag: () => void

  toasts: Toast[]
  toast: (level: Toast['level'], text: string) => void
  dismissToast: (id: number) => void

  /**
   * Screen-space margins (CSS px) covered by HUD panels. The UI reports them; the scene
   * frames the office inside the remaining area (e.g. via camera.setViewOffset).
   */
  viewInsets: { top: number; right: number; bottom: number; left: number }
  setViewInsets: (v: OfficeState['viewInsets']) => void

  // ---- actions ----
  // Mutations resolve to true on success, false on failure (a toast was already shown).
  init: (source: DemoDataSource) => Promise<void>
  createTask: (input: TaskInput) => Promise<Task | null>
  updateTask: (id: Id, patch: TaskPatch) => Promise<boolean>
  deleteTask: (id: Id) => Promise<boolean>
  /** Assign to a member (top of their stack) or null (back to the backlog shelf). */
  assignTask: (taskId: Id, memberId: Id | null) => Promise<boolean>
  moveTask: (taskId: Id, status: TaskStatus) => Promise<boolean>
  createMember: (input: MemberInput) => Promise<Member | null>
  updateMember: (id: Id, patch: MemberPatch) => Promise<boolean>
  deleteMember: (id: Id, reassign: Reassign) => Promise<boolean>
  /** Only available when canReset. */
  resetData: () => Promise<boolean>
  /** Put a task on / take it off the next meeting's agenda. */
  setAgenda: (taskId: Id, on: boolean) => Promise<boolean>
  startMeeting: (input: MeetingStart) => Promise<Meeting | null>
  endMeeting: (id: Id, result: MeetingEnd) => Promise<boolean>
}

/** The meeting currently in progress, if any. */
export function ongoingMeeting(meetings: Record<Id, Meeting>): Meeting | null {
  for (const m of Object.values(meetings)) if (m.status === 'ongoing') return m
  return null
}

/**
 * 진입 흐름(#64 · #68)이 생기기 전에 열 사무실 (#102 T5-c-1).
 * preferredId가 목록에 있으면 그것, 아니면 GitHub 팀 사무실 중 첫째(목록은 displayName 순), 없으면 첫째. 목록이 비면 null.
 */
export function pickWorkspace(list: readonly WorkspaceListItem[], preferredId: Id | null = null): Id | null {
  const preferred = preferredId === null ? undefined : list.find((w) => w.id === preferredId)
  return (preferred ?? list.find((w) => w.kind === 'github') ?? list[0])?.id ?? null
}

let source: DemoDataSource | null = null
let unsubscribe: (() => void) | null = null
let toastSeq = 1

// v1 사무실 연결. officeGen은 사무실을 열고 닫을 때마다 늘어서, 그 전 사무실의 늦은 응답 · 알림을 버린다.
let officeSource: DataSource | null = null
let officeUnsubscribe: (() => void) | null = null
let officeReloadTimer: ReturnType<typeof setTimeout> | null = null
let officeGen = 0
/** Snapshot 읽기마다 늘어난다. 마지막에 보낸 읽기의 응답만 반영한다(겹친 읽기의 늦은 옛 응답을 버린다) */
let officeLoadSeq = 0
/** 마지막 읽기가 끝나지 않았는가 */
let officeLoadPending = false
/** 마지막 읽기 중에 온 sync 알림 — 응답 위에 다시 얹는다(알림이 그 응답보다 새 값이라고 본다) */
let syncDuringLoad: SyncStatus | null = null

const DEMO_PREF_KEY = 'office-dashboard:demo'
const readPref = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const writePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // Private mode / blocked storage: the preference just isn't remembered.
  }
}

/** Patch that moves a task to the top of `memberId`'s stack (or the backlog shelf for null). */
function assignPatch(tasks: Record<Id, Task>, t: Task, memberId: Id | null): TaskPatch {
  const top = Math.max(0, ...Object.values(tasks).filter((x) => x.assigneeId === memberId).map((x) => x.order)) + 1
  const patch: TaskPatch = { assigneeId: memberId, order: top }
  if (memberId === null && (t.status === 'in_progress' || t.status === 'review')) patch.status = 'todo'
  return patch
}

/** id가 같은 것을 바꾸고, 없으면 뒤에 붙인다 */
const upsert = <T extends { id: Id }>(list: readonly T[], item: T): T[] => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item])
const byId = <T extends { id: Id }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x])) as Record<Id, T>
const isNotFound = (e: unknown) => e instanceof DataError && e.code === 'not_found'
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : '요청을 처리하지 못했어요')
const without = <T>(rec: Record<Id, T>, id: Id) => {
  const next = { ...rec }
  delete next[id]
  return next
}

export const useOffice = create<OfficeState>((set, get) => {
  const fail = (e: unknown) => get().toast('bad', errText(e))

  const apply = (c: DemoChange) => {
    const s = get()
    switch (c.type) {
      case 'task_upsert':
        set({ tasks: { ...s.tasks, [c.task.id]: c.task } })
        break
      case 'task_delete':
        if (s.tasks[c.id]) set({ tasks: without(s.tasks, c.id) })
        if (s.selection?.kind === 'task' && s.selection.id === c.id) set({ selection: null })
        break
      case 'member_upsert':
        set({ members: { ...s.members, [c.member.id]: c.member } })
        break
      case 'member_delete':
        if (s.members[c.id]) set({ members: without(s.members, c.id) })
        if (s.selection?.kind === 'member' && s.selection.id === c.id) set({ selection: null })
        if (s.filters.assigneeIds.includes(c.id)) {
          set({ filters: { ...s.filters, assigneeIds: s.filters.assigneeIds.filter((x) => x !== c.id) } })
        }
        break
      case 'project_upsert':
        set({ projects: { ...s.projects, [c.project.id]: c.project } })
        break
      case 'meeting_upsert':
        set({ meetings: { ...s.meetings, [c.meeting.id]: c.meeting } })
        break
      case 'activity':
        if (!s.activity.some((a) => a.id === c.activity.id)) set({ activity: [...s.activity, c.activity].slice(-100) })
        break
      case 'snapshot':
        replaceWorkspace(c.workspace)
        break
      case 'connection':
        set({ connection: c.status })
        break
      case 'demo':
        set({ demoMode: c.on })
        break
    }
  }

  // ---- v1 사무실 ----

  const toOfficeError = (e: unknown): OfficeView['error'] =>
    e instanceof DataError ? { code: e.code, message: e.message } : { code: 'unavailable', message: errText(e) }

  /** Snapshot을 (다시) 읽는다. 실패해도 마지막 snapshot은 지우지 않는다. */
  const loadOffice = async (gen: number) => {
    const src = officeSource
    const office = get().office
    if (!src || !office || gen !== officeGen) return
    const seq = ++officeLoadSeq
    officeLoadPending = true
    syncDuringLoad = null
    const isLatest = () => gen === officeGen && seq === officeLoadSeq
    try {
      let snapshot = await src.load(office.workspaceId)
      if (!isLatest()) return
      if (syncDuringLoad) snapshot = { ...snapshot, sync: syncDuringLoad }
      officeLoadPending = false
      syncDuringLoad = null
      const current = get().office
      // 고른 것이 새 Snapshot에서 사라졌으면(동기화로 삭제 · 팀원 제외 등) 상세를 닫는다
      if (current) set({ office: { ...current, status: 'ready', snapshot, error: null }, officeSelection: aliveInOffice(snapshot, get().officeSelection) })
    } catch (e) {
      if (!isLatest()) return
      officeLoadPending = false
      syncDuringLoad = null
      const current = get().office
      if (current) set({ office: { ...current, status: current.snapshot ? 'ready' : 'error', error: toOfficeError(e) } })
    }
  }

  /**
   * v1 사무실 쓰기 한 번. 사무실이 없으면 보내지 않고 null. 성공하면 patch로 snapshot을 바로 고친다(그 사이 사무실을
   * 닫거나 바꿨으면 버린다). 실패하면 알림 후 null — conflict면 지금 값을 다시 읽어 화면을 맞춘다.
   */
  const officeWrite = async <T>(run: (src: DataSource, workspaceId: Id) => Promise<T>, patch: (snapshot: WorkspaceSnapshot, result: T) => WorkspaceSnapshot): Promise<T | null> => {
    const src = officeSource
    const office = get().office
    if (!src || !office) return null
    const gen = officeGen
    try {
      const result = await run(src, office.workspaceId)
      const current = get().office
      if (gen === officeGen && current?.snapshot) set({ office: { ...current, snapshot: patch(current.snapshot, result) } })
      return result
    } catch (e) {
      fail(e)
      if (e instanceof DataError && e.code === 'conflict' && gen === officeGen) void loadOffice(gen)
      return null
    }
  }

  const scheduleOfficeReload = (gen: number) => {
    if (officeReloadTimer) clearTimeout(officeReloadTimer)
    officeReloadTimer = setTimeout(() => {
      officeReloadTimer = null
      void loadOffice(gen)
    }, OFFICE_RELOAD_DELAY_MS)
  }

  const applyOfficeChange = (gen: number, c: Change) => {
    const office = get().office
    if (gen !== officeGen || !office) return
    switch (c.type) {
      case 'sync':
        // 동기화 상태만 바꾸고 나머지는 마지막 데이터 그대로 (실패해도 화면 유지 — NFR-09)
        if (office.snapshot) set({ office: { ...office, snapshot: { ...office.snapshot, sync: c.status } } })
        if (officeLoadPending) syncDuringLoad = c.status
        break
      case 'changed':
        scheduleOfficeReload(gen)
        break
      case 'connection':
        // 다시 연결되면 놓친 알림을 재생하지 않으므로 Snapshot을 다시 읽는다 (CONTRACTS_API.md 「6」)
        if (c.status === 'online') scheduleOfficeReload(gen)
        break
    }
  }

  /** Swap in a whole workspace, dropping view state that points at things that no longer exist. */
  const replaceWorkspace = (ws: Workspace) => {
    const members = byId(ws.members)
    const tasks = byId(ws.tasks)
    const s = get()
    const alive = (x: Selection | null) => (x && (x.kind === 'task' ? tasks[x.id] : members[x.id]) ? x : null)
    set({
      projects: byId(ws.projects),
      members,
      tasks,
      meetings: byId(ws.meetings ?? []),
      activity: ws.activity.slice(-100),
      selection: alive(s.selection),
      hover: alive(s.hover),
      filters: { ...s.filters, assigneeIds: s.filters.assigneeIds.filter((id) => id === 'unassigned' || members[id]) },
    })
  }

  return {
    status: 'idle',
    sourceLabel: '',
    canDemo: false,
    canReset: false,
    connection: null,
    projects: {},
    members: {},
    tasks: {},
    meetings: {},
    activity: [],

    office: null,
    openOffice: async (src, workspaceId) => {
      get().closeOffice()
      const gen = officeGen
      officeSource = src
      set({ office: { workspaceId, status: 'loading', snapshot: null, error: null } })
      // 읽기 전에 구독한다 — 읽는 사이에 온 알림을 놓치지 않게
      officeUnsubscribe = src.subscribe(workspaceId, (c) => applyOfficeChange(gen, c))
      await loadOffice(gen)
    },
    openDefaultOffice: async (src, preferredId = null) => {
      let list: WorkspaceListItem[]
      try {
        list = await src.listWorkspaces()
      } catch {
        return
      }
      const id = pickWorkspace(list, preferredId)
      // 목록을 읽는 사이 다른 곳(StrictMode의 두 번째 호출 등)이 이미 열었으면 그대로 둔다
      if (id !== null && !get().office) await get().openOffice(src, id)
    },
    closeOffice: () => {
      officeGen++
      officeUnsubscribe?.()
      officeUnsubscribe = null
      if (officeReloadTimer) clearTimeout(officeReloadTimer)
      officeReloadTimer = null
      officeSource = null
      officeLoadPending = false
      syncDuringLoad = null
      if (get().office || get().officeSelection) set({ office: null, officeSelection: null })
    },
    officeSelection: null,
    selectInOffice: (officeSelection) => set(officeSelection ? { officeSelection, selection: null } : { officeSelection }),
    updateOfficeSettings: async (settings) => {
      const src = officeSource
      const office = get().office
      if (!src || !office) return false
      const gen = officeGen
      try {
        const saved = await src.updateSettings(office.workspaceId, settings)
        // 그 사이 사무실을 닫거나 바꿨으면 버린다
        const current = get().office
        if (gen === officeGen && current?.snapshot) set({ office: { ...current, snapshot: { ...current.snapshot, settings: saved } } })
        return true
      } catch (e) {
        fail(e)
        return false
      }
    },
    evaluateSubmission: async (submissionId, request) => {
      const src = officeSource
      const office = get().office
      if (!src || !office) return null
      const gen = officeGen
      try {
        const round = await src.evaluate(office.workspaceId, submissionId, request)
        // 응답 회차가 그 PR의 현재 회차면 바로 반영한다(changed 알림으로 다시 읽기 전에도 화면이 맞게)
        const current = get().office
        if (gen === officeGen && current?.snapshot) {
          const submissions = current.snapshot.submissions.map((s) => (s.id === submissionId && s.currentRound?.id === round.id ? { ...s, currentRound: round } : s))
          set({ office: { ...current, snapshot: { ...current.snapshot, submissions } } })
        }
        return round
      } catch (e) {
        fail(e)
        // 그 사이 새 회차가 열렸거나 PR이 닫혔다 — 지금 값을 다시 읽어 화면을 맞춘다
        if (e instanceof DataError && e.code === 'conflict' && gen === officeGen) void loadOffice(gen)
        return null
      }
    },
    loadRounds: async (submissionId) => {
      const src = officeSource
      const office = get().office
      if (!src || !office) return null
      try {
        return await src.listRounds(office.workspaceId, submissionId)
      } catch (e) {
        fail(e)
        return null
      }
    },

    // ---- 회의 · 안건 · 작업 마감 (#102 T5-c-2) — 응답을 바로 반영하고, 서버의 changed 알림으로 다시 읽는다 ----
    startOfficeMeeting: (attendeeMemberIds) =>
      officeWrite(
        (src, ws) => src.startMeeting(ws, { attendeeMemberIds }),
        (snap, meeting) => ({ ...snap, meetings: upsert(snap.meetings, meeting) }),
      ),
    endOfficeMeeting: (meetingId, notes) =>
      officeWrite(
        (src, ws) => src.endMeeting(ws, meetingId, { notes }),
        (snap, meeting) => ({ ...snap, meetings: upsert(snap.meetings, meeting) }),
      ),
    raiseAgendaItem: (request) =>
      officeWrite(
        (src, ws) => src.createAgendaItem(ws, request),
        (snap, item) => ({ ...snap, agendaItems: upsert(snap.agendaItems, item) }),
      ),
    withdrawAgendaItem: (agendaItemId) =>
      officeWrite(
        (src, ws) => src.withdrawAgendaItem(ws, agendaItemId),
        (snap, item) => ({ ...snap, agendaItems: upsert(snap.agendaItems, item) }),
      ),
    recordAgendaDecision: (agendaItemId, request) =>
      officeWrite(
        (src, ws) => src.recordDecision(ws, agendaItemId, request),
        (snap, item) => ({ ...snap, agendaItems: upsert(snap.agendaItems, item) }),
      ),
    setTaskDueDate: async (taskId, dueDate) =>
      (await officeWrite(
        (src, ws) => src.setDueDate(ws, taskId, { dueDate }),
        (snap, saved) => ({ ...snap, tasks: snap.tasks.map((t) => (t.id === saved.taskId ? { ...t, dueDate: saved.dueDate } : t)) }),
      )) !== null,
    clearTaskDueDate: async (taskId) =>
      (await officeWrite(
        async (src, ws) => {
          await src.clearDueDate(ws, taskId)
          return true as const
        },
        (snap) => ({ ...snap, tasks: snap.tasks.map((t) => (t.id === taskId ? { ...t, dueDate: null } : t)) }),
      )) !== null,

    selection: null,
    // 데모 쪽을 고르면 v1 상세는 닫는다(상세 서랍은 하나)
    select: (selection) => set(selection ? { selection, officeSelection: null } : { selection }),
    hover: null,
    setHover: (hover) => {
      const cur = get().hover
      if (cur === hover || (cur && hover && cur.kind === hover.kind && cur.id === hover.id)) return
      set({ hover })
    },
    filters: EMPTY_FILTERS,
    setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
    clearFilters: () => set({ filters: EMPTY_FILTERS }),
    overlay: 'none',
    setOverlay: (overlay) => set({ overlay }),
    panelView: 'kanban',
    setPanelView: (panelView) => set({ panelView }),
    dialog: null,
    openDialog: (dialog) => set({ dialog }),
    focus: null,
    focusOn: (target) => set({ focus: { target, key: Date.now() } }),
    clearFocus: () => set({ focus: null }),
    demoMode: false,
    setDemoMode: (on) => {
      const enabled = on && !!source?.setDemoMode
      if (source?.getDemoMode) {
        // Shared demo (server): the user's toggle is always a real change; the source reports the
        // actual state back with a 'demo' change if it differs (e.g. the request failed).
        source.setDemoMode?.(enabled, 'user')
      } else {
        const busy = get().dialog !== null || get().drag !== null
        if (enabled && busy) source?.setDemoMode?.(false, 'pause')
        else source?.setDemoMode?.(enabled, 'user')
        writePref(DEMO_PREF_KEY, enabled ? '1' : '0')
      }
      set({ demoMode: enabled })
    },

    viewInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    setViewInsets: (v) => {
      const cur = get().viewInsets
      if (cur.top === v.top && cur.right === v.right && cur.bottom === v.bottom && cur.left === v.left) return
      set({ viewInsets: v })
    },

    drag: null,
    dropTarget: null,
    startDrag: (taskId, from) => set({ drag: { taskId, from }, dropTarget: null }),
    setDropTarget: (t) => {
      const cur = get().dropTarget
      if (JSON.stringify(cur) === JSON.stringify(t)) return
      set({ dropTarget: t })
    },
    endDrag: () => {
      const { drag, dropTarget } = get()
      set({ drag: null, dropTarget: null })
      if (!drag || !dropTarget) return
      const { tasks } = get()
      const t = tasks[drag.taskId]
      if (!t) return
      // One drop = one request. A box dragged off the meeting table (3D) to a person or the shelf
      // also leaves the agenda; reassigning from the panel keeps it on the agenda.
      const offTable: TaskPatch = drag.from === 'scene' && t.onAgenda ? { onAgenda: false } : {}
      switch (dropTarget.kind) {
        case 'member':
          if (t.assigneeId !== dropTarget.id) void get().updateTask(t.id, { ...assignPatch(tasks, t, dropTarget.id), ...offTable })
          else if (offTable.onAgenda === false) void get().updateTask(t.id, offTable)
          break
        case 'backlog':
          if (t.assigneeId !== null) void get().updateTask(t.id, { ...assignPatch(tasks, t, null), ...offTable })
          else if (offTable.onAgenda === false) void get().updateTask(t.id, offTable)
          break
        case 'status':
          void get().moveTask(drag.taskId, dropTarget.status)
          break
        case 'agenda':
          void get().setAgenda(drag.taskId, true)
          break
      }
    },
    cancelDrag: () => set({ drag: null, dropTarget: null }),

    toasts: [],
    toast: (level, text) => {
      const id = toastSeq++
      set({ toasts: [...get().toasts.slice(-3), { id, level, text }] })
      setTimeout(() => get().dismissToast(id), 3500)
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    init: async (src) => {
      if (src === source) return
      unsubscribe?.()
      unsubscribe = null
      // Stop a local demo we were driving; never switch off a shared (server) demo for everyone.
      if (source && !source.getDemoMode) source.setDemoMode?.(false, 'user')
      source = src
      set({ status: 'loading', sourceLabel: src.label, canDemo: !!src.setDemoMode, canReset: !!src.reset, connection: null })
      try {
        // A remote source may not be up yet: keep retrying while it's unreachable.
        let ws: Workspace | null = null
        for (let delay = 1000; !ws; delay = Math.min(delay * 2, 10_000)) {
          try {
            ws = await src.load()
          } catch (e) {
            if (!(e instanceof DataError && e.code === 'unavailable')) throw e
            if (source !== src) return
            set({ connection: 'offline' })
            await new Promise((r) => setTimeout(r, delay))
            if (source !== src) return
          }
        }
        if (source !== src) return
        set({
          status: 'ready',
          projects: byId(ws.projects),
          members: byId(ws.members),
          tasks: byId(ws.tasks),
          meetings: byId(ws.meetings ?? []),
          activity: ws.activity.slice(-100),
        })
        unsubscribe = src.subscribe(apply)
        if (src.getDemoMode) {
          // Shared demo (e.g. on a server): show its state, don't override it.
          const on = await src.getDemoMode().catch(() => false)
          if (source === src) set({ demoMode: on })
        } else if (src.setDemoMode) {
          // Local demo teammates start on by default; the toggle is remembered per browser.
          get().setDemoMode(readPref(DEMO_PREF_KEY) !== '0')
        }
      } catch (e) {
        set({ status: 'error' })
        fail(e)
      }
    },

    createTask: async (input) => {
      if (!source) return null
      try {
        const task = await source.createTask(input)
        apply({ type: 'task_upsert', task })
        return task
      } catch (e) {
        fail(e)
        return null
      }
    },

    updateTask: async (id, patch) => {
      const prev = get().tasks[id]
      if (!source || !prev) return false
      const optimistic: Task = { ...prev, ...patch, updatedAt: new Date().toISOString() }
      if (patch.status && patch.status !== prev.status) {
        optimistic.completedAt = patch.status === 'done' ? new Date().toISOString() : null
      }
      apply({ type: 'task_upsert', task: optimistic })
      try {
        apply({ type: 'task_upsert', task: await source.updateTask(id, patch) })
        return true
      } catch (e) {
        const cur = get().tasks[id]
        if (isNotFound(e)) {
          apply({ type: 'task_delete', id })
        } else if (cur) {
          // Undo only the fields we changed, and only where nobody changed them since.
          const undo: Partial<Task> = {}
          for (const k of Object.keys(patch) as (keyof TaskPatch)[]) {
            if (cur[k] === optimistic[k]) (undo as Record<string, unknown>)[k] = prev[k]
          }
          if (cur.completedAt === optimistic.completedAt) undo.completedAt = prev.completedAt
          apply({ type: 'task_upsert', task: { ...cur, ...undo } })
        }
        fail(e)
        return false
      }
    },

    deleteTask: async (id) => {
      const prev = get().tasks[id]
      if (!source || !prev) return false
      apply({ type: 'task_delete', id })
      try {
        await source.deleteTask(id)
        return true
      } catch (e) {
        if (!isNotFound(e)) {
          apply({ type: 'task_upsert', task: prev })
          fail(e)
          return false
        }
        return true
      }
    },

    assignTask: async (taskId, memberId) => {
      const { tasks } = get()
      const t = tasks[taskId]
      if (!t) return false
      if (t.assigneeId === memberId) return true
      return get().updateTask(taskId, assignPatch(tasks, t, memberId))
    },

    moveTask: async (taskId, status) => {
      const t = get().tasks[taskId]
      if (!t) return false
      if (t.status === status) return true
      return get().updateTask(taskId, { status })
    },

    createMember: async (input) => {
      if (!source) return null
      try {
        const member = await source.createMember(input)
        apply({ type: 'member_upsert', member })
        return member
      } catch (e) {
        fail(e)
        return null
      }
    },

    updateMember: async (id, patch) => {
      const prev = get().members[id]
      if (!source || !prev) return false
      const optimistic = { ...prev, ...patch }
      apply({ type: 'member_upsert', member: optimistic })
      try {
        apply({ type: 'member_upsert', member: await source.updateMember(id, patch) })
        return true
      } catch (e) {
        if (get().members[id] === optimistic) apply({ type: 'member_upsert', member: prev })
        fail(e)
        return false
      }
    },

    deleteMember: async (id, reassign) => {
      if (!source || !get().members[id]) return false
      try {
        // Not optimistic: the source moves tasks and pushes the resulting changes.
        await source.deleteMember(id, reassign)
        apply({ type: 'member_delete', id })
        return true
      } catch (e) {
        fail(e)
        return false
      }
    },

    resetData: async () => {
      if (!source?.reset) return false
      try {
        const ws = await source.reset()
        replaceWorkspace(ws)
        set({
          selection: null,
          hover: null,
          filters: EMPTY_FILTERS,
          dialog: null,
          drag: null,
          dropTarget: null,
        })
        return true
      } catch (e) {
        fail(e)
        return false
      }
    },

    setAgenda: async (taskId, on) => {
      const t = get().tasks[taskId]
      if (!t) return false
      if (t.onAgenda === on) return true
      return get().updateTask(taskId, { onAgenda: on })
    },

    startMeeting: async (input) => {
      if (!source) return null
      try {
        // Not optimistic: the source flips attendee presence and pushes those changes.
        const meeting = await source.startMeeting(input)
        apply({ type: 'meeting_upsert', meeting })
        return meeting
      } catch (e) {
        fail(e)
        return null
      }
    },

    endMeeting: async (id, result) => {
      if (!source) return false
      try {
        const meeting = await source.endMeeting(id, result)
        apply({ type: 'meeting_upsert', meeting })
        return true
      } catch (e) {
        fail(e)
        return false
      }
    },
  }
})

// Local demo teammates pause while the user is in the middle of something (dialog open or
// dragging), so simulated changes never race a user's edit. A shared server demo ignores 'pause';
// there the server's manager-touch window keeps the bot off what the user just edited.
useOffice.subscribe((s, prev) => {
  const busy = s.dialog !== null || s.drag !== null
  const wasBusy = prev.dialog !== null || prev.drag !== null
  if (busy === wasBusy || !s.demoMode) return
  source?.setDemoMode?.(!busy, 'pause')
})
