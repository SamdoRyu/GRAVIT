// 활동 기록 대화상자 (#173 — FR-ACT-01 ~ 03 · P12, CONTRACTS_API.md 「14」). 소유: A(리뷰 D).
// GitHub에 남지 않는 활동을 쓰고(수집 동의한 팀원만), 작성자가 아닌 팀원이 확인한다. 확인된 것만 사무실 메모지 · 내 리포트 분포에 나온다.
// 걸린 시간은 기록 한 줄에만 보이고 팀 화면에서 합산하지 않는다(P6). 강사는 보기만 — 숨김은 편의이고 서버가 403으로 다시 검사한다.
// 열린 사무실에 처음 들어온 팀원이 아직 동의하지 않았으면 이 대화상자를 동의 화면으로 한 번 연다(activityConsent.ts).
import { useEffect, useState, type FormEvent } from 'react'
import {
  ACTIVITY_CONTENT_MAX,
  ACTIVITY_KINDS,
  ACTIVITY_MINUTES_MAX,
  ACTIVITY_MINUTES_MIN,
  activityCreateError,
  canConfirmActivity,
  canWriteActivity,
} from '../data/rules/activity'
import { ACTIVITY_KIND_LABEL } from '../data/rules/report'
import type { ActivityKind, ActivityRecordDto, Id } from '../data/types'
import { useOffice } from '../store'
import { Field } from './common'
import { Modal } from './Dialogs'
import { formatDate } from './format'
import './activity.css'

function close() {
  useOffice.getState().openDialog(null)
}

const FILTERS = [
  { id: 'all', label: '전체', status: undefined },
  { id: 'pending', label: '확인 대기', status: 'pending' },
  { id: 'confirmed', label: '확인됨', status: 'confirmed' },
] as const

type Loaded = { key: string; items: ActivityRecordDto[]; page: number; totalPages: number }

