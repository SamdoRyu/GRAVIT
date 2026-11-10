// 개발 모드(dev 서버) 전용 — PR 머지 축하(#300)를 리허설용으로 바로 발동한다. 배포 빌드에는 들어가지 않는다(import.meta.env.DEV).
// Shift + P(PR) 또는 콘솔 gravitDemo.merge() — M은 회의 단축키(ui/useHotkeys)라 쓰지 않는다. 화면에 들고 있는 사무실 데이터만 바꾼다 — 서버 · GitHub에는 아무것도 보내지 않고,
// 다음에 사무실 데이터를 다시 읽으면 원래대로 돌아온다.
//  - 검토 중(열림 · Draft) PR이 있으면 그 PR을 머지로 → 상자가 아카이브로 날아가며 축하
//  - 없으면 가장 최근에 머지된 PR을 잠깐 검토 중으로 되돌렸다가(상자가 스캐너로) 다시 머지 → 몇 번이고 다시 볼 수 있다
// 소유: C.
import { useOffice } from '../store'

type Office = NonNullable<ReturnType<typeof useOffice.getState>['office']>
type Submission = NonNullable<Office['snapshot']>['submissions'][number]

/** 사무실 데이터의 PR 하나를 바꿔 넣는다 */
function patchSubmission(id: string, patch: Partial<Submission>) {
  const { office } = useOffice.getState()
  const snap = office?.snapshot
  if (!office || !snap) return
  useOffice.setState({ office: { ...office, snapshot: { ...snap, submissions: snap.submissions.map((p) => (p.id === id ? { ...p, ...patch } : p)) } } })
}

/** 축하 한 번 — 어느 PR을 썼는지 돌려준다(없으면 null) */
async function merge(): Promise<string | null> {
  const snap = useOffice.getState().office?.snapshot
  if (!snap) return null
  const now = () => new Date().toISOString()
  const open = snap.submissions.find((p) => p.state === 'open' || p.state === 'draft')
  if (open) {
    patchSubmission(open.id, { state: 'merged', mergedAt: now(), closedAt: now() })
    return `#${open.githubPrNumber}`
  }
  const merged = [...snap.submissions].filter((p) => p.state === 'merged').sort((a, b) => (b.mergedAt ?? '').localeCompare(a.mergedAt ?? ''))[0]
  if (!merged) return null
  // 스캐너로 되돌렸다가(상자가 날아가 자리 잡을 시간) 다시 머지
  patchSubmission(merged.id, { state: 'open', mergedAt: null, closedAt: null })
  await new Promise((r) => setTimeout(r, 1800))
  patchSubmission(merged.id, { state: 'merged', mergedAt: now(), closedAt: now() })
  return `#${merged.githubPrNumber}`
}

/** 개발 모드에서만 단축키 · 콘솔 명령을 건다. 떼는 함수를 돌려준다 */
export function installDevMergeDemo(): () => void {
  if (!import.meta.env.DEV) return () => {}
  const w = window as unknown as { gravitDemo?: Record<string, unknown> }
  w.gravitDemo = { ...w.gravitDemo, merge }
  const onKey = (e: KeyboardEvent) => {
    if (!e.shiftKey || e.code !== 'KeyP' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
    const el = document.activeElement as HTMLElement | null
    if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
    void merge()
  }
  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('keydown', onKey)
    if (w.gravitDemo) delete w.gravitDemo.merge
  }
}
