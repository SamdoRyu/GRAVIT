// 사무실 밖 화면 — 로그인(LoginScreen.tsx) · 사무실 고르기 (#64 · #68 화면 몫, CONTRACTS_API.md 「2」 · 「3」). 소유: D.
// 사무실이 열리면 App이 3D · HUD로 바꾼다. 레포를 골라 새 사무실을 여는 부분은 OpenWorkspace.tsx(#13 · #68).
import { useEffect, useState } from 'react'
import type { WorkspaceListItem } from '../../data/types'
import { useSession } from '../../session'
import { Icon } from '../icons'
import { Toasts } from '../Toasts'
import { formatDate } from '../format'
import { LoginScreen } from './LoginScreen'
import { RepositoryChoices } from './OpenWorkspace'
import './entry.css'

function Brand() {
  return (
    <div className="entry-brand">
      <span className="brand-mark" aria-hidden="true">
        <Icon name="cube" size={16} />
      </span>
      <span className="entry-brand-name">팀 오피스</span>
    </div>
  )
}

const ROLE_LABEL: Record<WorkspaceListItem['myRole'], string> = { repo_admin: '레포 관리자', participant: '참여자', instructor: '강사' }

function WorkspacePicker() {
  const me = useSession((s) => s.me)
  const [list, setList] = useState<WorkspaceListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [entering, setEntering] = useState<string | null>(null)

  const load = async () => {
    const got = await useSession.getState().listWorkspaces()
    if (got) setList(got)
    else setFailed(true)
  }
  useEffect(() => {
    let alive = true
    void useSession
      .getState()
      .listWorkspaces()
      .then((got) => {
        if (!alive) return
        if (got) setList(got)
        else setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="entry-card entry-wide glass" aria-labelledby="picker-title">
      <header className="entry-head">
        <Brand />
        <span className="grow" />
        {me && (
          <span className="entry-me" title={me.user.githubLogin ? `@${me.user.githubLogin}` : '심사용 계정'}>
            {me.user.displayName}
          </span>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void useSession.getState().logout()}>
          로그아웃
        </button>
      </header>
      <h1 id="picker-title" className="entry-title">
        사무실 고르기
      </h1>
      {list === null ? (
        failed ? (
          <div className="entry-state">
            <p>사무실 목록을 받지 못했어요.</p>
            <button type="button" className="btn btn-sm" onClick={() => { setFailed(false); void load() }}>
              다시 시도
            </button>
          </div>
        ) : (
          <p className="entry-state" role="status">
            사무실 목록을 읽는 중…
          </p>
        )
      ) : list.length === 0 ? (
        <p className="entry-state">아직 들어갈 수 있는 사무실이 없어요. 팀장(레포 관리자)이 레포의 사무실을 열면 여기에 보여요.</p>
      ) : (
        <ul className="entry-list" aria-label="들어갈 수 있는 사무실">
          {list.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                className="entry-ws"
                disabled={entering !== null}
                onClick={async () => {
                  setEntering(w.id)
                  await useSession.getState().enterWorkspace(w.id)
                  setEntering(null)
                }}
              >
                <span className="entry-ws-name">{w.displayName}</span>
                <span className="entry-ws-tags">
                  {w.kind === 'demo' && <span className="flag">시연</span>}
                  <span className="flag">{ROLE_LABEL[w.myRole]}</span>
                  <span className="dim small">{formatDate(w.openedAt)} 열림</span>
                </span>
                <span className="entry-ws-go" aria-hidden="true">
                  {entering === w.id ? '여는 중…' : <Icon name="chevronRight" size={16} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* 레포를 골라 새 사무실 열기 — 목록을 읽은 뒤에(이미 들어갈 수 있는 사무실은 "들어가기") */}
      {list !== null && (
        <RepositoryChoices
          myWorkspaceIds={new Set(list.map((w) => w.id))}
          onEnter={(id) => void useSession.getState().enterWorkspace(id)}
        />
      )}
    </section>
  )
}

/** 세션 확인 중 · 서버 오류 · 로그인 · 사무실 고르기 */
export function EntryScreen() {
  const status = useSession((s) => s.status)
  const error = useSession((s) => s.error)
  // 로그인 화면은 자기 배경 · 레이아웃을 갖는다(GRAVIT 로그인 디자인)
  if (status === 'signed_out') return <LoginScreen />
  return (
    <main className="entry">
      {status === 'signed_in' ? (
        <WorkspacePicker />
      ) : status === 'error' ? (
        <section className="entry-card glass" role="alert">
          <Brand />
          <h1 className="entry-title">서버에 연결할 수 없어요</h1>
          <p className="entry-lead">{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void useSession.getState().retry()}>
            다시 시도
          </button>
        </section>
      ) : (
        <p className="entry-state" role="status">
          로그인 확인 중…
        </p>
      )}
      <Toasts />
    </main>
  )
}
