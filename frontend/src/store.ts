// App state + actions. OWNER: D.
// 사무실 데이터는 v1 WorkspaceSnapshot(office)이 전부다 — 쓰기는 v1 DataSource 액션이 보내고 응답을 snapshot에 반영한다.
// 데모 모델(DemoDataSource의 작업 · 팀원 · 회의 칸과 액션)은 #102 ④에서 걷어냈다. 남은 view state(selection · hover · focus · drag)는
// 3D(C)가 읽어 #102 ④ 다음 단계에서 같이 정리한다.
import { create } from 'zustand'
import { DataError, type DataErrorCode, type DataSource } from './data/DataSource'
import type { AgendaItemCreateRequest, AgendaItemDto, Change, DecisionRequest, ConnectionStatus, EvaluateRequest, EvaluationRoundDto, HelpCommentDto, HelpRequestCloseRequest, HelpRequestCreateRequest, HelpRequestDetail, HelpRequestSummary, Id, LocalDate, MeetingDto, PageResponse, ReportCreateRequest, ReportLearningRequest, RetroReportDto, RetroReportSummary, StandupDto, StandupPrefill, StandupSaveRequest, SyncStatus, TimelineEntry, TeamSettings, WorkspaceSnapshot } from './data/types'
import { afterComment, toHelpSummary } from './data/rules/help'
import { deckOrderKey, keepDeckOrder, parseDeckOrder, sameDeckOrder, withProgress } from './data/rules/requirements'
import type { RequirementLinkDto } from './data/types'

export type Selection = { kind: 'task'; id: Id } | { kind: 'member'; id: Id }
/** v1 사무실에서 고른 것 — 이슈(task) · PR(submission) · 팀원(member) */
export type OfficeSelection = { kind: 'task' | 'submission' | 'member'; id: Id }

/** 고른 것이 snapshot에 아직 있으면 그대로, 없으면 null */
export function aliveInOffice(snapshot: WorkspaceSnapshot, sel: OfficeSelection | null): OfficeSelection | null {
  if (!sel) return null
  const list = sel.kind === 'task' ? snapshot.tasks : sel.kind === 'submission' ? snapshot.submissions : snapshot.members
  return list.some((x) => x.id === sel.id) ? sel : null
}
export type Dialog =
  | { kind: 'startMeeting' }
  | { kind: 'endMeeting'; meetingId: Id }
  /** v1 사무실의 프로젝트 기간 (#38 — FR-PLAN-01, R2만) */
  | { kind: 'projectPeriod' }
  /** 3D에서 이슈 · PR을 회의실에 놓았을 때 안건 올리기 (#30 · #26 — C의 MeetingDialogs) */
  | { kind: 'raiseAgenda'; source: { type: 'task' | 'submission'; id: Id } }
  /** 요구사항 대기 목록 (#197). linkTaskId가 있으면 그 이슈를 연결할 요구사항 고르기 */
  | { kind: 'requirementWaiting'; linkTaskId: Id | null }

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

/** 이 브라우저에 둔 교환 결과 — 저장소를 읽지 못하면 null(기본 순서) */
function readDeckOrder(workspaceId: Id): Id[] | null {
  try {
    return parseDeckOrder(localStorage.getItem(deckOrderKey(workspaceId)))
  } catch {
    return null
  }
}
function writeDeckOrder(workspaceId: Id, ids: Id[] | null) {
  try {
    if (ids === null) localStorage.removeItem(deckOrderKey(workspaceId))
    else localStorage.setItem(deckOrderKey(workspaceId), JSON.stringify(ids))
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 바뀐다
  }
}

/** 요구사항 연결을 바꾸고 진행 수를 같은 규칙으로 다시 센다 */
const withLinks = (snap: WorkspaceSnapshot, requirementLinks: RequirementLinkDto[]): WorkspaceSnapshot => ({
  ...snap,
  requirementLinks,
  requirements: withProgress(snap.requirements, requirementLinks, snap.tasks),
})

