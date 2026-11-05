// 화면 타입. data/ · scene/ · ui/ 가 함께 쓴다. 소유: D (프론트 HUD · 데이터).
//
// 1) v1 계약 타입 — docs/CONTRACTS_API.md 의 TypeScript 표기를 필드 이름 · 타입 그대로 옮긴 것
//    (기준 계약 커밋 e14fb85a6fe0ff8aea8be6a2a6c66a9b626fef03). 계약을 바꾸지 않는다 — 다르면 문서 담당자에게.
//    모든 필드는 늘 있다(값이 없으면 null, 목록이 비면 []). 선택 필드(?)를 쓰지 않는다.
//    ID는 불투명한 문자열이다 — 숫자로 바꾸거나 크기를 비교하거나 ID로 정렬하지 않는다(CONTRACTS.md 「2」).
// 2) 데모 모델 — 지금 화면 · 3D가 쓰는 이전 모델. 화면이 v1으로 옮겨 가면 지운다.
//    v1과 이름이 겹치는 것만 Demo 접두사를 붙였다(DemoPriority · DemoChange).

// ============================================================================
// v1 계약 — CONTRACTS_API.md 「1」 공통 타입
// ============================================================================

/** 내부 ID — Long의 10진 문자열(예: "42"). mock은 자기 문자열을 만들어도 된다. */
export type Id = string
/** GitHub 사용자 · 레포 · 계정 ID — 10진 문자열. */
export type GithubId = string
/** UTC ISO 8601, 'Z'로 끝남. 예: "2026-11-03T05:12:00Z" */
export type Instant = string
/** "YYYY-MM-DD" — 한국 시간 기준 달력 날짜. */
export type LocalDate = string

export type ErrorCode =
  | 'invalid'
  | 'not_found'
  | 'conflict'
  | 'unavailable'
  | 'unauthorized'
  | 'forbidden_role'
  | 'github_unauthorized'
  | 'github_rate_limited'
export interface ErrorResponse {
  error: { code: ErrorCode; message: string }
}

export type WorkspaceKind = 'github' | 'demo'
export type WorkspaceRole = 'repo_admin' | 'participant' | 'instructor'
export type Priority = 'high' | 'medium' | 'low'
export type Verdict = 'recommend' | 'not_recommend'

/** 이름을 보여도 되는 사람(익명 대상이 아닌 기록의 작성자). */
export interface UserRef {
  userId: Id
  /** 심사용 계정은 null */
  githubLogin: string | null
  displayName: string
  avatarUrl: string | null
}

export interface PageResponse<T> {
  items: T[]
  /** 0부터 */
  page: number
  size: number
  totalItems: number
  totalPages: number
}

// ---- 「2」 로그인 · 세션 ------------------------------------------------------

export interface LoginOptions {
  /** "/oauth2/authorization/github" */
  githubLoginUrl: string
  /** false면 화면이 심사용 로그인 폼을 숨긴다(숨김은 보안이 아니다 — 경로 자체가 없다). */
  reviewLoginEnabled: boolean
}

export interface MeResponse {
  user: UserRef
  accountType: 'github' | 'review'
  /** 심사용 계정은 null */
  githubUserId: GithubId | null
  /** 강사 요청함을 쓸 수 있는가 */
  isInstructor: boolean
}

// ---- 「3」 사무실 · 레포 선택 -------------------------------------------------

export interface RepositoryChoiceResponse {
  organizations: OwnerChoice[]
}
export interface OwnerChoice {
  githubOwnerId: GithubId
  /** 조직(또는 개인 계정) 이름 */
  login: string
  /** false면 자물쇠 + "승인 요청하기" */
  appInstalled: boolean
  /** GitHub 앱 설치 · 승인 요청 페이지 (P2) */
  installUrl: string | null
  repositories: RepositoryChoice[]
}
export interface RepositoryChoice {
  githubRepoId: GithubId
  owner: string
  name: string
  myRole: 'repo_admin' | 'participant'
  /** null = 아직 열리지 않음 */
  workspaceId: Id | null
  /** "아직 사무실이 열리지 않았어요" 안내의 팀장 이름 (P2) */
  adminLogins: string[]
}
export interface WorkspaceSummary {
  id: Id
  kind: WorkspaceKind
  /** "owner/repo" 또는 시연 사무실 이름 */
  displayName: string
  /** 시연은 null */
  githubOwner: string | null
  githubRepo: string | null
  githubRepoId: GithubId | null
  /** 레포 주소 — "이슈로 만들기" 링크의 바탕. 시연은 null */
  htmlUrl: string | null
  openedAt: Instant
}
export interface WorkspaceListItem extends WorkspaceSummary {
  myRole: WorkspaceRole
}
export interface OpenWorkspaceRequest {
  githubRepoId: GithubId
  projectStartDate: LocalDate
  projectEndDate: LocalDate
  /** 건너뛰면 null (FR-REQ-01). 1~300자 */
  specDocumentPath: string | null
  /** 팀장의 활동 기록 수집 동의 (FR-ACT · P12) */
  activityConsent: boolean
}

