// v1 mock seed — 서버 없이 화면 · 3D를 개발하려고 브라우저에 두는 사무실 데이터. 소유: D.
// 모양은 v1 계약 DTO 그대로다. ID는 일부러 접두사 문자열("m_1", "t_1"…)이다 — 화면이 ID를 숫자로
// 다루면 바로 드러나게 한다(CONTRACTS.md 「2」 변환 경계). GitHub 식별자는 10진 문자열이다.
// 요구사항 · 연결 · 안건 · 회의 · 도움 요청 · 활동 메모는 각 기능 Issue에서 채운다(지금은 []).
import type {
  EvaluationRoundDto,
  FlowSummary,
  HelpCommentDto,
  HelpRequestSummary,
  StandupDto,
  Id,
  Instant,
  LocalDate,
  MeResponse,
  MemberDto,
  OwnerChoice,
  RepositoryChoice,
  SubmissionDto,
  SyncStatus,
  TaskDto,
  Verdict,
  WorkspaceSnapshot,
} from '../../types'

/** mock 세션 — GitHub 로그인 사용자 또는 심사용 계정. null = 로그인 안 됨. */
export type MockSession = 'github' | 'review'

/** 저장하는 사무실 데이터. viewer · canEvaluate · generatedAt은 load 때 요청자 기준으로 계산한다. */
export type StoredSnapshot = Omit<WorkspaceSnapshot, 'viewer' | 'generatedAt'>

export interface MockWorkspace {
  snapshot: StoredSnapshot
  /** 활동 기록 수집에 동의한 사용자 (Viewer.activityConsented) */
  consentedUserIds: Id[]
  /**
   * 팀원이 mock에서 남긴 PR 평가 — 회차마다 사람당 하나 (#19 · #20). seed의 이유(currentRound.reasons)는
   * 평가자 없는 예시라 그대로 두고, 읽을 때 이것과 합친다. 없으면 빈 목록(이 칸이 생기기 전 저장값 포함)
   */
  evaluations?: MockEvaluation[]
  /** 회의 결정 revise_and_reevaluate로 닫힌 지난 평가 회차 (#102 — 회의 · 안건). 없으면 빈 목록 */
  pastRounds?: { submissionId: Id; round: EvaluationRoundDto }[]
  /** 도움 요청의 코멘트 · 닫을 때 남긴 값 (#183) — Snapshot 요약(helpRequests)과 ID로 짝. 없으면 빈 목록 */
  helpThreads?: MockHelpThread[]
  /** 스탠드업 (#190) — Snapshot에 없고 날짜로 읽는다. 없으면 빈 목록 */
  standups?: StandupDto[]
}

export interface MockHelpThread {
  helpRequestId: Id
  /** createdAt 오름차순 */
  comments: HelpCommentDto[]
  helpfulCommentId: Id | null
  learning: string | null
}

export interface MockEvaluation {
  submissionId: Id
  roundId: Id
  memberId: Id
  verdict: Verdict
  reason: string
  updatedAt: Instant
}

export interface MockState {
  version: typeof MOCK_STATE_VERSION
  session: MockSession | null
  /** 새로 만드는 행의 ID 번호 */
  nextId: number
  /** 열린 순서 */
  workspaces: MockWorkspace[]
}

/**
 * 저장 모양(MockState · seed)을 바꾸면 올린다. 그래야 개발자 브라우저에 남은 옛 데이터를 읽지 않고 seed로 다시 시작한다.
 * (올리지 않으면 옛 데이터에 새 칸 · 새 seed가 없어 화면에 안 보이거나, 뼈대 검사에서 걸러져 seed로 돌아간다.)
 */
export const MOCK_STATE_VERSION = 4 // 2: 팀 사무실 seed에 평균 리뷰 대기 예시 값 (#24) · 3: 도움 요청 seed · helpThreads (#183) · 4: 스탠드업 seed (#190)

