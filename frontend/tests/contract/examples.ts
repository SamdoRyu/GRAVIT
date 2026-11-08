// 계약 테스트 ③ — contract/examples/ 공통 JSON의 TS 사본(CONTRACTS.md 「9」 계약 테스트).
// `satisfies`로 TS 타입과 예시 모양을 컴파일 때 맞춘다: 빠진 필드 · 모르는 필드(초과 속성) · 유니언 밖 값이 오류다.
// tsconfig.tools.json이 tests/를 포함하므로 `npm run build`(tsc -b)가 검사한다.
// 사본과 공통 JSON이 같은 값인지는 ④ examples.test.ts가 본다. 예시를 바꿀 때는 JSON과 이 사본을 같은 PR에서 함께 바꾼다.
// JSON을 바로 import하지 않는 이유: 리터럴이 string으로 넓어져 유니언 검사가 안 된다(CONTRACTS.md 「9」).
import type {
  ActivityRecordDto,
  AgendaItemCreateRequest,
  AgendaItemDto,
  ConventionLibraryItemDto,
  ConventionLibraryItemRequest,
  DecisionRequest,
  ErrorResponse,
  EvaluateRequest,
  EvaluationRoundDto,
  HelpCommentCreateRequest,
  HelpRequestCloseRequest,
  HelpRequestCreateRequest,
  HelpRequestDetail,
  HelpRequestSummary,
  InboxItem,
  InstructorAssignmentDto,
  InstructorCandidateDto,
  InstructorFeedbackCreateRequest,
  MeResponse,
  MeetingDto,
  OpenWorkspaceRequest,
  PageResponse,
  RepositoryChoiceResponse,
  RetroReportDto,
  RetroReportSummary,
  StandupDto,
  StandupPrefill,
  TaskDueDateDto,
  TimelineEntry,
  WorkspaceListItem,
  WorkspaceSnapshot,
} from '../../src/data/types'

// contract/examples/auth/me-response.json — CONTRACTS_API.md 「2」
export const meResponseExample = {
  user: { userId: '7', githubLogin: 'octo-kim', displayName: '김옥토', avatarUrl: 'https://avatars.githubusercontent.com/u/1001?v=4' },
  accountType: 'github',
  githubUserId: '1001',
  isInstructor: false,
} satisfies MeResponse

// contract/examples/common/error-response.json — CONTRACTS_API.md 「1」
export const errorResponseExample = {
  error: { code: 'forbidden_role', message: '이 작업을 할 권한이 없어요' },
} satisfies ErrorResponse

// contract/examples/evaluation/evaluate-request.json — CONTRACTS_API.md 「9」
export const evaluateRequestExample = {
  roundId: '21',
  verdict: 'not_recommend',
  reason: '실패 응답 모양이 계약과 달라요',
} satisfies EvaluateRequest

// contract/examples/evaluation/evaluation-round.json — CONTRACTS_API.md 「9」 (닫힌 회차 · 내 평가 있음)
export const evaluationRoundExample = {
  id: '20',
  roundNumber: 1,
  headSha: '9b1d3e5f7a2c4e6b8d0f1a3c5e7b9d2f4a6c8e0b',
  openedReason: 'new_pr',
  openedAt: '2026-11-04T05:00:00Z',
  closedAt: '2026-11-05T01:55:00Z',
  recommendCount: 1,
  notRecommendCount: 0,
  reasons: [{ verdict: 'recommend', reason: '로그인 흐름을 나눠서 읽기 쉬워요' }],
  myEvaluation: { verdict: 'recommend', reason: '로그인 흐름을 나눠서 읽기 쉬워요', updatedAt: '2026-11-04T06:20:00Z' },
  canEvaluate: false,
} satisfies EvaluationRoundDto

// contract/examples/meeting/agenda-item-create-request.json — CONTRACTS_API.md 「10」
export const agendaItemCreateRequestExample = {
  kind: 'pr',
  sourceId: '9',
  title: '실패 응답 모양을 계약대로 바꿀까?',
  background: null,
  tried: '로컬에서 401 응답 확인',
  unresolvedReason: '추천·비추천 의견이 갈림',
} satisfies AgendaItemCreateRequest

