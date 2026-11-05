// 앱과 데이터 사이의 유일한 문. 소유: D (프론트 HUD · 데이터).
// 구현: mock(src/data/mock — 브라우저 seed + localStorage) · api(src/data/api — Spring /api/**).
import type {
  AgendaItemCreateRequest,
  AgendaItemDto,
  Change,
  DecisionRequest,
  EndMeetingRequest,
  MeetingDto,
  StartMeetingRequest,
  TaskDueDateDto,
  TaskDueDateRequest,
  DemoChange,
  ErrorCode,
  EvaluateRequest,
  EvaluationRoundDto,
  Id,
  LoginOptions,
  MeResponse,
  Meeting,
  MeetingEnd,
  MeetingStart,
  Member,
  MemberInput,
  MemberPatch,
  OpenWorkspaceRequest,
  Reassign,
  RepositoryChoiceResponse,
  ReviewLoginRequest,
  SyncStatus,
  Task,
  TeamSettings,
  TaskInput,
  TaskPatch,
  Workspace,
  WorkspaceListItem,
  WorkspaceSnapshot,
  WorkspaceSummary,
} from './types'

/**
 * v1 DataSource — 메서드는 API 엔드포인트와 1:1이다(CONTRACTS_API.md 「0」 DataSource 열, CONTRACTS.md 「8」).
 * 인자 순서는 (workspaceId, 경로의 다른 ID…, 요청 DTO), 반환은 응답 DTO 그대로(204는 void).
 * 실패는 DataError(message, code)로 던진다.
 *
 * P0 메서드(#8 T5-a)에 기능 Issue마다 그 PR에서 더한다(T5-b) — 팀 설정(#38) · PR 평가(#19 · #20) · 회의 · 안건 · 작업 마감(#102).
 */
export interface DataSource {
  /** 화면에 보일 이름, 예: "로컬 mock 데이터" */
  readonly label: string

  /** GET /api/login-options */
  getLoginOptions(): Promise<LoginOptions>
  /** GET /api/me — 세션이 없으면 unauthorized */
  getMe(): Promise<MeResponse>
  /** POST /api/logout — 세션이 없어도 성공 */
  logout(): Promise<void>
  /**
   * POST /api/review-login — 보안 심사용 ID/PW 로그인(form). 204 + 세션. 값이 틀리면 unauthorized(어느 값인지 말하지 않음),
   * 심사용 로그인이 꺼진 환경이면 not_found. 성공 뒤 getMe로 새 CSRF 쿠키를 받는다
   */
  reviewLogin(request: ReviewLoginRequest): Promise<void>

  /** GET /api/repositories */
  listRepositories(): Promise<RepositoryChoiceResponse>
  /** GET /api/workspaces — displayName 오름차순 */
  listWorkspaces(): Promise<WorkspaceListItem[]>
  /** POST /api/workspaces — 이어서 첫 동기화를 시작한다 */
  openWorkspace(request: OpenWorkspaceRequest): Promise<WorkspaceSummary>

  /** GET W/snapshot */
  load(workspaceId: Id): Promise<WorkspaceSnapshot>
  /** GET W/events (SSE). 구독을 끊는 함수를 돌려준다. */
  subscribe(workspaceId: Id, onChange: (change: Change) => void): () => void

  /** POST W/sync — 202 SyncStatus(state: 'running') */
  requestSync(workspaceId: Id): Promise<SyncStatus>
  /** GET W/sync-status */
  getSyncStatus(workspaceId: Id): Promise<SyncStatus>

  /** GET W/settings */
  getSettings(workspaceId: Id): Promise<TeamSettings>
  /** PUT W/settings — 전체 교체, R2만. 범위 · 날짜 순서가 틀리면 invalid, R2가 아니면 forbidden_role */
  updateSettings(workspaceId: Id, settings: TeamSettings): Promise<TeamSettings>

  /** GET W/submissions/{submissionId}/rounds — 회차 번호 내림차순(현재 회차가 처음) */
  listRounds(workspaceId: Id, submissionId: Id): Promise<EvaluationRoundDto[]>
  /**
   * PUT W/submissions/{submissionId}/evaluations/mine — 내 평가를 만들거나 바꾼다. 응답은 그 회차(myEvaluation 포함).
   * 이유 없음 · 200자 초과 invalid, 작성자 · 강사 forbidden_role, 현재 회차가 아님 · PR이 머지 · 닫힘 conflict
   */
  evaluate(workspaceId: Id, submissionId: Id, request: EvaluateRequest): Promise<EvaluationRoundDto>

