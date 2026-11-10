// 관리 패널 "도움 요청" 탭 (#183 — FR-LRN-15 ~ 19 · 21, CONTRACTS_API.md 「11」). 소유: A (D 동의 — 2026-11-06).
// 목록은 Snapshot의 helpRequests, 상세(코멘트)는 열 때 읽는다. 권한은 서버가 다시 검사한다 — 화면은 할 수 있는 버튼만 보인다.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AGENDA_TITLE_MAX } from '../data/rules/meeting'
import { HELP_CONTENT_MAX, HELP_LEARNING_MAX, HELP_MSG, acceptsComments, helpCloseError, helpCommentError, helpCreateError, helpToAgendaError, instructorRequestError, isOpenForDiscussion } from '../data/rules/help'
import type { HelpCommentDto, HelpRequestDetail, HelpRequestStatus, HelpRequestSummary, Id, MemberDto, Viewer, WorkspaceKind } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { FormAlert } from './ErrorStates'
import { useWriteProblem } from './useWriteProblem'
import { relativeTime } from './format'
import { useNow } from './hooks'
import { useUnreadInstructorAnswers } from './useAwaitingInstructor'
import { Icon } from './icons'
import { MemberAvatar } from './officeParts'
import { useUi, type HelpDraft } from './uiState'
import './help.css'

const STATUS_LABEL: Record<HelpRequestStatus, string> = {
  open: '열림',
  discussing: '논의 중',
  resolved: '해결',
  on_agenda: '회의 안건',
  ended: '끝남',
}
const DONE: readonly HelpRequestStatus[] = ['resolved', 'ended']

type Members = ReadonlyMap<Id, MemberDto>

function useHelpData(): { helpRequests: HelpRequestSummary[]; members: Members; viewer: Viewer; workspaceKind: WorkspaceKind } | null {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  return useMemo(
    () =>
      snapshot
        ? { helpRequests: snapshot.helpRequests, members: new Map(snapshot.members.map((m) => [m.id, m])), viewer: snapshot.viewer, workspaceKind: snapshot.workspace.kind }
        : null,
    [snapshot],
  )
}

const memberName = (members: Members, id: Id | null) => (id ? members.get(id)?.displayName : undefined) ?? '알 수 없는 팀원'

/** 탭 본문 — 고른 도움 요청이 있으면 상세, 없으면 목록 */
export function HelpPanel() {
  const data = useHelpData()
  const selectedId = useUi((s) => s.helpRequestId)
  const selected = data?.helpRequests.find((h) => h.id === selectedId) ?? null
  if (!data) return <Empty icon="refresh" title="사무실을 불러오는 중…" />
  return selected ? (
    <HelpDetailView key={selected.id} summary={selected} members={data.members} viewer={data.viewer} workspaceKind={data.workspaceKind} />
  ) : (
    <HelpList data={data} />
  )
}

function StatusChip({ help, unread = false }: { help: HelpRequestSummary; unread?: boolean }) {
  return (
    <span className="help-chips">
      <span className={`help-status help-status-${help.status}`}>{STATUS_LABEL[help.status]}</span>
      {help.isAgendaCandidate && (
        <span className="help-tag help-tag-candidate" title="48시간이 지나도록 해결되지 않아 회의 안건 후보가 됐어요">
          안건 후보
        </span>
      )}
      {help.instructorRequested && (
        <span className="help-tag">
          강사 요청
          {unread && <i className="help-dot" title="새 강사 답변이 있어요" />}
        </span>
      )}
    </span>
  )
}

// ---- 목록 ----------------------------------------------------------------------

