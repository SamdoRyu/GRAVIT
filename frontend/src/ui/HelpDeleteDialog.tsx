// 도움 요청 삭제 범위 고르기 (#316 — CONTRACTS_API.md 「11」 도움 요청 삭제, 서버 #315). 소유: D.
// - 나에게서만 삭제: 내 화면에서만 숨긴다(다른 사람에게는 그대로, 「숨긴 도움 요청」에서 다시 볼 수 있다). 볼 수 있는 사람 누구나.
// - 모두에게서 영구 삭제: 요청자만. 경고(다른 사람 코멘트 · 강사 답변 개수, 복원 불가, 연결 안건 처리)를 본 뒤 한 번 더 눌러야 지운다.
// 버튼을 숨기는 것은 권한 검사가 아니다 — 서버가 고른 범위(엔드포인트)대로 다시 검사하고, 실패는 폼 위 띠로 알린다.
// 다른 대화상자처럼 HUD의 Dialogs가 그린다(오른쪽 패널 안에서 그리면 패널의 backdrop-filter에 갇힌다).
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DELETED_HELP_REQUEST_TITLE, helpDeleteLoss, helpDeleteScopes, type HelpDeleteScope } from '../data/rules/help'
import type { HelpRequestDetail, Id } from '../data/types'
import { useOffice } from '../store'
import { Modal } from './Dialogs'
import { FormAlert } from './ErrorStates'
import { useUi } from './uiState'
import { useWriteProblem } from './useWriteProblem'

export function HelpDeleteDialog({ helpRequestId }: { helpRequestId: Id }) {
  const summary = useOffice((s) => s.office?.snapshot?.helpRequests.find((h) => h.id === helpRequestId) ?? null)
  const viewerMemberId = useOffice((s) => s.office?.snapshot?.viewer.memberId ?? null)
  const [detail, setDetail] = useState<HelpRequestDetail | null>(null)
  const [scope, setScope] = useState<HelpDeleteScope>('me')
  const [step, setStep] = useState<'choose' | 'confirm'>('choose')
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const w = useWriteProblem('deleteHelp', { resubmit: () => formRef.current?.requestSubmit() })
  const close = () => useOffice.getState().openDialog(null)

  // 경고에 보일 개수(다른 사람 코멘트 · 강사 답변)는 상세에서 센다 — 못 읽으면 전체 개수만 보인다
  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadHelpRequest(helpRequestId)
      .then((got) => {
        if (alive && got) setDetail(got)
      })
    return () => {
      alive = false
    }
  }, [helpRequestId])
  // 그 사이 다른 곳에서 지워지거나 숨겨졌다 — 고를 것이 없으니 닫는다
  useEffect(() => {
    if (summary === null && !busy) useOffice.getState().openDialog(null)
  }, [summary, busy])
  if (!summary) return null

  const scopes = helpDeleteScopes(summary, viewerMemberId)
  const loss = detail ? helpDeleteLoss(detail) : null
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (scope === 'everyone' && step === 'choose') {
      setStep('confirm') // 재확인 — 경고를 보이고 한 번 더 누르게 한다
      return
    }
    setBusy(true)
    w.clear()
    const st = useOffice.getState()
    const ok = scope === 'me' ? await st.hideHelpRequest(summary.id, w.report) : await st.deleteHelpRequest(summary.id, w.report)
    setBusy(false)
    if (!ok) return
    st.toast('good', scope === 'me' ? '내 화면에서 숨겼어요. 「숨긴 도움 요청」에서 다시 볼 수 있어요' : '도움 요청을 모두에게서 지웠어요')
    useUi.getState().openHelpRequest(null)
    close()
  }

  return (
    <Modal title="도움 요청 삭제" onClose={close} width={440}>
      <form ref={formRef} onSubmit={submit} noValidate aria-label="도움 요청 삭제">
        <div className="modal-body help-delete">
          {w.notice && <FormAlert notice={w.notice} busy={w.busy} onAction={w.act} />}
          {step === 'choose' ? (
            <fieldset className="help-delete-scopes">
              <legend className="small dim">어디에서 지울까요?</legend>
              <label className="help-delete-scope">
                <input type="radio" name="help-delete-scope" value="me" checked={scope === 'me'} onChange={() => setScope('me')} />
                <span>
                  <strong>나에게서만 삭제</strong>
                  <span className="small dim">내 화면에서만 숨겨요. 다른 사람에게는 그대로 보이고, 「숨긴 도움 요청」에서 다시 볼 수 있어요.</span>
                </span>
              </label>
              {scopes.includes('everyone') && (
                <label className="help-delete-scope">
                  <input type="radio" name="help-delete-scope" value="everyone" checked={scope === 'everyone'} onChange={() => setScope('everyone')} />
                  <span>
                    <strong>모두에게서 영구 삭제</strong>
                    <span className="small dim">모든 사람의 화면에서 지우고, 되돌릴 수 없어요. 요청한 사람만 할 수 있어요.</span>
                  </span>
                </label>
              )}
            </fieldset>
          ) : (
            <div className="help-note help-note-warn help-delete-warn" role="alert">
              <strong>정말 모두에게서 지울까요? 되돌릴 수 없어요.</strong>
              <ul>
                <li>
                  본문과 코멘트 {summary.commentCount}개가 모두 지워져요.
                  {loss === null && ' (코멘트를 불러오지 못해 누가 썼는지는 확인하지 못했어요.)'}
                </li>
                {loss && loss.otherComments > 0 && <li>다른 사람이 쓴 코멘트 {loss.otherComments}개도 함께 지워져요.</li>}
                {loss && loss.instructorAnswers > 0 && <li>강사 답변 {loss.instructorAnswers}개도 함께 지워져요.</li>}
                {summary.status === 'on_agenda' && <li>회의 안건으로 올라가 있는 안건은 거둬져서 회의실 탁자에서 빠져요.</li>}
                <li>이 요청으로 만든 회의 결정 기록은 남지만, 안건 제목은 "{DELETED_HELP_REQUEST_TITLE}"으로 바뀌어요.</li>
                <li>결정 · 회의록에 사람이 직접 옮겨 적은 내용은 지워지지 않아요.</li>
              </ul>
            </div>
          )}
        </div>
        <footer className="modal-foot">
          {step === 'confirm' ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStep('choose')} disabled={busy}>
              뒤로
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-ghost" onClick={close}>
              취소
            </button>
          )}
          <button type="submit" className={`btn btn-sm ${scope === 'everyone' && step === 'confirm' ? 'btn-danger-solid' : 'btn-primary'}`} disabled={busy}>
            {scope === 'me' ? '나에게서만 삭제' : step === 'choose' ? '다음' : '영구 삭제'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