export const MOCK_USERS: Record<MockSession, MeResponse> = {
  github: {
    user: { userId: 'u_1', githubLogin: 'octo-kim', displayName: '김옥토', avatarUrl: null },
    accountType: 'github',
    githubUserId: '1001',
    isInstructor: false,
  },
  review: {
    user: { userId: 'u_review', githubLogin: null, displayName: '심사 계정', avatarUrl: null },
    accountType: 'review',
    githubUserId: null,
    isInstructor: false,
  },
}

/** 레포 선택 화면의 조직 · 레포. workspaceId는 열린 사무실에서 계산한다. */
export type MockOwner = Omit<OwnerChoice, 'repositories'> & { repositories: Omit<RepositoryChoice, 'workspaceId'>[] }

export const MOCK_OWNERS: MockOwner[] = [
  {
    githubOwnerId: '5001',
    login: 'team-samdo',
    appInstalled: true,
    installUrl: null,
    repositories: [
      { githubRepoId: '880001234', owner: 'team-samdo', name: 'gitvillage', myRole: 'participant', adminLogins: ['samdo-lee'] },
      { githubRepoId: '880001300', owner: 'team-samdo', name: 'side-lab', myRole: 'repo_admin', adminLogins: ['octo-kim'] },
    ],
  },
  {
    githubOwnerId: '5002',
    login: 'bootcamp-lab',
    appInstalled: false,
    installUrl: 'https://github.com/apps/gitvillage/installations/new',
    repositories: [{ githubRepoId: '880002001', owner: 'bootcamp-lab', name: 'final-project', myRole: 'participant', adminLogins: ['lab-lead'] }],
  },
]

// ---- 시각 ------------------------------------------------------------------

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const KST_OFFSET_MS = 9 * HOUR_MS

