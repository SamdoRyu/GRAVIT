// UI-only view state (panel layout etc.). Domain state stays in src/store.ts. OWNER: ui-builder.
import { create } from 'zustand'
import type { BoardColumn, BoardSortKey } from '../data/rules/board'
import { useOffice } from '../store'
import { OVERLAY_QUERY } from './hooks'

/** 관리 패널 탭. 팀원 탭(사람별 업무량 카드)은 v1에서 뺐다 — FR-FLOW-06 (#102 T5-c-2) */
export type Tab = 'kanban' | 'list' | 'week'

interface UiState {
  tab: Tab
  setTab: (t: Tab) => void
  panelOpen: boolean
  setPanelOpen: (on: boolean) => void
  wide: boolean
  setWide: (on: boolean) => void
  /** Width before the weekly plan forced wide mode (restored when leaving it). */
  prevWide: boolean | null
  /** Weekly plan: 0 = this week, -1 = last week, +1 = next week. */
  weekOffset: number
  setWeekOffset: (n: number) => void
  /** Meeting history dialog (read-only, UI-only so it doesn't need a store Dialog kind). */
  historyOpen: boolean
  /** Tap-to-explain text for chips that only have a hover tooltip. */
  tip: string | null
  showTip: (t: string | null) => void
  setHistoryOpen: (on: boolean) => void

  // ---- 칸반 · 목록 (#102 T5-c-2 — v1 이슈 · PR) ----
  /** 이슈 · PR 검색어 (칸반 · 목록 공용) */
  boardQuery: string
  setBoardQuery: (q: string) => void
  /** 좁은 칸반에서 접은 열 */
  boardCollapsed: Partial<Record<BoardColumn, boolean>>
  toggleBoardCollapsed: (c: BoardColumn) => void
  /** 목록 정렬. 같은 열을 다시 누르면 방향이 바뀐다 */
  boardSort: { key: BoardSortKey; dir: 'asc' | 'desc' }
  setBoardSort: (key: BoardSortKey) => void
}

export const useUi = create<UiState>((set, get) => ({
  tab: 'kanban',
  setTab: (tab) => {
    const cur = get().tab
    if (tab !== 'week') useOffice.getState().setPanelView(tab)
    if (tab === 'week' && cur !== 'week') set({ tab, prevWide: get().wide, wide: true })
    else if (tab !== 'week' && cur === 'week') set({ tab, wide: get().prevWide ?? get().wide, prevWide: null })
    else set({ tab })
  },
  // Narrow screens start with the rail collapsed (it opens as an overlay drawer).
  panelOpen: typeof window === 'undefined' || !window.matchMedia(OVERLAY_QUERY).matches,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  wide: false,
  setWide: (wide) => set({ wide }),
  prevWide: null,
  weekOffset: 0,
  setWeekOffset: (weekOffset) => set({ weekOffset }),
  historyOpen: false,
  tip: null,
  showTip: (tip) => set({ tip }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  boardQuery: '',
  setBoardQuery: (boardQuery) => set({ boardQuery }),
  boardCollapsed: { done: true },
  toggleBoardCollapsed: (c) => set({ boardCollapsed: { ...get().boardCollapsed, [c]: !get().boardCollapsed[c] } }),
  boardSort: { key: 'number', dir: 'asc' },
  setBoardSort: (key) => {
    const { boardSort } = get()
    set({ boardSort: boardSort.key === key ? { key, dir: boardSort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' } })
  },
}))
