// 로그인 화면 — GRAVIT 로그인 디자인("로그인-원본" 아트보드)을 옮긴 것 (#64 · #63 화면 몫, CONTRACTS_API.md 「2」). 소유: D.
// 디자인에 없는 보안 심사용 ID/PW 폼(#63 — 켜진 환경에서만)은 카드 안 접기 칸으로 더했다.
// 로그인 뒤 처음 사무실을 고르면 나오는 도착 장면(전환 A · 행성 줌인)은 Landing.tsx.
import { useState, type FormEvent } from 'react'
import { MOCK_REVIEW_LOGIN } from '../../data/mock/v1'
import { useSession } from '../../session'
import { Toasts } from '../Toasts'
import planetUrl from './login-planet.svg'
import { SpaceShell } from './SpaceShell'
import './login.css'

function GithubMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="#1a1430"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="#f29a52" strokeOpacity=".25" strokeWidth="2.4" />
      <path className="login-spin" d="M10 2.5 A7.5 7.5 0 0 1 17.5 10" fill="none" stroke="#e07a2c" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** 정거장 화물 범례 — 이슈 상자 · PR 삼각기둥 · 도움 요청 구 · 배운 점 팔면체 (3D 사무실의 도형과 같은 모양) */
const CARGO = [
  {
    label: '이슈',
    viewBox: '-15 -25 30 28',
    shape: (
      <g>
        <polygon points="0,-21 10,-16 0,-11 -10,-16" fill="#fffaf0" />
        <polygon points="-10,-16 0,-11 0,0 -10,-5" fill="#efe0c6" />
        <polygon points="0,-11 10,-16 10,-5 0,0" fill="#d5bf9f" />
        <path d="M-10 -10.5 L0 -5.5 L10 -10.5" fill="none" stroke="#f29a52" strokeWidth="2" />
      </g>
    ),
  },
  {
    label: 'PR',
    viewBox: '-15 -21 30 30',
    shape: (
      <g>
        <polygon points="-12,0 0,6 6,-10 -6,-16" fill="#fff6e6" />
        <polygon points="0,6 12,0 6,-10" fill="#d5bf9f" />
        <path d="M-9 -8 L3 -2" stroke="#f29a52" strokeWidth="2" />
      </g>
    ),
  },
  {
    label: '도움 요청',
    viewBox: '-15 -27 30 30',
    shape: (
      <g>
        <defs>
          <radialGradient id="login-orb" cx=".35" cy=".3" r=".75">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".5" stopColor="#f6ecd9" />
            <stop offset="1" stopColor="#c3aed6" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="-12" r="9.5" fill="url(#login-orb)" />
        <polygon points="-6,-18 1,-21 -1,-14" fill="#ffffff" opacity=".75" />
        <circle cx="0" cy="-21.5" r="2" fill="#ff9d4d" />
      </g>
    ),
  },
  {
    label: '배운 점',
    viewBox: '-15 -30 30 31',
    shape: (
      <g>
        <polygon points="0,-28 -10,-16 0,-11" fill="#ffffff" />
        <polygon points="0,-28 0,-11 10,-16" fill="#e6d3b6" />
        <polygon points="-10,-16 0,-11 0,-4" fill="#d7c2a6" />
        <polygon points="0,-11 10,-16 0,-4" fill="#b9a2c0" />
      </g>
    ),
  },
]

/** 보안 심사용 ID/PW 로그인(#63) — 켜진 환경에서만. 기본은 접혀 있다 */
function ReviewLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mock = useSession((s) => s.mock)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력해 주세요')
      return
    }
    setBusy(true)
    const failed = await useSession.getState().loginForReview(username.trim(), password)
    setBusy(false)
    setError(failed)
    if (failed) setPassword('')
  }

  return (
    <details className="login-review">
      <summary>보안 심사용 계정으로 로그인</summary>
      <form onSubmit={submit} noValidate aria-label="보안 심사용 로그인">
        <label className="login-field">
          <span>아이디</span>
          <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="login-field">
          <span>비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            aria-invalid={!!error}
            aria-describedby={error ? 'review-login-error' : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <em id="review-login-error" className="login-field-error" role="alert">
            {error}
          </em>
        )}
        <button type="submit" className="login-review-submit" disabled={busy}>
          심사용 계정으로 로그인
        </button>
        {mock && (
          <p className="login-mock">
            로컬 mock 데이터 — 심사용 계정은 {MOCK_REVIEW_LOGIN.username} / {MOCK_REVIEW_LOGIN.password}
          </p>
        )}
      </form>
    </details>
  )
}

export function LoginScreen() {
  const options = useSession((s) => s.loginOptions)
  const mock = useSession((s) => s.mock)
  const [leaving, setLeaving] = useState(false)

  const github = () => {
    // 서버면 GitHub로 이동한다 — 페이지가 바뀔 때까지 "이동하는 중". 이동할 주소가 없으면 버튼을 그대로 둔다
    if (!mock && options?.githubLoginUrl) setLeaving(true)
    useSession.getState().loginWithGithub()
  }

  return (
    <SpaceShell>
      <main className="login-main">
        <section className="login-hero" aria-labelledby="login-hero-title">
          <span className="login-eyebrow">TEAM REPO SPACE STATION</span>
          <h1 id="login-hero-title">
            흩어진 이슈와 PR을
            <br />한 궤도로 끌어당겨요
          </h1>
          <p>팀 레포가 하나의 정거장이 돼요. 리뷰, 도움 요청, 회의에서 내린 결정까지 팀원 모두가 같은 화면에서 봐요.</p>
          <img className="login-art" src={planetUrl} alt="보랏빛 행성 주위를 이슈 · PR · 도움 요청 · 배운 점 화물이 궤도를 따라 도는 정거장 일러스트" />
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card-head">
            <span className="login-chip">
              <span aria-hidden="true" className="login-chip-dot" />
              탑승 수속
            </span>
            <h2 id="login-title">정거장에 탑승하기</h2>
            <p>GRAVIT은 GitHub 계정으로 로그인해요. 내가 속한 팀 레포가 정거장으로 열려요.</p>
          </div>

          {leaving ? (
            <button type="button" className="login-github is-busy" disabled aria-busy="true">
              <Spinner />
              GitHub로 이동하는 중…
            </button>
          ) : (
            <button type="button" className="login-github" onClick={github}>
              <GithubMark />
              GitHub로 계속하기
            </button>
          )}
          <p className="login-note">{mock ? '로컬 mock 데이터 — 누르면 바로 로그인돼요.' : '요청하는 권한은 GitHub 승인 화면에서 확인할 수 있어요.'}</p>

          {options?.reviewLoginEnabled && <ReviewLogin />}

          <div className="login-divider" />

          <div className="login-cargo">
            <span>정거장에 떠다니는 화물</span>
            <ul>
              {CARGO.map((c) => (
                <li key={c.label}>
                  <svg width="32" height="32" viewBox={c.viewBox} aria-hidden="true">
                    {c.shape}
                  </svg>
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <Toasts />
    </SpaceShell>
  )
}
