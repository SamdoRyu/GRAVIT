// OWNER: D. Composition root: data source wiring, 진입 화면(로그인 · 사무실 고르기) ↔ 사무실(canvas · HUD), global drag end.
import { lazy, Suspense, useEffect } from 'react'
import { useOffice } from './store'
import { createMockDataSource } from './data/mock'
import { createV1ApiDataSource } from './data/api/v1'
import { createV1MockDataSource } from './data/mock/v1'
import { useSession } from './session'
import { EntryScreen } from './ui/entry/EntryScreen'
import { Hud } from './ui/Hud'
import { SceneBoundary } from './app/SceneBoundary'

// One source per page load (module scope, so StrictMode's double effects don't create two).
const params = new URLSearchParams(location.search)
const apiMode = params.get('source') === 'api'
// 데모 모델(store의 데모 칸 — #102 ④에서 걷어낸다)은 mock에서만 띄운다. `?source=api`의 Spring에는 데모 API가 없어
// (GET /api/workspace → 401 · 404) 띄우면 콘솔 오류와 "데이터를 불러오지 못했어요"만 남는다 (#102 T5-c-3)
const demoSource = apiMode ? null : createMockDataSource()

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
    if (demoSource) void useOffice.getState().init(demoSource)
    void useSession.getState().start(officeSource, { preferredWorkspace })
  }, [])

  const signedIn = useSession((s) => s.status === 'signed_in')
  const officeOpen = useOffice((s) => s.office !== null)
  // 로그인되면 3D 묶음을 미리 받아 둔다 — 사무실을 고르는 사이에 받아져 사무실이 빨리 뜬다
  useEffect(() => {
    if (signedIn) void loadScene().catch(() => {})
  }, [signedIn])

  useEffect(() => {
    // A drag can start in the 3D view or the panel and end anywhere.
    const up = (e: PointerEvent) => {
      // Only the pointer that carries the drag can drop it (a second finger or palm must not).
      if (!e.isPrimary) return
      if (useOffice.getState().drag) useOffice.getState().endDrag()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useOffice.getState().drag) useOffice.getState().cancelDrag()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key)
    }
  }, [])

  if (!signedIn || !officeOpen) return <EntryScreen />

  return (
    <div className="app">
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
  )
}