  // ---- 「10」 회의 · 안건 (#102 T5-c-2 — C의 회의 대화상자가 쓴다) ----
  /** POST W/meetings — 201 MeetingDto(ongoing). 진행 중 회의가 있으면 conflict, 참석자가 팀원이 아니면 invalid */
  startMeeting(workspaceId: Id, request: StartMeetingRequest): Promise<MeetingDto>
  /** POST W/meetings/{meetingId}/end — 200 MeetingDto(ended). 이미 끝났으면 conflict */
  endMeeting(workspaceId: Id, meetingId: Id, request: EndMeetingRequest): Promise<MeetingDto>
  /** POST W/agenda-items — 201 AgendaItemDto(confirmed). 종류 · 원본이 안 맞으면 invalid, 원본이 없으면 not_found */
  createAgendaItem(workspaceId: Id, request: AgendaItemCreateRequest): Promise<AgendaItemDto>
  /** POST W/agenda-items/{agendaItemId}/withdraw — 올린 사람만(forbidden_role), confirmed가 아니면 conflict */
  withdrawAgendaItem(workspaceId: Id, agendaItemId: Id): Promise<AgendaItemDto>
  /**
   * POST W/agenda-items/{agendaItemId}/decision — 200 AgendaItemDto(discussed). revise_and_reevaluate면 새 평가 회차.
   * 요청이 틀리면 invalid, confirmed가 아니거나 머지 · 닫힌 PR에 revise_and_reevaluate면 conflict
   */
  recordDecision(workspaceId: Id, agendaItemId: Id, request: DecisionRequest): Promise<AgendaItemDto>

  // ---- 「13」 작업 마감 (C의 일정판이 쓴다) ----
  /** PUT W/tasks/{taskId}/due-date — R2 또는 그 이슈 담당자. 아니면 forbidden_role, 날짜 형식 invalid */
  setDueDate(workspaceId: Id, taskId: Id, request: TaskDueDateRequest): Promise<TaskDueDateDto>
  /** DELETE W/tasks/{taskId}/due-date — 204. 마감이 없어도 성공 */
  clearDueDate(workspaceId: Id, taskId: Id): Promise<void>
}

/** CONTRACTS.md 「6」의 8개 에러 코드 전부. */
export type DataErrorCode = ErrorCode

/** DataSource가 거부할 때 이것을 던진다 — 화면은 `message`(한국어)를 보인다. */
export class DataError extends Error {
  code: DataErrorCode
  constructor(message: string, code: DataErrorCode = 'invalid') {
    super(message)
    this.name = 'DataError'
    this.code = code
  }
}

// ============================================================================
// 데모 DataSource — 지금 화면(store)이 쓰는 이전 인터페이스. 화면이 v1으로 옮겨 가면 지운다.
// 계약에 없는 CRUD · 데모 모드 메서드다(CONTRACTS.md 「4」 · 「8」).
// ============================================================================

export interface DemoDataSource {
  /** Human-readable name for the UI, e.g. "로컬 데모 데이터". */
  readonly label: string

  load(): Promise<Workspace>

  createTask(input: TaskInput): Promise<Task>
  updateTask(id: Id, patch: TaskPatch): Promise<Task>
  deleteTask(id: Id): Promise<void>

  createMember(input: MemberInput): Promise<Member>
  updateMember(id: Id, patch: MemberPatch): Promise<Member>
  /** Moves the member's non-done tasks per `reassign`, then removes the member. */
  deleteMember(id: Id, reassign: Reassign): Promise<void>

  /**
   * Starts the (single) team meeting: captures open onAgenda tasks as the agenda and sets every
   * attendee's presence to 'meeting'. Rejects with 'conflict' if a meeting is already ongoing.
   */
  startMeeting(input: MeetingStart): Promise<Meeting>
  /**
   * Ends the ongoing meeting atomically: applies each outcome to its task, clears onAgenda on
   * agenda tasks (except 'keep'), sets attendees back to 'working', stores notes/outcomes.
   */
  endMeeting(id: Id, result: MeetingEnd): Promise<Meeting>

  /**
   * Every change (own calls, demo mode, other users/server) is pushed here, plus one
   * `activity` change per meaningful action. Returns an unsubscribe function.
   */
  subscribe(listener: (change: DemoChange) => void): () => void

  /**
   * Optional: simulated teammates working on their own. Sources without it hide the toggle.
   * reason 'pause' = the store briefly pausing while a dialog/drag is open (a shared server-side
   * demo may ignore it); 'user' = the user flipped the toggle.
   */
  setDemoMode?(on: boolean, reason?: 'user' | 'pause'): void
  /** Optional: where demo state lives in the source (e.g. a shared server), report it on load. */
  getDemoMode?(): Promise<boolean>
  /** Optional: wipe local data back to the seed. */
  reset?(): Promise<Workspace>
}