// contract/examples/meeting/decision-request.json — CONTRACTS_API.md 「10」
export const decisionRequestExample = {
  conclusion: '에러 응답을 계약 모양으로 맞추고 다시 평가받는다',
  learning: '에러 응답 모양은 전역 예외 처리 한 곳에서 바꾼다',
  prDecision: 'revise_and_reevaluate',
  followUpAssigneeMemberId: '3',
  followUpDueDate: '2026-11-07',
  meetingId: '5',
} satisfies DecisionRequest

// contract/examples/meeting/instructor-feedback-create-request.json — CONTRACTS_API.md 「10」
export const instructorFeedbackCreateRequestExample = {
  body: '401과 403을 나누는 기준을 결정 기록에 한 줄 남겨 두면 좋겠어요',
} satisfies InstructorFeedbackCreateRequest

// contract/examples/meeting/agenda-item.json — CONTRACTS_API.md 「10」
export const agendaItemExample = {
  id: '21',
  kind: 'pr',
  status: 'discussed',
  title: '실패 응답 모양을 계약대로 바꿀까?',
  background: null,
  tried: '로컬에서 401 응답 확인',
  unresolvedReason: '추천·비추천 의견이 갈림',
  source: { type: 'submission', id: '9' },
  evaluationRoundId: '4',
  raisedByMemberId: '2',
  raisedAt: '2026-11-05T02:00:00Z',
  decision: {
    conclusion: '에러 응답을 계약 모양으로 맞추고 다시 평가받는다',
    learning: '에러 응답 모양은 전역 예외 처리 한 곳에서 바꾼다',
    prDecision: 'revise_and_reevaluate',
    followUpAssigneeMemberId: '3',
    followUpDueDate: '2026-11-07',
    meetingId: '5',
    decidedByMemberId: '3',
    decidedAt: '2026-11-05T05:30:00Z',
  },
  feedbackRequested: true,
  feedbackRequestedAt: '2026-11-05T05:40:00Z',
  instructorFeedbacks: [
    {
      id: '7',
      instructor: { userId: '40', githubLogin: 'instructor-kim', displayName: '김강사', avatarUrl: null },
      body: '401과 403을 나누는 기준을 결정 기록에 한 줄 남겨 두면 좋겠어요',
      createdAt: '2026-11-05T06:00:00Z',
    },
  ],
} satisfies AgendaItemDto

// contract/examples/meeting/meeting.json — CONTRACTS_API.md 「10」
export const meetingExample = {
  id: '5',
  status: 'ended',
  startedAt: '2026-11-05T05:00:00Z',
  endedAt: '2026-11-05T05:45:00Z',
  attendeeMemberIds: ['2', '3'],
  notes: '실패 응답 모양은 계약대로 맞추기로 함',
  discussedAgendaItemIds: ['21'],
} satisfies MeetingDto

// contract/examples/meeting/standup.json — CONTRACTS_API.md 「12」
export const standupExample = {
  id: '31',
  memberId: '2',
  date: '2026-11-05',
  yesterday: '로그인 세션 붙임 (#12)',
  blockers: '로그아웃 뒤에도 세션이 남아요',
  updatedAt: '2026-11-05T00:30:00Z',
} satisfies StandupDto

// contract/examples/meeting/standup-prefill.json — CONTRACTS_API.md 「12」
export const standupPrefillExample = {
  date: '2026-11-05',
  items: [
    { kind: 'commit', title: '세션 만료 처리', githubNumber: null, occurredAt: '2026-11-04T02:10:00Z' },
    { kind: 'pr_opened', title: 'feat(auth): GitHub 로그인', githubNumber: 15, occurredAt: '2026-11-04T03:00:00Z' },
    { kind: 'review_submitted', title: 'feat(sync): 동기화 상태', githubNumber: 14, occurredAt: '2026-11-04T06:30:00Z' },
    { kind: 'issue_closed', title: 'GitHub 로그인', githubNumber: 12, occurredAt: '2026-11-04T09:00:00Z' },
  ],
} satisfies StandupPrefill

// contract/examples/plan/task-due-date.json — CONTRACTS_API.md 「13」
export const taskDueDateExample = {
  taskId: '12',
  dueDate: '2026-11-07',
  updatedAt: '2026-11-05T03:00:00Z',
  updatedBy: { userId: '7', githubLogin: 'octo-kim', displayName: '김옥토', avatarUrl: 'https://avatars.githubusercontent.com/u/1001?v=4' },
} satisfies TaskDueDateDto

