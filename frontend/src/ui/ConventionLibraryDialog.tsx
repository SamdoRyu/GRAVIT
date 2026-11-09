// 컨벤션 라이브러리 대화상자 (#225 — FR-LIB-01 · 02, CONTRACTS_API.md 「17」). 소유: A(리뷰 D).
// 서버 전체에 하나인 라이브러리를 로그인한 누구나 본다(목록 → 상세). 등록 · 편집은 GitHub 계정 강사만(심사용 계정은 강사여도 읽기만).
// 지우기는 없다. Snapshot에 없어 열 때 읽고, 저장한 뒤 다시 읽는다. 팀 규칙 검사와 연결하지 않는다(FR-LIB-02).
import { useEffect, useState, type FormEvent } from 'react'
import {
  CONVENTION_CONTENT_MAX,
  CONVENTION_DESCRIPTION_MAX,
  CONVENTION_NAME_MAX,
  CONVENTION_TARGETS,
  CONVENTION_TARGET_LABEL,
  canEditConventionLibrary,
  conventionRequestError,
} from '../data/rules/conventionLibrary'
import { panelProblem, type PanelProblem } from '../data/rules/errors'
import { blankToNull } from '../data/rules/meeting'
import type { ConventionLibraryItemDto, ConventionLibraryItemRequest, ConventionTarget, Id } from '../data/types'
import { useSession } from '../session'
import { useOffice } from '../store'
import { Field } from './common'
import { Modal } from './Dialogs'
import { PanelEmpty, PanelState } from './ErrorStates'
import { formatDate } from './format'
import './conventionLibrary.css'

function close() {
  useOffice.getState().openDialog(null)
}

/** list → detail(항목) → edit(항목 또는 새 항목 null) */
type View = { mode: 'list' } | { mode: 'detail'; id: Id } | { mode: 'edit'; item: ConventionLibraryItemDto | null }

