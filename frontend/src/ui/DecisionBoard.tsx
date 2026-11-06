// 관리 패널 "결정 기록" 탭 (#212 — FR-LRN-22 · FR-MTG-04 · FR-LRN-05 · 12, CONTRACTS_API.md 「10」). 소유: B (A 요청 — 리뷰 D).
// 결정 기록 · 피드백 요청 · 강사 피드백은 Snapshot agendaItems에 있다 — 쓰면 응답으로 바로 바꾸고, 다른 사람의 쓰기는 SSE(agenda_items)로 다시 읽는다.
// 팀원은 결정 기록에 강사 피드백을 요청하고, 강사는 요청이 켜진 결정 기록에만 피드백을 쓴다. 피드백은 팀 전체에게 보인다.
// 권한은 서버가 다시 검사한다(403) — 화면은 할 수 있는 버튼만 보인다.
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { INSTRUCTOR_FEEDBACK_MAX, decisionRecords, instructorFeedbackError } from '../data/rules/meeting'
import { kstToday } from '../data/rules/period'
import type { AgendaDecisionDto, AgendaItemDto, Id, MeetingDto, MemberDto, Viewer } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { formatMonthDay, relativeTime } from './format'
import { TextField } from './HelpBoard'
import { useNow } from './hooks'
import { Icon } from './icons'
import { AGENDA_KIND_LABEL, PR_DECISION_LABEL } from './meetingView'
import { useUi } from './uiState'
import './help.css'
import './decision.css'

type DecisionRecord = AgendaItemDto & { decision: AgendaDecisionDto }
type Members = ReadonlyMap<Id, MemberDto>

const memberName = (members: Members, id: Id | null) => (id ? members.get(id)?.displayName : undefined) ?? '알 수 없는 팀원'

/** 탭 본문 — 고른 결정 기록이 있으면 상세, 없으면 목록 */
export function DecisionPanel() {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const selectedId = useUi((s) => s.decisionItemId)
  const records = useMemo(() => (snapshot ? decisionRecords(snapshot.agendaItems) : []), [snapshot])
  const members = useMemo<Members>(() => new Map((snapshot?.members ?? []).map((m) => [m.id, m])), [snapshot])
  if (!snapshot) return <Empty icon="refresh" title="사무실을 불러오는 중…" />
  const selected = records.find((r) => r.id === selectedId) ?? null
  return selected ? (
    <DecisionDetail key={selected.id} record={selected} members={members} meetings={snapshot.meetings} viewer={snapshot.viewer} />
  ) : (
    <DecisionList records={records} viewer={snapshot.viewer} />
  )
}

function FeedbackChips({ record }: { record: DecisionRecord }) {
  const count = record.instructorFeedbacks.length
  return (
    <span className="help-chips">
      <span className="help-tag">{AGENDA_KIND_LABEL[record.kind]}</span>
      {record.decision.prDecision && <span className="help-tag">{PR_DECISION_LABEL[record.decision.prDecision]}</span>}
      {count > 0 ? (
        <span className="help-tag help-tag-good">강사 피드백 {count}</span>
      ) : (
        record.feedbackRequested && <span className="help-status help-status-open">피드백 요청됨</span>
      )}
    </span>
  )
}

// ---- 목록 ----------------------------------------------------------------------

