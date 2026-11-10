// Meeting dialogs over the open v1 office (CONTRACTS_API.md 「10」 · #102 T5-c-2). OWNER: C.
// Start: attendees (may be none — FR-MTG-05) and the confirmed agenda; the raiser can withdraw an item before it is decided.
// End: record a decision per agenda item (conclusion · PR decision · follow-up), then end with notes — lessons and what was
// discussed go in the notes (#318 — no separate learning inputs; existing learning items · decision lessons still show). Items left
// undecided stay on the agenda for the next meeting. The PR decision is a record only — merging or closing happens on GitHub.
// History: ended meetings with the decisions made in them.
// Other items (no source — #31) are written in the start and end dialogs; issues / PRs are raised from the 3D bridge.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AGENDA_TEXT_MAX, AGENDA_TITLE_MAX, agendaCreateError, blankToNull, decisionError, DECISION_TEXT_MAX, MEETING_MSG, MEETING_NOTES_MAX, meetingEndError } from '../data/rules/meeting'
import type { AgendaItemCreateRequest, AgendaItemDto, Id, MeetingDto, MemberDto, WorkspaceSnapshot } from '../data/types'
import { useOffice } from '../store'
import { Empty, Field } from './common'
import { Modal } from './Dialogs'
import { FieldError, FormAlert } from './ErrorStates'
import { useWriteProblem } from './useWriteProblem'
import { formatClock, formatDate, formatDuration, localDateOf } from './format'
import { Icon } from './icons'
import {
  AGENDA_KIND_LABEL,
  canRunMeeting,
  canWithdraw,
  confirmedAgenda,
  decidedIn,
  endedMeetings,
  ongoingMeetingOf,
  PR_DECISION_LABEL,
  prDecisionsFor,
  sourceText,
  type PrDecision,
} from './meetingView'
import { GithubLink, MemberAvatar } from './officeParts'
import { useUi } from './uiState'

function close() {
  useOffice.getState().openDialog(null)
}

const useSnapshot = () => useOffice((s) => s.office?.snapshot ?? null)
const currentMembers = (snapshot: WorkspaceSnapshot) => snapshot.members.filter((m) => m.removedAt === null)
const memberName = (snapshot: WorkspaceSnapshot, id: Id | null) => (id === null ? null : (snapshot.members.find((m) => m.id === id)?.displayName ?? '알 수 없는 팀원'))

/** One agenda line: kind · source · title · who raised it */
function AgendaLine({ item, snapshot }: { item: AgendaItemDto; snapshot: WorkspaceSnapshot }) {
  return (
    <>
      <span className="agenda-kind">{AGENDA_KIND_LABEL[item.kind]}</span>
      {item.source && <span className="card-key">{sourceText(snapshot, item)}</span>}
      <span className="mini-title" title={item.title}>
        {item.title}
      </span>
      <span className="dim small agenda-by">{memberName(snapshot, item.raisedByMemberId)}</span>
    </>
  )
}

// ---- Start -------------------------------------------------------------------