export function ConventionLibraryDialog() {
  const canEdit = canEditConventionLibrary(useSession((s) => s.me))
  const [items, setItems] = useState<ConventionLibraryItemDto[] | null>(null)
  /** 읽기 실패의 원인 — 권한 오류 ↔ 조회 실패를 대화상자 안에서 나눈다 (#274 — D 공용) */
  const [failed, setFailed] = useState<PanelProblem | null>(null)
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<View>({ mode: 'list' })

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadConventionLibrary((e) => {
        if (alive) setFailed(panelProblem('conventionLibrary', e))
      })
      .then((list) => {
        if (!alive) return
        setLoading(false)
        if (list !== null) {
          setFailed(null)
          setItems(list)
        }
      })
    return () => {
      alive = false
    }
  }, [reload])

  // 다시 불러오기 — 이 라이브러리 목록만. 실패 안내는 결과가 올 때까지 그대로 둔다
  const refresh = () => {
    setLoading(true)
    setReload((n) => n + 1)
  }

  const saved = (item: ConventionLibraryItemDto, created: boolean) => {
    useOffice.getState().toast('good', created ? `"${item.name}" 컨벤션을 등록했어요` : `"${item.name}" 컨벤션을 고쳤어요`)
    setView({ mode: 'detail', id: item.id })
    refresh()
  }

  const detail = view.mode === 'detail' ? (items?.find((i) => i.id === view.id) ?? null) : null

  return (
    <Modal title="컨벤션 라이브러리" onClose={close} width={600}>
      <div className="modal-body conv">
        {failed?.kind === 'state' && items === null ? (
          <PanelState problem={failed} busy={loading} onRetry={refresh} />
        ) : items === null ? (
          <p className="dim small">불러오는 중…</p>
        ) : view.mode === 'edit' ? (
          <ConventionForm item={view.item} onSaved={saved} onCancel={() => setView(view.item ? { mode: 'detail', id: view.item.id } : { mode: 'list' })} />
        ) : detail ? (
          <article className="conv-detail" aria-label={detail.name}>
            <div className="conv-head">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setView({ mode: 'list' })}>
                목록으로
              </button>
              {canEdit && (
                <button type="button" className="btn btn-sm" onClick={() => setView({ mode: 'edit', item: detail })}>
                  편집
                </button>
              )}
            </div>
            <span className="conv-target">{CONVENTION_TARGET_LABEL[detail.target]}</span>
            <h3 className="conv-name">{detail.name}</h3>
            <pre className="conv-content" aria-label="내용">
              {detail.content}
            </pre>
            {detail.description && <p className="conv-desc">{detail.description}</p>}
            <p className="dim small">
              {detail.author.displayName} 강사가 만듦 · {formatDate(detail.updatedAt)} 수정
            </p>
          </article>
        ) : (
          <>
            <div className="conv-head">
              <p className="dim small conv-lead">강사가 모아 둔 브랜치 · 커밋 · PR · 이슈 컨벤션 예시예요. {canEdit ? '강사는 등록 · 편집할 수 있어요.' : '보기만 할 수 있어요.'}</p>
              {canEdit && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setView({ mode: 'edit', item: null })}>
                  새 컨벤션 등록
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <PanelEmpty icon="list" title="아직 등록된 컨벤션이 없어요" body={canEdit ? '팀이 함께 볼 규칙을 등록하면 모두가 같은 기준을 보게 돼요.' : '강사가 컨벤션을 등록하면 여기에 모여요.'} />
            ) : (
              <ul className="conv-list" aria-label="컨벤션 목록">
                {items.map((i) => (
                  <li key={i.id}>
                    <button type="button" className="conv-item" onClick={() => setView({ mode: 'detail', id: i.id })}>
                      <span className="conv-target">{CONVENTION_TARGET_LABEL[i.target]}</span>
                      <strong>{i.name}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <footer className="modal-foot">
        <button type="button" className="btn" data-autofocus onClick={close}>
          닫기
        </button>
      </footer>
    </Modal>
  )
}

function ConventionForm({ item, onSaved, onCancel }: { item: ConventionLibraryItemDto | null; onSaved: (item: ConventionLibraryItemDto, created: boolean) => void; onCancel: () => void }) {
  const [target, setTarget] = useState<ConventionTarget>(item?.target ?? 'branch_name')
  const [name, setName] = useState(item?.name ?? '')
  const [content, setContent] = useState(item?.content ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const request: ConventionLibraryItemRequest = { target, name: name.trim(), content, description: blankToNull(description) }
  const error = conventionRequestError(request)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    const st = useOffice.getState()
    const done = item ? await st.updateConventionLibraryItem(item.id, request) : await st.createConventionLibraryItem(request)
    setBusy(false)
    if (done) onSaved(done, item === null)
  }

  return (
    <form className="conv-form" onSubmit={submit} noValidate aria-label={item ? `${item.name} 편집` : '새 컨벤션 등록'}>
      <Field label="대상">
        <select className="select select-sm" value={target} onChange={(e) => setTarget(e.target.value as ConventionTarget)}>
          {CONVENTION_TARGETS.map((t) => (
            <option key={t} value={t}>
              {CONVENTION_TARGET_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="이름">
        <input className="select" type="text" value={name} maxLength={CONVENTION_NAME_MAX} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="내용">
        <textarea className="select conv-mono" rows={8} value={content} maxLength={CONVENTION_CONTENT_MAX} placeholder="패턴 · 예시 · 템플릿 본문" onChange={(e) => setContent(e.target.value)} />
      </Field>
      <Field label="설명 (선택)">
        <textarea className="select" rows={2} value={description} maxLength={CONVENTION_DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {submitted && error && (
        <em className="fld-error" role="alert">
          {error}
        </em>
      )}
      <div className="conv-head">
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          저장
        </button>
      </div>
    </form>
  )
}