interface OfficeState {
  /** Link state for remote sources (null for local ones). */
  connection: ConnectionStatus | null
  // ---- v1 사무실 (WorkspaceSnapshot) ----
  /** 지금 연 사무실. null = 열지 않음 */
  office: OfficeView | null
  /**
   * 사무실을 열어 Snapshot을 읽고 변경 알림을 구독한다. 이미 연 사무실이 있으면 닫고 연다.
   * 어느 사무실을 열지는 진입 흐름(로그인 · 사무실 고르기 — #64 · #68)이 정해 부른다.
   */
  openOffice: (source: DataSource, workspaceId: Id) => Promise<void>
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

  // ---- 요구사항 연결 (#197 — 「8」, R2만). 3D 판 · 대기 목록에 이슈를 놓으면 부른다. 위와 같이 실패하면 알림 후 null(false) ----
  // 성공하면 snapshot.requirementLinks와 요구사항 진행 수(linkedTaskCount · doneTaskCount)를 같은 규칙(rules/requirements)으로 바로 고친다.
  // 서버의 changed(requirements) 알림이 오면 Snapshot을 다시 읽어 서버 값으로 맞춘다.
  /** POST W/requirement-links — 새 연결이든 이미 있던 연결이든 그 연결을 돌려준다 */
  linkRequirement: (requirementId: Id, taskId: Id) => Promise<RequirementLinkDto | null>
  /** DELETE W/requirement-links/{linkId} */
  unlinkRequirement: (linkId: Id) => Promise<boolean>

  // ---- 요구사항 판 배치 교환 결과 (#197 — CONTRACTS.md 「8」 · 「10」). 3D(SceneModel planRequirementDeck)와 대기 목록이 읽는다 ----
  /**
   * 지금 연 사무실의 교환 결과 — 판에 올린 요구사항 ID 목록. null = 기본 순서(position).
   * 사무실별로 이 브라우저에만 둔다. 버리는 때(active 10개 이하 · 교환한 요구사항이 active가 아님 · 저장소를 읽지 못함)는 store가 null로 바꾼다.
   */
  requirementDeckOrder: Id[] | null
  /** 교환 결과를 바꾼다(null = "기본 순서로"). 쓸 수 없는 목록이면 null로 저장한다 */
  setRequirementDeckOrder: (ids: Id[] | null) => void
  /** 대기 목록을 연다 — 3D 대기 칸을 누르면 인자 없이, 대기 칸에 이슈 상자를 놓으면 그 이슈 ID로(연결할 요구사항 고르기) */
  openRequirementWaiting: (linkTaskId?: Id) => void

  // ---- 도움 요청 (#183 — 「11」). 목록은 Snapshot의 helpRequests. 위와 같이 실패하면 알림 후 null ----
  /** GET W/help-requests/{id} — 상세(코멘트 포함) */
  loadHelpRequest: (helpRequestId: Id) => Promise<HelpRequestDetail | null>
  /** POST W/help-requests — 팀원만 */
  createHelpRequest: (request: HelpRequestCreateRequest) => Promise<HelpRequestSummary | null>
  /** POST W/help-requests/{id}/comments */
  addHelpComment: (helpRequestId: Id, content: string) => Promise<HelpCommentDto | null>
  /** POST W/help-requests/{id}/close — 요청자만. 도움이 된 코멘트(선택) · 배운 점 */
  closeHelpRequest: (helpRequestId: Id, request: HelpRequestCloseRequest) => Promise<HelpRequestDetail | null>
  /** POST W/help-requests/{id}/to-agenda — 요청자만. 직접 전환과 48시간 후보 확정이 같다 */
  convertHelpRequestToAgenda: (helpRequestId: Id, title: string) => Promise<AgendaItemDto | null>
  /** POST W/help-requests/{id}/instructor-request — 요청자만 */
  requestInstructorHelp: (helpRequestId: Id) => Promise<HelpRequestSummary | null>