// contract/examples/report/timeline-page.json — CONTRACTS_API.md 「15」
export const timelinePageExample = {
  items: [
    {
      kind: 'evaluation_received',
      occurredAt: '2026-11-05T02:40:00Z',
      title: '#15 feat(auth): GitHub 로그인',
      detail: '실패 응답 모양이 계약과 달라요',
      verdict: 'not_recommend',
      ref: { type: 'submission', id: '9' },
    },
  ],
  page: 0,
  size: 20,
  totalItems: 1,
  totalPages: 1,
} satisfies PageResponse<TimelineEntry>

// contract/examples/report/retro-report.json — CONTRACTS_API.md 「15」
export const retroReportExample = {
  id: '3',
  kind: 'final',
  createdAt: '2026-11-17T09:00:00Z',
  memberId: '2',
  summary: '맡은 이슈 4개(닫힘 3) · 작성한 PR 5개(머지 4) · 올린 안건 2건(결론 1)',
  areaLabels: ['area:auth', 'area:sync'],
  learning: '에러 응답 모양은 처음부터 한 곳에서 정하는 게 덜 고친다',
  agendaResults: [
    {
      agendaItemId: '21',
      title: '실패 응답 모양을 계약대로 바꿀까?',
      conclusion: '에러 응답을 계약 모양으로 맞추고 다시 평가받는다',
      learning: '에러 응답 모양은 전역 예외 처리 한 곳에서 바꾼다',
      prDecision: 'revise_and_reevaluate',
      decidedAt: '2026-11-05T05:30:00Z',
    },
  ],
  instructorFeedbacks: [
    {
      agendaItemId: '21',
      instructor: { userId: '40', githubLogin: 'instructor-kim', displayName: '김강사', avatarUrl: null },
      body: '401과 403을 나누는 기준을 결정 기록에 한 줄 남겨 두면 좋겠어요',
      createdAt: '2026-11-05T06:00:00Z',
    },
  ],
  activityDistribution: [{ kind: 'research', totalMinutes: 90 }],
  decisionCards: [
    {
      id: '8',
      memberId: '2',
      submissionId: '9',
      cells: {
        goal: '로그인 실패를 계약 모양으로 돌려주기',
        initialApproach: '컨트롤러마다 try-catch',
        feedbackReceived: '실패 응답 모양이 계약과 달라요',
        meetingDecision: '에러 응답을 계약 모양으로 맞추고 다시 평가받는다',
        finalChange: '전역 예외 처리 한 곳으로 옮김',
        rationale: null,
        blockedMoment: null,
        learning: '에러 응답 모양은 한 곳에서 정한다',
        source: 'https://github.com/team-samdo/gitvillage/pull/15',
      },
      confirmed: true,
      confirmedAt: '2026-11-06T01:00:00Z',
      followUpRequested: false,
      followUpRequestedAt: null,
      followUpQuestions: [],
      createdAt: '2026-11-06T00:30:00Z',
      updatedAt: '2026-11-06T01:00:00Z',
    },
  ],
} satisfies RetroReportDto

// contract/examples/report/retro-report-summary.json — CONTRACTS_API.md 「15」
export const retroReportSummaryExample = {
  id: '2',
  kind: 'midterm',
  createdAt: '2026-11-10T09:00:00Z',
} satisfies RetroReportSummary

// contract/examples/workspace/repository-choice-response.json — CONTRACTS_API.md 「3」 (설치 안 된 조직 · 열린 사무실 있는 레포 · 없는 레포)
export const repositoryChoiceResponseExample = {
  organizations: [
    {
      githubOwnerId: '880000001',
      login: 'samdo-lab',
      appInstalled: false,
      installUrl: 'https://github.com/apps/gravit-office/installations/new',
      repositories: [],
    },
    {
      githubOwnerId: '880000002',
      login: 'team-samdo',
      appInstalled: true,
      installUrl: null,
      repositories: [
        { githubRepoId: '880001234', owner: 'team-samdo', name: 'gitvillage', myRole: 'repo_admin', workspaceId: '3', adminLogins: [] },
        { githubRepoId: '880001235', owner: 'team-samdo', name: 'gitvillage-docs', myRole: 'participant', workspaceId: null, adminLogins: ['samdo-lee'] },
      ],
    },
  ],
} satisfies RepositoryChoiceResponse

