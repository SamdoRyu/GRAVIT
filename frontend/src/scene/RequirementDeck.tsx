// The requirement deck (H — #16 · #17): one solar-cell plate per requirement zone on the deck of the new module south of the
// scanner, laid out by stationScene `deckPlan` (5 to 10 plates). A plate is the design's panel() lying on the floor: a cream
// frame, a navy panel and a 5 × 2 cell grid. Cells light up teal as the linked issues close (doneTaskCount / linkedTaskCount,
// the Snapshot's server values — FR-REQ-05); all closed adds a teal rim. A zone with no linked issue (FR-REQ-06) is an
// unpowered panel: darker, cells off, an orange frame and "연결 없음". Unused places show only a faint floor outline; when
// requirements overflow, the last place is the waiting plate (SceneModel `requirement-group:waiting` — waiting:N · empty:k).
// While an issue box is dragged (#15), every requirement plate shows a faint teal rim and the one under it a bright one — letting
// go there links the issue to that requirement (TaskBox · cargoDrop); over the waiting plate it opens the waiting list to pick
// the requirement (#197). A click on a plate opens the panel's 요구사항 tab, on the waiting plate the waiting list. When the
// viewer swaps plates (store requirementDeckOrder → SceneModel), a plate glides over to its new place. The tags show only when
// the camera is near the deck — from the whole-station view ten of them would pile up over it.
// OWNER: C.
import { useFrame } from '@react-three/fiber'
import { createContext, memo, useContext, useRef, useState } from 'react'
import { MeshBasicMaterial, Vector3, type Group, type Mesh } from 'three'
import type { RequirementDto } from '../data/types'
import { useOffice } from '../store'
import { REQ_DECK, REQ_PLATE, reqPlateCenter, WORLD_SCALE } from '../theme/station/geometry'
import { Bx, COLORS, Glow, basic, lam } from '../theme/station/parts'
import { BADGE, REQUIREMENT_WAITING_KEY, REQUIREMENT_WAITING_ROLE } from './model/buildSceneModel'
import { badgeCount, litCells, PLATE_CELLS, plateTag } from './requirementPlate'
import { cargoDrag, noRaycast, setCursor } from './runtime'
import { useUi } from '../ui/uiState'
import { SceneHtml } from './shared'
import { useStationScene } from './useStationScene'

const CELL_COLUMNS = 5
const ORANGE = '#f29a52'

const PANEL = 0x2c4a7c
const PANEL_OFF = 0x1b2540
const CELL_OFF = 0x3d5d92
const CELL_DEAD = 0x26324f
const FRAME = 0xece2cf
const OUTLINE = 0xd2c4ab

/** deckPlan place of the waiting plate (the tail of `requirement:waiting`) */
const WAITING_PLACE = REQUIREMENT_WAITING_ROLE.slice('requirement:'.length)

const W = REQ_PLATE.width
const D = REQ_PLATE.depth
const Y = REQ_DECK.deckY + 0.08

function Cells({ lit, dead }: { lit: number; dead: boolean }) {
  const gap = 0.08
  const cw = (W - 0.2 - gap * (CELL_COLUMNS - 1)) / CELL_COLUMNS
  const cd = (D - 0.2 - gap) / 2
  return (
    <>
      {Array.from({ length: PLATE_CELLS }, (_, i) => {
        const col = i % CELL_COLUMNS
        const row = Math.floor(i / CELL_COLUMNS)
        const x = -W / 2 + 0.1 + cw / 2 + col * (cw + gap)
        const z = -D / 2 + 0.1 + cd / 2 + row * (cd + gap)
        return <Bx key={i} s={[cw, 0.03, cd]} p={[x, 0.135, z]} c={i < lit ? basic(COLORS.teal) : lam(dead ? CELL_DEAD : CELL_OFF)} />
      })}
    </>
  )
}

/** Four thin bars around a w × d rectangle at height y */
function Rim({ w, d, y, color, t = 0.08 }: { w: number; d: number; y: number; color: number; t?: number }) {
  const c = color === COLORS.teal ? basic(color) : lam(color)
  return (
    <>
      <Bx s={[w + t, 0.04, t]} p={[0, y, -d / 2]} c={c} />
      <Bx s={[w + t, 0.04, t]} p={[0, y, d / 2]} c={c} />
      <Bx s={[t, 0.04, d + t]} p={[-w / 2, y, 0]} c={c} />
      <Bx s={[t, 0.04, d + t]} p={[w / 2, y, 0]} c={c} />
    </>
  )
}

const tagBox = {
  display: 'grid',
  justifyItems: 'center',
  gap: 1,
  maxWidth: 150,
  padding: '3px 8px',
  borderRadius: 9,
  background: 'rgba(255,255,255,0.96)',
  boxShadow: '0 3px 10px rgba(30,45,90,0.22)',
  font: '600 11px var(--font, sans-serif)',
  color: '#1b2333',
  userSelect: 'none' as const,
  whiteSpace: 'nowrap' as const,
}
const titleLine = { maxWidth: 134, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500, fontSize: 10.5, color: '#6b7487' }

