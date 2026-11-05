// 프로젝트 기간 입력 (#38 — FR-PLAN-01). v1 사무실의 R2(레포 관리자)만 연다. 소유: D.
// PUT W/settings는 전체 교체라 기간 밖의 설정(명세 문서 경로 · 기준 시간)은 지금 값 그대로 보낸다.
import { useEffect, useState, type FormEvent } from 'react'
import { periodError, projectDay } from '../data/rules/period'
import { useOffice } from '../store'
import { Field } from './common'
import { Modal } from './Dialogs'

function close() {
  useOffice.getState().openDialog(null)
}

export function ProjectPeriodDialog() {
  const settings = useOffice((s) => s.office?.snapshot?.settings ?? null)
  const canEdit = useOffice((s) => s.office?.snapshot?.viewer.role === 'repo_admin')
  const [start, setStart] = useState(settings?.projectStartDate ?? '')
  const [end, setEnd] = useState(settings?.projectEndDate ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  // 사무실이 닫히거나 권한이 없어지면 닫는다
  useEffect(() => {
    if (!settings || !canEdit) close()
  }, [settings, canEdit])

  if (!settings) return null
  const error = periodError(start, end)
  // 형식 오류는 제출할 때, 순서 오류는 바로 보인다
  const shownError = submitted || (start && end && error) ? error : null
  const totalDays = error ? null : projectDay({ projectStartDate: start, projectEndDate: end }, start)?.totalDays

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    if (start === settings.projectStartDate && end === settings.projectEndDate) {
      close()
      return
    }
    setBusy(true)
    const st = useOffice.getState()
    if (await st.updateOfficeSettings({ ...settings, projectStartDate: start, projectEndDate: end })) {
      st.toast('good', '프로젝트 기간을 바꿨어요')
      close()
    } else {
      setBusy(false)
    }
  }

  return (
    <Modal title="프로젝트 기간" onClose={close} width={420}>
      <form onSubmit={submit} noValidate>
        <div className="modal-body">
          <div className="grid2">
            <Field label="시작 날짜">
              <input className="select" type="date" data-autofocus value={start} required onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="끝 날짜">
              <input
                className="select"
                type="date"
                value={end}
                min={start || undefined}
                required
                aria-invalid={!!shownError}
                aria-describedby={shownError ? 'period-error' : undefined}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
          {/* 두 칸 아래 한 줄 — 한쪽 칸에만 붙이면 두 입력칸 높이가 어긋난다 */}
          {shownError && (
            <em id="period-error" className="fld-error" role="alert">
              {shownError}
            </em>
          )}
          <p className="modal-text">
            {totalDays ? `총 ${totalDays}일 · ` : ''}D-day는 끝 날짜까지 한국 시간 날짜로 셉니다. 팀원 모두의 상단 바에 바로 반영돼요.
          </p>
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={close}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            저장
          </button>
        </footer>
      </form>
    </Modal>
  )
}
