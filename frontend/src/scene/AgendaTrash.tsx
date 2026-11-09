// The bridge trash can (#291 — FR-LRN-14): a small bin on the bridge deck between the meeting table and the seats, where an
// agenda item the viewer raised (and nobody has decided yet) can be dropped to take it off the agenda (TaskBox withdrawByDrop
// → withdrawAgendaItem). Low and small so it never hides the table or the agenda shapes on it.
// - idle: just the bin. Hovering it shows a small tooltip right beside it; leaving closes it.
// - an agenda shape the viewer may withdraw is being dragged (runtime cargoDrag.agenda): a soft ring breathes around the bin.
// - the pointer is within its catch range (cargoDrag.overTrash): the ring turns the drop colour, the lid lifts, and a
//   "놓으면 회의에서 빠져요" label says letting go will act.
// Others' items and decided items are never picked up, so the bin stays quiet for them. The meeting dialog's "안건 거두기"
// button stays for anyone who can't drag. Reads the drag state every frame — nothing re-renders while dragging except the
// label flipping on and off.
import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { CylinderGeometry, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, type Group } from 'three'
import { useOffice } from '../store'
import { PALETTE } from '../theme'
import { BRIDGE_TRASH, bridgeTrashCenter, WORLD_SCALE } from '../theme/station/geometry'
import { cargoDrag, noRaycast, setCursor } from './runtime'
import { SceneHtml } from './shared'

/** Tooltip on hover (#291) */
export const TRASH_TOOLTIP = '안건을 여기에 놓으면 회의에서 뺄 수 있어요'
/** Label while letting go would withdraw the dragged agenda item */
export const TRASH_DROP_LABEL = '놓으면 회의에서 빠져요'

// Bin in design units (drawn inside a group scaled by WORLD_SCALE, like the station theme).
const H = BRIDGE_TRASH.height
const R_TOP = 0.58
const R_BOTTOM = 0.46
const LID_H = 0.12
const BODY = new CylinderGeometry(R_TOP, R_BOTTOM, H - LID_H, 20, 1, false)
const LID = new CylinderGeometry(R_TOP + 0.05, R_TOP + 0.05, LID_H, 20)
const KNOB = new CylinderGeometry(0.15, 0.15, 0.08, 12)
/** Vertical ribs on the body — reads as a bin, not a stool */
const RIB = new CylinderGeometry(0.03, 0.03, H - LID_H - 0.3, 6)
const RIBS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2)
/** Floor ring and disc of the highlight — about the catch range, so it shows where letting go counts */
const RING = new RingGeometry(BRIDGE_TRASH.catchRadius - 0.22, BRIDGE_TRASH.catchRadius, 48).rotateX(-Math.PI / 2)
const DISC = new RingGeometry(0, BRIDGE_TRASH.catchRadius - 0.22, 48).rotateX(-Math.PI / 2)

const C = bridgeTrashCenter()

/** One bin in the scene: its materials live for the whole session (like TaskBox's shared materials) and are animated in place */
const MAT = {
  body: new MeshStandardMaterial({ color: '#e6dac3', roughness: 0.6, metalness: 0, emissive: PALETTE.dropOk, emissiveIntensity: 0 }),
  trim: new MeshStandardMaterial({ color: '#5d6e92', roughness: 0.5, metalness: 0.1 }),
  ring: new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0, depthWrite: false }),
  disc: new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0, depthWrite: false }),
}

const tipStyle = {
  padding: '5px 9px',
  borderRadius: 8,
  background: 'rgba(27, 35, 51, 0.92)',
  color: '#fff',
  font: '500 12px var(--font, sans-serif)',
  whiteSpace: 'nowrap',
  boxShadow: '0 2px 10px rgba(30,45,90,0.2)',
  userSelect: 'none',
  pointerEvents: 'none',
  // beside the bin: drei centres the box on the anchor, so shift it right by half its width plus a gap
  transform: 'translateX(calc(50% + 18px))',
} as const

const dropStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 999,
  background: PALETTE.dropOk,
  color: '#fff',
  font: '600 12px var(--font, sans-serif)',
  whiteSpace: 'nowrap',
  boxShadow: '0 2px 10px rgba(20,90,60,0.25)',
  userSelect: 'none',
  pointerEvents: 'none',
  // above the bin
  transform: 'translateY(calc(-50% - 34px))',
} as const

