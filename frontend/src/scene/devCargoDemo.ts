// 개발 모드(dev 서버) 전용 — 새 이슈 화물 도착(#304)을 리허설용으로 바로 발동한다. 배포 빌드에는 들어가지 않는다(import.meta.env.DEV).
// Shift + I(이슈) 또는 콘솔 gravitDemo.cargo(n). 화면에 들고 있는 사무실 데이터에 담당자 없는 열린 이슈를 n개(기본 1) 덧붙일 뿐 —
// 서버 · GitHub에는 아무것도 보내지 않고, 다음에 사무실 데이터를 다시 읽으면 사라진다.
// 소유: C.
import { useOffice } from '../store'

let seq = 0

/** 가짜 새 이슈 n개 — 덧붙인 이슈 번호들을 돌려준다 */
function cargo(n = 1): number[] {
  const { office } = useOffice.getState()
  const snap = office?.snapshot
  const base = snap?.tasks[0]
  if (!office || !snap || !base) return []
  const top = Math.max(...snap.tasks.map((t) => t.githubIssueNumber))
  const now = new Date().toISOString()
  const added = Array.from({ length: Math.max(1, Math.min(12, n)) }, (_, i) => {
    seq++
    const number = top + i + 1
    return { ...base, id: `demo_cargo_${seq}`, githubIssueNumber: number, title: `리허설 새 이슈 ${seq}`, state: 'open' as const, closedReason: null, assigneeMemberIds: [], labels: [], priority: null, dueDate: null, linkedSubmissionIds: [], isBlocked: false, htmlUrl: null, githubCreatedAt: now, githubUpdatedAt: now, closedAt: null, stateChangedAt: now, syncedAt: now }
  })
  useOffice.setState({ office: { ...office, snapshot: { ...snap, tasks: [...snap.tasks, ...added] } } })
  return added.map((t) => t.githubIssueNumber)
}

/** 개발 모드에서만 단축키 · 콘솔 명령을 건다. 떼는 함수를 돌려준다 */
export function installDevCargoDemo(): () => void {
  if (!import.meta.env.DEV) return () => {}
  const w = window as unknown as { gravitDemo?: Record<string, unknown> }
  w.gravitDemo = { ...w.gravitDemo, cargo }
  const onKey = (e: KeyboardEvent) => {
    if (!e.shiftKey || e.code !== 'KeyI' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
    const el = document.activeElement as HTMLElement | null
    if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
    cargo(1)
  }
  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('keydown', onKey)
    if (w.gravitDemo) delete w.gravitDemo.cargo
  }
}