// ---- 「4」 동기화 -------------------------------------------------------------

export interface SyncStatus {
  state: 'idle' | 'running'
  lastSucceededAt: Instant | null
  lastFailedAt: Instant | null
  lastFailureCode: 'github_unauthorized' | 'github_rate_limited' | 'unavailable' | null
  lastFailureMessage: string | null
  /** lastFailedAt이 lastSucceededAt보다 나중 — 상단 바 실패 표시 (FR-GH-05) */
  isFailing: boolean
  /** 마지막 명세 문서 읽기의 경고 */
  specWarnings: SpecWarning[]
}
export interface SpecWarning {
  code: 'duplicate_source_key' | 'duplicate_title' | 'spec_not_found'
  /** 문제의 ## 제목 (spec_not_found는 null) */
  heading: string | null
}

// ---- 「5」 WorkspaceSnapshot --------------------------------------------------

export interface WorkspaceSnapshot {
  workspace: WorkspaceSummary
  viewer: Viewer
  settings: TeamSettings
  sync: SyncStatus
  /** 빠진 팀원 포함 전부. 지금 팀원 먼저 deskIndex 순, 그 뒤 빠진 팀원 */
  members: MemberDto[]
  /** 이슈 전부. githubIssueNumber 오름차순 */
  tasks: TaskDto[]
  /** PR 전부. githubPrNumber 오름차순 */
  submissions: SubmissionDto[]
  /** 상태 무관 전부. position 오름차순 */
  requirements: RequirementDto[]
  requirementLinks: RequirementLinkDto[]
  /** 거둔 것 포함 전부. raisedAt 오름차순 */
  agendaItems: AgendaItemDto[]
  /** 진행 중 + 최근 끝난 것 20개. startedAt 오름차순 */
  meetings: MeetingDto[]
  /** 전부. createdAt 오름차순 */
  helpRequests: HelpRequestSummary[]
  /** 확인된 활동 기록 (FR-ACT-03 — Should) */
  activityNotes: ActivityNote[]
  flow: FlowSummary
  generatedAt: Instant
}

export interface Viewer {
  userId: Id
  role: WorkspaceRole
  /** 강사는 null */
  memberId: Id | null
  /** 팀원이 수집 동의를 했는가 — 처음 입장 화면 분기 (P12). 강사는 false */
  activityConsented: boolean
}

export interface TeamSettings {
  projectStartDate: LocalDate
  projectEndDate: LocalDate
  specDocumentPath: string | null
  /** 정수 1~720, 기본 48 (P9) */
  reviewWaitHours: number
  /** 정수 1~720, 기본 48 (P9) */
  noCommitHours: number
}

export interface MemberDto {
  id: Id
  /** 시연 Seed 팀원은 null */
  userId: Id | null
  /** 시연 Seed · 심사용 팀원은 null */
  githubUserId: GithubId | null
  githubLogin: string | null
  displayName: string
  avatarUrl: string | null
  /** 0~9 — 테마의 책상 자리 번호(좌표 아님). 빠진 팀원은 null — 책상 · 아바타 없음 */
  deskIndex: number | null
  isRepoAdmin: boolean
  /** 콜라보레이터에서 빠진 시각 */
  removedAt: Instant | null
  syncedAt: Instant | null
}