export function AgendaTrash() {
  // Instructors neither raise nor withdraw agenda items (FR-AUTH-08): no bin for them
  const member = useOffice((s) => s.office?.snapshot?.viewer.memberId != null)
  return member ? <Bin /> : null
}

function Bin() {
  const lid = useRef<Group>(null)
  const glow = useRef<Group>(null)
  const k = useRef({ armed: 0, ready: 0 })
  const [hover, setHover] = useState(false)
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)

  useFrame((state, delta) => {
    const { body, ring, disc } = MAT
    const dt = Math.min(delta, 0.05)
    const armed = cargoDrag.key !== null && cargoDrag.agenda
    const over = armed && cargoDrag.overTrash
    const a = k.current
    a.armed += ((armed ? 1 : 0) - a.armed) * (1 - Math.exp(-8 * dt))
    a.ready += ((over ? 1 : 0) - a.ready) * (1 - Math.exp(-14 * dt))
    const breathe = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.4)

    // soft accent ring while a withdrawable item is held; it turns the drop colour over the bin
    ring.color.set(over ? PALETTE.dropOk : PALETTE.accent)
    disc.color.set(over ? PALETTE.dropOk : PALETTE.accent)
    ring.opacity = Math.min(1, a.armed * (0.5 + 0.25 * breathe) + a.ready * 0.35)
    disc.opacity = a.armed * 0.1 + a.ready * 0.25
    body.emissiveIntensity = a.ready * 0.35
    const g = glow.current
    if (g) {
      const vis = a.armed > 0.01
      if (g.visible !== vis) g.visible = vis
      g.scale.setScalar(1 + a.ready * 0.12)
    }
    const l = lid.current
    if (l) {
      l.position.y = H - LID_H / 2 + a.ready * 0.16
      l.rotation.z = a.ready * 0.35
    }
    if (over !== readyRef.current) {
      readyRef.current = over
      setReady(over)
      if (over) setHover(false)
    }
  })

  return (
    <group position={[C.x * WORLD_SCALE, C.y * WORLD_SCALE, C.z * WORLD_SCALE]} scale={WORLD_SCALE}>
      <group
        name="agenda-trash"
        onPointerOver={(e) => {
          e.stopPropagation()
          if (cargoDrag.key !== null) return
          setHover(true)
          setCursor('')
        }}
        onPointerOut={() => setHover(false)}
      >
        <mesh geometry={BODY} material={MAT.body} position={[0, (H - LID_H) / 2, 0]} castShadow receiveShadow />
        {RIBS.map((a) => (
          <mesh key={a} geometry={RIB} material={MAT.trim} position={[Math.cos(a) * (R_TOP + R_BOTTOM) * 0.5, (H - LID_H) / 2, Math.sin(a) * (R_TOP + R_BOTTOM) * 0.5]} raycast={noRaycast} />
        ))}
        <group ref={lid} position={[0, H - LID_H / 2, 0]}>
          <mesh geometry={LID} material={MAT.trim} castShadow />
          <mesh geometry={KNOB} material={MAT.trim} position={[0, LID_H / 2 + 0.03, 0]} raycast={noRaycast} />
        </group>
      </group>
      <group ref={glow} visible={false}>
        <mesh geometry={RING} material={MAT.ring} position={[0, 0.03, 0]} renderOrder={3} raycast={noRaycast} />
        <mesh geometry={DISC} material={MAT.disc} position={[0, 0.025, 0]} renderOrder={3} raycast={noRaycast} />
      </group>
      <group position={[0, H * 0.6, 0]}>
        <SceneHtml center zIndexRange={[0, 0]} pointerEvents="none">
          {ready ? (
            <div style={dropStyle} data-testid="agenda-trash-drop">
              {TRASH_DROP_LABEL}
            </div>
          ) : hover ? (
            <div style={tipStyle} role="tooltip">
              {TRASH_TOOLTIP}
            </div>
          ) : (
            <div />
          )}
        </SceneHtml>
      </group>
    </group>
  )
}