// contract/examples/workspace/workspace-list-item.json — CONTRACTS_API.md 「3」
export const workspaceListItemExample = {
  id: '3',
  kind: 'github',
  displayName: 'team-samdo/gitvillage',
  githubOwner: 'team-samdo',
  githubRepo: 'gitvillage',
  githubRepoId: '880001234',
  htmlUrl: 'https://github.com/team-samdo/gitvillage',
  openedAt: '2026-11-04T00:10:00Z',
  myRole: 'participant',
} satisfies WorkspaceListItem

// contract/examples/workspace/open-workspace-request.json — CONTRACTS_API.md 「3」
export const openWorkspaceRequestExample = {
  githubRepoId: '880001234',
  projectStartDate: '2026-11-04',
  projectEndDate: '2026-11-17',
  specDocumentPath: 'docs/requirements.md',
  activityConsent: true,
} satisfies OpenWorkspaceRequest

// contract/examples/workspace/workspace-snapshot.json — CONTRACTS_API.md 「5」
export const workspaceSnapshotExample = {
  workspace: {
    id: '3',
    kind: 'github',
    displayName: 'team-samdo/gitvillage',
    githubOwner: 'team-samdo',
    githubRepo: 'gitvillage',
    githubRepoId: '880001234',
    htmlUrl: 'https://github.com/team-samdo/gitvillage',
    openedAt: '2026-11-04T00:10:00Z',
  },
  viewer: { userId: '7', role: 'participant', memberId: '12', activityConsented: true },
  settings: { projectStartDate: '2026-11-04', projectEndDate: '2026-11-17', specDocumentPath: 'docs/requirements.md', reviewWaitHours: 48, noCommitHours: 48 },
  sync: { state: 'idle', lastSucceededAt: '2026-11-05T03:00:00Z', lastFailedAt: null, lastFailureCode: null, lastFailureMessage: null, isFailing: false, specWarnings: [] },
  members: [
    {
      id: '12',
      userId: '7',
      githubUserId: '1001',
      githubLogin: 'octo-kim',
      displayName: '김옥토',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1001?v=4',
      deskIndex: 0,
      isRepoAdmin: false,
      removedAt: null,
      syncedAt: '2026-11-05T03:00:00Z',
    },
  ],
  tasks: [
    {
      id: '41',
      githubIssueNumber: 12,
      title: 'GitHub 로그인',
      state: 'open',
      closedReason: null,
      assigneeMemberIds: ['12'],
      labels: ['area:auth', 'priority:high'],
      priority: 'high',
      dueDate: '2026-11-07',
      linkedSubmissionIds: ['9'],
      isBlocked: false,
      htmlUrl: 'https://github.com/team-samdo/gitvillage/issues/12',
      githubCreatedAt: '2026-11-04T01:00:00Z',
      githubUpdatedAt: '2026-11-05T02:10:00Z',
      closedAt: null,
      stateChangedAt: '2026-11-04T05:00:00Z',
      syncedAt: '2026-11-05T03:00:00Z',
    },
  ],
  submissions: [
    {
      id: '9',
      githubPrNumber: 15,
      title: 'feat(auth): GitHub 로그인',
      authorMemberId: '12',
      authorGithubLogin: 'octo-kim',
      state: 'open',
      headSha: '3f2c9a1e5b7d4c6a8e0f1b2c3d4e5f6a7b8c9d0e',
      reviewRequestedMemberIds: ['13'],
      reviews: [{ reviewerMemberId: '13', reviewerGithubLogin: 'samdo-lee', state: 'changes_requested', submittedAt: '2026-11-05T01:40:00Z' }],
      suggestedReviewerMemberIds: [],
      labels: ['area:auth'],
      priority: null,
      linkedTaskIds: ['41'],
      isBlocked: false,
      htmlUrl: 'https://github.com/team-samdo/gitvillage/pull/15',
      githubCreatedAt: '2026-11-05T01:00:00Z',
      githubUpdatedAt: '2026-11-05T02:00:00Z',
      mergedAt: null,
      closedAt: null,
      lastCommitAt: '2026-11-05T01:55:00Z',
      stateChangedAt: '2026-11-05T01:00:00Z',
      syncedAt: '2026-11-05T03:00:00Z',
      currentRound: {
        id: '21',
        roundNumber: 1,
        headSha: '3f2c9a1e5b7d4c6a8e0f1b2c3d4e5f6a7b8c9d0e',
        openedReason: 'new_pr',
        openedAt: '2026-11-05T03:00:00Z',
        closedAt: null,
        recommendCount: 1,
        notRecommendCount: 1,
        reasons: [
          { verdict: 'recommend', reason: '세션 만료 처리가 명확해요' },
          { verdict: 'not_recommend', reason: '실패 응답 모양이 계약과 달라요' },
        ],
        myEvaluation: null,
        canEvaluate: false,
      },
    },
  ],
  requirements: [
    { id: '5', sourceKey: 'FR-AUTH-01', title: 'GitHub 로그인', position: 0, status: 'active', linkedTaskCount: 1, doneTaskCount: 0, lastSeenAt: '2026-11-05T03:00:00Z' },
  ],
  requirementLinks: [{ id: '30', requirementId: '5', taskId: '41', linkedAt: '2026-11-05T02:30:00Z' }],
  agendaItems: [],
  meetings: [],
  helpRequests: [],
  activityNotes: [],
  flow: {
    blockedMemberIds: [],
    reviewConcentratedMemberIds: [],
    assignmentConcentratedMemberIds: [],
    openSubmissionCount: 1,
    averageReviewWaitHours: 2.0,
    latestStandupDate: '2026-11-05',
  },
  generatedAt: '2026-11-05T03:01:12Z',
} satisfies WorkspaceSnapshot

