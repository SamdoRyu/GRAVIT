// Top bar: wordmark · 지금 연 저장소 이름, v1 팀 지표, 동기화 상태, 회의, 더보기(회의록 · 강사 관리 · 강사 요청함(강사만) · 컨벤션 라이브러리 · 활동 기록 · 사무실 바꾸기 · 로그아웃). OWNER: D.
// 사람별 업무량 표현(업무량 오버레이 · 업무 재배정 추천)은 v1에서 뺐다 — FR-FLOW-06 (#102 T5-c-2).
// 데모 화면(데모 지표 줄 · 오버레이 · 작업 만들기 · 데모 스위치 · 팀원 추가 · 초기화)도 뺐다 — v1은 GitHub가 원본이다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSession } from '../session'
import { useOffice } from '../store'
import { AnimatedNumber } from './common'
import type { FlowSummary, TeamSettings, WorkspaceSnapshot } from '../data/types'
import { ddayText, kstToday, projectDay } from '../data/rules/period'
import { canUseInbox } from '../data/rules/inbox'
import { finiteOrNull, formatDuration, formatHours, formatMonthDay } from './format'
import { useNow } from './hooks'
import { Icon } from './icons'
import { useUi } from './uiState'
import { ConnectionBanner } from './Toasts'
import { SyncStatus } from './SyncStatus'
import { confirmedAgenda, ongoingMeetingOf } from './meetingView'

function Kpi({
  label,
  onClick,
  title,
  hint,
  children,
}: {
  label: string
  onClick?: () => void
  title?: string
  /** Explanation shown on tap (touch has no hover tooltips). */
  hint?: string
  children: ReactNode
}) {
  const cls = 'kpi'
  const body = (
    <>
      <span className="kpi-value">{children}</span>
      <span className="kpi-label">{label}</span>
    </>
  )
  return onClick ? (
    <button type="button" className={`${cls} kpi-click`} onClick={onClick} title={title}>
      {body}
    </button>
  ) : hint ? (
    <button type="button" className={`${cls} kpi-click kpi-tip`} onClick={() => useUi.getState().showTip(hint)} title={hint}>
      {body}
    </button>
  ) : (
    <div className={cls} title={title}>
      {body}
    </div>
  )
}

/**
 * v1 팀 지표 (FR-FLOW-05) — 서버가 계산한 팀 단위 값(Snapshot `flow`)만 보인다.
 * 사람별 값 · 순위 · 비교는 두지 않는다 (FR-FLOW-06).
 */
function TeamMetrics({ flow }: { flow: FlowSummary | null }) {
  // flow가 없음 = 사무실을 읽는 중이거나 첫 읽기에 실패 — 데모 숫자 대신 빈 값을 보인다
  const open = finiteOrNull(flow?.openSubmissionCount)
  const wait = finiteOrNull(flow?.averageReviewWaitHours)
  return (
    <>
      <Kpi label="열린 PR" hint={open === null ? '사무실 데이터를 아직 받지 못했어요' : '지금 열려 있는 PR 수예요 — 팀 전체 값'}>
        {open === null ? <NoValue /> : <AnimatedNumber value={open} />}
      </Kpi>
      <Kpi label="평균 리뷰 대기" hint={wait === null ? '아직 계산할 리뷰가 없어요' : 'PR이 리뷰를 기다린 평균 시간이에요 — 팀 전체 값'}>
        {wait === null ? <NoValue /> : formatHours(wait)}
      </Kpi>
    </>
  )
}

/** 프로젝트 기간 D-day (FR-PLAN-01) — 끝 날짜까지, 한국 시간 달력 날짜 기준. R2는 눌러서 기간을 바꾼다 */
function ProjectDday({ settings, canEdit }: { settings: TeamSettings | null; canEdit: boolean }) {
  const now = useNow(60_000) // 자정이 지나면 다음 날로 바뀌게
  const day = settings ? projectDay(settings, kstToday(new Date(now))) : null
  const edit = settings && canEdit ? () => useOffice.getState().openDialog({ kind: 'projectPeriod' }) : undefined
  if (!settings || !day) {
    const hint = settings ? '프로젝트 기간이 올바르지 않아요' : '사무실 데이터를 아직 받지 못했어요'
    return (
      <Kpi label="D-day" hint={hint} onClick={edit} title={edit ? `${hint} — 눌러서 기간 바꾸기` : undefined}>
        <NoValue />
      </Kpi>
    )
  }
  const { value, label } = ddayText(day)
  const today = day.dayOfProject === null ? '' : ` · 오늘 ${day.dayOfProject}일째`
  const hint = `프로젝트 기간 ${formatMonthDay(settings.projectStartDate)} ~ ${formatMonthDay(settings.projectEndDate)} (총 ${day.totalDays}일)${today}`
  return (
    <Kpi label={label} hint={hint} onClick={edit} title={edit ? `${hint} — 눌러서 기간 바꾸기` : undefined}>
      {value}
    </Kpi>
  )
}

