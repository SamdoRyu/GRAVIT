// 학습 타임라인 · 회고 리포트 규칙 (CONTRACTS_API.md 「15」). 순수 함수 — mock과 화면이 같은 규칙 · 문구를 쓴다.
// 서버(TimelineService · RetroReportService)와 같은 계산이다. 서버는 같은 검사를 다시 한다(400 invalid). #209.
import type {
  AgendaItemDto,
  EvaluationRoundDto,
  Id,
  Instant,
  MemberDto,
  PageResponse,
  RetroReportDto,
  RetroReportSummary,
  SubmissionDto,
  TaskDto,
  TimelineEntry,
  Verdict,
} from '../types'

export type ReportKind = RetroReportSummary['kind']

export const REPORT_KINDS: readonly ReportKind[] = ['final', 'midterm']
export const REPORT_KIND_LABEL: Record<ReportKind, string> = { final: '최종', midterm: '중간' }
/** 내가 배운 점 — 0~5000자 */
export const REPORT_LEARNING_MAX = 5000
/** 타임라인 페이지 — 서버 PageResponse.DEFAULT_SIZE · MAX_SIZE (CONTRACTS.md 「4」) */
export const TIMELINE_PAGE_SIZE = 20
export const TIMELINE_PAGE_SIZE_MAX = 100

export const REPORT_MSG = {
  kind: '리포트 종류는 최종 · 중간 중에서 골라 주세요',
  learning: `내가 배운 점은 ${REPORT_LEARNING_MAX}자까지 쓸 수 있어요`,
  page: '페이지 범위가 올바르지 않아요',
  memberNotFound: '팀원을 찾을 수 없어요',
  reportNotFound: '리포트를 찾을 수 없어요',
  notSelf: '본인 것만 볼 수 있어요',
  notSelfWrite: '본인 것만 쓸 수 있어요',
} as const

/** `POST W/members/{memberId}/reports` 검사 */
export function reportCreateError(req: unknown): string | null {
  const kind = typeof req === 'object' && req !== null ? (req as { kind?: unknown }).kind : undefined
  return REPORT_KINDS.includes(kind as ReportKind) ? null : REPORT_MSG.kind
}

/** `PUT …/reports/{reportId}/learning` 검사 — 문자열 0~5000자(빈 값으로 지울 수 있다) */
export function reportLearningError(req: unknown): string | null {
  const learning = typeof req === 'object' && req !== null ? (req as { learning?: unknown }).learning : undefined
  return typeof learning === 'string' && Array.from(learning).length <= REPORT_LEARNING_MAX ? null : REPORT_MSG.learning
}

/** 타임라인 페이지 인자 — page 0 이상, size 1~100 정수 */
export function timelinePageError(page: number, size: number): string | null {
  const ok = Number.isInteger(page) && page >= 0 && Number.isInteger(size) && size >= 1 && size <= TIMELINE_PAGE_SIZE_MAX
  return ok ? null : REPORT_MSG.page
}

/** 이미 정렬된 전체 목록에서 한 페이지 — 마지막 페이지 뒤는 빈 items (서버 PageResponse.slice) */
export function slicePage<T>(all: readonly T[], page: number, size: number): PageResponse<T> {
  const from = Math.min(page * size, all.length)
  return { items: all.slice(from, from + size), page, size, totalItems: all.length, totalPages: Math.ceil(all.length / size) }
}

// ---- 학습 타임라인 -------------------------------------------------------------

export interface TimelineInput {
  memberId: Id
  submissions: readonly SubmissionDto[]
  /** 그 PR의 모든 회차(현재 · 지난) — 이유는 평가자 없이 추천 먼저 */
  roundsOf: (submission: SubmissionDto) => readonly EvaluationRoundDto[]
  /** 그 팀원이 남긴 평가 — 회차마다 하나, updatedAt은 마지막으로 고친 시각 */
  evaluationsGiven: readonly { submissionId: Id; verdict: Verdict; reason: string; updatedAt: Instant }[]
  agendaItems: readonly AgendaItemDto[]
}

const prTitle = (pr: Pick<SubmissionDto, 'githubPrNumber' | 'title'>) => `#${pr.githubPrNumber} ${pr.title}`

/**
 * 그 팀원의 학습 타임라인 전체 — occurredAt 내림차순(같은 시각은 모은 순서). 평가자는 싣지 않는다.
 * evaluation_received의 occurredAt은 회차가 열린 시각(서버 [구현 기본값]). commit_after_meeting은 아직 없다(#34와 같은 선행).
 */