/** GitHub 이슈의 앱 모델 */
export interface TaskDto {
  id: Id
  githubIssueNumber: number
  title: string
  state: 'open' | 'closed'
  closedReason: 'completed' | 'not_planned' | null
  /** 팀원인 담당자 전원 — 첫 번째가 대표 담당자 (CONTRACTS.md 「3」) */
  assigneeMemberIds: Id[]
  labels: string[]
  /** priority:* 라벨에서 서버가 계산 (P6) */
  priority: Priority | null
  /** 앱 저장 작업 마감 (P14) */
  dueDate: LocalDate | null
  /** GitHub 공식 연결만 (FR-GH-04) */
  linkedSubmissionIds: Id[]
  /** 서버 계산 (FR-FLOW-01) */
  isBlocked: boolean
  /** GitHub 이슈 주소. 시연은 null */
  htmlUrl: string | null
  githubCreatedAt: Instant
  githubUpdatedAt: Instant
  closedAt: Instant | null
  /** 열림 · 닫힘 · 담당자가 마지막으로 바뀐 시각 (FR-FLOW-08) */
  stateChangedAt: Instant
  syncedAt: Instant
}

/** GitHub PR의 앱 모델 */
export interface SubmissionDto {
  id: Id
  githubPrNumber: number
  title: string
  /** 작성자가 팀원이 아니면 null */
  authorMemberId: Id | null
  authorGithubLogin: string | null
  /** closed = 머지 안 되고 닫힘 */
  state: 'open' | 'draft' | 'merged' | 'closed'
  headSha: string
  reviewRequestedMemberIds: Id[]
  /** GitHub 리뷰 — GitHub에 공개된 값이라 익명 대상이 아니다 */
  reviews: GithubReviewDto[]
  /** 추천 리뷰어 (FR-FLOW-04 — Should) */
  suggestedReviewerMemberIds: Id[]
  labels: string[]
  priority: Priority | null
  /** GitHub 공식 연결만 */
  linkedTaskIds: Id[]
  isBlocked: boolean
  /** GitHub PR 화면 (FR-LRN-07). 시연은 null */
  htmlUrl: string | null
  githubCreatedAt: Instant
  githubUpdatedAt: Instant
  mergedAt: Instant | null
  closedAt: Instant | null
  lastCommitAt: Instant | null
  stateChangedAt: Instant
  syncedAt: Instant
  /** 가장 최근 회차. PR이 닫혀도 마지막 회차를 보인다 */
  currentRound: EvaluationRoundDto | null
}
export interface GithubReviewDto {
  reviewerMemberId: Id | null
  reviewerGithubLogin: string
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed'
  submittedAt: Instant
}

export interface RequirementDto {
  id: Id
  /** ## 제목의 요구사항 ID (예: "FR-AUTH-01"). 묶음 키는 화면이 여기서 계산 */
  sourceKey: string | null
  /** 원본 ID를 뺀 정규화 제목 */
  title: string
  /** 문서 안 순서 (0부터) */
  position: number
  status: 'active' | 'missing' | 'needs_review'
  linkedTaskCount: number
  /** 연결된 이슈 중 닫힌 이슈 수 (FR-REQ-05) */
  doneTaskCount: number
  /** 마지막으로 문서에서 본 시각 */
  lastSeenAt: Instant | null
}
export interface RequirementLinkDto {
  id: Id
  requirementId: Id
  taskId: Id
  linkedAt: Instant
}

/** 팀 단위 계산 값 — 사람별 합계 · 순위 없음 (P6) */
export interface FlowSummary {
  /** 막힌 도형이 있는 팀원 — 아바타 강조 (FR-FLOW-02) */
  blockedMemberIds: Id[]
  /** 리뷰 편중 — 몰렸다는 표시만 (FR-FLOW-03 — Should) */
  reviewConcentratedMemberIds: Id[]
  /** 담당 편중 (FR-FLOW-07 — Should) */
  assignmentConcentratedMemberIds: Id[]
  /** 열린 PR 수 (FR-FLOW-05) */
  openSubmissionCount: number
  /** 평균 리뷰 대기, 소수 첫째 자리 (FR-FLOW-05) */
  averageReviewWaitHours: number | null
  /** 최근 변화 뷰의 기준 (FR-FLOW-08 — Should) */
  latestStandupDate: LocalDate | null
}

/** 3D 메모지 — 시간 · 내용 없음 */
export interface ActivityNote {
  id: Id
  authorMemberId: Id
  kind: 'planning' | 'research' | 'design' | 'presentation' | 'mentor_question'
  confirmedAt: Instant
}

// ---- 「6」 변경 알림 (SSE) · CONTRACTS.md 「8」 Change ---------------------------

