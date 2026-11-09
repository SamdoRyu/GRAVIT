// 앱과 데이터 사이의 유일한 문. 소유: D (프론트 HUD · 데이터).
// 구현: mock(src/data/mock — 브라우저 seed + localStorage) · api(src/data/api — Spring /api/**).
import type {
  ActivityCreateRequest,
  ActivityRecordDto,
  AgendaItemCreateRequest,
  AgendaItemDto,
  Change,
  DecisionCardCreateRequest,
  DecisionCardDto,
  DecisionCardUpdateRequest,
  DecisionRequest,
  EndMeetingRequest,
  FollowUpQuestionCreateRequest,
  FollowUpQuestionDto,
  MeetingDto,
  StartMeetingRequest,
  TaskDueDateDto,
  TaskDueDateRequest,
  RequirementLinkCreateRequest,
  RequirementLinkDto,
  InstructorAssignmentDto,
  InstructorCandidateDto,
  ConventionLibraryItemDto,
  ConventionLibraryItemRequest,
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
  InboxItem,
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

  // ---- 「7」 강사 지정 (#53 — FR-AUTH-06) ----
  /** GET W/instructors — 현재 지정만, assignedAt 오름차순. 사무실에 접근할 수 있으면 누구나 */
  listInstructors(workspaceId: Id): Promise<InstructorAssignmentDto[]>
  /** GET W/instructor-candidates — 허용 목록 전원(isAssigned 포함). R2만(forbidden_role) */
  listInstructorCandidates(workspaceId: Id): Promise<InstructorCandidateDto[]>
  /** PUT W/instructors/{githubUserId} — 이미 지정돼 있으면 그 지정. R2만, 허용 목록 밖 invalid, 요청한 사람 자신 conflict */
  assignInstructor(workspaceId: Id, githubUserId: string): Promise<InstructorAssignmentDto>
  /** DELETE W/instructors/{githubUserId} — 204. R2만, 현재 지정 없음 not_found */
  revokeInstructor(workspaceId: Id, githubUserId: string): Promise<void>

  // ---- 「8」 요구사항 연결 (#197 — 요구사항 목록 · 연결은 Snapshot의 requirements · requirementLinks) ----
  /**
   * POST W/requirement-links — 201 새 연결, 같은 연결이 이미 있으면 200과 기존 연결(요구사항 상태와 상관없이).
   * R2만(forbidden_role), 요구사항 · 이슈가 없거나 다른 사무실 것 not_found, 요구사항이 active가 아님 conflict
   */
  linkRequirement(workspaceId: Id, request: RequirementLinkCreateRequest): Promise<RequirementLinkDto>
  /** DELETE W/requirement-links/{linkId} — 204. R2만(forbidden_role) */
  unlinkRequirement(workspaceId: Id, linkId: Id): Promise<void>

  // ---- 「14」 활동 기록 (#173 — FR-ACT-01 ~ 03). 목록은 Snapshot에 없다(확인된 것만 activityNotes) — 화면을 열 때 읽는다 ----
  /** PUT W/activity-consent — 팀원 본인 동의 · 철회, 응답은 바뀐 값. 강사 forbidden_role. SSE 알림이 없다 */
  setActivityConsent(workspaceId: Id, consented: boolean): Promise<boolean>
  /** GET W/activities?status=&page=&size= — createdAt 내림차순. status를 빼면 전부 */
  listActivities(workspaceId: Id, status?: ActivityRecordDto['status'], page?: number, size?: number): Promise<PageResponse<ActivityRecordDto>>
  /** POST W/activities — 201(pending). 내용 1~500자 · 1~1440분 invalid → 강사 forbidden_role → 동의 안 함 conflict */
  createActivity(workspaceId: Id, request: ActivityCreateRequest): Promise<ActivityRecordDto>
  /** POST W/activities/{activityId}/confirm — 작성자가 아닌 팀원. 1명 이상이면 confirmed, 이미 확인했으면 그대로. 작성자 · 강사 forbidden_role */
  confirmActivity(workspaceId: Id, activityId: Id): Promise<ActivityRecordDto>

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

  // ---- 「15」 개인 API — 기술 결정 카드 · 강사 꼬리질문 (#218). 접근 규칙은 위와 같다 ----
  /** GET W/members/{memberId}/decision-cards — createdAt 내림차순 */
  listDecisionCards(workspaceId: Id, memberId: Id): Promise<DecisionCardDto[]>
  /**
   * POST W/members/{memberId}/decision-cards — 201. 9칸을 재료에서 규칙대로 채운다(AI 없음, 재료 없는 칸은 null).
   * 본인만. 내가 작성한 PR이 아님 forbidden_role, PR이 아직 열림 · 같은 PR 카드가 있음 conflict
   */
  createDecisionCard(workspaceId: Id, memberId: Id, request: DecisionCardCreateRequest): Promise<DecisionCardDto>
  /** PUT W/members/{memberId}/decision-cards/{cardId} — 본인만. 9칸 각 0~2000자, confirmed: true인데 learning이 비었으면 invalid */
  updateDecisionCard(workspaceId: Id, memberId: Id, cardId: Id, request: DecisionCardUpdateRequest): Promise<DecisionCardDto>
  /** POST W/members/{memberId}/decision-cards/{cardId}/follow-up-request — 본인만. 이미 켜져 있으면 처음 시각 그대로 */
  requestFollowUp(workspaceId: Id, memberId: Id, cardId: Id): Promise<DecisionCardDto>
  /** POST W/members/{memberId}/decision-cards/{cardId}/follow-up-questions — 201. R4만, 1~1000자, 요청 안 된 카드 forbidden_role */
  addFollowUpQuestion(workspaceId: Id, memberId: Id, cardId: Id, request: FollowUpQuestionCreateRequest): Promise<FollowUpQuestionDto>

  // ---- 「16」 강사 요청함 (#224 — FR-LRN-23). 사무실 경로 밖 — 지금 지정된 사무실들의 요청을 한 목록으로 ----
  /**
   * GET /api/instructor/inbox?answered= — requestedAt 내림차순. answered를 빼면 전부, true면 답한 것만, false면 아직인 것만.
   * 강사(MeResponse.isInstructor)가 아니면 forbidden_role. 해제된 사무실 것은 나오지 않는다
   */
  getInstructorInbox(answered?: boolean): Promise<InboxItem[]>

  // ---- 「17」 컨벤션 라이브러리 (#225 — FR-LIB). 서버 전체에 하나, 사무실 경로 밖 ----
  /** GET /api/convention-library — target · name 순. 로그인한 사람 누구나(심사용 포함) */
  listConventionLibrary(): Promise<ConventionLibraryItemDto[]>
  /** POST /api/convention-library — 201. 길이 · 대상 invalid → GitHub 계정 강사가 아님(심사용 · 학생) forbidden_role */
  createConventionLibraryItem(request: ConventionLibraryItemRequest): Promise<ConventionLibraryItemDto>
  /** PUT /api/convention-library/{itemId} — 같은 순서, 그 뒤 없는 항목 not_found. 다른 강사가 만든 항목도 고친다 */
  updateConventionLibraryItem(itemId: Id, request: ConventionLibraryItemRequest): Promise<ConventionLibraryItemDto>

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
  /**
   * 서버가 돌려준 HTTP 상태. 같은 code라도 상태로 갈리는 때가 있다 — `invalid` 400(입력 오류) ↔ 403(CSRF · 요청 출처, CONTRACTS.md 「6」).
   * 0 = 응답을 받지 못함(네트워크 — 쓰기가 서버에 닿았는지 모른다). undefined = 상태를 모름(mock 등 — code로만 판단)
   */
  status?: number
  constructor(message: string, code: DataErrorCode = 'invalid', status?: number) {
    super(message)
    this.name = 'DataError'
    this.code = code
    if (status !== undefined) this.status = status
  }
}
