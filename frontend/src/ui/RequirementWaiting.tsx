// 요구사항 대기 목록 (#197 — CONTRACTS.md 「8」 판 배치 · 「10」, 2026-11-06 결정 #194). 소유: D.
// active 요구사항이 판 수보다 많으면 3D 데크의 마지막 칸이 대기 칸이다. 대기 칸을 누르면 이 목록이 열리고, 판에 오른 요구사항과
// 자리를 바꾸거나("판에 올리기") "기본 순서로" 되돌린다 — 바꾼 결과는 보는 사람의 브라우저에만 둔다(store.requirementDeckOrder).
// 대기 칸에 이슈 상자를 놓으면 연결할 요구사항 고르기로 열린다(연결은 R2만 — CONTRACTS_API.md 「8」).
// 어느 요구사항이 판 · 대기 칸에 있는지는 3D와 같은 함수(SceneModel planRequirementDeck)로 센다.
import { useMemo, useState } from 'react'
import { canEditRequirementLinks, progressText, requirementName, swapDeckOrder } from '../data/rules/requirements'
import type { Id, RequirementDto } from '../data/types'
import { planRequirementDeck } from '../scene/model/requirementDeck'
import { useOffice } from '../store'
import { Modal } from './Dialogs'
import './requirements.css'

function close() {
  useOffice.getState().openDialog(null)
}

export function RequirementWaitingDialog({ linkTaskId }: { linkTaskId: Id | null }) {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const order = useOffice((s) => s.requirementDeckOrder)
  const plan = useMemo(() => (snapshot ? planRequirementDeck(snapshot.requirements, order) : null), [snapshot, order])
  if (!snapshot || !plan) return null
  const task = linkTaskId ? (snapshot.tasks.find((t) => t.id === linkTaskId) ?? null) : null
  const linking = linkTaskId !== null
  const title = linking ? '연결할 요구사항 고르기' : '대기 중인 요구사항'

  return (
    <Modal title={title} onClose={close} width={480}>
      <div className="modal-body req-waiting">
        {linking && <LinkNotice task={task} canEdit={canEditRequirementLinks(snapshot.viewer)} />}
        {plan.waiting.length === 0 ? (
          <p className="dim small">대기 중인 요구사항이 없어요. 요구사항이 판 수보다 적어 모두 판에 있어요.</p>
        ) : (
          <>
            {!linking && <p className="dim small req-lead">판이 모자라 대기 칸에 있는 요구사항이에요. 판에 오른 요구사항과 자리를 바꿀 수 있어요 — 이 브라우저에서만 바뀌어요.</p>}
            <ul className="req-list" aria-label="대기 중인 요구사항">
              {plan.waiting.map((r) => (
                <WaitingItem key={r.id} requirement={r} shown={plan.shown} linkTaskId={task ? task.id : null} canLink={canEditRequirementLinks(snapshot.viewer)} linking={linking} />
              ))}
            </ul>
          </>
        )}
      </div>
      <footer className="modal-foot">
        {!linking && (
          <button
            type="button"
            className="btn"
            disabled={order === null}
            title={order === null ? '이미 기본 순서(문서 순서)예요' : undefined}
            onClick={() => {
              useOffice.getState().setRequirementDeckOrder(null)
              useOffice.getState().toast('good', '판을 기본 순서로 되돌렸어요')
            }}
          >
            기본 순서로
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn" data-autofocus onClick={close}>
          닫기
        </button>
      </footer>
    </Modal>
  )
}

function LinkNotice({ task, canEdit }: { task: { githubIssueNumber: number; title: string } | null; canEdit: boolean }) {
  if (!task) return <p className="notice notice-warn">이 이슈를 더 찾을 수 없어요.</p>
  return (
    <p className={`notice${canEdit ? '' : ' notice-warn'}`}>
      {canEdit ? (
        <>
          <strong>
            #{task.githubIssueNumber} {task.title}
          </strong>
          을(를) 연결할 요구사항을 골라 주세요. 이슈는 제자리에 있고 GitHub도 바뀌지 않아요.
        </>
      ) : (
        '요구사항 연결은 레포 관리자만 바꿀 수 있어요.'
      )}
    </p>
  )
}

function WaitingItem({
  requirement: r,
  shown,
  linkTaskId,
  canLink,
  linking,
}: {
  requirement: RequirementDto
  shown: RequirementDto[]
  linkTaskId: Id | null
  canLink: boolean
  linking: boolean
}) {
  const name = requirementName(r)
  const [board, setBoard] = useState<Id>(shown[shown.length - 1]?.id ?? '')
  const [busy, setBusy] = useState(false)

  const link = async () => {
    if (!linkTaskId) return
    const st = useOffice.getState()
    const already = st.office?.snapshot?.requirementLinks.some((l) => l.requirementId === r.id && l.taskId === linkTaskId) ?? false
    setBusy(true)
    const done = await st.linkRequirement(r.id, linkTaskId)
    setBusy(false)
    if (!done) return
    st.toast('good', already ? `이미 ${name}에 연결돼 있어요` : `${name}에 연결했어요`)
    close()
  }

  const swap = () => {
    const ids = shown.map((x) => x.id)
    if (!ids.includes(board)) return
    const st = useOffice.getState()
    st.setRequirementDeckOrder(swapDeckOrder(ids, board, r.id))
    st.toast('good', `${name}을(를) 판에 올렸어요`)
  }

  return (
    <li className={`req-item${r.linkedTaskCount === 0 ? ' is-empty' : ''}`} aria-label={name}>
      <div className="req-head">
        {r.sourceKey && <span className="req-key">{r.sourceKey}</span>}
        <strong className="req-title">{r.title}</strong>
        <span className={`small${r.linkedTaskCount === 0 ? ' req-empty' : ' dim'}`}>{progressText(r)}</span>
      </div>
      {linking ? (
        <div className="req-actions">
          <button type="button" className="btn btn-sm btn-primary" disabled={!canLink || linkTaskId === null || busy} onClick={() => void link()}>
            이 요구사항에 연결
          </button>
        </div>
      ) : (
        shown.length > 0 && (
          <div className="req-actions">
            <label className="req-swap">
              <span className="dim small">자리를 바꿀 판</span>
              <select className="select" value={board} onChange={(e) => setBoard(e.target.value)} aria-label={`${name}와(과) 자리를 바꿀 판`}>
                {shown.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {i + 1}번 판 · {requirementName(s)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-sm" onClick={swap}>
              판에 올리기
            </button>
          </div>
        )
      )}
    </li>
  )
}