/** Deck centre (world) — the tags show when the camera is within TAGS_NEAR of it and hide again past TAGS_FAR */
const DECK_CENTER = new Vector3(REQ_DECK.x * WORLD_SCALE, REQ_DECK.deckY * WORLD_SCALE, REQ_DECK.z * WORLD_SCALE)
const TAGS_NEAR = 15
const TAGS_FAR = 17

/** Whether the plate tags show (camera near the deck). Re-renders only when it flips. */
function useTagsShown(): boolean {
  const [shown, setShown] = useState(false)
  const last = useRef(false)
  useFrame(({ camera }) => {
    const d = camera.position.distanceTo(DECK_CENTER)
    const next = last.current ? d < TAGS_FAR : d < TAGS_NEAR
    if (next !== last.current) {
      last.current = next
      setShown(next)
    }
  })
  return shown
}

/** Tags stay mounted (drei's Html misbehaves when mounted / unmounted often) and are only hidden */
const TagsShown = createContext(false)

function PlateTag({ head, sub, warn, title }: { head: string; sub: string | null; warn: string | null; title: string | null }) {
  const shown = useContext(TagsShown)
  return (
    <SceneHtml center position={[0, 1.3, 0]} zIndexRange={[0, 0]} pointerEvents="none">
      <div style={{ ...tagBox, opacity: shown ? 1 : 0, transition: 'opacity 0.25s' }} data-plate-tag="" data-shown={shown ? '' : undefined}>
        <div>
          {head}
          {sub && <span style={{ color: '#3a7d73' }}> · {sub}</span>}
          {warn && <span style={{ color: ORANGE }}> · {warn}</span>}
        </div>
        {title && <div style={titleLine}>{title}</div>}
      </div>
    </SceneHtml>
  )
}

/** The drop rim's two looks, shared by every plate: faint while an issue is dragged, bright on the drop target */
const DROP_FAINT = new MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 0.35, depthWrite: false })
const DROP_BRIGHT = new MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 1, depthWrite: false })

/** Drop glow of one requirement plate (or the waiting plate, id 'waiting'): off, faint while an issue is dragged, bright when it is the drop target */
function PlateDropGlow({ requirementId, y = 0 }: { requirementId: string; y?: number }) {
  const group = useRef<Group>(null)
  const target = `requirement:${requirementId}`
  useFrame(() => {
    const g = group.current
    if (!g) return
    const issue = cargoDrag.key !== null && cargoDrag.key.startsWith('task:')
    const hit = cargoDrag.target === target
    g.visible = issue
    if (!issue) return
    g.scale.setScalar(hit ? 1.06 : 1)
    for (const child of g.children) (child as Mesh).material = hit ? DROP_BRIGHT : DROP_FAINT
  })
  const mat = DROP_FAINT
  const w = W + 0.62
  const d = D + 0.62
  const t = 0.14
  return (
    <group ref={group} visible={false} position={[0, y, 0]}>
      {[
        [w + t, 0, -d / 2, t],
        [w + t, 0, d / 2, t],
        [t, -w / 2, 0, d + t],
        [t, w / 2, 0, d + t],
      ].map(([sx, x, z, sz], i) => (
        <mesh key={i} position={[x, 0.2, z]} material={mat} raycast={noRaycast} renderOrder={4}>
          <boxGeometry args={[sx, 0.05, sz]} />
        </mesh>
      ))}
    </group>
  )
}

/** Invisible, pickable cover of a plate — the plate meshes themselves are not pickable */
const HIT = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })

/** A click target over a plate: pointer cursor, and `onOpen` on a click (not while a box is dragged) */
function PlateHit({ height, onOpen }: { height: number; onOpen: () => void }) {
  return (
    <mesh
      position={[0, height / 2, 0]}
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
        onOpen()
      }}
    >
      <boxGeometry args={[W + 0.24, height, D + 0.24]} />
    </mesh>
  )
}

/** Open the panel on the 요구사항 tab (D — #202) */
function openRequirementsTab() {
  const ui = useUi.getState()
  ui.setPanelOpen(true)
  ui.setTab('requirements')
}