function DecisionList({ records, viewer }: { records: DecisionRecord[]; viewer: Viewer }) {
  const now = useNow(60_000)
  if (records.length === 0) {
    return (
      <div className="help">
        <Empty icon="meeting" title="아직 결정 기록이 없어요" hint={viewer.role === 'instructor' ? '팀이 회의에서 안건을 결정하면 여기에 보여요.' : '회의에서 안건의 결론을 기록하면 여기에 쌓여요.'} />
      </div>
    )
  }
  return (
    <div className="help">
      <ul className="help-list" aria-label="결정 기록 목록">
        {records.map((r) => (
          <li key={r.id}>
            <button type="button" className="help-item" aria-label={`결정 기록: ${r.title}`} onClick={() => useUi.getState().openDecisionRecord(r.id)}>
              <FeedbackChips record={r} />
              <strong className="help-item-text">{r.title}</strong>
              <span className="help-item-text dim">{r.decision.conclusion}</span>
              <span className="help-item-foot">
                <span className="grow" />
                <span className="dim" title={r.decision.decidedAt}>
                  {relativeTime(r.decision.decidedAt, now)} 결정
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- 상세 ----------------------------------------------------------------------

function DecisionDetail({ record, members, meetings, viewer }: { record: DecisionRecord; members: Members; meetings: MeetingDto[]; viewer: Viewer }) {
  const now = useNow(60_000)
  const { decision } = record
  const meeting = decision.meetingId ? meetings.find((m) => m.id === decision.meetingId) : undefined
  const instructor = viewer.role === 'instructor'

  return (
    <article className="help" aria-label={`결정 기록: ${record.title}`}>
      <button type="button" className="btn btn-sm btn-ghost help-back" onClick={() => useUi.getState().openDecisionRecord(null)}>
        <Icon name="chevronLeft" size={14} />
        결정 기록 목록
      </button>
      <header className="help-head">
        <FeedbackChips record={record} />
        <h3 className="help-sub">{record.title}</h3>
      </header>

      <dl className="help-note decision-facts">
        <Fact label="결론">{decision.conclusion}</Fact>
        {decision.learning && <Fact label="배운 점">{decision.learning}</Fact>}
        {decision.prDecision && <Fact label="PR 결정">{PR_DECISION_LABEL[decision.prDecision]}</Fact>}
        {decision.followUpAssigneeMemberId && (
          <Fact label="더 알아볼 사람">
            {memberName(members, decision.followUpAssigneeMemberId)}
            {decision.followUpDueDate && ` · ${formatMonthDay(decision.followUpDueDate)}까지`}
          </Fact>
        )}
        {meeting && <Fact label="다룬 회의">{formatMonthDay(kstToday(new Date(meeting.startedAt)))} 회의</Fact>}
        <Fact label="기록">
          {memberName(members, decision.decidedByMemberId)} · <span title={decision.decidedAt}>{relativeTime(decision.decidedAt, now)}</span>
        </Fact>
      </dl>

      <h4 className="help-sub">강사 피드백 {record.instructorFeedbacks.length}</h4>
      {record.instructorFeedbacks.length > 0 && (
        <ul className="help-comments" aria-label="강사 피드백">
          {record.instructorFeedbacks.map((f) => (
            <li key={f.id} className="help-comment is-instructor">
              <span className="help-item-foot">
                <strong>{f.instructor.displayName}</strong>
                <span className="help-tag">강사</span>
                <span className="dim">· {relativeTime(f.createdAt, now)}</span>
              </span>
              <p className="help-comment-text">{f.body}</p>
            </li>
          ))}
        </ul>
      )}

      {instructor ? (
        record.feedbackRequested ? (
          <FeedbackForm agendaItemId={record.id} />
        ) : (
          <p className="help-note">팀이 강사 피드백을 요청하면 여기에 쓸 수 있어요.</p>
        )
      ) : (
        <FeedbackRequest record={record} now={now} />
      )}
    </article>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="decision-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** 팀원 — 결정 기록에 강사 피드백 요청. 켠 뒤에는 요청됨 표시 */
function FeedbackRequest({ record, now }: { record: DecisionRecord; now: number }) {
  const [busy, setBusy] = useState(false)
  if (record.feedbackRequested) {
    return (
      <p className="help-note help-note-good" role="status">
        강사 피드백을 요청했어요{record.feedbackRequestedAt ? ` · ${relativeTime(record.feedbackRequestedAt, now)}` : ''}
      </p>
    )
  }
  const request = async () => {
    setBusy(true)
    const done = await useOffice.getState().requestDecisionFeedback(record.id)
    setBusy(false)
    if (done) useOffice.getState().toast('good', '강사 피드백을 요청했어요')
  }
  return (
    <div className="help-actions">
      <span className="dim small">이 결정에 강사의 의견이 필요하면 요청해 보세요</span>
      <span className="grow" />
      <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void request()}>
        강사 피드백 요청
      </button>
    </div>
  )
}

/** 강사 — 요청이 켜진 결정 기록에만 */
function FeedbackForm({ agendaItemId }: { agendaItemId: Id }) {
  const [body, setBody] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const error = instructorFeedbackError({ body })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    const saved = await useOffice.getState().addInstructorFeedback(agendaItemId, body.trim())
    setBusy(false)
    if (!saved) return
    useOffice.getState().toast('good', '강사 피드백을 남겼어요')
    setBody('')
    setSubmitted(false)
  }

  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label="강사 피드백 쓰기">
      <TextField label="강사 피드백" value={body} max={INSTRUCTOR_FEEDBACK_MAX} rows={3} error={submitted ? error : null} placeholder="결정에 대한 의견을 남겨 주세요 — 팀 전체가 봐요" onChange={setBody} />
      <div className="help-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          피드백 남기기
        </button>
      </div>
    </form>
  )
}
