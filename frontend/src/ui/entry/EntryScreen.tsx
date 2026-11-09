// 사무실 밖 화면 — 로그인(LoginScreen.tsx) · 사무실 고르기 (#64 · #68 화면 몫, CONTRACTS_API.md 「2」 · 「3」). 소유: D.
// 모양은 로그인 디자인(#171)의 우주 배경 · 흰 카드 · 글꼴을 같이 쓴다(SpaceShell · login.css, #166).
// 사무실이 열리면 App이 3D · HUD로 바꾼다. 레포를 골라 새 사무실을 여는 부분은 OpenWorkspace.tsx(#13 · #68).
import { useEffect, useState } from 'react'
import type { DataError } from '../../data/DataSource'
import { canUseInbox } from '../../data/rules/inbox'
import type { WorkspaceListItem } from '../../data/types'
import { useSession } from '../../session'
import { Icon } from '../icons'
import { InboxList } from '../InstructorInbox'
import { Toasts } from '../Toasts'
import { FullScreenNotice } from '../ErrorStates'
import { formatClock, formatDate } from '../format'
import { LoginScreen } from './LoginScreen'
import { RepositoryChoices } from './OpenWorkspace'
import { SpaceShell } from './SpaceShell'
import './entry.css'

const ROLE_LABEL: Record<WorkspaceListItem['myRole'], string> = { repo_admin: '레포 관리자', participant: '참여자', instructor: '강사' }

/** 사무실 목록을 받지 못함 — 전체 화면(다시 시도). 세션 만료는 "다시 로그인해 주세요"가 대신한다 (#274) */
function onListError(setFailedAt: (at: string) => void) {
  return (e: DataError) => {
    if (e.code !== 'unauthorized') setFailedAt(new Date().toISOString())
  }
}

function WorkspacePicker() {
  const me = useSession((s) => s.me)
  const [list, setList] = useState<WorkspaceListItem[] | null>(null)
  /** 목록 읽기에 실패한 시각 — 있으면 전체 화면 */
  const [failedAt, setFailedAt] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [entering, setEntering] = useState<string | null>(null)
  /** 레포 목록을 다시 읽게 한다(사무실 열기 폼의 "목록 다시 불러오기") */
  const [reposKey, setReposKey] = useState(0)

  const load = async () => {
    const got = await useSession.getState().listWorkspaces(onListError(setFailedAt))
    if (got) {
      setList(got)
      setFailedAt(null)
    }
  }
  useEffect(() => {
    let alive = true
    void useSession
      .getState()
      .listWorkspaces(onListError((at) => alive && setFailedAt(at)))
      .then((got) => {
        if (alive && got) setList(got)
      })
    return () => {
      alive = false
    }
  }, [])

  if (list === null && failedAt !== null) {
    return (
      <FullScreenNotice
        eyebrow="사무실 목록"
        title="사무실 목록을 불러오지 못했어요"
        body="잠시 뒤 다시 시도해 주세요. 계속 안 되면 네트워크 상태를 확인해 주세요. 로그인 상태는 그대로예요."
        action={{
          label: '다시 시도',
          busy: retrying,
          busyLabel: '불러오는 중…',
          onClick: async () => {
            setRetrying(true)
            await load()
            setRetrying(false)
          },
        }}
        secondary={{ label: '로그아웃', onClick: () => void useSession.getState().logout() }}
        foot={`마지막 시도 · ${formatClock(failedAt)}`}
      />
    )
  }

  return (
    <section className="entry-card entry-wide" aria-labelledby="picker-title">
      <div className="entry-head">
        <h1 id="picker-title" className="entry-title">
          사무실 고르기
        </h1>
        <span className="grow" />
        {me && (
          <span className="entry-me" title={me.user.githubLogin ? `@${me.user.githubLogin}` : '심사용 계정'}>
            {me.user.displayName}
          </span>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void useSession.getState().logout()}>
          로그아웃
        </button>
      </div>
      {list === null ? (
        <p className="entry-state" role="status">
          사무실 목록을 읽는 중…
        </p>
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
      {/* 강사 요청함(#224) — 강사에게만. 항목을 누르면 그 사무실에 들어가 해당 화면으로 간다 */}
      {canUseInbox(me) && (
        <section className="inbox-entry" aria-labelledby="inbox-title">
          <h2 id="inbox-title" className="entry-subtitle">
            강사 요청함
          </h2>
          <InboxList />
        </section>
      )}
      {/* 레포를 골라 새 사무실 열기 — 목록을 읽은 뒤에(이미 들어갈 수 있는 사무실은 "들어가기") */}
      {list !== null && (
        <RepositoryChoices
          key={reposKey}
          myWorkspaceIds={new Set(list.map((w) => w.id))}
          onEnter={(id) => void useSession.getState().enterWorkspace(id)}
          // 사무실 열기가 막혔을 때(이미 열림 · 레포 없음 · 권한 바뀜) 사무실 · 레포 목록을 다시 읽는다
          onRefreshLists={async () => {
            await load()
            setReposKey((k) => k + 1)
          }}
        />
      )}
    </section>
  )
}

/** 쓰던 중에 세션이 끝났다(API 401) — 다시 로그인하면 지난번 사무실로 돌아간다 (#274) */
function SessionExpired({ place }: { place: string | null }) {
  return (
    <FullScreenNotice
      eyebrow="로그인 세션"
      title="다시 로그인해 주세요"
      body="로그인 유효 기간이 지났어요. GitHub 계정으로 다시 로그인하면 보던 사무실로 돌아가요."
      action={{ label: 'GitHub로 로그인', onClick: () => useSession.getState().loginWithGithub() }}
      secondary={{ label: '다른 방법으로 로그인', onClick: () => useSession.getState().dismissExpired() }}
      foot={place ? `돌아갈 위치 · ${place}` : null}
    />
  )
}

/** 세션 확인 중 · 서버 오류 · 로그인 · 세션 만료 · 사무실 고르기 */
export function EntryScreen() {
  const status = useSession((s) => s.status)
  const error = useSession((s) => s.error)
  const expired = useSession((s) => s.expired)
  // 로그인 화면은 자기 배경 · 레이아웃을 갖는다(GRAVIT 로그인 디자인)
  if (status === 'signed_out' && !expired) return <LoginScreen />
  return (
    <SpaceShell>
      <main className="entry">
        {status === 'signed_out' && expired ? (
          <SessionExpired place={expired.place} />
        ) : status === 'signed_in' ? (
          <WorkspacePicker />
        ) : status === 'error' ? (
          <FullScreenNotice
            eyebrow="서버 연결"
            title="서버에 연결할 수 없어요"
            body={`로그인 상태를 확인하지 못했어요(${error ?? '응답 없음'}). 잠시 뒤 다시 시도해 주세요.`}
            action={{ label: '다시 시도', onClick: () => void useSession.getState().retry() }}
          />
        ) : (
          <p className="entry-state entry-checking" role="status">
            로그인 확인 중…
          </p>
        )}
      </main>
      <Toasts />
    </SpaceShell>
  )
}
