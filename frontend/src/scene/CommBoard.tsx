// The communication hub's board (#205 — CONTRACTS.md 「8」 게시판): the big screen on the hub's back wall is the one board object.
// Above it, a pill with the SceneModel board badges — 열린 · 논의 중 도움 요청 수 (help:N) and, orange, 그중 48시간 안건 후보 수
// (candidate:k); no pill when both are 0. A click opens the panel's help-request list. The contents (help requests, …) stay in
// the HUD — no shape per help request (the shelf's sphere · octahedron · pad are decoration). OWNER: C.
import { MeshBasicMaterial } from 'three'
import { useUi } from '../ui/uiState'
import { COMM_HUB, WORLD_SCALE } from '../theme/station/geometry'
import { BADGE, BOARD_KEY } from './model/buildSceneModel'
import { badgeCount } from './requirementPlate'
import { cargoDrag, setCursor } from './runtime'
import { SceneHtml } from './shared'
import { useStationScene } from './useStationScene'

/** The board screen (design units) — StationEnvironment CommHub draws it; this is its pickable cover and the tag above */
const SCREEN = { x: COMM_HUB.x, y: COMM_HUB.deckY + 1.45, z: 4.95, w: 8.0, h: 2.3 } as const
const HIT = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })

/**
 * What a click on the board opens: the panel's help-request list. When a HUD for meeting decisions · instructor feedback exists
 * (FR-LRN-22, a later issue) the board opens that too — only this function changes then.
 */
function openBoardPanel() {
  const ui = useUi.getState()
  ui.setPanelOpen(true)
  ui.setTab('help')
}

const pill = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.96)',
  boxShadow: '0 2px 10px rgba(30,45,90,0.18)',
  font: '600 11.5px var(--font, sans-serif)',
  color: '#1b2333',
  whiteSpace: 'nowrap' as const,
  userSelect: 'none' as const,
}

export function CommBoard() {
  const scene = useStationScene()
  const badges = scene?.entities.find((e) => e.key === BOARD_KEY)?.badges ?? []
  const help = badgeCount(badges, BADGE.help)
  const candidates = badgeCount(badges, BADGE.candidate)
  if (!scene) return null
  return (
    <group scale={WORLD_SCALE} name="board">
      <mesh
        position={[SCREEN.x, SCREEN.y, SCREEN.z + 0.2]}
        material={HIT}
        onPointerOver={(e) => {
          if (cargoDrag.key !== null) return
          e.stopPropagation()
          setCursor('pointer')
        }}
        onPointerOut={() => {
          if (cargoDrag.key === null) setCursor('')
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.delta > 6 || cargoDrag.key !== null) return
          openBoardPanel()
        }}
      >
        <boxGeometry args={[SCREEN.w, SCREEN.h, 0.6]} />
      </mesh>
      {help > 0 && (
        <SceneHtml center position={[SCREEN.x, SCREEN.y + SCREEN.h / 2 + 0.9, SCREEN.z]} zIndexRange={[0, 0]} pointerEvents="none">
          <div style={pill} data-board-tag="">
            <span>도움 요청 {help}</span>
            {candidates > 0 && <span style={{ color: '#d9711f' }}>· 안건 후보 {candidates}</span>}
          </div>
        </SceneHtml>
      )}
    </group>
  )
}
