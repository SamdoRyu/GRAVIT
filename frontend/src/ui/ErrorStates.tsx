// 예외 처리 UI (#274 — 디자인 보드 「GRAVIT 예외 처리 UI」의 4가지 배치). 소유: D.
// 1 전체 화면(FullScreenNotice · OfficeBlocker) · 2 상단 배너(SystemBanners) · 3 폼 안(FormAlert · FieldError — 상태는 useWriteProblem.ts) ·
// 4 패널 안(PanelState · PanelEmpty). 어떤 문구 · 다음 행동인지는 rules/errors.ts(오류 code + 실패한 작업)와 systemBanners.ts가 정한다.
// 목업의 화면 · 오류 선택 메뉴(탭 · 칩)는 만들지 않았다 — 실제 오류가 날 때만 보인다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { officeProblem, type PanelProblem, type WriteNext, type WriteProblem } from '../data/rules/errors'
import { useSession } from '../session'
import { useOffice } from '../store'
import { useNow } from './hooks'
import { Icon, type IconName } from './icons'
import { connectionBanner, staleBanner, syncBanner, type LinkPhase, type SyncPhase, type SystemBanner } from './systemBanners'
import './errorStates.css'

// ---- 1 · 전체 화면 ----------------------------------------------------------------------

/** 로그인 화면 · 상단 바와 같은 GRAVIT 궤도 로고(한 가지 색) */
function OrbitMark() {
  return (
    <svg viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <circle cx="15" cy="15" r="7.5" fill="currentColor" />
      <path d="M9 12 Q15 10 21 12" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.4" fill="none" />
      <ellipse cx="15" cy="15" rx="13.5" ry="5" stroke="currentColor" strokeWidth="1.6" transform="rotate(-20 15 15)" />
      <rect x="23" y="6" width="4" height="4" fill="currentColor" transform="rotate(45 25 8)" />
    </svg>
  )
}

interface NoticeAction {
  label: string
  onClick: () => void
  busy?: boolean
  busyLabel?: string
}

export interface FullScreenNoticeProps {
  /** 작은 머리말 — 어느 단계에서 났는지 (예: 사무실 입장) */
  eyebrow: string
  title: string
  body: string
  action: NoticeAction
  secondary?: NoticeAction
  /** 버튼 옆 작은 글 — 돌아갈 위치 · 마지막 시도 등 */
  foot?: string | null
}

/** 전체 화면 카드 — 원인 한 줄 · 설명 · 다음 행동 하나(필요하면 보조 하나) */
export function FullScreenNotice({ eyebrow, title, body, action, secondary, foot }: FullScreenNoticeProps) {
  const first = useRef<HTMLButtonElement>(null)
  // 화면이 바뀌었음을 키보드 · 낭독기 사용자에게 — 다음 행동 버튼으로 초점을 옮긴다
  useEffect(() => first.current?.focus(), [title])
  return (
    <section className="fs-card err-ui" role="alert" aria-labelledby="fs-title">
      <div className="fs-eyebrow">
        <Icon name="alert" size={18} />
        <span>{eyebrow}</span>
      </div>
      <div className="fs-panel">
        <h1 id="fs-title" className="fs-title">
          {title}
        </h1>
        <p className="fs-body">{body}</p>
      </div>
      <div className="fs-actions">
        <button ref={first} type="button" className="err-btn" disabled={action.busy} onClick={action.onClick}>
          {action.busy ? (action.busyLabel ?? action.label) : action.label}
        </button>
        {secondary && (
          <button type="button" className="err-btn-ghost" disabled={secondary.busy} onClick={secondary.onClick}>
            {secondary.label}
          </button>
        )}
        {foot && <span className="fs-foot">{foot}</span>}
      </div>
    </section>
  )
}