export type SnapshotResource =
  | 'workspace'
  | 'settings'
  | 'members'
  | 'tasks'
  | 'submissions'
  | 'requirements'
  | 'agenda_items'
  | 'meetings'
  | 'help_requests'
  | 'activities'
  | 'standups'
  | 'instructors'

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

/** subscribe가 넘기는 변경 — 서버 SSE 이벤트를 옮긴 것 (CONTRACTS.md 「8」). */
export type Change =
  /** 화면은 load()로 Snapshot을 다시 읽는다 */
  | { type: 'changed'; resources: SnapshotResource[] }
  /** 동기화 시작 · 끝 */
  | { type: 'sync'; status: SyncStatus }
  | { type: 'connection'; status: ConnectionStatus }

// ---- 「7」 강사 지정 ----------------------------------------------------------

export interface InstructorAssignmentDto {
  /** 지정의 키 — 로그인 이름이 아님 (CONTRACTS.md 「6」 식별자 원칙) */
  githubUserId: GithubId
  /** 표시용 — 아직 모르면 null */
  githubLogin: string | null
  displayName: string | null
  avatarUrl: string | null
  assignedAt: Instant
  assignedBy: UserRef
}

export interface InstructorCandidateDto {
  githubUserId: GithubId
  /** 표시용 — 그 강사가 로그인한 적이 없어 모르면 null [구현 기본값] */
  githubLogin: string | null
  avatarUrl: string | null
  isAssigned: boolean
}

// ---- 「9」 PR 평가 · 평가 회차 -----------------------------------------------

export interface EvaluateRequest {
  /** 평가하려는 회차 — 그 사이 새 회차가 열렸으면 409 */
  roundId: Id
  verdict: Verdict
  /** 앞뒤 공백을 뺀 뒤 1~200자 (FR-LRN-02) */
  reason: string
}
export interface EvaluationRoundDto {
  id: Id
  roundNumber: number
  /** 회차를 시작한 커밋 — 회차 ID와 별개 */
  headSha: string
  openedReason: 'new_pr' | 'new_commit' | 'meeting_reevaluate'
  openedAt: Instant
  /** 새 회차가 열리면 채워짐 */
  closedAt: Instant | null
  recommendCount: number
  notRecommendCount: number
  /** 평가자 · 평가 ID · 시각 없음. 추천 먼저, 그 안에서 저장 순서 */
  reasons: EvaluationReason[]
  /** 요청한 사람 자신의 평가만 */
  myEvaluation: MyEvaluation | null
  /** 화면 표시용 — 서버는 평가 요청 때 다시 검사한다 */
  canEvaluate: boolean
}
export interface EvaluationReason {
  verdict: Verdict
  reason: string
}
export interface MyEvaluation {
  verdict: Verdict
  reason: string
  updatedAt: Instant
}

// ---- 「10」 회의 · 안건 · 강사 피드백 ----------------------------------------

export type AgendaKind = 'issue' | 'pr' | 'help_request' | 'learning' | 'other'

export interface AgendaItemCreateRequest {
  kind: 'issue' | 'pr' | 'learning' | 'other'
  /** issue → taskId, pr → submissionId, learning · other → null */
  sourceId: Id | null
  /** 1~100자 — 무엇을 토론할지 */
  title: string
  /** 0~2000자 */
  background: string | null
  /** 해 본 것, 0~2000자 */
  tried: string | null
  /** 혼자 결론 못 낸 이유, 0~2000자 */
  unresolvedReason: string | null
}
export interface DecisionRequest {
  /** 1~2000자 */
  conclusion: string
  /** 배운 점, 0~2000자 */
  learning: string | null
  /** PR 안건이면 필수, 아니면 null */
  prDecision: 'revise_and_reevaluate' | 'merge_as_is' | 'close_pr' | null
  /** 더 알아볼 사람 (FR-LRN-12) */
  followUpAssigneeMemberId: Id | null
  followUpDueDate: LocalDate | null
  /** 다룬 회의 */
  meetingId: Id | null
}