function HelpList({ data }: { data: { helpRequests: HelpRequestSummary[]; members: Members; viewer: Viewer } }) {
  const now = useNow(60_000)
  const canWrite = data.viewer.role !== 'instructor'
  // 진행 중인 것 먼저, 그 안에서 최근 것 먼저
  const sorted = useMemo(
    () => [...data.helpRequests].sort((a, b) => Number(DONE.includes(a.status)) - Number(DONE.includes(b.status)) || b.createdAt.localeCompare(a.createdAt)),
    [data.helpRequests],
  )
  // 스탠드업 "막힌 것"에서 넘어온 초안(#190)이 있으면 그 내용으로 쓰기 폼을 새로 연다
  const draft = useUi((s) => s.helpDraft)
  const unread = useUnreadInstructorAnswers()
  return (
    <div className="help">
      {canWrite && <HelpCompose key={draft ? `draft:${draft.fromStandupId}:${draft.content}` : 'new'} draft={draft} />}
      {sorted.length === 0 ? (
        <Empty icon="inbox" title="아직 도움 요청이 없어요" hint={canWrite ? '막힌 것을 적으면 팀원이 코멘트로 도와줘요.' : '학생이 도움 요청을 올리면 여기에 보여요.'} />
      ) : (
        <ul className="help-list" aria-label="도움 요청 목록">
          {sorted.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={`help-item${h.isAgendaCandidate ? ' is-candidate' : ''}${DONE.includes(h.status) ? ' is-done' : ''}`}
                aria-label={`도움 요청: ${h.content}${unread.has(h.id) ? ' (새 강사 답변)' : ''}`}
                onClick={() => useUi.getState().openHelpRequest(h.id)}
              >
                <StatusChip help={h} unread={unread.has(h.id)} />
                <span className="help-item-text">{h.content}</span>
                <span className="help-item-foot">
                  <MemberAvatar member={data.members.get(h.requesterMemberId)} size={18} />
                  <span className="help-item-who">{memberName(data.members, h.requesterMemberId)}</span>
                  <span className="dim">· {relativeTime(h.createdAt, now)}</span>
                  <span className="grow" />
                  <span className="help-count">코멘트 {h.commentCount}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <HiddenHelpRequests />
    </div>
  )
}

function HelpCompose({ draft }: { draft: HelpDraft | null }) {
  const [open, setOpen] = useState(draft !== null)
  const [content, setContent] = useState(draft?.content ?? '')
  const [fromStandupId, setFromStandupId] = useState<Id | null>(draft?.fromStandupId ?? null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  // 실패해도 쓴 내용은 그대로 — 원인 · 다음 행동은 폼 위, 입력 오류는 입력란 아래 (#274 — D 공용)
  const formRef = useRef<HTMLFormElement>(null)
  const w = useWriteProblem('createHelp', { resubmit: () => formRef.current?.requestSubmit() })
  const close = () => {
    setOpen(false)
    setContent('')
    setFromStandupId(null)
    setSubmitted(false)
    w.clear()
    if (draft) useUi.getState().startHelpDraft(null) // 초안을 다 썼다 — 다시 열면 빈 폼
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-primary help-new" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> 도움 요청 쓰기
      </button>
    )
  }
  const request = { content: content.trim(), fromStandupId }
  const error = helpCreateError(request)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    w.clear()
    const created = await useOffice.getState().createHelpRequest(request, w.report)
    setBusy(false)
    if (created) {
      useOffice.getState().toast('good', '도움 요청을 올렸어요')
      close()
    }
  }
  return (
    <form ref={formRef} className="help-form" onSubmit={submit} noValidate aria-label="도움 요청 쓰기">
      {w.notice && <FormAlert notice={w.notice} busy={w.busy} onAction={w.act} />}
      <TextField label="무엇이 막혔나요?" value={content} max={HELP_CONTENT_MAX} rows={3} error={(submitted ? error : null) ?? w.field} placeholder="해 본 것과 막힌 지점을 적어 주세요" onChange={setContent} autoFocus />
      {fromStandupId && <p className="dim small dnote">스탠드업의 "막힌 것"에서 넘어왔어요</p>}
      <div className="help-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={close}>
          취소
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          올리기
        </button>
      </div>
    </form>
  )
}

// ---- 상세 ----------------------------------------------------------------------

function HelpDetailView({ summary, members, viewer, workspaceKind }: { summary: HelpRequestSummary; members: Members; viewer: Viewer; workspaceKind: WorkspaceKind }) {
  const now = useNow(60_000)
  const [detail, setDetail] = useState<HelpRequestDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<'none' | 'close' | 'agenda'>('none')
  // 요약이 바뀌면(내 동작 · 다른 사람의 코멘트 알림) 상세를 다시 읽는다
  const version = `${summary.status}|${summary.commentCount}|${summary.instructorRequested}`
  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadHelpRequest(summary.id)
      .then((got) => {
        if (!alive) return
        if (got) setDetail(got)
        else setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [summary.id, version])
  // 상세를 열어 강사 답변을 봤다 — 이 사람의 빨간 점이 꺼진다(#290). 강사 본인은 점이 없다
  const lastAnswerId = detail?.comments.filter((c) => c.isInstructorAnswer).at(-1)?.id ?? null
  useEffect(() => {
    if (lastAnswerId && viewer.role !== 'instructor') useOffice.getState().markInstructorAnswerSeen(summary.id, lastAnswerId)
  }, [summary.id, lastAnswerId, viewer.role])

  const isRequester = viewer.memberId !== null && viewer.memberId === summary.requesterMemberId
  const isInstructor = viewer.role === 'instructor'
  const canComment = acceptsComments(summary.status) && (!isInstructor || summary.instructorRequested)
  const canAct = isRequester && isOpenForDiscussion(summary.status)
  const back = () => useUi.getState().openHelpRequest(null)

  return (
    <section className="help help-detail" aria-label="도움 요청 상세">
      <div className="help-detail-bar">
        <button type="button" className="btn btn-sm btn-ghost help-back" onClick={back}>
          <Icon name="chevronLeft" size={14} /> 목록
        </button>
        {/* 삭제 범위는 대화상자(HelpDeleteDialog)에서 고른다 — 요청자는 두 방식, 그 밖의 사람은 나에게서만(#316) */}
        <button type="button" className="btn btn-sm btn-ghost btn-danger" aria-haspopup="dialog" onClick={() => useOffice.getState().openDialog({ kind: 'deleteHelp', helpRequestId: summary.id })}>
          <Icon name="trash" size={14} /> 삭제
        </button>
      </div>
      <header className="help-head">
        <StatusChip help={summary} />
        <span className="help-item-foot">
          <MemberAvatar member={members.get(summary.requesterMemberId)} size={20} />
          <strong>{memberName(members, summary.requesterMemberId)}</strong>
          <span className="dim">· {relativeTime(summary.createdAt, now)}</span>
        </span>
      </header>
      <p className="help-content">{summary.content}</p>

      <StatusNote summary={summary} detail={detail} members={members} now={now} />

      {isRequester && (
        <div className="help-owner">
          <InstructorRequest summary={summary} demo={workspaceKind === 'demo'} now={now} />
          {canAct && (
            <>
              <button type="button" className={`btn btn-sm${mode === 'agenda' ? ' is-on' : ''}`} aria-pressed={mode === 'agenda'} onClick={() => setMode(mode === 'agenda' ? 'none' : 'agenda')}>
                {summary.isAgendaCandidate ? '안건 후보 확정' : '회의 안건으로'}
              </button>
              <button type="button" className={`btn btn-sm${mode === 'close' ? ' is-on' : ''}`} aria-pressed={mode === 'close'} onClick={() => setMode(mode === 'close' ? 'none' : 'close')}>
                해결로 닫기
              </button>
            </>
          )}
        </div>
      )}
      {canAct && mode === 'agenda' && <ToAgendaForm summary={summary} onDone={() => setMode('none')} />}
      {canAct && mode === 'close' && (
        <CloseForm
          summary={summary}
          detail={detail}
          onClosed={(closed) => {
            setDetail(closed)
            setMode('none')
          }}
          onCancel={() => setMode('none')}
        />
      )}

      <h3 className="help-sub">코멘트 {summary.commentCount}</h3>
      {detail ? (
        <Comments detail={detail} members={members} now={now} />
      ) : failed ? (
        <p className="dim small dnote">코멘트를 불러오지 못했어요.</p>
      ) : (
        <p className="dim small dnote">불러오는 중…</p>
      )}
      {canComment && <CommentForm helpRequestId={summary.id} instructor={isInstructor} onAdded={(c) => setDetail((d) => (d ? { ...d, comments: [...d.comments, c] } : d))} />}
    </section>
  )
}

/** 「숨긴 도움 요청」 — 내가 "나에게서만 삭제"한 요청을 펼쳐 보고 숨김을 푼다(#316). 목록은 펼칠 때 읽는다 */
function HiddenHelpRequests() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<HelpRequestSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<Id | null>(null)
  useEffect(() => {
    if (!open) return
    let alive = true
    void useOffice
      .getState()
      .listHiddenHelpRequests()
      .then((got) => {
        if (!alive) return
        if (got) setItems(got)
        else setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [open])
  const unhide = async (id: Id) => {
    setBusyId(id)
    const ok = await useOffice.getState().unhideHelpRequest(id)
    setBusyId(null)
    if (ok) {
      setItems((list) => list?.filter((h) => h.id !== id) ?? null)
      useOffice.getState().toast('good', '숨김을 풀었어요. 다시 목록에 보여요')
    }
  }
  return (
    <section className="help-hidden" aria-label="숨긴 도움 요청">
      <button type="button" className="btn btn-sm btn-ghost help-hidden-toggle" aria-expanded={open}
        onClick={() => {
          // 펼칠 때마다 새로 읽는다 — 다른 탭에서 숨기거나 풀었을 수 있다
          setItems(null)
          setFailed(false)
          setOpen((v) => !v)
        }}
      >
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} /> 숨긴 도움 요청
      </button>
      {open &&
        (failed ? (
          <p className="dim small dnote">숨긴 도움 요청을 불러오지 못했어요.</p>
        ) : items === null ? (
          <p className="dim small dnote">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="dim small dnote">숨긴 도움 요청이 없어요.</p>
        ) : (
          <ul className="help-hidden-list" aria-label="숨긴 도움 요청 목록">
            {items.map((h) => (
              <li key={h.id}>
                <span className="help-item-text">{h.content}</span>
                <button type="button" className="btn btn-sm" disabled={busyId === h.id} aria-label={`숨김 해제: ${h.content}`} onClick={() => void unhide(h.id)}>
                  숨김 해제
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}

type InstructorAvailability = 'loading' | 'none' | 'some' | 'failed'

/**
 * 「11」 강사에게 요청 (#272) — 강사가 답할 수 있는 글(open · discussing · on_agenda)에서만 보인다. 새로 켤 때는 지정된 강사가
 * 있어야 해서 목록을 읽어 로딩 · 0명 · 1명 이상 · 조회 실패를 나눈다. 시연 사무실은 심사용 강사가 강사라 읽지 않는다.
 * 버튼은 UX용이고 최종 판정은 서버다 — 목록을 못 읽었으면 눌러 보게 두고 서버 답(409)을 알림으로 보인다.
 */
function InstructorRequest({ summary, demo, now }: { summary: HelpRequestSummary; demo: boolean; now: number }) {
  const [availability, setAvailability] = useState<InstructorAvailability>('loading')
  const needsList = !demo && !summary.instructorRequested && acceptsComments(summary.status)
  useEffect(() => {
    if (!needsList) return
    let alive = true
    void useOffice
      .getState()
      .loadInstructors()
      .then((list) => {
        if (alive) setAvailability(list === null ? 'failed' : list.length > 0 ? 'some' : 'none')
      })
    return () => {
      alive = false
    }
  }, [needsList])

  if (summary.instructorRequested) {
    return <p className="dim small dnote">강사에게 요청했어요{summary.instructorRequestedAt ? ` · ${relativeTime(summary.instructorRequestedAt, now)}` : ''}</p>
  }
  if (!acceptsComments(summary.status)) return null
  const state: InstructorAvailability = demo ? 'some' : availability
  const blocked = instructorRequestError(summary, state !== 'none') !== null
  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        disabled={state === 'loading' || blocked}
        aria-busy={state === 'loading'}
        onClick={() => void useOffice.getState().requestInstructorHelp(summary.id)}
      >
        강사에게 요청
      </button>
      {state === 'none' && <p className="dim small dnote">{HELP_MSG.noInstructor} — 레포 관리자가 강사를 지정하면 요청할 수 있어요</p>}
      {state === 'failed' && <p className="dim small dnote">강사 목록을 불러오지 못했어요 — 요청하면 서버가 확인해요</p>}
    </>
  )
}

function StatusNote({ summary, detail, members, now }: { summary: HelpRequestSummary; detail: HelpRequestDetail | null; members: Members; now: number }) {
  if (summary.status === 'resolved') {
    const helpful = detail?.comments.find((c) => c.id === detail.helpfulCommentId)
    return (
      <div className="help-note help-note-good">
        <strong>해결했어요{summary.closedAt ? ` · ${relativeTime(summary.closedAt, now)}` : ''}</strong>
        {detail?.learning && <p>배운 점: {detail.learning}</p>}
        {helpful && <p className="dim small">도움이 된 코멘트: {helpful.authorMemberId ? memberName(members, helpful.authorMemberId) : helpful.author.displayName}</p>}
      </div>
    )
  }
  if (summary.status === 'on_agenda') return <div className="help-note">회의실 안건으로 올라갔어요. 회의에서 결정을 기록하면 끝나요.</div>
  if (summary.status === 'ended') return <div className="help-note">회의에서 결정을 기록해 끝났어요{summary.closedAt ? ` · ${relativeTime(summary.closedAt, now)}` : ''}.</div>
  if (summary.isAgendaCandidate) return <div className="help-note help-note-warn">48시간이 지나도록 해결되지 않아 안건 후보가 됐어요. 요청한 사람이 확정하면 회의실 안건이 돼요.</div>
  return null
}

function Comments({ detail, members, now }: { detail: HelpRequestDetail; members: Members; now: number }) {
  if (detail.comments.length === 0) return <p className="dim small dnote">아직 코멘트가 없어요.</p>
  return (
    <ul className="help-comments" aria-label="코멘트">
      {detail.comments.map((c) => (
        <li key={c.id} className={`help-comment${c.isInstructorAnswer ? ' is-instructor' : ''}`}>
          <span className="help-item-foot">
            <MemberAvatar member={c.authorMemberId ? members.get(c.authorMemberId) : { displayName: c.author.displayName }} size={18} />
            <strong>{c.authorMemberId ? memberName(members, c.authorMemberId) : c.author.displayName}</strong>
            {c.isInstructorAnswer && <span className="help-tag">강사 답변</span>}
            {c.id === detail.helpfulCommentId && <span className="help-tag help-tag-good">도움이 됨</span>}
            <span className="dim">· {relativeTime(c.createdAt, now)}</span>
          </span>
          <p className="help-comment-text">{c.content}</p>
        </li>
      ))}
    </ul>
  )
}

function CommentForm({ helpRequestId, instructor, onAdded }: { helpRequestId: Id; instructor: boolean; onAdded: (c: HelpCommentDto) => void }) {
  const [content, setContent] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const error = helpCommentError({ content: content.trim() })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    const added = await useOffice.getState().addHelpComment(helpRequestId, content.trim())
    setBusy(false)
    if (added) {
      onAdded(added)
      setContent('')
      setSubmitted(false)
    }
  }
  const label = instructor ? '강사 답변' : '코멘트'
  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label={`${label} 쓰기`}>
      <TextField label={label} value={content} max={HELP_CONTENT_MAX} rows={2} error={submitted ? error : null} placeholder={instructor ? '학생에게 남길 답변' : '아는 것 · 해 볼 것을 남겨 주세요'} onChange={setContent} />
      <div className="help-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          {instructor ? '답변 달기' : '코멘트 달기'}
        </button>
      </div>
    </form>
  )
}

function ToAgendaForm({ summary, onDone }: { summary: HelpRequestSummary; onDone: () => void }) {
  // 첫 줄을 제목 초안으로 — 100자에서 자른다
  const [title, setTitle] = useState(() => Array.from(summary.content.split('\n')[0].trim()).slice(0, AGENDA_TITLE_MAX).join(''))
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const error = helpToAgendaError({ title: title.trim() })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    const item = await useOffice.getState().convertHelpRequestToAgenda(summary.id, title.trim())
    setBusy(false)
    if (item) {
      useOffice.getState().toast('good', '회의실 안건으로 올렸어요')
      onDone()
    }
  }
  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label="회의 안건으로 올리기">
      <TextField label="안건 제목" value={title} max={AGENDA_TITLE_MAX} error={submitted ? error : null} onChange={setTitle} autoFocus />
      <p className="dim small dnote">코멘트는 안건에 그대로 붙어 보여요.</p>
      <div className="help-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDone}>
          취소
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          회의실에 올리기
        </button>
      </div>
    </form>
  )
}

function CloseForm({ summary, detail, onClosed, onCancel }: { summary: HelpRequestSummary; detail: HelpRequestDetail | null; onClosed: (d: HelpRequestDetail) => void; onCancel: () => void }) {
  const [helpfulId, setHelpfulId] = useState<Id | null>(null)
  const [learning, setLearning] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  // 고를 수 있는 코멘트 — 강사 답변 · 내 코멘트는 안 된다(「11」)
  const choices = (detail?.comments ?? []).filter((c) => !c.isInstructorAnswer && c.authorMemberId !== summary.requesterMemberId)
  const error = helpCloseError({ helpfulCommentId: helpfulId, learning: learning.trim() })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    const closed = await useOffice.getState().closeHelpRequest(summary.id, { helpfulCommentId: helpfulId, learning: learning.trim() })
    setBusy(false)
    if (closed) {
      useOffice.getState().toast('good', '해결로 닫았어요')
      onClosed(closed)
    }
  }
  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label="해결로 닫기">
      {choices.length > 0 && (
        <fieldset className="help-choices">
          <legend className="fld-label">도움이 된 코멘트 (선택)</legend>
          <label>
            <input type="radio" name="helpful" checked={helpfulId === null} onChange={() => setHelpfulId(null)} /> 고르지 않음
          </label>
          {choices.map((c) => (
            <label key={c.id}>
              <input type="radio" name="helpful" checked={helpfulId === c.id} onChange={() => setHelpfulId(c.id)} /> {c.author.displayName}: {c.content}
            </label>
          ))}
        </fieldset>
      )}
      <TextField label="배운 점 한 줄" value={learning} max={HELP_LEARNING_MAX} error={submitted ? error : null} placeholder="다음에 같은 문제를 만나면 무엇을 할지" onChange={setLearning} autoFocus />
      <div className="help-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          해결로 닫기
        </button>
      </div>
    </form>
  )
}

/** 글자 수가 보이는 입력 — rows가 있으면 여러 줄 */
export function TextField(props: { label: string; value: string; max: number; rows?: number; error: string | null; placeholder?: string; autoFocus?: boolean; onChange: (v: string) => void }) {
  const length = Array.from(props.value).length
  const common = {
    className: 'select',
    value: props.value,
    placeholder: props.placeholder,
    autoFocus: props.autoFocus,
    'aria-invalid': !!props.error,
    onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
  }
  return (
    <label className="fld">
      <span className="fld-label">
        {props.label} <span className={`eval-count${length > props.max ? ' is-over' : ''}`}>{length}/{props.max}</span>
      </span>
      {props.rows ? <textarea rows={props.rows} {...common} /> : <input type="text" {...common} />}
      {props.error && (
        <em className="fld-error" role="alert">
          {props.error}
        </em>
      )}
    </label>
  )
}