/** 사무실 위를 덮는 전체 화면 — 3D는 뒤에 그대로 두고, 디자인의 간단한 상단 줄(로고 · 지금 위치)과 카드를 올린다 */
function FullScreenCover({ ctx, children }: { ctx: string | null; children: ReactNode }) {
  return (
    <div className="fs-notice-cover err-ui">
      <div className="fs-notice-bar" aria-hidden="true">
        <OrbitMark />
        <span className="fs-brand">GRAVIT</span>
        {ctx && (
          <>
            <span className="fs-divider" />
            <span className="fs-ctx">{ctx}</span>
          </>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * 사무실을 열었는데 쓸 수 없을 때 — 첫 Snapshot 읽기 실패(다시 시도), 404(이 사무실을 열 수 없어요 — 없음 · 접근 없음을 같은 말로).
 * 세션 만료(401)는 진입 흐름이 "다시 로그인해 주세요"로 바꾼다. 받은 데이터가 있는 다시 읽기 실패는 배너(SystemBanners)가 맡는다
 */
export function OfficeBlocker() {
  const office = useOffice((s) => s.office)
  const [busy, setBusy] = useState(false)
  if (!office) return null
  const problem = officeProblem(office.error, office.snapshot !== null)
  const ws = office.snapshot?.workspace
  const ctx = ws ? (ws.githubRepo ?? ws.displayName) : null
  const toList = () => useSession.getState().leaveWorkspace()
  if (problem === 'closed') {
    return (
      <FullScreenCover ctx={ctx}>
        <FullScreenNotice
          eyebrow="사무실 입장"
          title="이 사무실을 열 수 없어요"
          body="사무실이 없거나 들어갈 권한이 없어요. 사무실 목록에서 다른 사무실을 골라 주세요."
          action={{ label: '사무실 목록으로', onClick: toList }}
          foot={ws ? `요청한 사무실 · ${ws.displayName}` : null}
        />
      </FullScreenCover>
    )
  }
  if (problem === 'boot') {
    const retry = async () => {
      setBusy(true)
      await useOffice.getState().reloadOffice()
      setBusy(false)
    }
    return (
      <FullScreenCover ctx={ctx}>
        <FullScreenNotice
          eyebrow="사무실 불러오기"
          title="사무실을 여는 중 문제가 생겼어요"
          body="사무실 데이터를 받아오지 못했어요. 다시 시도하면 데이터를 처음부터 다시 불러와요."
          action={{ label: '다시 시도', onClick: () => void retry(), busy, busyLabel: '다시 불러오는 중…' }}
          secondary={{ label: '사무실 목록으로', onClick: toList, busy }}
          foot="3D 화면은 그대로 두고 데이터만 다시 받아요"
        />
      </FullScreenCover>
    )
  }
  return null
}

// ---- 2 · 상단 배너 ------------------------------------------------------------------------

/** 반영 중 — 그때 마지막으로 반영한 Snapshot 시각(base)과 오류(err). 새 Snapshot이 반영되거나 다시 읽기가 실패하면 끝난다 */
type Applying = { kind: 'applying'; base: number; err: unknown }
type SyncTrack = { kind: 'running' } | Applying | null
type LinkTrack = { kind: 'offline' } | Applying | null

/**
 * 상단 바 아래 배너 — 동기화 진행 중 · 동기화 실패 · 실시간 연결 끊김 · 최신 데이터 못 받음을 따로 보인다. 화면을 막지 않아 열린 사무실을
 * 그대로 쓴다. 재연결은 api DataSource의 기존 backoff가 하고, 다시 붙으면(또는 동기화가 끝나면) store가 Snapshot을 다시 읽는다 —
 * 그 Snapshot이 반영되면 닫힌다. 다시 읽기가 실패하면 "최신 내용을 받지 못했어요"가 이어 받는다.
 */
export function SystemBanners() {
  const sync = useOffice((s) => s.office?.snapshot?.sync ?? null)
  const canSync = useOffice((s) => s.office?.snapshot?.viewer.role !== 'instructor')
  const connection = useOffice((s) => s.connection)
  const loadedAt = useOffice((s) => s.office?.loadedAt ?? 0)
  const error = useOffice((s) => s.office?.error ?? null)
  const hasSnapshot = useOffice((s) => s.office?.snapshot != null)
  const now = useNow()
  const syncState = sync?.state ?? null
  const syncFailing = sync?.isFailing ?? false

  const [dismissed, setDismissed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [syncTrack, setSyncTrack] = useState<SyncTrack>(syncState === 'running' ? { kind: 'running' } : null)
  const [linkTrack, setLinkTrack] = useState<LinkTrack>(connection === 'offline' ? { kind: 'offline' } : null)
  const [seen, setSeen] = useState({ sync: syncState, conn: connection })
  /** 다시 연결된 뒤 최신 Snapshot까지 반영한 횟수 — 늘면 "다시 연결됐어요" 알림 */
  const [recovered, setRecovered] = useState(0)

  // 상태가 바뀐 렌더에서 바로 단계를 정한다(이전 값과 비교 — 효과 없이)
  if (seen.sync !== syncState || seen.conn !== connection) {
    setSeen({ sync: syncState, conn: connection })
    // 동기화: running → (끝남) 반영 중 → 닫힘. 실패로 끝나면 실패 배너
    if (syncState === 'running') setSyncTrack({ kind: 'running' })
    else if (seen.sync === 'running') setSyncTrack(syncFailing ? null : { kind: 'applying', base: loadedAt, err: error })
    // 연결: offline → online이 되면 반영 중 → 닫힘
    if (connection === 'offline') setLinkTrack({ kind: 'offline' })
    else if (connection === 'online' && seen.conn === 'offline') setLinkTrack({ kind: 'applying', base: loadedAt, err: error })
    else if (connection === null) setLinkTrack(null)
  }
  const settled = (t: SyncTrack | LinkTrack) => t?.kind === 'applying' && (loadedAt !== t.base || (error !== null && error !== t.err))
  if (settled(syncTrack)) setSyncTrack(null)
  if (settled(linkTrack)) {
    setLinkTrack(null)
    if (loadedAt !== (linkTrack as Applying).base) setRecovered((n) => n + 1)
  }
  useEffect(() => {
    if (recovered > 0) useOffice.getState().toast('good', '다시 연결됐어요 · 최신 내용으로 바꿨어요')
  }, [recovered])

  const syncPhase: SyncPhase = syncTrack?.kind ?? null
  const linkPhase: LinkPhase = linkTrack?.kind ?? null
  const banners = [connectionBanner(linkPhase), syncBanner(sync, syncPhase, canSync, now), staleBanner(error, hasSnapshot, connection === 'offline')].filter(
    (b): b is SystemBanner => b !== null && (b.dismissKey === null || b.dismissKey !== dismissed),
  )
  if (banners.length === 0) return null

  const run = async (b: SystemBanner) => {
    if (!b.action) return
    setBusy(b.id)
    const st = useOffice.getState()
    if (b.action.kind === 'sync') await st.requestOfficeSync()
    else await st.reloadOffice()
    setBusy(null)
  }

  return (
    <div className="sys-banners err-ui">
      {banners.map((b) => (
        <div key={b.id} className={`sys-banner tone-${b.tone}`} role={b.tone === 'bad' ? 'alert' : 'status'} aria-label={b.title}>
          {b.busy ? <span className="spinner spinner-sm" aria-hidden="true" /> : <span className="sys-banner-dot" aria-hidden="true" />}
          <div className="sys-banner-text">
            <div className="sys-banner-title">{b.title}</div>
            <div className="sys-banner-body">{b.body}</div>
          </div>
          {b.meta && <span className="sys-banner-meta">{b.meta}</span>}
          {b.action && (
            <button type="button" className="err-btn" disabled={busy === b.id} onClick={() => void run(b)}>
              {busy === b.id ? '확인하는 중…' : b.action.label}
            </button>
          )}
          {b.dismissKey && (
            <button type="button" className="sys-banner-x" aria-label={`${b.title} 알림 닫기`} title="닫기" onClick={() => setDismissed(b.dismissKey)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ---- 3 · 폼 안 -----------------------------------------------------------------------------

const NEXT_LABEL: Record<WriteNext, string> = {
  reload: '최신 상태 보기',
  refreshLists: '목록 다시 불러오기',
  csrf: '보안 확인하기',
  resubmit: '다시 제출',
}

type Notice = Extract<WriteProblem, { kind: 'notice' }>

/** 폼 상단 띠 — 권한 · 대상 없음 · 충돌 · 보안 확인 · 결과 불확실. 입력값은 건드리지 않는다 */
export function FormAlert({ notice, busy, onAction, extra }: { notice: Notice; busy?: boolean; onAction?: (next: WriteNext) => void; extra?: ReactNode }) {
  return (
    <div className={`form-alert err-ui tone-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
      <span className="form-alert-dot" aria-hidden="true" />
      <div className="form-alert-text">
        <div className="form-alert-title">{notice.title}</div>
        <div className="form-alert-body">{notice.body}</div>
        {(notice.next || extra) && (
          <div className="form-alert-actions">
            {notice.next && onAction && (
              <button type="button" className="err-btn" disabled={busy} onClick={() => onAction(notice.next!)}>
                {busy ? '확인하는 중…' : NEXT_LABEL[notice.next]}
              </button>
            )}
            {extra}
          </div>
        )}
      </div>
    </div>
  )
}

/** 입력란 아래 오류 — 아이콘 + 짧은 문구 */
export function FieldError({ id, text }: { id?: string; text: string }) {
  return (
    <em id={id} className="fld-error err-field" role="alert">
      <Icon name="alert" size={14} />
      <span>{text}</span>
    </em>
  )
}

// ---- 4 · 패널 안 ---------------------------------------------------------------------------

type PanelStateProblem = Extract<PanelProblem, { kind: 'state' }>

/**
 * 패널 안 조회 실패 · 권한 오류. "다시 불러오기"는 그 패널 데이터만 다시 읽는다(onRetry). 권한 · 대상 없음은 다시 불러와도 같아 버튼이 없다.
 * GitHub 연결 오류는 GitHub로 다시 로그인한다(돌아오면 이 화면).
 */
export function PanelState({ problem, onRetry, busy }: { problem: PanelStateProblem; onRetry: () => void; busy?: boolean }) {
  const act = problem.action === 'reconnectGithub' ? () => useSession.getState().loginWithGithub() : onRetry
  return (
    <div className={`pstate err-ui tone-${problem.tone}`} role="alert">
      <span className="pstate-icon" aria-hidden="true">
        <Icon name="alert" size={20} />
      </span>
      <h3 className="pstate-title">{problem.title}</h3>
      <p className="pstate-body">{problem.body}</p>
      {problem.action && (
        <button type="button" className="err-btn" disabled={busy} onClick={act}>
          {busy ? '불러오는 중…' : problem.action === 'reconnectGithub' ? 'GitHub 다시 연결' : '다시 불러오기'}
        </button>
      )}
      {problem.foot && <span className="pstate-foot">{problem.foot}</span>}
    </div>
  )
}

/** 패널의 정상 빈 상태 — 오류처럼 보이지 않게 라벤더 톤, 다시 불러오기 버튼 없음 */
export function PanelEmpty({ icon = 'inbox', title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="pstate err-ui tone-calm" role="status">
      <span className="pstate-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <h3 className="pstate-title">{title}</h3>
      {body && <p className="pstate-body">{body}</p>}
      {action}
    </div>
  )
}