export function timelineEntries(input: TimelineInput): TimelineEntry[] {
  const { memberId } = input
  const entries: TimelineEntry[] = []
  const prById = new Map(input.submissions.map((pr) => [pr.id, pr]))
  for (const pr of input.submissions) {
    if (pr.authorMemberId !== memberId) continue
    for (const round of input.roundsOf(pr)) {
      for (const r of round.reasons) {
        entries.push({ kind: 'evaluation_received', occurredAt: round.openedAt, title: prTitle(pr), detail: r.reason, verdict: r.verdict, ref: { type: 'submission', id: pr.id } })
      }
    }
  }
  for (const given of input.evaluationsGiven) {
    const pr = prById.get(given.submissionId)
    if (!pr) continue
    entries.push({ kind: 'evaluation_given', occurredAt: given.updatedAt, title: prTitle(pr), detail: given.reason, verdict: given.verdict, ref: { type: 'submission', id: pr.id } })
  }
  for (const item of input.agendaItems) {
    if (item.raisedByMemberId !== memberId) continue
    const ref = { type: 'agenda_item', id: item.id } as const
    entries.push({ kind: 'agenda_raised', occurredAt: item.raisedAt, title: item.title, detail: item.background, verdict: null, ref })
    if (item.decision) entries.push({ kind: 'agenda_decided', occurredAt: item.decision.decidedAt, title: item.title, detail: item.decision.conclusion, verdict: null, ref })
    for (const f of item.instructorFeedbacks) entries.push({ kind: 'instructor_feedback', occurredAt: f.createdAt, title: item.title, detail: f.body, verdict: null, ref })
  }
  // 정렬은 안정적이라 같은 시각은 모은 순서 그대로다(서버 List.sort와 같다)
  return entries.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

// ---- 회고 리포트 ---------------------------------------------------------------

/** 저장하는 칸 — 나머지는 읽을 때 지금 데이터로 계산한다 */
export interface StoredReport {
  id: Id
  memberId: Id
  kind: ReportKind
  createdAt: Instant
  learning: string | null
}

export interface ReportInput {
  tasks: readonly TaskDto[]
  submissions: readonly SubmissionDto[]
  agendaItems: readonly AgendaItemDto[]
  /** 본인의 확인된 활동 — 유형별 분 합계 (FR-ACT-03) */
  activityDistribution: RetroReportDto['activityDistribution']
  /** 본인이 확인한 카드만 (P11) — createdAt 내림차순 */
  decisionCards: RetroReportDto['decisionCards']
}

const byTime = <T>(at: (x: T) => Instant) => (a: T, b: T) => Date.parse(at(a)) - Date.parse(at(b))

/** 저장된 리포트 + 지금 데이터 → 응답 (서버 RetroReportService.toDto와 같은 계산) */
export function retroReportView(report: StoredReport, input: ReportInput): RetroReportDto {
  const me = report.memberId
  const myIssues = input.tasks.filter((t) => t.assigneeMemberIds.includes(me))
  const myPrs = input.submissions.filter((pr) => pr.authorMemberId === me)
  const myAgenda = input.agendaItems.filter((a) => a.raisedByMemberId === me)
  const agendaResults = myAgenda
    .flatMap((a) => (a.decision ? [{ agendaItemId: a.id, title: a.title, conclusion: a.decision.conclusion, learning: a.decision.learning, prDecision: a.decision.prDecision, decidedAt: a.decision.decidedAt }] : []))
    .sort(byTime((r) => r.decidedAt))
  const instructorFeedbacks = myAgenda
    .flatMap((a) => a.instructorFeedbacks.map((f) => ({ agendaItemId: a.id, instructor: f.instructor, body: f.body, createdAt: f.createdAt })))
    .sort(byTime((f) => f.createdAt))
  const areaLabels = [...new Set([...myIssues.flatMap((t) => t.labels), ...myPrs.flatMap((pr) => pr.labels)].filter((l) => l.startsWith('area:')))].sort()
  const summary =
    `맡은 이슈 ${myIssues.length}개(닫힘 ${myIssues.filter((t) => t.state === 'closed').length}) · ` +
    `작성한 PR ${myPrs.length}개(머지 ${myPrs.filter((pr) => pr.state === 'merged').length}) · ` +
    `올린 안건 ${myAgenda.length}건(결론 ${agendaResults.length})`
  // 키 순서는 계약 표 그대로
  return {
    id: report.id,
    kind: report.kind,
    createdAt: report.createdAt,
    memberId: me,
    summary,
    areaLabels,
    learning: report.learning,
    agendaResults,
    instructorFeedbacks,
    activityDistribution: input.activityDistribution,
    decisionCards: input.decisionCards,
  }
}

const NONE = '- 없음'
/** 마크다운의 활동 유형 이름 — 서버와 같다(#173) */
export const ACTIVITY_KIND_LABEL: Record<RetroReportDto['activityDistribution'][number]['kind'], string> = {
  planning: '기획',
  research: '자료조사',
  design: '디자인',
  presentation: '발표 준비',
  mentor_question: '멘토 질문',
}
const CELL_LABELS: [keyof RetroReportDto['decisionCards'][number]['cells'], string][] = [
  ['goal', '무엇을 하려 했나'],
  ['initialApproach', '처음 택한 방법'],
  ['feedbackReceived', '받은 평가'],
  ['meetingDecision', '회의에서 정한 것'],
  ['finalChange', '최종적으로 바꾼 것'],
  ['rationale', '왜 그렇게 결정했나'],
  ['blockedMoment', '막혔던 순간'],
  ['learning', '내가 배운 점'],
  ['source', '원본'],
]

/** 리포트 → 마크다운(익명화 전). 서버 RetroReportService.toMarkdown과 같은 모양 */
export function reportMarkdown(report: RetroReportDto): string {
  const out: string[] = []
  out.push(`# ${REPORT_KIND_LABEL[report.kind]} 회고 리포트\n\n`, `- 만든 시각: ${report.createdAt}\n\n`, `## 요약\n\n${report.summary}\n\n`, '## 담당 기능 영역\n\n')
  for (const label of report.areaLabels) out.push(`- ${label}\n`)
  if (report.areaLabels.length === 0) out.push(`${NONE}\n`)
  out.push(`\n## 내가 배운 점\n\n${report.learning === null || report.learning.trim() === '' ? NONE : report.learning}\n\n## 안건 결론\n\n`)
  for (const r of report.agendaResults) {
    out.push(`### ${r.title}\n\n`, `- 결론: ${r.conclusion}\n`)
    if (r.learning !== null) out.push(`- 배운 점: ${r.learning}\n`)
    if (r.prDecision !== null) out.push(`- PR 결정: ${r.prDecision}\n`)
    out.push(`- 결정 시각: ${r.decidedAt}\n\n`)
  }
  if (report.agendaResults.length === 0) out.push(`${NONE}\n\n`)
  out.push('## 강사 피드백\n\n')
  for (const f of report.instructorFeedbacks) out.push(`- ${f.createdAt} 강사: ${f.body}\n`)
  if (report.instructorFeedbacks.length === 0) out.push(`${NONE}\n`)
  out.push('\n## 활동 분포\n\n')
  for (const a of report.activityDistribution) out.push(`- ${ACTIVITY_KIND_LABEL[a.kind]}: ${a.totalMinutes}분\n`)
  if (report.activityDistribution.length === 0) out.push(`${NONE}\n`)
  out.push('\n## 기술 결정 카드\n\n')
  for (const card of report.decisionCards) {
    out.push(`### 확인한 카드 — ${card.confirmedAt}\n\n`)
    for (const [key, label] of CELL_LABELS) {
      const value = card.cells[key]
      if (value !== null && value.trim() !== '') out.push(`- ${label}: ${value.replaceAll('\n', '\n  ')}\n`)
    }
    for (const q of card.followUpQuestions) out.push(`- ${q.createdAt} 강사 꼬리질문: ${q.body}\n`)
    out.push('\n')
  }
  if (report.decisionCards.length === 0) out.push(`${NONE}\n`)
  return out.join('')
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 팀원 이름 · 로그인을 처음 나온 순서대로 "팀원 A" · "팀원 B"…로 바꾼다(FR-REP-03, 빠진 팀원 포함). 서버 anonymize와 같은 규칙 —
 * 대소문자 무시, 긴 이름 먼저, 영문 · 숫자 · _ · -에 붙은 곳은 다른 단어로 보고 건너뛴다(한글 조사는 붙어도 바꾼다).
 */
export function anonymizeMembers(text: string, members: readonly Pick<MemberDto, 'id' | 'displayName' | 'githubLogin'>[]): string {
  const memberIdByAlias = new Map<string, Id>()
  for (const m of members) {
    for (const alias of [m.displayName, m.githubLogin]) {
      if (alias && alias.trim() !== '' && !memberIdByAlias.has(alias.toLowerCase())) memberIdByAlias.set(alias.toLowerCase(), m.id)
    }
  }
  if (memberIdByAlias.size === 0) return text
  const alternatives = [...memberIdByAlias.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])(?:${alternatives})(?![A-Za-z0-9_-])`, 'giu')
  const labelByMemberId = new Map<Id, string>()
  return text.replace(pattern, (match) => {
    const id = memberIdByAlias.get(match.toLowerCase())!
    if (!labelByMemberId.has(id)) labelByMemberId.set(id, `팀원 ${String.fromCharCode(65 + labelByMemberId.size)}`)
    return labelByMemberId.get(id)!
  })
}