export function StartMeetingDialog() {
  const snapshot = useSnapshot()
  const live = snapshot ? ongoingMeetingOf(snapshot) : null
  const members = useMemo(() => (snapshot ? currentMembers(snapshot) : []), [snapshot])
  const [picked, setPicked] = useState<Set<Id>>(() => new Set(members.map((m) => m.id)))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (live) close() // someone else started one meanwhile: the top bar shows it
  }, [live])

  if (!snapshot) return null
  const agenda = confirmedAgenda(snapshot)
  const allowed = canRunMeeting(snapshot.viewer)
  const attendeeIds = members.filter((m) => picked.has(m.id)).map((m) => m.id)
  const allOn = members.length > 0 && attendeeIds.length === members.length

  const toggle = (id: Id) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // No surrounding <form>: the learning · other form inside the agenda section is a form of its own.
  const start = async () => {
    if (busy || !allowed) return
    setBusy(true)
    const st = useOffice.getState()
    if (await st.startOfficeMeeting(attendeeIds)) {
      st.toast('good', '회의를 시작했어요')
      close()
    } else {
      setBusy(false)
    }
  }

  return (
    <Modal title="회의 시작" onClose={close} width={540}>
      <>
        <div className="modal-body">
          <div className="fld">
            <div className="fld-row">
              <span className="fld-label">
                참석자 {attendeeIds.length}/{members.length}명
              </span>
              {members.length > 0 && (
                <button type="button" className="link-btn" onClick={() => setPicked(allOn ? new Set() : new Set(members.map((m) => m.id)))}>
                  {allOn ? '모두 해제' : '모두 선택'}
                </button>
              )}
            </div>
            {members.length === 0 ? (
              <p className="dim small">아직 팀원이 없어요.</p>
            ) : (
              <div className="fchips" role="group" aria-label="참석자">
                {members.map((m) => (
                  <button key={m.id} type="button" aria-pressed={picked.has(m.id)} className={`fchip fchip-lg${picked.has(m.id) ? ' is-on' : ''}`} onClick={() => toggle(m.id)}>
                    <MemberAvatar member={m} size={16} />
                    {m.displayName}
                  </button>
                ))}
              </div>
            )}
            <p className="dim small">참석자 없이도 시작할 수 있어요</p>
          </div>

          <div className="fld">
            <span className="fld-label">안건 {agenda.length}개 · 올린 순서</span>
            {agenda.length === 0 ? (
              <p className="agenda-empty">아직 안건이 없어요.</p>
            ) : (
              <ul className="agenda-list" aria-label="안건">
                {agenda.map((a) => (
                  <li key={a.id}>
                    <AgendaLine item={a} snapshot={snapshot} />
                    {canWithdraw(snapshot.viewer, a) && (
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost btn-xs"
                        aria-label={`${a.title} 안건 거두기`}
                        title="안건 거두기 (올린 사람만)"
                        onClick={() => void useOffice.getState().withdrawAgendaItem(a.id)}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="dim small">이슈 상자 · PR 삼각기둥을 회의실로 끌어 안건을 올려요</p>
            {allowed && <AgendaNoteForm />}
          </div>
          {!allowed && <p className="notice notice-warn">강사는 회의를 시작할 수 없어요.</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={close}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !allowed} data-autofocus onClick={() => void start()}>
            회의 시작
          </button>
        </footer>
      </>
    </Modal>
  )
}

// ---- Raise (an issue / PR dropped on the bridge — #30 · #26) ------------------

/** Puts an issue / PR on the agenda (POST agenda-items). The original stays where it is. */
export function RaiseAgendaDialog({ source }: { source: { type: 'task' | 'submission'; id: Id } }) {
  const snapshot = useSnapshot()
  const task = source.type === 'task' ? snapshot?.tasks.find((t) => t.id === source.id) : undefined
  const pr = source.type === 'submission' ? snapshot?.submissions.find((s) => s.id === source.id) : undefined
  const original = task ?? pr
  const [title, setTitle] = useState(() => Array.from(original?.title ?? '').slice(0, AGENDA_TITLE_MAX).join(''))
  const [background, setBackground] = useState('')
  const [tried, setTried] = useState('')
  const [unresolved, setUnresolved] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  // 실패해도 쓴 내용은 그대로 — 원인 · 다음 행동은 폼 위, 입력 오류는 아래 (#274 — D 공용)
  const formRef = useRef<HTMLFormElement>(null)
  const w = useWriteProblem('raiseAgenda', { resubmit: () => formRef.current?.requestSubmit() })

  if (!snapshot) return null
  if (!original) {
    // The issue / PR left the Snapshot (e.g. a resync) while the dialog opened
    return (
      <Modal title="안건 올리기" onClose={close}>
        <div className="modal-body">
          <p className="notice notice-warn">이 이슈 · PR을 더 찾을 수 없어요.</p>
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" data-autofocus onClick={close}>
            닫기
          </button>
        </footer>
      </Modal>
    )
  }
  const kind = source.type === 'task' ? 'issue' : 'pr'
  const label = task ? `이슈 #${task.githubIssueNumber}` : `PR #${pr!.githubPrNumber}`
  const allowed = canRunMeeting(snapshot.viewer)
  const request = { kind, sourceId: source.id, title, background: blankToNull(background), tried: blankToNull(tried), unresolvedReason: blankToNull(unresolved) } as const
  const error = agendaCreateError(request)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy || !allowed) return
    setBusy(true)
    w.clear()
    const st = useOffice.getState()
    if (await st.raiseAgendaItem({ ...request, title: title.trim() }, w.report)) {
      st.toast('good', '안건을 올렸어요')
      close()
    } else {
      setBusy(false)
    }
  }

  return (
    <Modal title="안건 올리기" onClose={close} width={520}>
      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="modal-body">
          {w.notice && <FormAlert notice={w.notice} busy={w.busy} onAction={w.act} />}
          <p className="raise-source">
            <span className="agenda-kind">{AGENDA_KIND_LABEL[kind]}</span>
            <span className="card-key">{label}</span>
            <span className="mini-title" title={original.title}>
              {original.title}
            </span>
          </p>
          <Field label="무엇을 이야기할까요" error={submitted && error === MEETING_MSG.agendaTitle ? error : ''}>
            <input className="select" type="text" data-autofocus value={title} maxLength={AGENDA_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="배경 (선택)">
            <textarea className="select" rows={2} value={background} maxLength={AGENDA_TEXT_MAX} onChange={(e) => setBackground(e.target.value)} />
          </Field>
          <Field label="해 본 것 (선택)">
            <textarea className="select" rows={2} value={tried} maxLength={AGENDA_TEXT_MAX} onChange={(e) => setTried(e.target.value)} />
          </Field>
          <Field label="혼자 결론 못 낸 이유 (선택)">
            <textarea className="select" rows={2} value={unresolved} maxLength={AGENDA_TEXT_MAX} onChange={(e) => setUnresolved(e.target.value)} />
          </Field>
          {pr?.currentRound && <p className="dim small">지금 평가 회차({pr.currentRound.roundNumber}회차)를 함께 기억해요</p>}
          <p className="dim small">원본 {AGENDA_KIND_LABEL[kind]}은 제자리에 그대로 있어요</p>
          {submitted && error && error !== MEETING_MSG.agendaTitle && <p className="notice notice-warn">{error}</p>}
          {w.field && <FieldError text={w.field} />}
          {!allowed && <p className="notice notice-warn">강사는 안건을 올릴 수 없어요.</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={close}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !allowed}>
            안건 올리기
          </button>
        </footer>
      </form>
    </Modal>
  )
}

// ---- Write an other item (no source — #31 · FR-LRN-11) -----------------------

/**
 * Puts an other item on the agenda (POST agenda-items, kind 'other', sourceId null). Collapsed to one button until opened;
 * after raising it folds back and the item joins the agenda list above it (and the bridge table in 3D). Lessons are not
 * raised here any more — they go in the meeting notes when ending the meeting (#318).
 */
function AgendaNoteForm() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [background, setBackground] = useState('')
  const [tried, setTried] = useState('')
  const [unresolved, setUnresolved] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const w = useWriteProblem('raiseAgenda', { resubmit: () => formRef.current?.requestSubmit() })

  if (!open) {
    return (
      <button type="button" className="btn btn-sm agenda-note-open" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        기타 안건 쓰기
      </button>
    )
  }

  const request: AgendaItemCreateRequest = {
    kind: 'other',
    sourceId: null,
    title,
    background: blankToNull(background),
    tried: blankToNull(tried),
    unresolvedReason: blankToNull(unresolved),
  }
  const error = agendaCreateError(request)
  const reset = () => {
    setOpen(false)
    setTitle('')
    setBackground('')
    setTried('')
    setUnresolved('')
    setSubmitted(false)
    setBusy(false)
    w.clear()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    w.clear()
    const st = useOffice.getState()
    if (await st.raiseAgendaItem({ ...request, title: title.trim() }, w.report)) {
      st.toast('good', `${AGENDA_KIND_LABEL.other} 안건을 올렸어요`)
      reset()
    } else {
      setBusy(false)
    }
  }

  return (
    <form ref={formRef} className="agenda-note" onSubmit={submit} noValidate aria-label="기타 안건 쓰기">
      {w.notice && <FormAlert notice={w.notice} busy={w.busy} onAction={w.act} />}
      <Field label="무엇을 이야기할까요" error={submitted && error === MEETING_MSG.agendaTitle ? error : ''}>
        <input className="select" type="text" autoFocus value={title} maxLength={AGENDA_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="배경 (선택)">
        <textarea className="select" rows={2} value={background} maxLength={AGENDA_TEXT_MAX} placeholder="이야기를 꺼낸 배경" onChange={(e) => setBackground(e.target.value)} />
      </Field>
      <Field label="해 본 것 (선택)">
        <textarea className="select" rows={2} value={tried} maxLength={AGENDA_TEXT_MAX} onChange={(e) => setTried(e.target.value)} />
      </Field>
      <Field label="혼자 결론 못 낸 이유 (선택)">
        <textarea className="select" rows={2} value={unresolved} maxLength={AGENDA_TEXT_MAX} onChange={(e) => setUnresolved(e.target.value)} />
      </Field>
      {submitted && error && error !== MEETING_MSG.agendaTitle && <p className="notice notice-warn">{error}</p>}
      {w.field && <FieldError text={w.field} />}
      <div className="decision-foot">
        <button type="button" className="btn btn-sm" onClick={reset}>
          취소
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          안건 올리기
        </button>
      </div>
    </form>
  )
}

// ---- End ---------------------------------------------------------------------

/** The decision form of one agenda item (POST agenda-items/{id}/decision) */
function DecisionForm({ item, meeting, snapshot, members }: { item: AgendaItemDto; meeting: MeetingDto; snapshot: WorkspaceSnapshot; members: MemberDto[] }) {
  const [conclusion, setConclusion] = useState('')
  const [prDecision, setPrDecision] = useState<PrDecision | null>(null)
  const [followUp, setFollowUp] = useState('')
  const [followUpDue, setFollowUpDue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const choices = prDecisionsFor(snapshot, item)
  const pr = item.source?.type === 'submission' ? snapshot.submissions.find((s) => s.id === item.source!.id) : undefined

  const request = {
    conclusion,
    // 배운 점은 회의록에 적는다(#318) — 결정마다 따로 받지 않는다
    learning: null,
    prDecision,
    followUpAssigneeMemberId: followUp === '' ? null : followUp,
    followUpDueDate: followUpDue === '' ? null : followUpDue,
    meetingId: meeting.id,
  }
  const error = decisionError(request, item.kind)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    const saved = await useOffice.getState().recordAgendaDecision(item.id, { ...request, conclusion: conclusion.trim() })
    if (!saved) setBusy(false) // on success the item leaves the confirmed list and this form unmounts
  }

  return (
    <form className="decision" onSubmit={submit} noValidate aria-label={`${item.title} 결정`}>
      <Field label="결론" error={submitted && !conclusion.trim() ? '결론을 적어 주세요' : ''}>
        <textarea className="select" rows={2} value={conclusion} maxLength={DECISION_TEXT_MAX} placeholder="무엇으로 정했는지" onChange={(e) => setConclusion(e.target.value)} />
      </Field>
      {item.kind === 'pr' && (
        <div className="fld">
          <span className="fld-label">PR 결정</span>
          <div className="seg" role="radiogroup" aria-label={`${item.title} PR 결정`}>
            {choices.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={prDecision === d} className={prDecision === d ? 'is-on' : ''} onClick={() => setPrDecision(d)}>
                {PR_DECISION_LABEL[d]}
              </button>
            ))}
          </div>
          <span className="dim small">
            기록만 남아요 — 실제 머지 · 닫기는 GitHub에서 해요{prDecision === 'revise_and_reevaluate' ? ' · 새 평가 회차가 열려요' : ''}
          </span>
          {pr?.htmlUrl && <GithubLink href={pr.htmlUrl} label={`GitHub에서 PR #${pr.githubPrNumber} 열기`} text={`PR #${pr.githubPrNumber} 열기`} />}
          {submitted && error && prDecision === null && <em className="fld-error">{error}</em>}
        </div>
      )}
      <div className="decision-follow">
        <Field label="더 알아볼 사람 (선택)">
          <select className="select select-sm" value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
            <option value="">없음</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="기한 (선택)">
          <input className="select select-sm" type="date" value={followUpDue} onChange={(e) => setFollowUpDue(e.target.value)} />
        </Field>
      </div>
      {submitted && error && (item.kind !== 'pr' || prDecision !== null) && conclusion.trim() !== '' && (
        <em className="fld-error" role="alert">
          {error}
        </em>
      )}
      <div className="decision-foot">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          결정 기록
        </button>
      </div>
    </form>
  )
}

export function EndMeetingDialog({ meetingId }: { meetingId: Id }) {
  const snapshot = useSnapshot()
  // The top bar passes the ongoing meeting's id; fall back to the ongoing one if that id is not a v1 meeting.
  const meeting = snapshot ? (snapshot.meetings.find((m) => m.id === meetingId) ?? ongoingMeetingOf(snapshot)) : null
  const [notes, setNotes] = useState('')
  const [open, setOpen] = useState<Id | null>(null)
  const [busy, setBusy] = useState(false)
  /** True while our own end call is in flight, so its Snapshot update isn't mistaken for "ended elsewhere". */
  const endingHere = useRef(false)

  const ongoing = meeting?.status === 'ongoing'
  useEffect(() => {
    if (ongoing) return
    if (!endingHere.current) useOffice.getState().toast('info', '회의가 이미 끝났어요')
    close()
  }, [ongoing])

  if (!snapshot || !meeting) return null
  const agenda = confirmedAgenda(snapshot)
  const decided = decidedIn(snapshot, meeting)
  const members = currentMembers(snapshot)
  const allowed = canRunMeeting(snapshot.viewer)
  const notesError = meetingEndError({ notes: blankToNull(notes) })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || notesError || !allowed) return
    setBusy(true)
    endingHere.current = true
    const st = useOffice.getState()
    if (await st.endOfficeMeeting(meeting.id, blankToNull(notes))) {
      st.toast('good', decided.length > 0 ? `회의를 마쳤어요 · 결정 ${decided.length}건` : '회의를 마쳤어요')
      close()
    } else {
      endingHere.current = false
      setBusy(false)
    }
  }

  return (
    <Modal title={`회의 종료 · ${formatClock(meeting.startedAt)} 시작`} onClose={close} width={600}>
      <div className="modal-body">
        <div className="fld">
          <span className="fld-label">결정할 안건 {agenda.length}개</span>
          {agenda.length === 0 ? (
            <p className="agenda-empty">결정할 안건이 없어요.</p>
          ) : (
            <ul className="outcomes" aria-label="결정할 안건">
              {agenda.map((a) => (
                <li key={a.id} className="outcome">
                  <div className="outcome-top">
                    <AgendaLine item={a} snapshot={snapshot} />
                    {allowed && (
                      <button type="button" className="btn btn-sm" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                        {open === a.id ? '접기' : '결정하기'}
                      </button>
                    )}
                  </div>
                  {open === a.id && <DecisionForm item={a} meeting={meeting} snapshot={snapshot} members={members} />}
                </li>
              ))}
            </ul>
          )}
          {agenda.length > 0 && <p className="dim small">결정하지 않은 안건은 다음 회의로 넘어가요</p>}
          {allowed && <AgendaNoteForm />}
        </div>

        {decided.length > 0 && (
          <div className="fld">
            <span className="fld-label">이번 회의에서 결정 {decided.length}건</span>
            <ul className="minutes-decisions" aria-label="이번 회의 결정">
              {decided.map((a) => (
                <DecisionLine key={a.id} item={a} snapshot={snapshot} />
              ))}
            </ul>
          </div>
        )}

        <form id="end-meeting" onSubmit={submit} noValidate>
          <Field label="회의록 (선택)" error={notesError ?? ''}>
            <textarea className="select" rows={4} value={notes} maxLength={MEETING_NOTES_MAX} placeholder="이번 회의에서 배운 점과 나눈 이야기 · 결정 배경 · 다음 할 일을 여기에 남겨 보세요" onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <p className="dim small">배운 점과 회의 내용은 회의록 한 곳에 적어요. 비워 두어도 회의는 끝나요.</p>
        </form>
        {!allowed && <p className="notice notice-warn">강사는 결정을 기록하거나 회의를 마칠 수 없어요.</p>}
      </div>
      <footer className="modal-foot">
        <button type="button" className="btn" onClick={close}>
          닫기
        </button>
        <button type="submit" form="end-meeting" className="btn btn-primary" disabled={busy || !!notesError || !allowed}>
          회의 종료
        </button>
      </footer>
    </Modal>
  )
}

// ---- History (read-only) -----------------------------------------------------

/** A decided item: source · title, conclusion, PR decision, learning, follow-up */
function DecisionLine({ item, snapshot }: { item: AgendaItemDto; snapshot: WorkspaceSnapshot }) {
  const d = item.decision
  const follow = d ? memberName(snapshot, d.followUpAssigneeMemberId) : null
  return (
    <li>
      <div className="outcome-top">
        <span className="agenda-kind">{AGENDA_KIND_LABEL[item.kind]}</span>
        {item.source && <span className="card-key">{sourceText(snapshot, item)}</span>}
        <span className="mini-title">{item.title}</span>
        {d?.prDecision && <span className="agenda-kind">{PR_DECISION_LABEL[d.prDecision]}</span>}
      </div>
      {d && <p className="minutes-notes">{d.conclusion}</p>}
      {d?.learning && <p className="dim small">배운 점 · {d.learning}</p>}
      {follow && (
        <p className="dim small">
          더 알아볼 사람 · {follow}
          {d?.followUpDueDate ? ` · ${formatDate(d.followUpDueDate)}까지` : ''}
        </p>
      )}
    </li>
  )
}

function MeetingRecord({ meeting, snapshot }: { meeting: MeetingDto; snapshot: WorkspaceSnapshot }) {
  const decided = decidedIn(snapshot, meeting)
  const who = meeting.attendeeMemberIds.map((id) => snapshot.members.find((m) => m.id === id)).filter((m): m is MemberDto => !!m)
  return (
    <li className="minutes">
      <div className="minutes-head">
        <strong>{formatDate(localDateOf(meeting.startedAt))} 회의</strong>
        <span className="dim">
          {formatClock(meeting.startedAt)} · {formatDuration(meeting.startedAt, meeting.endedAt)}
        </span>
      </div>
      <div className="minutes-who">
        {who.length === 0 ? (
          <span className="dim small">참석자 {meeting.attendeeMemberIds.length}명</span>
        ) : (
          who.map((m) => (
            <span key={m.id} className="fchip is-on">
              <MemberAvatar member={m} size={14} />
              {m.displayName}
            </span>
          ))
        )}
      </div>
      <div className="small dim">결정 {decided.length}건</div>
      {decided.length > 0 && (
        <ul className="minutes-decisions">
          {decided.map((a) => (
            <DecisionLine key={a.id} item={a} snapshot={snapshot} />
          ))}
        </ul>
      )}
      {meeting.notes && meeting.notes.trim() !== '' && <p className="minutes-notes">{meeting.notes}</p>}
    </li>
  )
}

export function MeetingHistoryDialog() {
  const snapshot = useSnapshot()
  const ended = useMemo(() => (snapshot ? endedMeetings(snapshot) : []), [snapshot])
  const onClose = () => useUi.getState().setHistoryOpen(false)
  return (
    <Modal title="회의록" onClose={onClose} width={560}>
      <div className="modal-body">
        {!snapshot || ended.length === 0 ? (
          <Empty icon="meeting" title="아직 회의록이 없어요" hint="회의를 시작하고 마치면 여기에 기록돼요." />
        ) : (
          <ul className="minutes-list">
            {ended.map((m) => (
              <MeetingRecord key={m.id} meeting={m} snapshot={snapshot} />
            ))}
          </ul>
        )}
      </div>
      <footer className="modal-foot">
        <button type="button" className="btn" data-autofocus onClick={onClose}>
          닫기
        </button>
      </footer>
    </Modal>
  )
}
