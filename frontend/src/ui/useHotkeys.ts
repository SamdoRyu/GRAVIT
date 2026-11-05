// Global keyboard shortcuts. OWNER: D.
//   M start/end meeting · / search · Esc close dialog, else clear selection
//   (데모의 N 새 작업 · 1-3 오버레이는 v1에서 뺐다 — #102 T5-c-2)
import { useEffect } from 'react'
import { ongoingMeeting, useOffice } from '../store'
import { OVERLAY_QUERY } from './hooks'
import { useUi } from './uiState'

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (isTyping(e.target)) return
      const st = useOffice.getState()

      if (e.key === 'Escape') {
        if (st.drag) return // App cancels the drag
        const ui = useUi.getState()
        if (st.dialog) st.openDialog(null)
        else if (ui.panelOpen && window.matchMedia(OVERLAY_QUERY).matches) ui.setPanelOpen(false)
        else if (st.selection) st.select(null)
        else if (st.officeSelection) st.selectInOffice(null)
        return
      }
      if (st.dialog || st.drag || useUi.getState().historyOpen) return

      if (e.code === 'KeyM') {
        e.preventDefault()
        const live = ongoingMeeting(st.meetings)
        st.openDialog(live ? { kind: 'endMeeting', meetingId: live.id } : { kind: 'startMeeting' })
      } else if (e.code === 'Slash') {
        e.preventDefault()
        const ui = useUi.getState()
        ui.setPanelOpen(true)
        if (ui.tab === 'week') ui.setTab('kanban')
        requestAnimationFrame(() => {
          const el = document.getElementById('hud-search')
          el?.focus()
          if (el instanceof HTMLInputElement) el.select()
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
