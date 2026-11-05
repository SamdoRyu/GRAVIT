// OWNER: architect. Composition root: data source wiring, canvas, HUD, global drag end.
import { lazy, Suspense, useEffect } from 'react'
import { useOffice } from './store'
import { createMockDataSource } from './data/mock'
import { createApiDataSource } from './data/api'
import { createV1MockDataSource } from './data/mock/v1'
import { Hud } from './ui/Hud'
import { SceneBoundary } from './app/SceneBoundary'

// One source per page load (module scope, so StrictMode's double effects don't create two).
// `?source=api` talks to the local server (docs/API.md); otherwise the in-browser mock.
const params = new URLSearchParams(location.search)
const apiMode = params.get('source') === 'api'
const dataSource = apiMode ? createApiDataSource() : createMockDataSource()

// v1 사무실(WorkspaceSnapshot — #102 T5-c-1). 지금은 mock만 연다 — `?source=api`의 v1 연결은 백엔드 Snapshot API(#103) 뒤 T5-c-3.
// 진입 흐름(#64 · #68) 전까지 `?workspace=<id>`로 고를 수 있고, 없으면 팀 사무실을 연다.
const officeSource = apiMode ? null : createV1MockDataSource()
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
    void useOffice.getState().init(dataSource)
    if (officeSource) void useOffice.getState().openDefaultOffice(officeSource, preferredWorkspace)
  }, [])

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