/** UTC ISO 8601, 소수 초 없이 'Z'로 끝남 */
export function toInstant(d: Date): Instant {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** 한국 시간 기준 달력 날짜 */
export function kstDate(d: Date, offsetDays = 0): LocalDate {
  return new Date(d.getTime() + KST_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10)
}

export function idleSync(lastSucceededAt: Instant | null): SyncStatus {
  return { state: 'idle', lastSucceededAt, lastFailedAt: null, lastFailureCode: null, lastFailureMessage: null, isFailing: false, specWarnings: [] }
}

/** 팀 단위 계산 값 — 막힌 도형이 있는 팀원 · 열린 PR 수만. 나머지(Should)는 빈 값. */
export function computeFlow(snapshot: Pick<StoredSnapshot, 'members' | 'tasks' | 'submissions'>): FlowSummary {
  const blocked = new Set<Id>()
  for (const t of snapshot.tasks) if (t.isBlocked && t.state === 'open') t.assigneeMemberIds.forEach((id) => blocked.add(id))
  for (const s of snapshot.submissions) if (s.isBlocked && s.authorMemberId !== null) blocked.add(s.authorMemberId)
  return {
    blockedMemberIds: snapshot.members.filter((m) => blocked.has(m.id)).map((m) => m.id),
    reviewConcentratedMemberIds: [],
    assignmentConcentratedMemberIds: [],
    openSubmissionCount: snapshot.submissions.filter((s) => s.state === 'open' || s.state === 'draft').length,
    averageReviewWaitHours: null,
    latestStandupDate: null,
  }
}

// ---- seed ------------------------------------------------------------------

interface SeedContext {
  ago: (hours: number) => Instant
  /** 레포 주소. 시연 사무실은 null */
  repoUrl: string | null
  syncedAt: Instant
}

interface MemberSeed {
  id: Id
  userId: Id | null
  githubUserId: string | null
  githubLogin: string | null
  displayName: string
  deskIndex: number | null
  isRepoAdmin?: boolean
  removedHoursAgo?: number
}

function member(s: MemberSeed, c: SeedContext): MemberDto {
  return {
    id: s.id,
    userId: s.userId,
    githubUserId: s.githubUserId,
    githubLogin: s.githubLogin,
    displayName: s.displayName,
    avatarUrl: null,
    deskIndex: s.deskIndex,
    isRepoAdmin: s.isRepoAdmin ?? false,
    removedAt: s.removedHoursAgo === undefined ? null : c.ago(s.removedHoursAgo),
    syncedAt: s.githubUserId === null ? null : c.syncedAt,
  }
}

interface TaskSeed {
  id: Id
  n: number
  title: string
  /** 대표 담당자 순서(GitHub 사용자 ID 오름차순)로 적는다 */
  assignees?: Id[]
  labels?: string[]
  closed?: 'completed' | 'not_planned'
  blocked?: boolean
  dueDate?: LocalDate
  submissions?: Id[]
  createdHoursAgo: number
  changedHoursAgo: number
}

function task(s: TaskSeed, c: SeedContext): TaskDto {
  const labels = s.labels ?? []
  const priorityLabel = labels.find((l) => l.startsWith('priority:'))
  return {
    id: s.id,
    githubIssueNumber: s.n,
    title: s.title,
    state: s.closed ? 'closed' : 'open',
    closedReason: s.closed ?? null,
    assigneeMemberIds: s.assignees ?? [],
    labels,
    priority: priorityLabel === 'priority:high' ? 'high' : priorityLabel === 'priority:medium' ? 'medium' : priorityLabel === 'priority:low' ? 'low' : null,
    dueDate: s.dueDate ?? null,
    linkedSubmissionIds: s.submissions ?? [],
    isBlocked: s.blocked ?? false,
    htmlUrl: c.repoUrl === null ? null : `${c.repoUrl}/issues/${s.n}`,
    githubCreatedAt: c.ago(s.createdHoursAgo),
    githubUpdatedAt: c.ago(s.changedHoursAgo),
    closedAt: s.closed ? c.ago(s.changedHoursAgo) : null,
    stateChangedAt: c.ago(s.changedHoursAgo),
    syncedAt: c.syncedAt,
  }
}

interface SubmissionSeed {
  id: Id
  n: number
  title: string
  author: { memberId: Id | null; login: string | null }
  state: SubmissionDto['state']
  headSha: string
  reviewRequested?: Id[]
  reviews?: SubmissionDto['reviews']
  labels?: string[]
  tasks?: Id[]
  round: { id: Id; reasons: { verdict: 'recommend' | 'not_recommend'; reason: string }[] }
  createdHoursAgo: number
  changedHoursAgo: number
}

function submission(s: SubmissionSeed, c: SeedContext): SubmissionDto {
  const finished = s.state === 'merged' || s.state === 'closed'
  // 추천 먼저, 그 안에서 저장 순서 (CONTRACTS.md 「5」 익명성)
  const reasons = [...s.round.reasons.filter((r) => r.verdict === 'recommend'), ...s.round.reasons.filter((r) => r.verdict === 'not_recommend')]
  return {
    id: s.id,
    githubPrNumber: s.n,
    title: s.title,
    authorMemberId: s.author.memberId,
    authorGithubLogin: s.author.login,
    state: s.state,
    headSha: s.headSha,
    reviewRequestedMemberIds: s.reviewRequested ?? [],
    reviews: s.reviews ?? [],
    suggestedReviewerMemberIds: [],
    labels: s.labels ?? [],
    priority: null,
    linkedTaskIds: s.tasks ?? [],
    isBlocked: false,
    htmlUrl: c.repoUrl === null ? null : `${c.repoUrl}/pull/${s.n}`,
    githubCreatedAt: c.ago(s.createdHoursAgo),
    githubUpdatedAt: c.ago(s.changedHoursAgo),
    mergedAt: s.state === 'merged' ? c.ago(s.changedHoursAgo) : null,
    closedAt: finished ? c.ago(s.changedHoursAgo) : null,
    lastCommitAt: c.ago(s.changedHoursAgo + 0.1),
    stateChangedAt: c.ago(s.changedHoursAgo),
    syncedAt: c.syncedAt,
    currentRound: {
      id: s.round.id,
      roundNumber: 1,
      headSha: s.headSha,
      openedReason: 'new_pr',
      openedAt: c.ago(s.createdHoursAgo),
      closedAt: null,
      recommendCount: reasons.filter((r) => r.verdict === 'recommend').length,
      notRecommendCount: reasons.filter((r) => r.verdict === 'not_recommend').length,
      reasons,
      myEvaluation: null,
      canEvaluate: false, // load 때 요청자 기준으로 다시 계산
    },
  }
}

function emptyCollections() {
  return { requirements: [], requirementLinks: [], agendaItems: [], meetings: [], helpRequests: [], activityNotes: [] } satisfies Partial<StoredSnapshot>
}

function teamWorkspace(now: Date): MockWorkspace {
  const ago = (hours: number) => toInstant(new Date(now.getTime() - hours * HOUR_MS))
  const repoUrl = 'https://github.com/team-samdo/gitvillage'
  const c: SeedContext = { ago, repoUrl, syncedAt: ago(0.2) }
  const members = [
    member({ id: 'm_1', userId: 'u_1', githubUserId: '1001', githubLogin: 'octo-kim', displayName: '김옥토', deskIndex: 0 }, c),
    member({ id: 'm_2', userId: 'u_2', githubUserId: '1002', githubLogin: 'samdo-lee', displayName: '이삼도', deskIndex: 1, isRepoAdmin: true }, c),
    member({ id: 'm_3', userId: 'u_3', githubUserId: '1003', githubLogin: 'dev-park', displayName: '박데브', deskIndex: 2 }, c),
    member({ id: 'm_4', userId: 'u_4', githubUserId: '1004', githubLogin: 'hana-choi', displayName: '최하나', deskIndex: 3 }, c),
    // 콜라보레이터에서 빠진 팀원 — 책상 · 아바타 없음, 과거 기록용으로 남는다
    member({ id: 'm_5', userId: 'u_5', githubUserId: '1005', githubLogin: 'left-kang', displayName: '강떠남', deskIndex: null, removedHoursAgo: 30 }, c),
  ]
  const tasks = [
    task({ id: 't_1', n: 3, title: '프로젝트 골격 만들기', assignees: ['m_2'], labels: ['area:infra'], closed: 'completed', createdHoursAgo: 50, changedHoursAgo: 40 }, c),
    task({ id: 't_2', n: 5, title: 'GitHub 로그인', assignees: ['m_1'], labels: ['area:auth', 'priority:high'], dueDate: kstDate(now, 2), submissions: ['s_1'], createdHoursAgo: 46, changedHoursAgo: 20 }, c),
    task({ id: 't_3', n: 6, title: '레포 선택 화면', assignees: ['m_1'], labels: ['area:workspace'], createdHoursAgo: 46, changedHoursAgo: 18 }, c),
    task({ id: 't_4', n: 8, title: '동기화 상태 표시', assignees: ['m_2', 'm_3'], labels: ['area:sync', 'priority:medium'], createdHoursAgo: 45, changedHoursAgo: 12 }, c),
    task({ id: 't_5', n: 9, title: '요구사항 패널', labels: ['area:requirement', 'priority:low'], createdHoursAgo: 44, changedHoursAgo: 44 }, c),
    task({ id: 't_6', n: 11, title: '3D 상자 배치', assignees: ['m_3'], labels: ['area:office'], blocked: true, createdHoursAgo: 55, changedHoursAgo: 52 }, c),
    task({ id: 't_7', n: 12, title: 'PR 평가 입력', labels: ['area:evaluation'], createdHoursAgo: 40, changedHoursAgo: 40 }, c),
    task({ id: 't_8', n: 13, title: '다크 모드', labels: [], closed: 'not_planned', createdHoursAgo: 39, changedHoursAgo: 10 }, c),
    task({ id: 't_9', n: 14, title: '회고 리포트', assignees: ['m_4'], labels: ['area:report'], submissions: ['s_2'], createdHoursAgo: 30, changedHoursAgo: 6 }, c),
  ]
  const submissions = [
    submission(
      {
        id: 's_3',
        n: 10,
        title: 'chore: 프로젝트 골격',
        author: { memberId: 'm_2', login: 'samdo-lee' },
        state: 'merged',
        headSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        reviews: [{ reviewerMemberId: 'm_1', reviewerGithubLogin: 'octo-kim', state: 'approved', submittedAt: ago(41) }],
        labels: ['area:infra'],
        tasks: ['t_1'],
        round: { id: 'r_3', reasons: [{ verdict: 'recommend', reason: '폴더 구조가 계약 문서와 같아요' }, { verdict: 'recommend', reason: 'README 명령이 그대로 돌아가요' }] },
        createdHoursAgo: 48,
        changedHoursAgo: 40,
      },
      c,
    ),
    submission(
      {
        id: 's_1',
        n: 15,
        title: 'feat(auth): GitHub 로그인',
        author: { memberId: 'm_1', login: 'octo-kim' },
        state: 'open',
        headSha: '3f2c9a1e5b7d4c6a8e0f1b2c3d4e5f6a7b8c9d0e',
        reviewRequested: ['m_2'],
        labels: ['area:auth'],
        tasks: ['t_2'],
        round: { id: 'r_1', reasons: [{ verdict: 'not_recommend', reason: '실패 응답 모양이 계약과 달라요' }, { verdict: 'recommend', reason: '세션 만료 처리가 명확해요' }] },
        createdHoursAgo: 20,
        changedHoursAgo: 19,
      },
      c,
    ),
    submission(
      {
        id: 's_2',
        n: 16,
        title: 'feat(report): 회고 리포트 초안',
        author: { memberId: 'm_4', login: 'hana-choi' },
        state: 'draft',
        headSha: '9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a291807',
        labels: ['area:report'],
        tasks: ['t_9'],
        round: { id: 'r_2', reasons: [] },
        createdHoursAgo: 6,
        changedHoursAgo: 5,
      },
      c,
    ),
  ]
  const help = teamHelpRequests(members, ago)
  return {
    snapshot: {
      workspace: { id: 'ws_1', kind: 'github', displayName: 'team-samdo/gitvillage', githubOwner: 'team-samdo', githubRepo: 'gitvillage', githubRepoId: '880001234', htmlUrl: repoUrl, openedAt: ago(52) },
      settings: { projectStartDate: kstDate(now, -2), projectEndDate: kstDate(now, 11), specDocumentPath: 'docs/requirements.md', reviewWaitHours: 48, noCommitHours: 48 },
      sync: idleSync(c.syncedAt),
      members,
      tasks,
      submissions,
      ...emptyCollections(),
      helpRequests: help.summaries,
      // 평균 리뷰 대기는 서버가 계산한다(FR-FLOW-05). mock은 상단 바를 그려 보려고 예시 값만 둔다
      flow: { ...computeFlow({ members, tasks, submissions }), averageReviewWaitHours: 6.5 },
    },
    consentedUserIds: ['u_1', 'u_2', 'u_3', 'u_4'],
    helpThreads: help.threads,
    // 오늘 이삼도 · 박데브(막힌 것 있음), 어제 나(김옥토). 오늘 내 스탠드업은 비워 둔다 — 화면에서 써 보게 (#190)
    standups: [
      { id: 'st_1', memberId: 'm_1', date: kstDate(now, -1), yesterday: '로그인 화면 마무리', blockers: null, updatedAt: ago(26) },
      { id: 'st_2', memberId: 'm_2', date: kstDate(now), yesterday: '레포 선택 화면 리뷰', blockers: null, updatedAt: ago(2) },
      { id: 'st_3', memberId: 'm_3', date: kstDate(now), yesterday: '3D 상자 배치', blockers: '상자를 끌면 가끔 책상 밖으로 튀어요', updatedAt: ago(1) },
    ],
  }
}

/**
 * 도움 요청 3건 (#183) — 로그인 사용자(m_1)의 48시간 지난 안건 후보 · 박데브의 열린 요청 · 최하나의 해결된 요청.
 * 안건 후보 여부(isAgendaCandidate)는 load 때 지금 시각으로 다시 계산한다.
 */
function teamHelpRequests(members: MemberDto[], ago: (hours: number) => Instant): { summaries: HelpRequestSummary[]; threads: MockHelpThread[] } {
  const ref = (memberId: Id) => {
    const m = members.find((x) => x.id === memberId)!
    return { userId: m.userId!, githubLogin: m.githubLogin, displayName: m.displayName, avatarUrl: m.avatarUrl }
  }
  const comment = (id: Id, memberId: Id, content: string, hoursAgo: number): HelpCommentDto => ({ id, author: ref(memberId), authorMemberId: memberId, isInstructorAnswer: false, content, createdAt: ago(hoursAgo) })
  // 키 순서는 계약 표 그대로
  const summary = (s: Pick<HelpRequestSummary, 'id' | 'requesterMemberId' | 'content' | 'status' | 'commentCount' | 'createdAt' | 'closedAt'>): HelpRequestSummary => ({
    id: s.id,
    requesterMemberId: s.requesterMemberId,
    content: s.content,
    status: s.status,
    isAgendaCandidate: false,
    instructorRequested: false,
    instructorRequestedAt: null,
    agendaItemId: null,
    fromStandupId: null,
    commentCount: s.commentCount,
    createdAt: s.createdAt,
    closedAt: s.closedAt,
  })
  return {
    summaries: [
      summary({ id: 'hr_1', requesterMemberId: 'm_1', content: '로컬에서 GitHub 로그인 뒤 세션이 자꾸 끊겨요. SameSite 설정을 어디서 바꾸나요?', status: 'discussing', commentCount: 1, createdAt: ago(50), closedAt: null }),
      summary({ id: 'hr_3', requesterMemberId: 'm_4', content: '회고 리포트를 마크다운으로 내보낼 때 팀원 이름은 어떻게 바꾸나요?', status: 'resolved', commentCount: 1, createdAt: ago(30), closedAt: ago(20) }),
      summary({ id: 'hr_2', requesterMemberId: 'm_3', content: '3D 상자를 끌면 가끔 책상 밖으로 튀어요. 원인을 같이 봐 줄 사람 있나요?', status: 'open', commentCount: 0, createdAt: ago(6), closedAt: null }),
    ],
    threads: [
      { helpRequestId: 'hr_1', comments: [comment('hc_1', 'm_2', 'application.yaml의 server.servlet.session.cookie.same-site를 확인해 보세요', 49)], helpfulCommentId: null, learning: null },
      { helpRequestId: 'hr_3', comments: [comment('hc_2', 'm_1', '처음 나온 순서대로 "팀원 A" · "팀원 B"로 바꿔요', 28)], helpfulCommentId: 'hc_2', learning: '익명화는 내보낼 때 한 번에 한다' },
      { helpRequestId: 'hr_2', comments: [], helpfulCommentId: null, learning: null },
    ],
  }
}

/** 시연 사무실 — GitHub를 부르지 않는다. GitHub 링크는 null, Seed 팀원은 userId · githubUserId가 없다. */
function demoWorkspace(now: Date): MockWorkspace {
  const ago = (hours: number) => toInstant(new Date(now.getTime() - hours * HOUR_MS))
  const c: SeedContext = { ago, repoUrl: null, syncedAt: ago(0.5) }
  const members = [
    member({ id: 'm_11', userId: 'u_1', githubUserId: '1001', githubLogin: 'octo-kim', displayName: '김옥토', deskIndex: 0 }, c),
    member({ id: 'm_12', userId: 'u_review', githubUserId: null, githubLogin: null, displayName: '심사 계정', deskIndex: 1 }, c),
    member({ id: 'm_13', userId: null, githubUserId: null, githubLogin: null, displayName: '시연 팀원 A', deskIndex: 2, isRepoAdmin: true }, c),
    member({ id: 'm_14', userId: null, githubUserId: null, githubLogin: null, displayName: '시연 팀원 B', deskIndex: 3 }, c),
  ]
  const tasks = [
    task({ id: 't_11', n: 1, title: '시연: 로그인 화면', assignees: ['m_13'], labels: ['priority:high'], createdHoursAgo: 30, changedHoursAgo: 8 }, c),
    task({ id: 't_12', n: 2, title: '시연: 사무실 꾸미기', labels: [], createdHoursAgo: 29, changedHoursAgo: 29 }, c),
    task({ id: 't_13', n: 3, title: '시연: 첫 동기화', assignees: ['m_14'], labels: [], closed: 'completed', createdHoursAgo: 28, changedHoursAgo: 4 }, c),
  ]
  const submissions = [
    submission(
      {
        id: 's_11',
        n: 4,
        title: 'feat: 시연 로그인 화면',
        author: { memberId: 'm_13', login: null },
        state: 'open',
        headSha: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c',
        tasks: ['t_11'],
        round: { id: 'r_11', reasons: [{ verdict: 'recommend', reason: '시연 흐름이 짧아요' }] },
        createdHoursAgo: 8,
        changedHoursAgo: 7,
      },
      c,
    ),
  ]
  return {
    snapshot: {
      workspace: { id: 'ws_2', kind: 'demo', displayName: '시연 사무실', githubOwner: null, githubRepo: null, githubRepoId: null, htmlUrl: null, openedAt: ago(72) },
      settings: { projectStartDate: kstDate(now, -2), projectEndDate: kstDate(now, 11), specDocumentPath: null, reviewWaitHours: 48, noCommitHours: 48 },
      sync: idleSync(c.syncedAt),
      members,
      tasks,
      submissions,
      ...emptyCollections(),
      flow: computeFlow({ members, tasks, submissions }),
    },
    consentedUserIds: ['u_1', 'u_review'],
  }
}

export function createSeed(now: Date, session: MockSession | null): MockState {
  return { version: MOCK_STATE_VERSION, session, nextId: 100, workspaces: [teamWorkspace(now), demoWorkspace(now)] }
}

/** 새로 연 사무실 — 연 사람(레포 관리자)만 팀원이다. 나머지는 첫 동기화가 채운다고 본다. */
export function openedWorkspace(args: {
  id: Id
  memberId: Id
  repo: Omit<RepositoryChoice, 'workspaceId'>
  user: MeResponse
  settings: StoredSnapshot['settings']
  activityConsent: boolean
  now: Date
}): MockWorkspace {
  const { repo, user } = args
  const members: MemberDto[] = [
    {
      id: args.memberId,
      userId: user.user.userId,
      githubUserId: user.githubUserId,
      githubLogin: user.user.githubLogin,
      displayName: user.user.displayName,
      avatarUrl: user.user.avatarUrl,
      deskIndex: 0,
      isRepoAdmin: true,
      removedAt: null,
      syncedAt: null,
    },
  ]
  return {
    snapshot: {
      workspace: {
        id: args.id,
        kind: 'github',
        displayName: `${repo.owner}/${repo.name}`,
        githubOwner: repo.owner,
        githubRepo: repo.name,
        githubRepoId: repo.githubRepoId,
        htmlUrl: `https://github.com/${repo.owner}/${repo.name}`,
        openedAt: toInstant(args.now),
      },
      settings: args.settings,
      sync: idleSync(null),
      members,
      tasks: [],
      submissions: [],
      ...emptyCollections(),
      flow: computeFlow({ members, tasks: [], submissions: [] }),
    },
    consentedUserIds: args.activityConsent ? [user.user.userId] : [],
  }
}
