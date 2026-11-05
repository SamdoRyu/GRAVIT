// v1 상세 패널의 순수 함수 (#102 T5-c-2 · #12 FR-OFF-05). 소유: D.
// 상세는 읽기 전용이다 — 상태 · 담당 변경은 GitHub 화면으로 간다.
import type { GithubReviewDto, Id, SubmissionDto, TaskDto, WorkspaceSnapshot } from '../types'

export const REVIEW_STATE_LABEL: Record<GithubReviewDto['state'], string> = {
  approved: '승인',
  changes_requested: '변경 요청',
  commented: '코멘트',
  dismissed: '무시됨',
}

export const SUBMISSION_STATE_LABEL: Record<SubmissionDto['state'], string> = {
  open: '열림',
  draft: 'Draft',
  merged: '머지됨',
  closed: '머지 안 되고 닫힘',
}

/** 이슈 상태 문구 — 닫힘 사유로 완료 · 종료를 나눈다(CONTRACTS.md 「3」 구현 기본값) */
export function taskStateLabel(t: Pick<TaskDto, 'state' | 'closedReason'>): string {
  if (t.state === 'open') return '열림'
  return t.closedReason === 'not_planned' ? '계획 안 함으로 닫힘' : '완료로 닫힘'
}

/**
 * 리뷰어마다 가장 최근 리뷰 하나 — GitHub 리뷰 기록은 한 사람이 여러 번 남길 수 있다.
 * 리뷰어는 팀원이면 memberId, 아니면 GitHub 로그인으로 묶는다. 최근 리뷰가 먼저.
 */
export function latestReviews(reviews: readonly GithubReviewDto[]): GithubReviewDto[] {
  const byReviewer = new Map<string, GithubReviewDto>()
  for (const r of reviews) {
    const who = r.reviewerMemberId !== null ? `m:${r.reviewerMemberId}` : `g:${r.reviewerGithubLogin.toLowerCase()}`
    const prev = byReviewer.get(who)
    if (!prev || Date.parse(r.submittedAt) >= Date.parse(prev.submittedAt)) byReviewer.set(who, r)
  }
  return [...byReviewer.values()].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
}

export interface MemberWork {
  /** 담당자로 들어간 열린 이슈(대표가 아니어도) */
  openTasks: TaskDto[]
  /** 이 팀원이 연 열린 PR(Draft 포함) */
  openSubmissions: SubmissionDto[]
  /** 이 팀원에게 리뷰를 요청한 열린 PR */
  reviewRequests: SubmissionDto[]
}

const isOpenPr = (s: SubmissionDto) => s.state === 'open' || s.state === 'draft'

/** 팀원 상세 — 그 사람이 맡은 일. 사람별 비교 · 업무량 값은 만들지 않는다(FR-FLOW-06). 번호 순 */
export function memberWork(snapshot: Pick<WorkspaceSnapshot, 'tasks' | 'submissions'>, memberId: Id): MemberWork {
  const byIssue = (a: TaskDto, b: TaskDto) => a.githubIssueNumber - b.githubIssueNumber
  const byPr = (a: SubmissionDto, b: SubmissionDto) => a.githubPrNumber - b.githubPrNumber
  return {
    openTasks: snapshot.tasks.filter((t) => t.state === 'open' && t.assigneeMemberIds.includes(memberId)).sort(byIssue),
    openSubmissions: snapshot.submissions.filter((s) => isOpenPr(s) && s.authorMemberId === memberId).sort(byPr),
    reviewRequests: snapshot.submissions.filter((s) => isOpenPr(s) && s.reviewRequestedMemberIds.includes(memberId)).sort(byPr),
  }
}

/** ID 목록을 Snapshot에서 찾는다 — 없는 ID(동기화 사이 어긋남)는 건너뛴다. 순서는 목록 그대로 */
export function pick<T extends { id: Id }>(list: readonly T[], ids: readonly Id[]): T[] {
  const byId = new Map(list.map((x) => [x.id, x]))
  return ids.flatMap((id) => {
    const x = byId.get(id)
    return x ? [x] : []
  })
}
