// 계약 테스트 ③ — contract/examples/ 공통 JSON의 TS 사본(CONTRACTS.md 「9」 계약 테스트).
// `satisfies`로 TS 타입과 예시 모양을 컴파일 때 맞춘다: 빠진 필드 · 모르는 필드(초과 속성) · 유니언 밖 값이 오류다.
// tsconfig.tools.json이 tests/를 포함하므로 `npm run build`(tsc -b)가 검사한다.
// 사본과 공통 JSON이 같은 값인지는 ④ examples.test.ts가 본다. 예시를 바꿀 때는 JSON과 이 사본을 같은 PR에서 함께 바꾼다.
// JSON을 바로 import하지 않는 이유: 리터럴이 string으로 넓어져 유니언 검사가 안 된다(CONTRACTS.md 「9」).
import type {
  AgendaItemCreateRequest,
  AgendaItemDto,
  DecisionRequest,
  ErrorResponse,
  EvaluateRequest,
  HelpCommentCreateRequest,
  HelpRequestCloseRequest,
  HelpRequestCreateRequest,
  HelpRequestDetail,
  HelpRequestSummary,
  MeResponse,
  MeetingDto,
  PageResponse,
  StandupDto,
  StandupPrefill,
  TimelineEntry,
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
      reviews: [],
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

/** contract/examples/ 기준 상대 경로 → TS 사본. 공통 JSON마다 하나씩 있어야 한다(④가 검사). */
export const EXAMPLES: Record<string, unknown> = {
  'auth/me-response.json': meResponseExample,
  'common/error-response.json': errorResponseExample,
  'evaluation/evaluate-request.json': evaluateRequestExample,
  'help/help-comment-create-request.json': helpCommentCreateRequestExample,
  'help/help-request-close-request.json': helpRequestCloseRequestExample,
  'help/help-request-create-request.json': helpRequestCreateRequestExample,
  'help/help-request-detail.json': helpRequestDetailExample,
  'help/help-request-summary.json': helpRequestSummaryExample,
  'meeting/agenda-item-create-request.json': agendaItemCreateRequestExample,
  'meeting/agenda-item.json': agendaItemExample,
  'meeting/decision-request.json': decisionRequestExample,
  'meeting/meeting.json': meetingExample,
  'meeting/standup-prefill.json': standupPrefillExample,
  'meeting/standup.json': standupExample,
  'report/timeline-page.json': timelinePageExample,
  'workspace/workspace-snapshot.json': workspaceSnapshotExample,
}