export interface AgendaItemDto {
  id: Id
  kind: AgendaKind
  status: 'confirmed' | 'discussed' | 'withdrawn'
  title: string
  background: string | null
  tried: string | null
  unresolvedReason: string | null
  source: { type: 'task' | 'submission' | 'help_request'; id: Id } | null
  /** PR 안건 — 붙는 추천·비추천 이유는 이 회차의 것 */
  evaluationRoundId: Id | null
  raisedByMemberId: Id
  /** 24시간 미처리 강조는 화면 계산 (FR-LRN-13 — Should) */
  raisedAt: Instant
  decision: AgendaDecisionDto | null
  feedbackRequested: boolean
  feedbackRequestedAt: Instant | null
  /** 결정 기록 아래 팀 전체에게 보임 (FR-LRN-22) */
  instructorFeedbacks: InstructorFeedbackDto[]
}
export interface AgendaDecisionDto {
  conclusion: string
  learning: string | null
  prDecision: 'revise_and_reevaluate' | 'merge_as_is' | 'close_pr' | null
  followUpAssigneeMemberId: Id | null
  followUpDueDate: LocalDate | null
  meetingId: Id | null
  decidedByMemberId: Id
  decidedAt: Instant
}
export interface InstructorFeedbackDto {
  id: Id
  instructor: UserRef
  body: string
  createdAt: Instant
}
export interface MeetingDto {
  id: Id
  status: 'ongoing' | 'ended'
  startedAt: Instant
  endedAt: Instant | null
  attendeeMemberIds: Id[]
  notes: string | null
  discussedAgendaItemIds: Id[]
}

// ---- 「11」 도움 요청 (Snapshot 요약) ----------------------------------------

export type HelpRequestStatus = 'open' | 'discussing' | 'resolved' | 'on_agenda' | 'ended'
export interface HelpRequestSummary {
  id: Id
  requesterMemberId: Id
  content: string
  status: HelpRequestStatus
  /** 계산 — open · discussing이고 만든 지 48시간 지남 (FR-LRN-18). 화면은 반투명 후보로 */
  isAgendaCandidate: boolean
  instructorRequested: boolean
  instructorRequestedAt: Instant | null
  /** 전환된 안건 */
  agendaItemId: Id | null
  fromStandupId: Id | null
  commentCount: number
  createdAt: Instant
  closedAt: Instant | null
}
/** `POST W/help-requests` — content 1~2000자, fromStandupId는 본인의 스탠드업 */
export interface HelpRequestCreateRequest {
  content: string
  fromStandupId: Id | null
}
/** `POST W/help-requests/{helpRequestId}/comments` — content 1~2000자 */
export interface HelpCommentCreateRequest {
  content: string
}
/** `POST W/help-requests/{helpRequestId}/close` — 요청자만. learning 1~200자 */
export interface HelpRequestCloseRequest {
  /** 이 글의 코멘트 — 강사 답변 · 요청자 본인 코멘트는 안 됨 */
  helpfulCommentId: Id | null
  learning: string
}
/** `GET W/help-requests/{helpRequestId}` */
export interface HelpRequestDetail extends HelpRequestSummary {
  /** createdAt 오름차순. 안건으로 전환해도 그대로 붙어 보인다 */
  comments: HelpCommentDto[]
  /** 코멘트 작성자의 "내가 도운 기록" */
  helpfulCommentId: Id | null
  learning: string | null
}
export interface HelpCommentDto {
  id: Id
  /** 익명 아님 */
  author: UserRef
  /** 강사는 null */
  authorMemberId: Id | null
  isInstructorAnswer: boolean
  content: string
  createdAt: Instant
}

// ---- 「12」 스탠드업 ----------------------------------------------------------

export interface StandupDto {
  id: Id
  memberId: Id
  /** 한국 시간 기준 날짜 */
  date: LocalDate
  yesterday: string
  blockers: string | null
  updatedAt: Instant
}
/** {date}의 전날(한국 시간) 내 GitHub 활동 — "어제 한 일" 미리 채우기 (FR-MTG-01) */
export interface StandupPrefill {
  date: LocalDate
  items: {
    kind: 'commit' | 'pr_opened' | 'pr_merged' | 'issue_closed' | 'review_submitted'
    title: string
    /** 이슈 · PR 번호 (커밋은 null) */
    githubNumber: number | null
    occurredAt: Instant
  }[]
}

// ---- 「15」 개인 API — 학습 타임라인 ------------------------------------------

export type TimelineKind =
  /** 내 PR이 받은 추천·비추천 이유 — 평가자 없음 */
  | 'evaluation_received'
  /** 내가 남긴 평가 이유 */
  | 'evaluation_given'
  /** 내가 올린 안건 */
  | 'agenda_raised'
  /** 내가 올린 안건의 결론 · 회의 결정 */
  | 'agenda_decided'
  /** 내가 올린 안건에 달린 강사 피드백 */
  | 'instructor_feedback'
  /** 회의 결정 뒤 고친 것(커밋) */
  | 'commit_after_meeting'