  // ---- 스탠드업 (#190 — 「12」). Snapshot 밖 — 화면이 날짜로 읽는다. 실패하면 알림 후 null ----
  /** GET W/standups?date= — 그날 쓴 팀원 것 */
  loadStandups: (date: LocalDate) => Promise<StandupDto[] | null>
  /** GET W/standups/{date}/mine/prefill — "어제 한 일" 미리 채우기 재료 */
  loadStandupPrefill: (date: LocalDate) => Promise<StandupPrefill | null>
  /** PUT W/standups/{date}/mine — 팀원만, 오늘 뒤 날짜는 안 됨 */
  saveMyStandup: (date: LocalDate, request: StandupSaveRequest) => Promise<StandupDto | null>

  // ---- 학습 타임라인 · 회고 리포트 (#209 — 「15」). 개인 API라 Snapshot · SSE 밖 — 화면이 열 때 읽는다. 실패하면 알림 후 null ----
  /** GET W/members/{memberId}/timeline — 본인 · 지정된 강사 */
  loadTimeline: (memberId: Id, page?: number, size?: number) => Promise<PageResponse<TimelineEntry> | null>
  /** GET W/members/{memberId}/reports — 본인 · 지정된 강사 */
  loadReports: (memberId: Id) => Promise<RetroReportSummary[] | null>
  /** POST W/members/{memberId}/reports — 본인만 */
  createReport: (memberId: Id, request: ReportCreateRequest) => Promise<RetroReportDto | null>
  /** GET W/members/{memberId}/reports/{reportId} */
  loadReport: (memberId: Id, reportId: Id) => Promise<RetroReportDto | null>
  /** PUT …/reports/{reportId}/learning — 본인만 */
  updateReportLearning: (memberId: Id, reportId: Id, request: ReportLearningRequest) => Promise<RetroReportDto | null>
  /** GET …/reports/{reportId}/markdown — 팀원 이름이 익명화된 마크다운 */
  exportReportMarkdown: (memberId: Id, reportId: Id) => Promise<string | null>
  /**
   * v1 사무실에서 고른 이슈 · PR · 팀원 — 상세 서랍이 연다 (#102 T5-c-2).
   * selection(3D가 아직 읽는 옛 선택 칸)과 따로 둔다. 한쪽을 고르면 다른 쪽은 비운다. Snapshot에서 사라지면 null.
   */
  officeSelection: OfficeSelection | null
  selectInOffice: (s: OfficeSelection | null) => void

  // ---- view state ----
  selection: Selection | null
  select: (s: Selection | null) => void
  /** Hovered thing in either the 3D view or the panel; both highlight it. */
  hover: Selection | null
  setHover: (s: Selection | null) => void
  dialog: Dialog | null
  openDialog: (d: Dialog | null) => void
  /** Camera fly-to request. Scene resolves the target's position, then clears it. */
  focus: { target: Selection; key: number } | null
  focusOn: (target: Selection) => void
  clearFocus: () => void

  // ---- 끌기 상태 — 데모 패널 ↔ 3D 끌어 놓기의 흔적. 지금은 시작하는 곳이 없어 늘 null이다.
  // 3D(CameraRig) · HUD · 단축키가 "끄는 중인가"를 읽어 남겨 둔다(#102 ④ 다음 단계에서 C와 함께 정리)
  drag: { taskId: Id; from: 'scene' | 'panel' } | null
  /** 끌기를 끝낸다 — 어디서든 pointerup */
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

}

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

/** id가 같은 것을 바꾸고, 없으면 뒤에 붙인다 */
const upsert = <T extends { id: Id }>(list: readonly T[], item: T): T[] => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item])
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : '요청을 처리하지 못했어요')

