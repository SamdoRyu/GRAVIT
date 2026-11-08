// 수집 동의 화면 (#173 — P12 · 07-screens 「수집 동의」): 열린 사무실에 처음 들어온 팀원이 아직 동의하지 않았으면
// 활동 기록 대화상자를 동의 화면으로 한 번 연다. 소유: A(리뷰 D).
import { useEffect, useRef } from 'react'
import { canWriteActivity } from '../data/rules/activity'
import type { Id } from '../data/types'
import { useSession } from '../session'
import { useOffice } from '../store'

const askedKey = (userId: Id, workspaceId: Id) => `gravit.activityConsentAsked.${userId}.${workspaceId}`

/**
 * 사무실에 들어와 처음 보는 Snapshot으로 한 번만 판단한다(도착 장면 · 다른 대화상자가 걷힌 뒤) — 들어온 뒤 동의를 거둬도 다시 묻지 않는다.
 * 물었다는 표시는 이 브라우저에만 남는다
 */
export function useActivityConsentPrompt() {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const dialogOpen = useOffice((s) => s.dialog !== null)
  const landing = useSession((s) => s.landing)
  const checked = useRef<Id | null>(null)
  useEffect(() => {
    if (!snapshot || dialogOpen || landing) return
    const { viewer, workspace } = snapshot
    if (checked.current === workspace.id) return
    checked.current = workspace.id
    if (!canWriteActivity(viewer) || viewer.activityConsented) return
    const key = askedKey(viewer.userId, workspace.id)
    try {
      if (localStorage.getItem(key) !== null) return
      localStorage.setItem(key, '1')
    } catch {
      return // 저장소를 못 쓰면 묻지 않는다 — 열 때마다 묻지 않게(더보기 → 활동 기록에서 동의할 수 있다)
    }
    useOffice.getState().openDialog({ kind: 'activities', consent: true })
  }, [snapshot, dialogOpen, landing])
}
