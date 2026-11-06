// 관리 패널 "도움 요청" 탭 (#183 — FR-LRN-15 ~ 19 · 21, CONTRACTS_API.md 「11」). 소유: A (D 동의 — 2026-11-06).
// 목록은 Snapshot의 helpRequests, 상세(코멘트)는 열 때 읽는다. 권한은 서버가 다시 검사한다 — 화면은 할 수 있는 버튼만 보인다.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AGENDA_TITLE_MAX } from '../data/rules/meeting'
import { HELP_CONTENT_MAX, HELP_LEARNING_MAX, acceptsComments, helpCloseError, helpCommentError, helpCreateError, helpToAgendaError, isOpenForDiscussion } from '../data/rules/help'
import type { HelpCommentDto, HelpRequestDetail, HelpRequestStatus, HelpRequestSummary, Id, MemberDto, Viewer } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { relativeTime } from './format'
import { useNow } from './hooks'
import { Icon } from './icons'
import { MemberAvatar } from './officeParts'
import { useUi } from './uiState'
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

function useHelpData(): { helpRequests: HelpRequestSummary[]; members: Members; viewer: Viewer } | null {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  return useMemo(
    () => (snapshot ? { helpRequests: snapshot.helpRequests, members: new Map(snapshot.members.map((m) => [m.id, m])), viewer: snapshot.viewer } : null),
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
  return selected ? <HelpDetailView key={selected.id} summary={selected} members={data.members} viewer={data.viewer} /> : <HelpList data={data} />
}

function StatusChip({ help }: { help: HelpRequestSummary }) {
  return (
    <span className="help-chips">
      <span className={`help-status help-status-${help.status}`}>{STATUS_LABEL[help.status]}</span>
      {help.isAgendaCandidate && (
        <span className="help-tag help-tag-candidate" title="48시간이 지나도록 해결되지 않아 회의 안건 후보가 됐어요">
          안건 후보
        </span>
      )}
      {help.instructorRequested && <span className="help-tag">강사 요청</span>}
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
  return (
    <div className="help">
      {canWrite && <HelpCompose />}
      {sorted.length === 0 ? (
        <Empty icon="inbox" title="아직 도움 요청이 없어요" hint={canWrite ? '막힌 것을 적으면 팀원이 코멘트로 도와줘요.' : '학생이 도움 요청을 올리면 여기에 보여요.'} />
      ) : (
        <ul className="help-list" aria-label="도움 요청 목록">
          {sorted.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={`help-item${h.isAgendaCandidate ? ' is-candidate' : ''}${DONE.includes(h.status) ? ' is-done' : ''}`}
                aria-label={`도움 요청: ${h.content}`}
                onClick={() => useUi.getState().openHelpRequest(h.id)}
              >
                <StatusChip help={h} />
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
    </div>
  )
}

function HelpCompose() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-primary help-new" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> 도움 요청 쓰기
      </button>
    )
  }
  const request = { content: content.trim(), fromStandupId: null }
  const error = helpCreateError(request)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    const created = await useOffice.getState().createHelpRequest(request)
    setBusy(false)
    if (created) {
      useOffice.getState().toast('good', '도움 요청을 올렸어요')
      setContent('')
      setSubmitted(false)
      setOpen(false)
    }
  }
  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label="도움 요청 쓰기">
      <TextField label="무엇이 막혔나요?" value={content} max={HELP_CONTENT_MAX} rows={3} error={submitted ? error : null} placeholder="해 본 것과 막힌 지점을 적어 주세요" onChange={setContent} autoFocus />
      <div className="help-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
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

function HelpDetailView({ summary, members, viewer }: { summary: HelpRequestSummary; members: Members; viewer: Viewer }) {
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

  const isRequester = viewer.memberId !== null && viewer.memberId === summary.requesterMemberId
  const isInstructor = viewer.role === 'instructor'
  const canComment = acceptsComments(summary.status) && (!isInstructor || summary.instructorRequested)
  const canAct = isRequester && isOpenForDiscussion(summary.status)
  const back = () => useUi.getState().openHelpRequest(null)

  return (
    <section className="help help-detail" aria-label="도움 요청 상세">
      <button type="button" className="btn btn-sm btn-ghost help-back" onClick={back}>
        <Icon name="chevronLeft" size={14} /> 목록
      </button>
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
          {summary.instructorRequested ? (
            <p className="dim small dnote">강사에게 요청했어요{summary.instructorRequestedAt ? ` · ${relativeTime(summary.instructorRequestedAt, now)}` : ''}</p>
          ) : (
            <button type="button" className="btn btn-sm" onClick={() => void useOffice.getState().requestInstructorHelp(summary.id)}>
              강사에게 요청
            </button>
          )}
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
function TextField(props: { label: string; value: string; max: number; rows?: number; error: string | null; placeholder?: string; autoFocus?: boolean; onChange: (v: string) => void }) {
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