export interface TimelineEntry {
  kind: TimelineKind
  occurredAt: Instant
  title: string
  detail: string | null
  /** evaluation_* 만 */
  verdict: Verdict | null
  ref: { type: 'submission' | 'agenda_item' | 'task'; id: Id } | null
}

// ---- 「15」 개인 API — 회고 리포트 · 기술 결정 카드 ---------------------------

export interface RetroReportSummary {
  id: Id
  kind: 'final' | 'midterm'
  createdAt: Instant
}
export interface RetroReportDto extends RetroReportSummary {
  memberId: Id
  /** 자동 요약 — 규칙으로 조립, AI 없음 */
  summary: string | null
  /** 담당 기능 영역 (area:* — FR-REP-01) */
  areaLabels: string[]
  /** 내가 배운 점 (FR-REP-02) */
  learning: string | null
  /** 내가 올린 안건과 결론 · PR 결정 (FR-LRN-05 · 12) */
  agendaResults: {
    agendaItemId: Id
    title: string
    conclusion: string
    learning: string | null
    prDecision: 'revise_and_reevaluate' | 'merge_as_is' | 'close_pr' | null
    decidedAt: Instant
  }[]
  /** FR-LRN-22 */
  instructorFeedbacks: { agendaItemId: Id; instructor: UserRef; body: string; createdAt: Instant }[]
  /** 본인 것만 (FR-ACT-03). kind = ActivityRecordDto['kind'] */
  activityDistribution: { kind: 'planning' | 'research' | 'design' | 'presentation' | 'mentor_question'; totalMinutes: number }[]
  /** 본인이 확인한 카드만 (P11) */
  decisionCards: DecisionCardDto[]
}
/** 9칸 — 각 0~2000자, 재료가 없으면 null */
export interface DecisionCardCells {
  goal: string | null
  initialApproach: string | null
  /** 받은 평가 — 추천·비추천 이유, 평가자 없음 */
  feedbackReceived: string | null
  meetingDecision: string | null
  finalChange: string | null
  rationale: string | null
  blockedMoment: string | null
  learning: string | null
  /** 원본 (PR · 이슈 · 회의 링크) */
  source: string | null
}
export interface DecisionCardDto {
  id: Id
  memberId: Id
  submissionId: Id
  cells: DecisionCardCells
  confirmed: boolean
  confirmedAt: Instant | null
  followUpRequested: boolean
  followUpRequestedAt: Instant | null
  followUpQuestions: FollowUpQuestionDto[]
  createdAt: Instant
  updatedAt: Instant
}
export interface FollowUpQuestionDto {
  id: Id
  instructor: UserRef
  body: string
  createdAt: Instant
}

// ============================================================================
// 데모 모델 — 화면 이행 중(이전 3D 데모). 화면이 v1 타입으로 옮겨 가면 지운다.
// ============================================================================

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'
export type DemoPriority = 'low' | 'medium' | 'high' | 'urgent'
/** Story points. */
export type Estimate = 1 | 2 | 3 | 5 | 8

export interface Project {
  id: Id
  /** Short key shown on task labels, e.g. "WEB". */
  key: string
  name: string
  /** Hex color, used for task box labels and the project overlay. */
  color: string
}

export interface Task {
  id: Id
  /** Human-friendly number, unique per workspace, e.g. 42 → "WEB-42". */
  number: number
  title: string
  description: string
  status: TaskStatus
  priority: DemoPriority
  estimate: Estimate
  projectId: Id
  /** null = unassigned → lives on the backlog shelf. */
  assigneeId: Id | null
  /** ISO date (YYYY-MM-DD) or null. */
  dueDate: string | null
  /** Sort key within a kanban column / desk stack (ascending). */
  order: number
  createdAt: string
  updatedAt: string
  /** ISO datetime when status became 'done', else null. */
  completedAt: string | null
  /** On the agenda for the next team meeting (sits on the meeting-room table). Open tasks only. */
  onAgenda: boolean
}

/** Where a member is right now. Drives where the avatar walks to. */
export type Presence = 'working' | 'meeting' | 'break' | 'away'

