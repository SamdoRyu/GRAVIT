// OWNER: D. Composition root: data source wiring, 진입 화면(로그인 · 사무실 고르기) ↔ 사무실(canvas · HUD).
import { lazy, Suspense, useEffect } from 'react'
import { useOffice } from './store'
import { createV1ApiDataSource } from './data/api/v1'
import { createV1MockDataSource } from './data/mock/v1'
import { useSession } from './session'
import { EntryScreen } from './ui/entry/EntryScreen'
import { Landing } from './ui/entry/Landing'
import { Hud } from './ui/Hud'
import { SceneBoundary } from './app/SceneBoundary'

// One source per page load (module scope, so StrictMode's double effects don't create two).
const params = new URLSearchParams(location.search)
const apiMode = params.get('source') === 'api'

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
  // 로그인되면 3D 묶음을 미리 받아 둔다 — 사무실을 고르는 사이에 받아져 사무실이 빨리 뜬다
  useEffect(() => {
    if (signedIn) void loadScene().catch(() => {})
  }, [signedIn])

  if (!signedIn || !officeOpen) return <EntryScreen />

  return (
    <>
      <div className="app" inert={landing}>
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
      {landing && <Landing />}
    </>
  )
}
