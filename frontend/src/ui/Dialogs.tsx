// Modal 틀과 대화상자 고르기 — 회의(C의 MeetingDialogs) · 프로젝트 기간 · 회의록. OWNER: D.
// 데모 팀원 · 작업 대화상자는 #102 ④에서 걷어냈다.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useOffice, type Dialog } from '../store'
import { Icon } from './icons'
import { EndMeetingDialog, MeetingHistoryDialog, RaiseAgendaDialog, StartMeetingDialog } from './MeetingDialogs'
import { ProjectPeriodDialog } from './PeriodDialog'
import { RequirementWaitingDialog } from './RequirementWaiting'
import { InstructorDialog } from './InstructorDialog'
import { InstructorInboxDialog } from './InstructorInbox'
import { ConventionLibraryDialog } from './ConventionLibraryDialog'
import { ActivityDialog } from './ActivityDialog'
import { HelpDeleteDialog } from './HelpDeleteDialog'
import { useActivityConsentPrompt } from './activityConsent'
import { useUi } from './uiState'

const FOCUSABLE = 'input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ title, onClose, children, width = 460 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    if (first instanceof HTMLInputElement && first.type === 'text') first.select()
    return () => prev?.focus?.()
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Tab' && ref.current) {
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }} onKeyDown={onKeyDown}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-icon btn-ghost" aria-label="닫기" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Dialogs() {
  const dialog = useOffice((s) => s.dialog)
  const historyOpen = useUi((s) => s.historyOpen)
  useActivityConsentPrompt()
  return (
    <>
      {dialog && <DialogSwitch key={dialogKey(dialog)} dialog={dialog} />}
      {historyOpen && !dialog && <MeetingHistoryDialog />}
    </>
  )
}

function dialogKey(d: Dialog): string {
  return JSON.stringify(d)
}

function DialogSwitch({ dialog }: { dialog: Dialog }) {
  switch (dialog.kind) {
    case 'startMeeting':
      return <StartMeetingDialog />
    case 'endMeeting':
      return <EndMeetingDialog meetingId={dialog.meetingId} />
    case 'projectPeriod':
      return <ProjectPeriodDialog />
    case 'raiseAgenda':
      return <RaiseAgendaDialog source={dialog.source} />
    case 'instructors':
      return <InstructorDialog />
    case 'instructorInbox':
      return <InstructorInboxDialog />
    case 'conventionLibrary':
      return <ConventionLibraryDialog />
    case 'activities':
      return <ActivityDialog consent={dialog.consent} />
    case 'requirementWaiting':
      return <RequirementWaitingDialog linkTaskId={dialog.linkTaskId} />
    case 'deleteHelp':
      return <HelpDeleteDialog helpRequestId={dialog.helpRequestId} />
  }
}