export interface Member {
  id: Id
  name: string
  /** e.g. "프론트엔드", "디자인". */
  role: string
  /** Hex color for the avatar's shirt and UI chips. */
  color: string
  /** Story points per week this person can comfortably take. */
  capacity: number
  /** Desk from OFFICE.desks. Unique among members. */
  deskId: string
  presence: Presence
  /** 0..n, picks hair style / accessory so avatars look distinct. */
  avatarVariant: number
  joinedAt: string
}

export type ActivityKind =
  | 'task_created'
  | 'task_updated'
  | 'task_assigned'
  | 'task_status'
  | 'task_deleted'
  | 'member_joined'
  | 'member_updated'
  | 'member_left'
  | 'presence'
  | 'meeting_started'
  | 'meeting_ended'
  /** Notices from the data source itself (e.g. storage recovered). */
  | 'system'

export interface Activity {
  id: Id
  at: string
  kind: ActivityKind
  /** Who did it: a member id, or null for the manager (the user). */
  actorId: Id | null
  taskId?: Id
  memberId?: Id
  /** Korean, one short sentence, ready to display. */
  message: string
}

// ---- Meetings (one meeting room → at most one ongoing meeting) -------------------

export type MeetingStatus = 'ongoing' | 'ended'

/** What the team decided for one agenda task when the meeting ended. */
export type AgendaOutcome =
  | { taskId: Id; action: 'assign'; memberId: Id }
  | { taskId: Id; action: 'status'; status: TaskStatus }
  | { taskId: Id; action: 'backlog' }
  /** Not settled — stays on the agenda for the next meeting. */
  | { taskId: Id; action: 'keep' }

export interface Meeting {
  id: Id
  title: string
  attendeeIds: Id[]
  /** Agenda tasks captured when the meeting started (tasks with onAgenda), in order. */
  agendaTaskIds: Id[]
  status: MeetingStatus
  startedAt: string
  endedAt: string | null
  /** Free-form minutes written at the end. */
  notes: string
  /** Decisions applied at the end (empty while ongoing). */
  outcomes: AgendaOutcome[]
}

export interface MeetingStart {
  title: string
  attendeeIds: Id[]
}

export interface MeetingEnd {
  notes: string
  /** At most one per agenda task; agenda tasks without an outcome count as 'keep'. */
  outcomes: AgendaOutcome[]
}

/** Everything the app needs at startup. */
export interface Workspace {
  projects: Project[]
  members: Member[]
  tasks: Task[]
  /** The ongoing meeting (if any) plus the most recent ended ones, newest last, at most 20. */
  meetings: Meeting[]
  /** Newest last, at most ~100. */
  activity: Activity[]
}

// ---- Inputs ----------------------------------------------------------------

export type TaskInput = Pick<Task, 'title' | 'projectId'> &
  Partial<Pick<Task, 'description' | 'status' | 'priority' | 'estimate' | 'assigneeId' | 'dueDate'>>

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'estimate' | 'projectId' | 'assigneeId' | 'dueDate' | 'order' | 'onAgenda'>
>

/** deskId is optional: the source picks a free desk when omitted. */
export type MemberInput = Pick<Member, 'name' | 'role' | 'color' | 'capacity'> & Partial<Pick<Member, 'deskId' | 'avatarVariant'>>

export type MemberPatch = Partial<Pick<Member, 'name' | 'role' | 'color' | 'capacity' | 'deskId' | 'presence'>>

/** What happens to a removed member's open tasks. */
export type Reassign = { mode: 'backlog' } | { mode: 'member'; memberId: Id }

/**
 * Pushed by a DataSource for every change, including ones caused by the app's own calls.
 * Upserts/deletes are idempotent so the store can apply them after an optimistic update.
 */
export type DemoChange =
  | { type: 'task_upsert'; task: Task }
  | { type: 'task_delete'; id: Id }
  | { type: 'member_upsert'; member: Member }
  | { type: 'member_delete'; id: Id }
  | { type: 'project_upsert'; project: Project }
  | { type: 'meeting_upsert'; meeting: Meeting }
  | { type: 'activity'; activity: Activity }
  /** Replace everything (e.g. after a reset, or when a reconnect can't replay missed changes). */
  | { type: 'snapshot'; workspace: Workspace }
  /** Remote sources report their link state; local sources never emit this. */
  | { type: 'connection'; status: ConnectionStatus }
  /** Shared demo state changed (another client toggled it, server restarted, a toggle failed). */
  | { type: 'demo'; on: boolean }
