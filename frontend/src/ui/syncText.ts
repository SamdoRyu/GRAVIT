// 상단 바 동기화 상태 문구 (FR-GH-05). SyncStatus → 표시할 말. 화면 계산만 하는 순수 함수. 소유: D.
import type { SyncStatus } from '../data/types'
import { formatClock, formatDateShort, localDateOf, relativeTime } from './format'

export type SyncTone = 'running' | 'failing' | 'ok' | 'never'

export interface SyncText {
  tone: SyncTone
  /** 상단 바에 늘 보이는 짧은 말 */
  label: string
  /** 실패 사유 — 실패 중일 때만, 상단 바에 함께 보인다 */
  reason: string | null
  /** 마지막 성공 시각 · 마지막 데이터 유지 안내 (툴팁 · 탭 설명) */
  detail: string
}

/** 서버가 사유 문구를 주지 않았을 때 쓰는 기본 문구 */
const FAILURE_TEXT: Record<NonNullable<SyncStatus['lastFailureCode']>, string> = {
  github_unauthorized: 'GitHub 권한이 없거나 만료됐어요',
  github_rate_limited: 'GitHub 요청 한도를 넘었어요',
  unavailable: 'GitHub에 연결하지 못했어요',
}

/** "11/5 오후 2:30" — 화면 시간대 기준 */
function absolute(iso: string): string {
  return `${formatDateShort(localDateOf(iso))} ${formatClock(iso)}`
}

function lastSuccess(s: SyncStatus): string {
  return s.lastSucceededAt ? `마지막 성공 ${absolute(s.lastSucceededAt)}` : '아직 성공한 동기화가 없어요'
}

export function failureReason(s: SyncStatus): string {
  const message = s.lastFailureMessage?.trim()
  if (message) return message
  return s.lastFailureCode ? FAILURE_TEXT[s.lastFailureCode] : '알 수 없는 이유로 실패했어요'
}

export function describeSync(s: SyncStatus, now = Date.now()): SyncText {
  if (s.state === 'running') {
    const before = s.isFailing ? ` · 직전 동기화는 실패했어요(${failureReason(s)})` : ''
    return { tone: 'running', label: '동기화 중', reason: null, detail: `${lastSuccess(s)}${before}` }
  }
  if (s.isFailing) {
    // 실패해도 화면은 마지막으로 읽은 데이터를 그대로 보인다 (NFR-09)
    return { tone: 'failing', label: '동기화 실패', reason: failureReason(s), detail: `${lastSuccess(s)} · 화면은 마지막으로 받은 데이터예요` }
  }
  if (s.lastSucceededAt) {
    return { tone: 'ok', label: `${relativeTime(s.lastSucceededAt, now)} 동기화`, reason: null, detail: lastSuccess(s) }
  }
  return { tone: 'never', label: '동기화 전', reason: null, detail: lastSuccess(s) }
}