export const useOffice = create<OfficeState>((set, get) => {
  const fail = (e: unknown) => get().toast('bad', errText(e))

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

  /** v1 사무실 읽기 한 번(Snapshot 밖의 데이터). 사무실이 없으면 보내지 않고 null, 실패하면 알림 후 null */
  const officeRead = async <T>(run: (src: DataSource, workspaceId: Id) => Promise<T>): Promise<T | null> => {
    const src = officeSource
    const office = get().office
    if (!src || !office) return null
    try {
      return await run(src, office.workspaceId)
    } catch (e) {
      fail(e)
      return null
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
        // 상단 바 · 오프라인 안내가 읽는 연결 상태. 다시 연결되면 놓친 알림을 재생하지 않으므로 Snapshot을 다시 읽는다
        // (CONTRACTS_API.md 「6」)
        set({ connection: c.status })
        if (c.status === 'online') scheduleOfficeReload(gen)
        break
    }
  }

  return {
    connection: null,

    office: null,
    openOffice: async (src, workspaceId) => {
      get().closeOffice()
      const gen = officeGen
      officeSource = src
      set({ office: { workspaceId, status: 'loading', snapshot: null, error: null }, requirementDeckOrder: readDeckOrder(workspaceId) })
      // 읽기 전에 구독한다 — 읽는 사이에 온 알림을 놓치지 않게
      officeUnsubscribe = src.subscribe(workspaceId, (c) => applyOfficeChange(gen, c))
      await loadOffice(gen)
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
      if (get().office || get().officeSelection) set({ office: null, officeSelection: null, connection: null, requirementDeckOrder: null })
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

    linkRequirement: (requirementId, taskId) =>
      officeWrite(
        (src, ws) => src.linkRequirement(ws, { requirementId, taskId }),
        (snap, link) => withLinks(snap, upsert(snap.requirementLinks, link)),
      ),
    unlinkRequirement: async (linkId) =>
      (await officeWrite(
        async (src, ws) => {
          await src.unlinkRequirement(ws, linkId)
          return true as const
        },
        (snap) => withLinks(
          snap,
          snap.requirementLinks.filter((l) => l.id !== linkId),
        ),
      )) !== null,

    // ---- 도움 요청 (#183) — 응답을 바로 반영하고, 서버의 changed(help_requests) 알림으로 다시 읽는다 ----
    loadHelpRequest: (helpRequestId) => officeRead((src, ws) => src.getHelpRequest(ws, helpRequestId)),
    createHelpRequest: (request) =>
      officeWrite(
        (src, ws) => src.createHelpRequest(ws, request),
        (snap, help) => ({ ...snap, helpRequests: upsert(snap.helpRequests, help) }),
      ),
    addHelpComment: (helpRequestId, content) =>
      officeWrite(
        (src, ws) => src.addHelpComment(ws, helpRequestId, { content }),
        (snap, comment) => ({ ...snap, helpRequests: snap.helpRequests.map((h) => (h.id === helpRequestId ? afterComment(h, comment) : h)) }),
      ),
    closeHelpRequest: (helpRequestId, request) =>
      officeWrite(
        (src, ws) => src.closeHelpRequest(ws, helpRequestId, request),
        (snap, detail) => ({ ...snap, helpRequests: upsert(snap.helpRequests, toHelpSummary(detail)) }),
      ),
    convertHelpRequestToAgenda: (helpRequestId, title) =>
      officeWrite(
        (src, ws) => src.convertHelpRequestToAgenda(ws, helpRequestId, { title }),
        (snap, item) => ({
          ...snap,
          agendaItems: upsert(snap.agendaItems, item),
          helpRequests: snap.helpRequests.map((h) => (h.id === helpRequestId ? { ...h, status: 'on_agenda' as const, isAgendaCandidate: false, agendaItemId: item.id } : h)),
        }),
      ),
    requestInstructorHelp: (helpRequestId) =>
      officeWrite(
        (src, ws) => src.requestInstructorHelp(ws, helpRequestId),
        (snap, help) => ({ ...snap, helpRequests: upsert(snap.helpRequests, help) }),
      ),

    // ---- 스탠드업 (#190) — Snapshot에 없다. 화면이 날짜로 읽고, 저장 뒤 다시 읽는다 ----
    loadStandups: (date) => officeRead((src, ws) => src.listStandups(ws, date)),
    loadStandupPrefill: (date) => officeRead((src, ws) => src.getStandupPrefill(ws, date)),
    saveMyStandup: (date, request) =>
      officeWrite(
        (src, ws) => src.saveMyStandup(ws, date, request),
        (snap) => snap,
      ),

    // ---- 학습 타임라인 · 회고 리포트 (#209) — Snapshot에 없다. 화면이 열 때 읽고, 쓴 뒤 응답으로 바꾼다 ----
    loadTimeline: (memberId, page, size) => officeRead((src, ws) => src.getTimeline(ws, memberId, page, size)),
    loadReports: (memberId) => officeRead((src, ws) => src.listReports(ws, memberId)),
    createReport: (memberId, request) =>
      officeWrite(
        (src, ws) => src.createReport(ws, memberId, request),
        (snap) => snap,
      ),
    loadReport: (memberId, reportId) => officeRead((src, ws) => src.getReport(ws, memberId, reportId)),
    updateReportLearning: (memberId, reportId, request) =>
      officeWrite(
        (src, ws) => src.updateReportLearning(ws, memberId, reportId, request),
        (snap) => snap,
      ),
    exportReportMarkdown: (memberId, reportId) => officeRead((src, ws) => src.exportReportMarkdown(ws, memberId, reportId)),

    selection: null,
    // 옛 선택 칸을 고르면 v1 상세는 닫는다(상세 서랍은 하나)
    select: (selection) => set(selection ? { selection, officeSelection: null } : { selection }),
    hover: null,
    setHover: (hover) => {
      const cur = get().hover
      if (cur === hover || (cur && hover && cur.kind === hover.kind && cur.id === hover.id)) return
      set({ hover })
    },
    dialog: null,
    openDialog: (dialog) => set({ dialog }),
    focus: null,
    focusOn: (target) => set({ focus: { target, key: Date.now() } }),
    clearFocus: () => set({ focus: null }),
    viewInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    setViewInsets: (v) => {
      const cur = get().viewInsets
      if (cur.top === v.top && cur.right === v.right && cur.bottom === v.bottom && cur.left === v.left) return
      set({ viewInsets: v })
    },

    drag: null,
    // 끌어 놓기는 데모 모델의 작업 배정 · 상태 이동이었다 — v1에는 놓을 곳이 없어 비우기만 한다
    endDrag: () => set({ drag: null }),
    cancelDrag: () => set({ drag: null }),

    toasts: [],
    toast: (level, text) => {
      const id = toastSeq++
      set({ toasts: [...get().toasts.slice(-3), { id, level, text }] })
      setTimeout(() => get().dismissToast(id), 3500)
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    requirementDeckOrder: null,
    setRequirementDeckOrder: (ids) => {
      const office = get().office
      if (!office) return
      // Snapshot을 받기 전이면 목록 그대로 두고, 받은 뒤 아래 구독이 버리는 규칙을 적용한다
      const next = ids === null ? null : office.snapshot ? keepDeckOrder(ids, office.snapshot.requirements) : [...new Set(ids)]
      writeDeckOrder(office.workspaceId, next)
      if (!sameDeckOrder(next, get().requirementDeckOrder)) set({ requirementDeckOrder: next })
    },
    openRequirementWaiting: (linkTaskId) => set({ dialog: { kind: 'requirementWaiting', linkTaskId: linkTaskId ?? null } }),
  }
})

// 교환 결과를 버리는 때(「10」) — 사무실의 요구사항이 바뀔 때마다(재동기화로 missing · needs_review가 됨, active가 10개 이하로 줄어듦) 다시 본다
useOffice.subscribe((s, prev) => {
  const office = s.office
  const order = s.requirementDeckOrder
  if (!office?.snapshot || order === null) return
  if (office.snapshot.requirements === prev.office?.snapshot?.requirements && order === prev.requirementDeckOrder) return
  const kept = keepDeckOrder(order, office.snapshot.requirements)
  if (sameDeckOrder(kept, order)) return
  writeDeckOrder(office.workspaceId, kept)
  useOffice.setState({ requirementDeckOrder: kept })
})
