// 도착 장면 — GRAVIT 로그인 디자인 "전환 A · 행성 줌인"을 옮긴 것. 소유: D.
// 계정마다 처음 사무실을 고를 때 한 번(session.landing): 탑승 수속 카드 → 행성으로 줌인 → 라벤더빛으로 덮였다가
// 실제 사무실(3D · HUD — 고른 레포)이 드러나고 "○○ 정거장에 도착했어요" 알림. 디자인의 도착 화면(가짜 레포)은 쓰지 않는다.
// 사무실이 아직 읽히는 중이면 덮인 채로 기다린다(최대 WAIT_MAX_MS). 움직임 줄이기 설정이면 장면 없이 알림만.
// 덮개가 걷힐 때 3D가 이어받는다: 행성 근접 시점에서 궤도로 진입해 우주선을 따라 정거장에 도착하는 입장 연출
// (scene/DockShip.tsx — 신호 ARRIVAL_EVENT).
import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../session'
import { useOffice } from '../../store'
import planetUrl from './login-planet.svg'
import './landing.css'

/** 디자인 타임라인(ms) — 진행 막대 → 글 · 카드 사라짐 → 줌인 → 덮기. 그 뒤는 사무실이 준비되면 드러내기 */
const AT = { fade: 1300, zoom: 1600, wash: 3600 }
/** 덮개를 걷을 때 3D 입장 연출을 시작하라는 신호(3D 모듈을 여기서 읽지 않으려고 이름만 맞춘다 — scene/DockShip.tsx ARRIVAL_INTRO_EVENT) */
const ARRIVAL_EVENT = 'gravit:arrival-intro'
/** 덮인 뒤 사무실을 이만큼 더 기다리고, 넘으면 그냥 드러낸다(HUD가 읽는 중 · 오류를 보여 준다) */
const WAIT_MAX_MS = 8000
/** 드러내는 데 걸리는 시간 — 끝나면 장면을 걷어 낸다 */
const REVEAL_MS = 1000

/** 0 탑승 수속 · 1 글 사라짐 · 2 줌인 · 3 덮음 · 4 드러냄 */
type Phase = 0 | 1 | 2 | 3 | 4

const STARS: [number, number, number, number][] = [
  [84, 132, 1.4, 0.7],
  [212, 64, 1, 0.5],
  [318, 188, 1.6, 0.8],
  [462, 92, 1, 0.45],
  [598, 40, 1.3, 0.6],
  [702, 156, 1, 0.5],
  [846, 72, 1.5, 0.75],
  [968, 138, 1, 0.45],
  [1104, 52, 1.4, 0.65],
  [1232, 118, 1, 0.5],
  [1376, 76, 1.6, 0.8],
  [46, 402, 1, 0.5],
  [138, 618, 1.5, 0.7],
  [58, 804, 1, 0.45],
  [286, 842, 1.3, 0.6],
  [742, 864, 1, 0.5],
  [812, 458, 1.2, 0.55],
  [884, 702, 1, 0.4],
  [1398, 388, 1.3, 0.6],
  [1412, 612, 1, 0.45],
  [1018, 842, 1.4, 0.6],
  [1188, 874, 1, 0.4],
]

const sceneMounted = () => typeof document !== 'undefined' && document.querySelector('.app canvas') !== null

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 사무실 데이터가 왔고(또는 오류) 3D 화면(canvas)이 붙었는가 — 3D 모듈을 여기서 읽으면 첫 화면 묶음에 three가 들어가 DOM으로 본다 */
function useOfficeArrived(): boolean {
  const loaded = useOffice((s) => s.office !== null && s.office.status !== 'loading')
  const [scene, setScene] = useState(sceneMounted)
  useEffect(() => {
    if (scene) return
    // 3D 화면은 따로 읽힌다 — 붙을 때까지 가볍게 살핀다(반응형 상태가 아님)
    const t = setInterval(() => {
      if (sceneMounted()) setScene(true)
    }, 150)
    return () => clearInterval(t)
  }, [scene])
  return loaded && scene
}