// contract/examples/help/help-comment-create-request.json — CONTRACTS_API.md 「11」
export const helpCommentCreateRequestExample = {
  content: 'application.yaml의 server.servlet.session.cookie.same-site를 lax로 두면 돼요',
} satisfies HelpCommentCreateRequest

// contract/examples/help/help-request-close-request.json — CONTRACTS_API.md 「11」
export const helpRequestCloseRequestExample = {
  helpfulCommentId: '31',
  learning: 'SameSite는 쿠키마다 정하고, Spring에서는 server.servlet.session.cookie.same-site로 바꾼다',
} satisfies HelpRequestCloseRequest

// contract/examples/help/help-request-create-request.json — CONTRACTS_API.md 「11」
export const helpRequestCreateRequestExample = {
  content: 'OAuth 로그인 뒤 세션이 바로 끊겨요. SameSite 설정을 어디서 바꾸는지 모르겠어요',
  fromStandupId: '3',
} satisfies HelpRequestCreateRequest

// contract/examples/help/help-request-summary.json — CONTRACTS_API.md 「11」
export const helpRequestSummaryExample = {
  id: '12',
  requesterMemberId: '2',
  content: 'OAuth 로그인 뒤 세션이 바로 끊겨요. SameSite 설정을 어디서 바꾸는지 모르겠어요',
  status: 'open',
  isAgendaCandidate: false,
  instructorRequested: false,
  instructorRequestedAt: null,
  agendaItemId: null,
  fromStandupId: '3',
  commentCount: 0,
  createdAt: '2026-11-05T01:20:00Z',
  closedAt: null,
} satisfies HelpRequestSummary

// contract/examples/help/help-request-detail.json — CONTRACTS_API.md 「11」
export const helpRequestDetailExample = {
  id: '12',
  requesterMemberId: '2',
  content: 'OAuth 로그인 뒤 세션이 바로 끊겨요. SameSite 설정을 어디서 바꾸는지 모르겠어요',
  status: 'discussing',
  isAgendaCandidate: false,
  instructorRequested: false,
  instructorRequestedAt: null,
  agendaItemId: null,
  fromStandupId: '3',
  commentCount: 1,
  createdAt: '2026-11-05T01:20:00Z',
  closedAt: null,
  comments: [
    {
      id: '31',
      author: { userId: '7', githubLogin: 'bob', displayName: '밥', avatarUrl: null },
      authorMemberId: '3',
      isInstructorAnswer: false,
      content: 'server.servlet.session.cookie.same-site 를 확인해 보세요',
      createdAt: '2026-11-05T02:05:00Z',
    },
  ],
  helpfulCommentId: null,
  learning: null,
} satisfies HelpRequestDetail

// contract/examples/instructor/instructor-assignment.json — CONTRACTS_API.md 「7」
export const instructorAssignmentExample = {
  githubUserId: '9001',
  githubLogin: 'mentor-park',
  displayName: '박멘토',
  avatarUrl: 'https://avatars.githubusercontent.com/u/9001?v=4',
  assignedAt: '2026-11-04T01:00:00Z',
  assignedBy: { userId: '7', githubLogin: 'octo-kim', displayName: '김옥토', avatarUrl: 'https://avatars.githubusercontent.com/u/1001?v=4' },
} satisfies InstructorAssignmentDto