/** v1 사무실이 열렸을 때 상단 바 지표 줄 — D-day가 먼저(좁은 화면에서는 앞의 것만 보인다) */
function OfficeKpis({ snapshot }: { snapshot: WorkspaceSnapshot | null }) {
  return (
    <div className="kpis">
      <ProjectDday settings={snapshot?.settings ?? null} canEdit={snapshot?.viewer.role === 'repo_admin'} />
      <TeamMetrics flow={snapshot?.flow ?? null} />
    </div>
  )
}

/** 값 없음 — 화면에는 "—", 화면 낭독기에는 "값 없음" */
function NoValue() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">값 없음</span>
    </>
  )
}

/**
 * "회의" button with the agenda count; becomes a slim live pill while a meeting is ongoing.
 * v1 사무실(Snapshot)의 회의 · 안건을 본다 — 결정을 기다리는 안건(confirmed) 수, 진행 중 회의(#102 T5-c-2).
 */
function MeetingControl() {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const now = useNow(15_000)
  const live = snapshot ? ongoingMeetingOf(snapshot) : null
  const agendaCount = snapshot ? confirmedAgenda(snapshot).length : 0
  if (live) {
    const elapsed = formatDuration(live.startedAt, null, now)
    const minutes = Math.max(0, Math.floor((now - Date.parse(live.startedAt)) / 60_000))
    const attendees = live.attendeeMemberIds.length
    return (
      <div className="meet-live" role="status" title={`회의 진행 중 ${elapsed} · 참석 ${attendees}명 · 결정할 안건 ${agendaCount}개`}>
        <i className="meet-dot" aria-hidden="true" />
        <b className="meet-elapsed">{minutes}분</b>
        <span className="meet-meta">
          회의 · 참석 {attendees} · 안건 {agendaCount}
        </span>
        <button type="button" className="btn btn-sm meet-end" onClick={() => useOffice.getState().openDialog({ kind: 'endMeeting', meetingId: live.id })} title="회의 종료 (M)" aria-label="회의 종료">
          종료
        </button>
      </div>
    )
  }
  return (
    <button type="button" className="btn" onClick={() => useOffice.getState().openDialog({ kind: 'startMeeting' })} title="회의 시작 (M)">
      <Icon name="meeting" size={14} />
      회의
      {agendaCount > 0 && (
        <span className="badge" title={`안건 ${agendaCount}개`}>
          {agendaCount}
        </span>
      )}
    </button>
  )
}

