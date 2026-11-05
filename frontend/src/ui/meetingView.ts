// Meeting dialog rules over the v1 Snapshot (CONTRACTS_API.md 「10」), pure — MeetingDialogs.tsx draws them. OWNER: C.
// A meeting has attendees and notes; each agenda item gets its own decision (conclusion · learning · PR decision ·
// follow-up). Items not decided stay `confirmed` and carry over to the next meeting.
import type { AgendaItemDto, AgendaKind, DecisionRequest, MeetingDto, Viewer, WorkspaceSnapshot } from '../data/types'

export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  issue: '이슈',
  pr: 'PR',
  help_request: '도움 요청',
  learning: '배운 점',
  other: '기타',
}

export type PrDecision = NonNullable<DecisionRequest['prDecision']>

/** The PR decision is a record only — merging or closing happens on GitHub (CON-02 · P3). */
export const PR_DECISION_LABEL: Record<PrDecision, string> = {
  revise_and_reevaluate: '고쳐서 다시 평가',
  merge_as_is: '그대로 머지',
  close_pr: 'PR 닫기',
}
export const PR_DECISIONS = Object.keys(PR_DECISION_LABEL) as PrDecision[]

/** Instructors don't run meetings or record decisions (403 — FR-AUTH-08); team members do. */
export const canRunMeeting = (viewer: Viewer) => viewer.role !== 'instructor' && viewer.memberId !== null

/** Only the member who raised it can withdraw an item, before it is decided (FR-LRN-14). */
export const canWithdraw = (viewer: Viewer, item: AgendaItemDto) => item.status === 'confirmed' && viewer.memberId !== null && item.raisedByMemberId === viewer.memberId

/** The ongoing meeting, if any */
export const ongoingMeetingOf = (snapshot: Pick<WorkspaceSnapshot, 'meetings'>): MeetingDto | null => snapshot.meetings.find((m) => m.status === 'ongoing') ?? null

/** Items waiting for a decision, oldest first (the Snapshot keeps raisedAt order) */
export const confirmedAgenda = (snapshot: Pick<WorkspaceSnapshot, 'agendaItems'>): AgendaItemDto[] => snapshot.agendaItems.filter((a) => a.status === 'confirmed')

/** Items decided in this meeting, in the order they were decided */
export function decidedIn(snapshot: Pick<WorkspaceSnapshot, 'agendaItems'>, meeting: MeetingDto): AgendaItemDto[] {
  const byId = new Map(snapshot.agendaItems.map((a) => [a.id, a]))
  const fromMeeting = meeting.discussedAgendaItemIds.map((id) => byId.get(id)).filter((a): a is AgendaItemDto => a !== undefined)
  // The Snapshot's meeting may lag the item by one reload: also take items whose decision names this meeting.
  const extra = snapshot.agendaItems.filter((a) => a.decision?.meetingId === meeting.id && !meeting.discussedAgendaItemIds.includes(a.id))
  return [...fromMeeting, ...extra]
}

/** Ended meetings, newest first */
export function endedMeetings(snapshot: Pick<WorkspaceSnapshot, 'meetings'>, limit = 10): MeetingDto[] {
  return snapshot.meetings
    .filter((m) => m.status === 'ended')
    .sort((a, b) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt))
    .slice(0, limit)
}

/** What the item is about: "#12" for an issue, "PR #15", or the kind for items without a source. */
export function sourceText(snapshot: Pick<WorkspaceSnapshot, 'tasks' | 'submissions'>, item: AgendaItemDto): string {
  const src = item.source
  if (src?.type === 'task') {
    const t = snapshot.tasks.find((x) => x.id === src.id)
    return t ? `#${t.githubIssueNumber}` : '이슈'
  }
  if (src?.type === 'submission') {
    const s = snapshot.submissions.find((x) => x.id === src.id)
    return s ? `PR #${s.githubPrNumber}` : 'PR'
  }
  return AGENDA_KIND_LABEL[item.kind]
}

/**
 * PR decisions offered for a PR item. Re-evaluating needs an open PR: for a merged / closed PR the server refuses the whole
 * decision with 409 (CONTRACTS.md 「3」 평가 회차 — 2026-11-05), so that choice is not offered.
 */
export function prDecisionsFor(snapshot: Pick<WorkspaceSnapshot, 'submissions'>, item: AgendaItemDto): PrDecision[] {
  if (item.kind !== 'pr') return []
  const sub = item.source?.type === 'submission' ? snapshot.submissions.find((s) => s.id === item.source!.id) : undefined
  const open = sub !== undefined && (sub.state === 'open' || sub.state === 'draft')
  return open ? PR_DECISIONS : PR_DECISIONS.filter((d) => d !== 'revise_and_reevaluate')
}