// contract/examples/instructor/instructor-candidate.json — CONTRACTS_API.md 「7」
export const instructorCandidateExample = {
  githubUserId: '9002',
  githubLogin: null,
  avatarUrl: null,
  isAssigned: false,
} satisfies InstructorCandidateDto

// contract/examples/instructor/inbox-item.json — CONTRACTS_API.md 「16」
export const inboxItemExample = {
  kind: 'help_request',
  workspaceId: '3',
  workspaceDisplayName: 'team-samdo/gitvillage',
  targetId: '12',
  ownerMemberId: '2',
  title: 'OAuth 로그인 뒤 세션이 바로 끊겨요. SameSite 설정을 어디서 바꾸는지 모르겠어요',
  requestedAt: '2026-11-05T01:30:00Z',
  answeredAt: '2026-11-05T02:40:00Z',
} satisfies InboxItem

// contract/examples/instructor/convention-library-item.json — CONTRACTS_API.md 「17」
export const conventionLibraryItemExample = {
  id: '3',
  target: 'pr_title',
  name: 'PR 제목 규칙',
  content: '<type>(<scope>)?: <설명>',
  description: null,
  author: { userId: '40', githubLogin: 'instructor-kim', displayName: '김강사', avatarUrl: null },
  updatedAt: '2026-11-05T03:00:00Z',
} satisfies ConventionLibraryItemDto

// contract/examples/instructor/convention-library-item-request.json — CONTRACTS_API.md 「17」
export const conventionLibraryItemRequestExample = {
  target: 'branch_name',
  name: '브랜치 이름',
  content: '<type>/<이슈번호>-<설명>',
  description: 'Git 전략',
} satisfies ConventionLibraryItemRequest

// contract/examples/activity/activity-record.json — CONTRACTS_API.md 「14」
export const activityRecordExample = {
  id: '40',
  authorMemberId: '12',
  kind: 'planning',
  content: '요구사항 정의서 정리',
  durationMinutes: 90,
  status: 'confirmed',
  confirmedByMemberIds: ['13', '14'],
  createdAt: '2026-11-06T02:00:00Z',
} satisfies ActivityRecordDto

/** contract/examples/ 기준 상대 경로 → TS 사본. 공통 JSON마다 하나씩 있어야 한다(④가 검사). */
export const EXAMPLES: Record<string, unknown> = {
  'activity/activity-record.json': activityRecordExample,
  'auth/me-response.json': meResponseExample,
  'common/error-response.json': errorResponseExample,
  'evaluation/evaluate-request.json': evaluateRequestExample,
  'evaluation/evaluation-round.json': evaluationRoundExample,
  'help/help-comment-create-request.json': helpCommentCreateRequestExample,
  'help/help-request-close-request.json': helpRequestCloseRequestExample,
  'help/help-request-create-request.json': helpRequestCreateRequestExample,
  'help/help-request-detail.json': helpRequestDetailExample,
  'help/help-request-summary.json': helpRequestSummaryExample,
  'instructor/convention-library-item-request.json': conventionLibraryItemRequestExample,
  'instructor/convention-library-item.json': conventionLibraryItemExample,
  'instructor/inbox-item.json': inboxItemExample,
  'instructor/instructor-assignment.json': instructorAssignmentExample,
  'instructor/instructor-candidate.json': instructorCandidateExample,
  'meeting/agenda-item-create-request.json': agendaItemCreateRequestExample,
  'meeting/agenda-item.json': agendaItemExample,
  'meeting/decision-request.json': decisionRequestExample,
  'meeting/instructor-feedback-create-request.json': instructorFeedbackCreateRequestExample,
  'meeting/meeting.json': meetingExample,
  'meeting/standup-prefill.json': standupPrefillExample,
  'meeting/standup.json': standupExample,
  'plan/task-due-date.json': taskDueDateExample,
  'report/retro-report-summary.json': retroReportSummaryExample,
  'report/retro-report.json': retroReportExample,
  'report/timeline-page.json': timelinePageExample,
  'workspace/open-workspace-request.json': openWorkspaceRequestExample,
  'workspace/repository-choice-response.json': repositoryChoiceResponseExample,
  'workspace/workspace-list-item.json': workspaceListItemExample,
  'workspace/workspace-snapshot.json': workspaceSnapshotExample,
}