function MoreMenu() {
  const me = useSession((s) => s.me)
  // 기존 session 값으로 권한 분기: 강사만 '강사 요청함'을 본다.
  // 별도 메뉴를 복제하지 않아 공통 기능과 권한 로직이 어긋나지 않는다.
  const isInstructor = canUseInbox(me)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn btn-icon btn-ghost" aria-haspopup="menu" aria-expanded={open} aria-label="더보기" title="더보기" onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu glass ivory-more-menu" role="menu" aria-label="더보기 메뉴">
          <div className="menu-group" role="group" aria-label="기록 및 자료">
            <span className="menu-heading" aria-hidden="true">기록 및 자료</span>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false)
                useUi.getState().setHistoryOpen(true)
              }}
            >
              <Icon name="history" size={15} />
              회의록
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false)
                useOffice.getState().openDialog({ kind: 'conventionLibrary' })
              }}
            >
              <Icon name="list" size={15} />
              컨벤션 라이브러리
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false)
                useOffice.getState().openDialog({ kind: 'activities' })
              }}
            >
              <Icon name="edit" size={15} />
              활동 기록
            </button>
          </div>
          <hr className="menu-sep" />
          <div className="menu-group" role="group" aria-label="강사 관련">
            <span className="menu-heading" aria-hidden="true">강사 관련</span>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false)
                useOffice.getState().openDialog({ kind: 'instructors' })
              }}
            >
              <Icon name="users" size={15} />
              강사 관리
            </button>
            {isInstructor && (
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setOpen(false)
                  useOffice.getState().openDialog({ kind: 'instructorInbox' })
                }}
              >
                <Icon name="inbox" size={15} />
                강사 요청함
                <span className="menu-role">강사 전용</span>
              </button>
            )}
          </div>
          <hr className="menu-sep" />
          <div className="menu-group" role="group" aria-label="계정 및 사무실">
            <span className="menu-heading" aria-hidden="true">계정 및 사무실</span>
            {me && (
              <div className="menu-me" title={me.user.githubLogin ? `@${me.user.githubLogin}` : '심사용 계정'}>
                {me.user.displayName}
              </div>
            )}
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false)
                useSession.getState().leaveWorkspace()
              }}
            >
              <Icon name="board" size={15} />
              사무실 바꾸기
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item menu-danger"
              onClick={() => {
                setOpen(false)
                void useSession.getState().logout()
              }}
            >
              <Icon name="logout" size={15} />
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Small popover for hover-only explanations, reachable by tap. Hides on the next tap or after a few seconds. */
function TapTip() {
  const tip = useUi((s) => s.tip)
  useEffect(() => {
    if (!tip) return
    const timer = window.setTimeout(() => useUi.getState().showTip(null), 4000)
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.kpi-tip')) useUi.getState().showTip(null)
    }
    window.addEventListener('pointerdown', down)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', down)
    }
  }, [tip])
  if (!tip) return null
  return (
    <div className="tap-tip glass" role="status">
      {tip}
    </div>
  )
}

/** 상단 바에 보일 저장소 이름 — GitHub 사무실은 저장소 이름(`gitvillage`), 시연 사무실은 표시 이름. full은 툴팁(`team-samdo/gitvillage`) */
function repoLabel(ws: WorkspaceSnapshot['workspace']): { name: string; full: string } {
  return { name: ws.githubRepo ?? ws.displayName, full: ws.displayName }
}

export function TopBar() {
  const me = useSession((state) => state.me)
  // 사무실을 읽지 못했다(받은 Snapshot이 없음) — 데모 모델의 상태가 아니다
  const failed = useOffice((s) => s.office?.status === 'error')
  const connection = useOffice((s) => s.connection)
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const repo = snapshot ? repoLabel(snapshot.workspace) : null
  return (
    <div className="hud-top">
      <div className="top-head">
      <header className="topbar glass">
        <div className="brand">
          {/* 로그인 화면 로고(SpaceShell Logo)와 같은 모양 — 행성 · 하이라이트 · 궤도 링 · 마름모. 색은 상단 바 보라 한 가지 */}
          <span className="brand-orbit" aria-hidden="true">
            <svg viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="15" cy="15" r="7.5" fill="currentColor" />
              <path d="M9 12 Q15 10 21 12" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.4" fill="none" />
              <ellipse cx="15" cy="15" rx="13.5" ry="5" stroke="currentColor" strokeWidth="1.6" transform="rotate(-20 15 15)" />
              <rect x="23" y="6" width="4" height="4" fill="currentColor" transform="rotate(45 25 8)" />
            </svg>
          </span>
          <span className="brand-logo">GRAVIT</span>
          <span className="brand-divider" aria-hidden="true" />
          {/* 지금 연 사무실의 GitHub 저장소 이름(owner 빼고) — 시연 사무실은 표시 이름. 사무실을 바꾸면 Snapshot과 함께 바뀐다 */}
          {repo && (
            <span className="brand-repo" title={repo.full}>
              {repo.name}
            </span>
          )}
          {connection !== null && <span className="badge-server">서버</span>}
        </div>
        {/* 사무실을 읽는 중 · 실패 · 열지 않음이면 값 칸이 "—" */}
        <OfficeKpis snapshot={snapshot} />
        <SyncStatus />
        <MeetingControl />
        {me && <span className="topbar-avatar" title={me.user.displayName} aria-label={`로그인 사용자: ${me.user.displayName}`}>{me.user.displayName.trim().charAt(0) || '?'}</span>}
        <MoreMenu />
      </header>
      {failed && (
        <div className="error-banner" role="alert">
          <span className="error-dot" />
          데이터를 불러오지 못했어요
        </div>
      )}
      <ConnectionBanner />
      <TapTip />
      </div>
    </div>
  )
}