export function Landing() {
  const me = useSession((s) => s.me)
  const repo = useOffice((s) => s.office?.snapshot?.workspace.displayName ?? null)
  const arrived = useOfficeArrived()
  // 움직임 줄이기 설정이면 장면 없이 바로 "드러냄"(보이지 않음) — 사무실이 오면 도착 알림만
  const [still] = useState(reducedMotion)
  const [phase, setPhase] = useState<Phase>(still ? 4 : 0)
  const [filled, setFilled] = useState(false)
  const [waitedEnough, setWaitedEnough] = useState(false)
  // 알림에 쓸 레포 이름 — 타이머 안에서 최신 값을 읽는다
  const repoRef = useRef(repo)
  useEffect(() => {
    repoRef.current = repo
  }, [repo])

  useEffect(() => {
    const timers = [setTimeout(() => setWaitedEnough(true), (still ? 0 : AT.wash) + WAIT_MAX_MS)]
    if (!still) {
      timers.push(
        setTimeout(() => setFilled(true), 60),
        setTimeout(() => setPhase(1), AT.fade),
        setTimeout(() => setPhase(2), AT.zoom),
        setTimeout(() => setPhase(3), AT.wash),
      )
    }
    return () => timers.forEach(clearTimeout)
  }, [still])

  // 덮인 뒤 사무실이 준비되면(또는 너무 오래 걸리면) 드러낸다 — 덮개가 다 덮일 시간(0.6s)을 둔다
  const ready = arrived || waitedEnough
  useEffect(() => {
    if (phase !== 3 || !ready) return
    const t = setTimeout(() => setPhase(4), 600)
    return () => clearTimeout(t)
  }, [phase, ready])

  // 드러내기 시작하면 3D가 입장 연출을 시작한다(움직임 줄이기면 3D 쪽이 하지 않는다)
  useEffect(() => {
    if (phase !== 4 || !ready || still) return
    window.dispatchEvent(new Event(ARRIVAL_EVENT))
  }, [phase, ready, still])

  // 드러냄이 끝나면 도착 알림을 남기고 장면을 걷는다
  useEffect(() => {
    if (phase !== 4 || !ready) return
    const t = setTimeout(
      () => {
        const name = repoRef.current
        useOffice.getState().toast('good', name ? `${name} 정거장에 도착했어요` : '정거장에 도착했어요')
        useSession.getState().finishLanding()
      },
      still ? 0 : REVEAL_MS,
    )
    return () => clearTimeout(t)
  }, [phase, ready, still])

  if (!me) return null
  const login = me.user.githubLogin
  const initial = (login ?? me.user.displayName).slice(0, 1).toUpperCase()

  return (
    <div className="landing" data-phase={phase}>
      <div className="landing-scene" aria-hidden={phase >= 4}>
        <svg className="landing-stars" aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <circle cx="1320" cy="1180" r="520" fill="#c1b3f8" opacity=".09" />
          <g fill="#fffaf0">
            {STARS.map(([cx, cy, r, o]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity={o} />
            ))}
          </g>
        </svg>

        <div className="landing-ui landing-brand" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 30 30">
            <circle cx="15" cy="15" r="7.5" fill="#f6b9b0" />
            <path d="M9 12 Q15 10 21 12" stroke="#fff0e4" strokeWidth="1.4" fill="none" />
            <ellipse cx="15" cy="15" rx="13.5" ry="5" fill="none" stroke="#8ff0e0" strokeWidth="1.6" transform="rotate(-20 15 15)" />
            <rect x="23" y="6" width="4" height="4" fill="#fffaf0" transform="rotate(45 25 8)" />
          </svg>
          <span>GRAVIT</span>
        </div>

        <div className="landing-ui landing-hero" aria-hidden="true">
          <span className="landing-eyebrow">TEAM REPO SPACE STATION</span>
          <p className="landing-title">
            흩어진 이슈와 PR을
            <br />한 궤도로 끌어당겨요
          </p>
        </div>

        <div className="landing-planet">
          <img src={planetUrl} alt="" />
        </div>

        <div className="landing-wash" />

        <section className="landing-ui landing-card" aria-labelledby="landing-title">
          <span className="landing-chip">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 7.2 L5.8 10 L11 4.4" stroke="#0b5a50" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            탑승 수속 완료
          </span>
          <div className="landing-card-head">
            <h2 id="landing-title">어서 와요, {me.user.displayName} 님</h2>
            <p>{repo ? `${repo} 정거장으로 이동하고 있어요.` : '정거장으로 이동하고 있어요.'}</p>
          </div>
          <div
            className="landing-progress"
            role="progressbar"
            aria-label="정거장으로 이동 중"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={filled ? 100 : 0}
          >
            <div className={filled ? 'is-filled' : undefined} />
          </div>
          <div className="landing-who">
            <span aria-hidden="true">{initial}</span>
            {login ? `GitHub · ${login} 계정으로 로그인됨` : '보안 심사용 계정으로 로그인됨'}
          </div>
        </section>
      </div>
    </div>
  )
}
