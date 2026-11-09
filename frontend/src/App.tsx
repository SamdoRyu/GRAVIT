// OWNER: D. Composition root: data source wiring, 진입 화면(로그인 · 사무실 고르기) ↔ 사무실(canvas · HUD).
import { lazy, Suspense, useEffect } from 'react'
import { useOffice } from './store'
import { createV1ApiDataSource } from './data/api/v1'
import { createV1MockDataSource } from './data/mock/v1'
import { useSession } from './session'
import { EntryScreen } from './ui/entry/EntryScreen'
import { Landing } from './ui/entry/Landing'
import { Hud } from './ui/Hud'
import { OfficeBlocker } from './ui/ErrorStates'
import { SceneBoundary } from './app/SceneBoundary'
import { officeProblem } from './data/rules/errors'

// One source per page load (module scope, so StrictMode's double effects don't create two).
const params = new URLSearchParams(location.search)
// GitHub 로그인은 서버의 고정 주소(/)로 돌아와 ?source가 빠진다 — 이 탭에서 고른 소스를 기억해 두고, 주소에 없으면 그것을 쓴다
// (#236 · mock이 기본인 동안만 필요). 저장소를 못 쓰면 주소만 본다.
const SOURCE_KEY = 'gravit.source'
function chooseSource(): string | null {
  const fromUrl = params.get('source')
  try {
    if (fromUrl !== null) sessionStorage.setItem(SOURCE_KEY, fromUrl)
    return fromUrl ?? sessionStorage.getItem(SOURCE_KEY)
  } catch {
    return fromUrl
  }
}
const apiMode = chooseSource() === 'api'

// v1 DataSource — 로그인 · 사무실 고르기 · 사무실(WorkspaceSnapshot). `?source=api`는 Spring /api, 아니면 브라우저 mock.
// `?workspace=<id>`면 로그인돼 있고 들어갈 수 있을 때 바로 그 사무실을 연다(없으면 지난번 사무실, 그것도 없으면 고르기).
const officeSource = apiMode ? createV1ApiDataSource() : createV1MockDataSource()
const preferredWorkspace = params.get('workspace')

// three.js + the scene are the bulk of the bundle: load them in parallel with the data so the HUD
// (and the loader) paint first.
// A retry after a failed chunk load needs a fresh import(), so the lazy component is keyed by attempt.
const loadScene = () => import('./app/SceneCanvas')
const sceneByAttempt = new Map<number, ReturnType<typeof lazy<typeof import('./app/SceneCanvas').default>>>()
const sceneFor = (attempt: number) => {
  let c = sceneByAttempt.get(attempt)
  if (!c) sceneByAttempt.set(attempt, (c = lazy(loadScene)))
  return c
}

export default function App() {
  useEffect(() => {
    void useSession.getState().start(officeSource, { preferredWorkspace })
  }, [])

  const signedIn = useSession((s) => s.status === 'signed_in')
  const officeOpen = useOffice((s) => s.office !== null)
  // 계정마다 처음 사무실을 고를 때 한 번 — 도착 장면이 사무실 위를 덮었다가 걷힌다(그동안 사무실은 뒤에서 읽힌다)
  const landing = useSession((s) => s.landing)
  // 사무실을 쓸 수 없다(첫 읽기 실패 · 열 수 없음) — 전체 화면이 덮는 동안 뒤의 사무실은 키보드로도 닿지 않게 (#274)
  const blocked = useOffice((s) => {
    const p = s.office ? officeProblem(s.office.error, s.office.snapshot !== null) : null
    return p === 'boot' || p === 'closed'
  })
  // 로그인되면 3D 묶음을 미리 받아 둔다 — 사무실을 고르는 사이에 받아져 사무실이 빨리 뜬다
  useEffect(() => {
    if (signedIn) void loadScene().catch(() => {})
  }, [signedIn])

  if (!signedIn || !officeOpen) return <EntryScreen />

  return (
    <>
      <div className="app" inert={landing || blocked}>
        <SceneBoundary>
          {(attempt) => {
            const SceneCanvas = sceneFor(attempt)
            return (
              <Suspense fallback={null}>
                <SceneCanvas />
              </Suspense>
            )
          }}
        </SceneBoundary>
        <Hud />
      </div>
      {/* 첫 Snapshot 읽기 실패 · 404(열 수 없음) — 3D는 뒤에 그대로 두고 덮는다 (#274) */}
      {!landing && <OfficeBlocker />}
      {landing && <Landing />}
    </>
  )
}
