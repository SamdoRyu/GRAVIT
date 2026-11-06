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
  RequirementLinkCreateRequest,
  RequirementLinkDto,
  ErrorCode,
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
  InstructorFeedbackCreateRequest,
  InstructorFeedbackDto,
  LocalDate,
  StandupDto,
  StandupPrefill,
  StandupSaveRequest,
  LoginOptions,
  MeResponse,
  OpenWorkspaceRequest,
  PageResponse,
  ReportCreateRequest,
  ReportLearningRequest,
  RetroReportDto,
  RetroReportSummary,
  TimelineEntry,
  RepositoryChoiceResponse,
  ReviewLoginRequest,
  SyncStatus,
  TeamSettings,
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
  /**
   * POST W/agenda-items/{agendaItemId}/feedback-request — 200 AgendaItemDto(feedbackRequested: true). 이미 켜져 있으면 그대로 (#212).
   * 팀원만(강사 forbidden_role), 결정 기록 전(discussed가 아님)이면 conflict
   */
  requestDecisionFeedback(workspaceId: Id, agendaItemId: Id): Promise<AgendaItemDto>
  /**
   * POST W/agenda-items/{agendaItemId}/instructor-feedback — 201 InstructorFeedbackDto. 안건 · 결정 상태는 바뀌지 않는다 (#212).
   * 지정된 강사만, 피드백 요청이 켜진 결정 기록에만(아니면 forbidden_role). body 1~2000자(공백만 invalid)
   */
  addInstructorFeedback(workspaceId: Id, agendaItemId: Id, request: InstructorFeedbackCreateRequest): Promise<InstructorFeedbackDto>

  // ---- 「11」 도움 요청 (#183 — 목록은 Snapshot의 helpRequests) ----
  /** GET W/help-requests/{helpRequestId} — 코멘트(createdAt 오름차순) · 도움이 된 코멘트 · 배운 점 */
  getHelpRequest(workspaceId: Id, helpRequestId: Id): Promise<HelpRequestDetail>
  /** POST W/help-requests — 201(open). 팀원만(강사 forbidden_role), fromStandupId가 본인 것이 아니면 forbidden_role */
  createHelpRequest(workspaceId: Id, request: HelpRequestCreateRequest): Promise<HelpRequestSummary>
  /**
   * POST W/help-requests/{id}/comments — 201. 요청자가 아닌 팀원의 첫 코멘트면 open → discussing. 강사는 "강사에게 요청"이
   * 켜진 글에만(아니면 forbidden_role), resolved · ended면 conflict
   */
  addHelpComment(workspaceId: Id, helpRequestId: Id, request: HelpCommentCreateRequest): Promise<HelpCommentDto>
  /** POST W/help-requests/{id}/close — 요청자만(forbidden_role), open · discussing만(conflict), 도움이 된 코멘트가 틀리면 invalid */
  closeHelpRequest(workspaceId: Id, helpRequestId: Id, request: HelpRequestCloseRequest): Promise<HelpRequestDetail>
  /** POST W/help-requests/{id}/to-agenda — 201 AgendaItemDto(help_request). 요청자만, open · discussing만. 도움 요청은 on_agenda */
  convertHelpRequestToAgenda(workspaceId: Id, helpRequestId: Id, request: HelpRequestToAgendaRequest): Promise<AgendaItemDto>
  /** POST W/help-requests/{id}/instructor-request — 요청자만. 이미 켜져 있으면 그대로 */
  requestInstructorHelp(workspaceId: Id, helpRequestId: Id): Promise<HelpRequestSummary>

  // ---- 「12」 스탠드업 (#190 — 날짜는 한국 시간 LocalDate) ----
  /** GET W/standups?date= — 그날 쓴 팀원 것, memberId 순. 날짜 형식이 틀리면 invalid */
  listStandups(workspaceId: Id, date: LocalDate): Promise<StandupDto[]>
  /** GET W/standups/{date}/mine/prefill — {date}의 전날 내 GitHub 활동. 강사 forbidden_role */
  getStandupPrefill(workspaceId: Id, date: LocalDate): Promise<StandupPrefill>
  /** PUT W/standups/{date}/mine — 있으면 고치고 없으면 만든다. 오늘 뒤 날짜 · 2000자 초과 invalid, 강사 forbidden_role */
  saveMyStandup(workspaceId: Id, date: LocalDate, request: StandupSaveRequest): Promise<StandupDto>

  // ---- 「8」 요구사항 연결 (#197 — 요구사항 목록 · 연결은 Snapshot의 requirements · requirementLinks) ----
  /**
   * POST W/requirement-links — 201 새 연결, 같은 연결이 이미 있으면 200과 기존 연결(요구사항 상태와 상관없이).
   * R2만(forbidden_role), 요구사항 · 이슈가 없거나 다른 사무실 것 not_found, 요구사항이 active가 아님 conflict
   */
  linkRequirement(workspaceId: Id, request: RequirementLinkCreateRequest): Promise<RequirementLinkDto>
  /** DELETE W/requirement-links/{linkId} — 204. R2만(forbidden_role) */
  unlinkRequirement(workspaceId: Id, linkId: Id): Promise<void>

  // ---- 「15」 개인 API — 학습 타임라인 · 회고 리포트 (#209). Snapshot · SSE에 실리지 않는다 — 화면을 열 때 읽는다 ----
  // 경로 팀원(빠진 팀원 포함)이 아니면 not_found, 읽기는 본인 · 지정된 강사, 쓰기는 본인만(아니면 forbidden_role)
  /** GET W/members/{memberId}/timeline?page=&size= — occurredAt 내림차순. page 0부터, size 1~100(기본 20), 범위 밖 invalid */
  getTimeline(workspaceId: Id, memberId: Id, page?: number, size?: number): Promise<PageResponse<TimelineEntry>>
  /** GET W/members/{memberId}/reports — createdAt 내림차순 */
  listReports(workspaceId: Id, memberId: Id): Promise<RetroReportSummary[]>
  /** POST W/members/{memberId}/reports — 201. 본인만, kind는 final · midterm(아니면 invalid) */
  createReport(workspaceId: Id, memberId: Id, request: ReportCreateRequest): Promise<RetroReportDto>
  /** GET W/members/{memberId}/reports/{reportId} — 계산 칸은 읽을 때 계산. 다른 팀원의 리포트 ID면 not_found */
  getReport(workspaceId: Id, memberId: Id, reportId: Id): Promise<RetroReportDto>
  /** PUT W/members/{memberId}/reports/{reportId}/learning — 본인만, 0~5000자(아니면 invalid) */
  updateReportLearning(workspaceId: Id, memberId: Id, reportId: Id, request: ReportLearningRequest): Promise<RetroReportDto>
  /** GET W/members/{memberId}/reports/{reportId}/markdown — text/markdown 본문. 팀원 이름은 "팀원 A"처럼 바뀐다 (FR-REP-03) */
  exportReportMarkdown(workspaceId: Id, memberId: Id, reportId: Id): Promise<string>

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