/** Keeps a plate group at (x, z): the first time it is just there, later it glides over (a small hop) when its place changes */
function useGlide(x: number, z: number) {
  const ref = useRef<Group>(null)
  /** Where the plate starts (so it is not at the origin before the first frame); later moves are the frame loop's */
  const [initial] = useState<[number, number, number]>(() => [x, Y, z])
  const from = useRef<{ x: number; z: number; t: number } | null>(null)
  useFrame((_, delta) => {
    const g = ref.current
    if (!g) return
    if (from.current === null) {
      g.position.set(x, Y, z)
      from.current = { x, z, t: 1 }
      return
    }
    const f = from.current
    if (Math.abs(g.position.x - x) > 1e-3 || Math.abs(g.position.z - z) > 1e-3) {
      if (f.t >= 1) {
        f.x = g.position.x
        f.z = g.position.z
        f.t = 0
      }
      f.t = Math.min(1, f.t + Math.min(delta, 0.1) / 0.6)
      const u = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2
      g.position.set(f.x + (x - f.x) * u, Y + Math.sin(Math.PI * f.t) * 0.9, f.z + (z - f.z) * u)
      if (f.t >= 1) g.position.set(x, Y, z)
    } else f.t = 1
  })
  return [ref, initial] as const
}

const RequirementPlate = memo(function RequirementPlate({ slot, requirement }: { slot: number; requirement: RequirementDto }) {
  const { x, z } = reqPlateCenter(slot)
  const [plateRef, plateAt] = useGlide(x, z)
  const linked = requirement.linkedTaskCount
  const done = requirement.doneTaskCount
  const empty = linked === 0
  const full = linked > 0 && done >= linked
  const tag = plateTag(requirement)
  return (
    <group ref={plateRef} position={plateAt} name={`requirement:${requirement.id}`}>
      <PlateHit height={0.4} onOpen={openRequirementsTab} />
      <Bx s={[W + 0.24, 0.1, D + 0.24]} p={[0, 0, 0]} c={lam(empty ? COLORS.trim : FRAME)} />
      <Bx s={[W, 0.12, D]} p={[0, 0.06, 0]} c={empty ? lam(PANEL_OFF) : lam(PANEL, { emissive: 0x0a1630 })} />
      <Cells lit={litCells(done, linked)} dead={empty} />
      <PlateDropGlow requirementId={requirement.id} />
      {full && (
        <>
          <Rim w={W + 0.5} d={D + 0.5} y={0.04} color={COLORS.teal} />
          <Glow color={COLORS.teal} size={2.6} p={[0, 0.35, 0]} opacity={0.3} />
        </>
      )}
      <PlateTag head={tag.head} sub={tag.progress} warn={empty ? '연결 없음' : null} title={tag.title} />
    </group>
  )
})

/** A place on the deck with no requirement: only a faint outline on the floor */
function OpenPlace({ slot }: { slot: number }) {
  const { x, z } = reqPlateCenter(slot)
  return (
    <group position={[x, Y, z]}>
      <Rim w={W} d={D} y={0} color={OUTLINE} t={0.06} />
    </group>
  )
}

/** The last place when requirements overflow: a stack of plates with how many wait (and how many of them have no issue) */
function WaitingPlate({ slot, waiting, empty }: { slot: number; waiting: number; empty: number }) {
  const { x, z } = reqPlateCenter(slot)
  return (
    <group position={[x, Y, z]} name="requirement:waiting">
      <PlateHit height={0.7} onOpen={() => useOffice.getState().openRequirementWaiting()} />
      <PlateDropGlow requirementId="waiting" y={0.32} />
      {[0, 1, 2].map((i) => (
        // stacked straight up (a slight sideways lean only), so the stack stays inside its own place
        <group key={i} position={[i * 0.08, i * 0.16, 0]}>
          <Bx s={[W + 0.24, 0.1, D + 0.24]} p={[0, 0, 0]} c={lam(i === 2 ? FRAME : COLORS.frame)} />
          <Bx s={[W, 0.12, D]} p={[0, 0.06, 0]} c={lam(PANEL)} />
        </group>
      ))}
      <PlateTag head={`대기 ×${waiting}`} sub={null} warn={empty > 0 ? `빈 구역 ${empty}` : null} title={null} />
    </group>
  )
}

export function RequirementDeck() {
  const scene = useStationScene()
  const tagsShown = useTagsShown()
  const requirements = useOffice((s) => s.office?.snapshot?.requirements)
  if (!scene || !requirements) return null
  const byId = new Map(requirements.map((r) => [r.id, r]))
  const waitingBadges = scene.entities.find((e) => e.key === REQUIREMENT_WAITING_KEY)?.badges ?? []
  const { slots, places } = scene.deck
  return (
    <TagsShown.Provider value={tagsShown}>
      <group scale={WORLD_SCALE}>
        {Array.from({ length: slots }, (_, i) => {
          const place = places[i]
          if (place === WAITING_PLACE)
            return <WaitingPlate key="waiting" slot={i} waiting={badgeCount(waitingBadges, BADGE.waiting)} empty={badgeCount(waitingBadges, BADGE.empty)} />
          const r = place === undefined ? undefined : byId.get(place)
          if (r) return <RequirementPlate key={`r:${r.id}`} slot={i} requirement={r} />
          return <OpenPlace key={`open:${i}`} slot={i} />
        })}
      </group>
    </TagsShown.Provider>
  )
}
