// 상단 배너 문구 (#274 — 디자인 보드 「2 · 상단 배너」). 동기화 진행 중 · 동기화 실패 · 실시간 연결 끊김 · 최신 데이터 못 받음을 따로 보인다.
// 화면 계산만 하는 순수 함수 — 언제 닫을지(복구 뒤 최신 Snapshot이 반영될 때까지)는 SystemBanners(ErrorStates.tsx)가 phase로 넘긴다. 소유: D.
import type { DataErrorCode } from '../data/DataSource'
import type { SyncStatus } from '../data/types'
import { formatClock, relativeTime } from './format'
import { failureReason } from './syncText'

export interface SystemBanner {
  id: 'sync' | 'connection' | 'stale'
  /** calm = 라벤더(진행 · 반영 중), bad = 빨강(실패), warn = 노랑(끊김 · 오래된 데이터) */
  tone: 'calm' | 'bad' | 'warn'
  title: string
  body: string
  /** 오른쪽 작은 글 — 기준 시각 등 */
  meta: string | null
  /** 보라 버튼. sync = 다시 동기화, reload = Snapshot 지금 다시 읽기 */
  action: { kind: 'sync' | 'reload'; label: string } | null
  /** 점 대신 도는 표시(진행 중) */
  busy: boolean
  /** 닫기(X)를 둘 때 — 같은 값이면 닫힌 채로 둔다(새 실패면 다시 보인다) */
  dismissKey: string | null
}

/** running = 동기화 중, applying = 끝났고 최신 Snapshot을 반영하는 중(반영되면 null) */
export type SyncPhase = 'running' | 'applying' | null
/** offline = 끊김(api DataSource가 backoff로 다시 붙는 중), applying = 다시 붙었고 최신 Snapshot을 반영하는 중 */
export type LinkPhase = 'offline' | 'applying' | null

const basis = (iso: string | null, now: number) => (iso ? `${relativeTime(iso, now)} 기준` : '아직 동기화하기 전 데이터')

export function syncBanner(sync: SyncStatus | null, phase: SyncPhase, canSync: boolean, now = Date.now()): SystemBanner | null {
  if (!sync) return null
  if (phase === 'running' || sync.state === 'running') {
    return {
      id: 'sync',
      tone: 'calm',
      title: 'GitHub와 동기화하고 있어요',
      body: '지금 보이는 내용은 직전 동기화 기준이에요. 끝나면 자동으로 바뀌어요. 그동안에도 사무실을 그대로 쓸 수 있어요.',
      meta: sync.lastSucceededAt ? `직전 동기화 · ${formatClock(sync.lastSucceededAt)}` : null,
      action: null,
      busy: true,
      dismissKey: null,
    }
  }
  if (phase === 'applying') {
    return { id: 'sync', tone: 'calm', title: '동기화를 마쳤어요', body: '최신 내용을 화면에 반영하고 있어요.', meta: null, action: null, busy: true, dismissKey: null }
  }
  if (sync.isFailing) {
    return {
      id: 'sync',
      tone: 'bad',
      title: '동기화하지 못했어요',
      body: `${failureReason(sync).replace(/[.\s]+$/, '')}. 지금 보이는 내용은 ${basis(sync.lastSucceededAt, now)}이에요. ${canSync ? '다시 동기화하면 최신 내용을 받아와요.' : '팀원이 다시 동기화하면 최신 내용으로 바뀌어요.'}`,
      meta: sync.lastSucceededAt ? `마지막 성공 · ${relativeTime(sync.lastSucceededAt, now)}` : null,
      action: canSync ? { kind: 'sync', label: '다시 동기화' } : null,
      busy: false,
      dismissKey: `sync:${sync.lastFailedAt ?? ''}`,
    }
  }
  return null
}

export function connectionBanner(phase: LinkPhase): SystemBanner | null {
  if (!phase) return null
  if (phase === 'offline') {
    return {
      id: 'connection',
      tone: 'warn',
      title: '실시간 연결을 복구하고 있어요',
      body: '지금 보이는 내용은 연결이 끊기기 직전 기준이에요. 복구되면 자동으로 최신 내용이 돼요.',
      meta: '자동으로 다시 연결하는 중',
      action: { kind: 'reload', label: '지금 새로고침' },
      busy: true,
      dismissKey: null,
    }
  }
  return { id: 'connection', tone: 'calm', title: '실시간 연결이 복구됐어요', body: '최신 내용을 화면에 반영하고 있어요.', meta: null, action: null, busy: true, dismissKey: null }
}

/**
 * 받은 데이터가 있는데 다시 읽기에 실패했다(NFR-09 — 화면은 마지막 데이터 그대로). 세션 만료 · 열 수 없음은 전체 화면이 대신하고,
 * 끊김 중에는 연결 배너가 같은 말을 하므로 보이지 않는다
 */
export function staleBanner(error: { code: DataErrorCode; message: string } | null, hasSnapshot: boolean, offline: boolean): SystemBanner | null {
  if (!error || !hasSnapshot || offline || error.code === 'unauthorized' || error.code === 'not_found') return null
  return {
    id: 'stale',
    tone: 'warn',
    title: '최신 내용을 받지 못했어요',
    body: '지금 보이는 내용은 마지막으로 받은 데이터예요. 잠시 뒤 다시 불러와 주세요.',
    meta: null,
    action: { kind: 'reload', label: '다시 불러오기' },
    busy: false,
    dismissKey: null,
  }
}
