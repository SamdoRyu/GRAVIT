// 사무실 밖 화면이 같이 쓰는 우주 배경 · 머리(로고 + GRAVIT) — 로그인 디자인(#171)에서 뽑아 사무실 고르기 · 오류 화면도 쓴다(#166). 소유: D.
// 모양은 login.css(.login · .login-head · .login-sky · .login-vignette)에 있다.
import type { ReactNode } from 'react'
import './login.css'

/** 행성 + 궤도 링 로고 */
export function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="15" cy="15" r="7.5" fill="#f6b9b0" />
      <path d="M9 12 Q15 10 21 12" stroke="#fff0e4" strokeWidth="1.4" fill="none" />
      <ellipse cx="15" cy="15" rx="13.5" ry="5" fill="none" stroke="#8ff0e0" strokeWidth="1.6" transform="rotate(-20 15 15)" />
      <rect x="23" y="6" width="4" height="4" fill="#fffaf0" transform="rotate(45 25 8)" />
    </svg>
  )
}

/** 배경 별 · 반짝이 — 위치는 디자인 그대로(1440×900 기준, 화면을 덮게 잘림) */
const STARS: [number, number, number, number][] = [
  [84, 132, 1.4, 0.7], [212, 64, 1, 0.5], [318, 188, 1.6, 0.8], [462, 92, 1, 0.45], [598, 40, 1.3, 0.6], [702, 156, 1, 0.5],
  [846, 72, 1.5, 0.75], [968, 138, 1, 0.45], [1104, 52, 1.4, 0.65], [1232, 118, 1, 0.5], [1376, 76, 1.6, 0.8], [46, 402, 1, 0.5],
  [138, 618, 1.5, 0.7], [58, 804, 1, 0.45], [286, 842, 1.3, 0.6], [742, 864, 1, 0.5], [812, 458, 1.2, 0.55], [884, 702, 1, 0.4],
  [1398, 388, 1.3, 0.6], [1412, 612, 1, 0.45], [1018, 842, 1.4, 0.6], [1188, 874, 1, 0.4],
]

export function Backdrop() {
  return (
    <>
      <svg className="login-sky" aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <circle cx="1320" cy="1180" r="520" fill="#c1b3f8" opacity=".09" />
        <circle cx="120" cy="-260" r="380" fill="#8ff0e0" opacity=".035" />
        <g fill="#fffaf0">
          {STARS.map(([cx, cy, r, o]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity={o} />
          ))}
        </g>
        <g fill="#ffd35a">
          <path d="M760 250 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" opacity=".75" />
          <path d="M1340 236 l2.4 6 l6 2.4 l-6 2.4 l-2.4 6 l-2.4 -6 l-6 -2.4 l6 -2.4 z" opacity=".6" />
          <path d="M96 520 l2.4 6 l6 2.4 l-6 2.4 l-2.4 6 l-2.4 -6 l-6 -2.4 l6 -2.4 z" opacity=".55" />
        </g>
      </svg>
      <div className="login-vignette" aria-hidden="true" />
    </>
  )
}

/** 우주 배경 + 머리(로고 · GRAVIT) 틀. 안쪽(children)은 화면마다 */
export function SpaceShell({ children }: { children: ReactNode }) {
  return (
    <div className="login">
      <Backdrop />
      <header className="login-head">
        <span className="login-logo">
          <Logo />
          <span className="login-wordmark">GRAVIT</span>
        </span>
      </header>
      {children}
    </div>
  )
}
