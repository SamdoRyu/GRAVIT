// 상단 바 동기화 상태 (FR-GH-05) — 진행 중 · 마지막 성공 · 실패 사유. 소유: D.
// v1 사무실(store.office)이 열려 있을 때만 보인다. 팀원은 눌러서 수동 동기화(#234 — 진행 중이면 설명만), 강사는 설명만 본다
// (강사 숨김은 편의이고 서버가 403으로 다시 검사한다).
import { useOffice } from '../store'
import { useNow } from './hooks'
import { Icon } from './icons'
import { describeSync } from './syncText'
import { useUi } from './uiState'

const ICON = { running: 'refresh', failing: 'alert', ok: 'check', never: 'refresh' } as const

/** 화면 낭독기에 알릴 말 — 상태가 바뀔 때만 달라진다(상대 시간 "3분 전"은 넣지 않아 1분마다 읽히지 않는다) */
const ANNOUNCE = { running: '동기화 중', ok: '동기화 완료', never: '' } as const

export function SyncStatus() {
  const sync = useOffice((s) => s.office?.snapshot?.sync ?? null)
  const isInstructor = useOffice((s) => s.office?.snapshot?.viewer.role === 'instructor')
  const now = useNow()
  if (!sync) return null
  const t = describeSync(sync, now)
  const canSync = !isInstructor && sync.state !== 'running'
  const explain = (t.reason ? `${t.label}: ${t.reason} · ${t.detail}` : `${t.label} · ${t.detail}`) + (canSync ? ' · 눌러서 지금 동기화' : '')
  const announce = t.tone === 'failing' ? `동기화 실패: ${t.reason}` : ANNOUNCE[t.tone]
  return (
    <>
      <button
        type="button"
        className={`sync-status sync-${t.tone}`}
        title={explain}
        aria-label={explain}
        // 동기화할 수 없을 때는 눌러서 설명을 본다(터치에는 툴팁이 없다)
        onClick={() => (canSync ? void useOffice.getState().requestOfficeSync() : useUi.getState().showTip(explain))}
      >
        <Icon name={ICON[t.tone]} size={13} />
        <span className="sync-label">{t.label}</span>
        {t.reason && <span className="sync-reason">{t.reason}</span>}
      </button>
      <span className="sr-only" role="status">
        {announce}
      </span>
    </>
  )
}