export function ActivityDialog({ consent = false }: { consent?: boolean }) {
  const viewer = useOffice((s) => s.office?.snapshot?.viewer ?? null)
  const members = useOffice((s) => s.office?.snapshot?.members ?? [])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const status = FILTERS.find((f) => f.id === filter)!.status
  // 지금 조건의 목록만 보인다 — 조건을 바꾸거나 다시 읽는 사이에는 "불러오는 중"
  const key = `${filter}:${reload}`
  const pages = loaded?.key === key ? loaded : null

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadActivities(status, 0)
      .then((got) => {
        if (!alive) return
        if (got) setLoaded({ key, items: got.items, page: 0, totalPages: got.totalPages })
        else setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [status, key])

  const refresh = () => {
    setFailed(false)
    setReload((n) => n + 1)
  }

  const more = async () => {
    if (!pages) return
    const got = await useOffice.getState().loadActivities(status, pages.page + 1)
    if (got) setLoaded({ key, items: [...pages.items, ...got.items], page: got.page, totalPages: got.totalPages })
  }

  const replace = (record: ActivityRecordDto) => setLoaded((p) => (p ? { ...p, items: p.items.map((r) => (r.id === record.id ? record : r)) } : p))

  if (!viewer) return null
  const canWrite = canWriteActivity(viewer)
  const nameOf = (memberId: Id) => members.find((m) => m.id === memberId)?.displayName ?? '알 수 없는 팀원'

  return (
    <Modal title={consent ? '활동 기록 수집 동의' : '활동 기록'} onClose={close} width={600}>
      <div className="modal-body act">
        <p className="dim small act-lead">
          기획 · 자료조사 · 디자인 · 발표 준비 · 멘토 질문처럼 GitHub에 남지 않는 활동을 기록해요. 다른 팀원 1명 이상이 확인하면 사무실 메모지와 내 회고 리포트에 나와요. 걸린 시간은 팀 화면에서 합산하지 않아요.
        </p>
        {canWrite && <ConsentBlock consented={viewer.activityConsented} firstVisit={consent} />}
        {canWrite && viewer.activityConsented && <ActivityForm onCreated={refresh} />}
        {!consent && (
          <>
            <div className="act-filters" role="group" aria-label="목록 조건">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className={`btn btn-sm${filter === f.id ? ' is-on' : ' btn-ghost'}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {failed ? (
              <div className="act-state">
                <p className="notice notice-warn">활동 기록을 불러오지 못했어요.</p>
                <button type="button" className="btn btn-sm" onClick={refresh}>
                  다시 읽기
                </button>
              </div>
            ) : pages === null ? (
              <p className="dim small">불러오는 중…</p>
            ) : pages.items.length === 0 ? (
              <p className="dim small">{filter === 'pending' ? '확인을 기다리는 활동이 없어요.' : '아직 기록된 활동이 없어요.'}</p>
            ) : (
              <ul className="act-list" aria-label="활동 기록 목록">
                {pages.items.map((r) => (
                  <ActivityRow key={r.id} record={r} nameOf={nameOf} canConfirm={canConfirmActivity(r, viewer)} onConfirmed={replace} />
                ))}
              </ul>
            )}
            {pages && pages.page + 1 < pages.totalPages && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void more()}>
                더 보기
              </button>
            )}
          </>
        )}
      </div>
      <footer className="modal-foot">
        <button type="button" className="btn" data-autofocus onClick={close}>
          {consent && !viewer.activityConsented ? '나중에' : '닫기'}
        </button>
      </footer>
    </Modal>
  )
}

function ConsentBlock({ consented, firstVisit }: { consented: boolean; firstVisit: boolean }) {
  const [busy, setBusy] = useState(false)
  const set = async (next: boolean) => {
    setBusy(true)
    const saved = await useOffice.getState().setActivityConsent(next)
    setBusy(false)
    if (saved !== null) useOffice.getState().toast('good', saved ? '활동 기록 수집에 동의했어요' : '활동 기록 수집 동의를 거뒀어요')
  }
  if (consented) {
    return (
      <p className="dim small act-consent">
        수집에 동의했어요.{' '}
        {!firstVisit && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void set(false)}>
            동의 거두기
          </button>
        )}
      </p>
    )
  }
  return (
    <div className="act-consent-ask">
      <p className="notice notice-warn">활동 기록은 수집에 동의한 팀원만 쓸 수 있어요. 동의하지 않아도 사무실은 그대로 쓸 수 있고, 나중에 더보기 → 활동 기록에서 바꿀 수 있어요.</p>
      <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void set(true)}>
        수집에 동의하기
      </button>
    </div>
  )
}

function ActivityForm({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = useState<ActivityKind>('planning')
  const [content, setContent] = useState('')
  const [minutes, setMinutes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const request = { kind, content, durationMinutes: Number(minutes) }
  const error = activityCreateError(request)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    const created = await useOffice.getState().createActivity(request)
    setBusy(false)
    if (!created) return
    useOffice.getState().toast('good', '활동을 기록했어요. 다른 팀원이 확인하면 사무실에 보여요')
    setContent('')
    setMinutes('')
    setSubmitted(false)
    onCreated()
  }

  return (
    <form className="act-form" onSubmit={submit} noValidate aria-label="활동 기록하기">
      <div className="act-form-row">
        <Field label="유형">
          <select className="select select-sm" value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="걸린 시간(분)">
          <input className="select select-sm" type="number" inputMode="numeric" min={ACTIVITY_MINUTES_MIN} max={ACTIVITY_MINUTES_MAX} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      <Field label="내용">
        <textarea className="select" rows={2} value={content} maxLength={ACTIVITY_CONTENT_MAX} placeholder="무엇을 했나요?" onChange={(e) => setContent(e.target.value)} />
      </Field>
      {submitted && error && (
        <em className="fld-error" role="alert">
          {error}
        </em>
      )}
      <button type="submit" className="btn btn-sm btn-primary act-submit" disabled={busy}>
        기록하기
      </button>
    </form>
  )
}

function ActivityRow({ record, nameOf, canConfirm, onConfirmed }: { record: ActivityRecordDto; nameOf: (id: Id) => string; canConfirm: boolean; onConfirmed: (r: ActivityRecordDto) => void }) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    const done = await useOffice.getState().confirmActivity(record.id)
    setBusy(false)
    if (done) onConfirmed(done)
  }
  return (
    <li className="act-item" aria-label={`${nameOf(record.authorMemberId)} · ${ACTIVITY_KIND_LABEL[record.kind]}`}>
      <div className="act-item-head">
        <strong>{nameOf(record.authorMemberId)}</strong>
        <span className="flag">{ACTIVITY_KIND_LABEL[record.kind]}</span>
        <span className={`flag${record.status === 'pending' ? ' act-pending' : ''}`}>{record.status === 'pending' ? '확인 대기' : '확인됨'}</span>
        <span className="grow" />
        <span className="dim small">
          {record.durationMinutes}분 · {formatDate(record.createdAt)}
        </span>
      </div>
      <p className="act-content">{record.content}</p>
      <div className="act-item-foot">
        <span className="dim small">{record.confirmedByMemberIds.length > 0 ? `확인: ${record.confirmedByMemberIds.map(nameOf).join(', ')}` : '아직 확인한 팀원이 없어요'}</span>
        {canConfirm && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void confirm()}>
            확인
          </button>
        )}
      </div>
    </li>
  )
}
