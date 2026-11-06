// One issue / PR as a piece of cargo (the v1 SceneModel's `issue` · `pr` entity), drawn like the confirmed design's cargo:
// an issue is a cube, a PR a triangular prism, both cream with an orange band (#11). A blocked one glows warm (#23), and its
// badges (blocked · Draft · 미병합 종료 · 계획 안 함 · a PR's current-round votes — #21) float above it. Keeps its own world
// position and flies along an arc when its slot changes.
// An original issue / PR can be dragged onto the bridge to raise it as an agenda item (#30 · #26 — CONTRACTS.md 「8」 드롭 결과):
// letting go there opens the agenda dialog and the shape flies back to its own place (the agenda never moves the original).
// Anywhere else nothing happens. Agenda shapes on the bridge table are not dragged; a click opens their source. A click on an
// original opens the v1 detail drawer (the GitHub originals are never changed from the app — CON-02).
// A learning · other agenda item has no source (#31): it sits on the bridge table as the design's octahedron (floating,
// turning, a lilac glow) or memo pad, shows its title on hover and opens nothing.
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import { BackSide, Color, CylinderGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, type BufferGeometry, type Group } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Id } from '../data/types'
import { useOffice, type OfficeSelection } from '../store'
import { PALETTE } from '../theme'
import { Glow } from '../theme/station/parts'
import { CargoBadges } from './CargoBadges'
import { cargoBadgeView, isEmptyBadgeView } from './badgeView'
import type { SceneEntity, ThemeLayout } from './model/types'
import { boxLive, cameraGesture, cameraLock, cargoDrag, CLICK_SLOP_PX, clickSlop, DRAG_Y, LONG_PRESS_MS, noRaycast, pointerOnPlane, setCursor, type BoxLive } from './runtime'
import { clamp, UNIT_BOX, useDynamicLayer } from './shared'
import { BOX_D, BOX_H, BOX_W, type Slot } from './slots'

const meshRaycast = Mesh.prototype.raycast
/** The design's cargo colours (public/station: CARGO · TRIM) */
const CARGO = '#f1e4cc'
const TRIM = '#f29a52'
/** Warm glow of a blocked shape (FR-FLOW-02) */
const BLOCKED_GLOW = '#ff8a3d'

/** Issue: the design's cube — a rounded box, band near the top. */
const CUBE = new RoundedBoxGeometry(1, 1, 1, 3, 0.1)

/**
 * PR: the design's triangular prism (cargo 'prism'): a 3-sided cylinder of circumradius r = 0.62 s and length 1.3 s lying
 * along x, one edge up, resting on the deck. Built at s = 1 and scaled to the box size.
 */
const PRISM_R = 0.62
function prism(r: number, length: number): BufferGeometry {
  const g = new CylinderGeometry(r, r, length, 3)
  g.rotateZ(Math.PI / 2)
  g.rotateX(-Math.PI / 2)
  g.translate(0, r * 0.5, 0) // bottom face (at -r/2) on the deck
  return g
}
const PRISM = prism(PRISM_R, 1.3)
/** The band: a thin, slightly larger slice around the middle */
const PRISM_BAND = prism(PRISM_R * 1.04, 0.16)
/** Prism size so its height (1.5 r · s) matches BOX_H */
const PRISM_S = BOX_H / (1.5 * PRISM_R)

/** Size s of the design's learning · other shapes, matched to the cube (cargo 'octa' · 'pad' are built for a cube of side s) */
const NOTE_S = 0.4
/** Learning: the design's octahedron (cargo 'octa') — radius s/2, stretched 1.4× upright, centred 0.95 s above the table */
const OCTA = new OctahedronGeometry(0.5)
OCTA.scale(1, 1.4, 1)
const OCTA_Y = 0.95 * NOTE_S
const OCTA_BODY = new MeshStandardMaterial({ color: CARGO, emissive: '#2a2030', roughness: 0.55, metalness: 0 })
const OCTA_GLOW = 0xd9c6ff
/** Other: the design's memo pad (cargo 'pad') — a thin slab with three blue lines, turned a quarter */
const PAD_LINE = new MeshBasicMaterial({ color: '#8fa4c4' })
const PAD_LINES = [0, 1, 2].map((i) => ({ w: (i === 2 ? 0.45 : 0.75) * NOTE_S, x: i === 2 ? -0.15 * NOTE_S : 0, z: (-0.2 + i * 0.2) * NOTE_S }))

const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)
const easeOutBack = (u: number) => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2)

function lerpAngle(a: number, b: number, k: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  else if (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

interface Anim {
  init: boolean
  px: number
  py: number
  pz: number
  ry: number
  tx: number
  ty: number
  tz: number
  fx: number
  fy: number
  fz: number
  t: number
  dur: number
  arc: number
  flying: boolean
  lift: number
  pop: number
  scale: number
}

function newAnim(): Anim {
  return { init: false, px: 0, py: 0, pz: 0, ry: 0, tx: NaN, ty: 0, tz: 0, fx: 0, fy: 0, fz: 0, t: 0, dur: 1, arc: 0, flying: false, lift: 0, pop: 0, scale: 1 }
}

/** What an original issue / PR raises as an agenda item when dropped on the bridge */
export interface AgendaSource {
  type: 'task' | 'submission'
  id: Id
}

/** Touch: the finger may drift this far (px) during the long press before it counts as an orbit gesture. */
const LONG_PRESS_SLOP_PX = 9

interface Props {
  entity: SceneEntity
  slot: Slot
  /** What a click opens in the v1 detail drawer (an agenda shape opens its source) */
  select: OfficeSelection | null
  /** Draggable onto the bridge to raise this as an agenda item; null = not draggable (agenda shapes) */
  raise: AgendaSource | null
  dropZoneAt: ThemeLayout['dropZoneAt']
  /** An open issue past its due date: a soft glow. */
  overdue: boolean
  /** Appeared after the first load: pop in instead of being there from the start. */
  pop: boolean
}

export const TaskBox = memo(function TaskBox({ entity, slot, select, raise, dropZoneAt, overdue, pop }: Props) {
  const { key } = entity
  const blocked = entity.highlight === 'blocked'
  const badges = useMemo(() => cargoBadgeView(entity.badges), [entity.badges])
  const kind = entity.kind === 'pr' || entity.kind === 'learning' || entity.kind === 'other' ? entity.kind : 'issue'
  const selected = useOffice((s) => select !== null && s.officeSelection?.kind === select.kind && s.officeSelection.id === select.id)
  const hovered = useOffice((s) => s.hover?.kind === 'task' && s.hover.id === key)

  const body = useMemo(() => new MeshStandardMaterial({ roughness: 0.55, metalness: 0, emissive: new Color(PALETTE.overdueGlow), emissiveIntensity: 0 }), [])
  const band = useMemo(() => new MeshStandardMaterial({ roughness: 0.5, metalness: 0 }), [])
  const outline = useMemo(() => new MeshBasicMaterial({ side: BackSide, transparent: true, opacity: 0.85, depthWrite: false }), [])
  useEffect(
    () => () => {
      body.dispose()
      band.dispose()
      outline.dispose()
    },
    [body, band, outline],
  )
  const main = useMemo(() => new Color(CARGO), [])
  const strip = useMemo(() => new Color(TRIM), [])
  useEffect(() => {
    body.emissive.set(blocked ? BLOCKED_GLOW : PALETTE.overdueGlow)
  }, [body, blocked])

  const group = useRef<Group>(null)
  useDynamicLayer(group)
  const outlineMesh = useRef<Mesh>(null)
  /** The learning octahedron's own turn and bob (inside the group that flies) */
  const spin = useRef<Group>(null)
  const anim = useRef<Anim>(newAnim())
  const live = useRef<BoxLive>({ x: 0, y: 0, z: 0 })
  const phase = useMemo(() => (key.length * 1.7 + key.charCodeAt(key.length - 1)) % 6.283, [key])

  useEffect(() => {
    outline.color.set(selected ? PALETTE.selection : PALETTE.hover)
  }, [outline, selected])

  useEffect(() => {
    const l = live.current
    boxLive.set(key, l)
    return () => {
      if (boxLive.get(key) === l) boxLive.delete(key)
      const s = useOffice.getState()
      if (s.hover?.kind === 'task' && s.hover.id === key) s.setHover(null)
    }
  }, [key])

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    // `delta` drives flight progress (real time, so low fps doesn't slow motion); `dt` is only for smoothing.
    const dt = Math.min(delta, 0.1)
    const a = anim.current
    const t = state.clock.elapsedTime

    if (!a.init) {
      a.init = true
      a.px = a.tx = slot.x
      a.py = a.ty = slot.y
      a.pz = a.tz = slot.z
      a.ry = slot.rot
      a.pop = pop ? 0 : 1
      a.scale = slot.scale
      body.color.copy(main)
      band.color.copy(strip)
    }

    // The tab was in the background: don't replay old flights, just be where we belong.
    if (delta > 1) {
      a.px = a.tx = slot.x
      a.py = a.ty = slot.y
      a.pz = a.tz = slot.z
      a.flying = false
      a.ry = slot.rot
      a.lift = 0
      a.scale = slot.scale
    }

    // ---- position: follow the pointer while dragged to the bridge, otherwise fly to the slot ----
    const dragged = cargoDrag.key === key
    if (dragged) {
      const k = 1 - Math.exp(-28 * dt)
      a.px += (cargoDrag.x - a.px) * k
      a.py += (cargoDrag.y - a.py) * k
      a.pz += (cargoDrag.z - a.pz) * k
      a.flying = false
      a.tx = NaN // fly back home when let go
    } else if (slot.x !== a.tx || slot.y !== a.ty || slot.z !== a.tz) {
      a.tx = slot.x
      a.ty = slot.y
      a.tz = slot.z
      a.fx = a.px
      a.fy = a.py
      a.fz = a.pz
      const dist = Math.hypot(a.tx - a.px, a.ty - a.py, a.tz - a.pz)
      a.t = 0
      a.dur = clamp(0.35 + dist * 0.12, 0.35, 1.5)
      a.arc = dist < 0.8 ? dist * 0.3 : clamp(dist * 0.45 + 0.7, 0.9, 4.5)
      a.flying = dist > 0.004
    }
    if (a.flying && !dragged) {
      a.t += delta / a.dur
      const u = Math.min(a.t, 1)
      const e = easeInOut(u)
      a.px = a.fx + (a.tx - a.fx) * e
      a.pz = a.fz + (a.tz - a.fz) * e
      a.py = a.fy + (a.ty - a.fy) * e + Math.sin(Math.PI * u) * a.arc
      if (u >= 1) a.flying = false
    }

    // ---- hover lift, pop-in ----
    a.lift += ((hovered && !dragged ? 0.1 : 0) - a.lift) * (1 - Math.exp(-14 * dt))
    if (a.pop < 1) a.pop = Math.min(1, a.pop + dt / 0.45)
    a.scale += (slot.scale * (dragged ? 1.1 : 1) - a.scale) * (1 - Math.exp(-14 * dt))
    const popScale = a.pop < 1 ? easeOutBack(a.pop) : 1
    g.scale.setScalar(Math.max(0.0001, a.scale * popScale))

    a.ry = lerpAngle(a.ry, slot.rot, 1 - Math.exp(-8 * dt))
    g.position.set(a.px, a.py + a.lift, a.pz)
    g.rotation.set(0, a.ry, 0)
    live.current.x = a.px
    live.current.y = a.py + a.lift
    live.current.z = a.pz

    // ---- look ----
    const k = 1 - Math.exp(-9 * dt)
    body.color.lerp(main, k)
    band.color.lerp(strip, k)
    if (blocked) body.emissiveIntensity = 0.16 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.2 + phase))
    else if (overdue) body.emissiveIntensity = 0.08 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.4 + phase))
    else if (body.emissiveIntensity !== 0) body.emissiveIntensity = Math.max(0, body.emissiveIntensity - dt * 2)

    const sp = spin.current
    if (sp) {
      sp.rotation.y = t * 0.8 + phase
      sp.position.y = NOTE_S * 0.08 * Math.sin(t * 1.7 + phase)
    }

    const om = outlineMesh.current
    if (om) {
      const on = selected || hovered || dragged
      if (om.visible !== on) om.visible = on
      outline.opacity = selected ? 0.75 + 0.25 * Math.sin(t * 5) : 0.85
    }
  })

  const h = BOX_H
  return (
    <group
      ref={group}
      onPointerOver={(e) => {
        if (cargoDrag.key !== null) return
        e.stopPropagation()
        useOffice.getState().setHover({ kind: 'task', id: key })
        setCursor(raise ? 'grab' : select ? 'pointer' : '')
      }}
      onPointerOut={() => {
        const s = useOffice.getState()
        if (s.hover?.kind === 'task' && s.hover.id === key) s.setHover(null)
        if (cargoDrag.key === null) setCursor('')
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !raise || cargoDrag.key !== null) return
        e.stopPropagation()
        startCargoDrag(key, raise, dropZoneAt, e.nativeEvent)
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (e.delta > clickSlop(e) || select === null) return
        useOffice.getState().selectInOffice(select)
      }}
    >
      {kind === 'learning' ? (
        <group ref={spin}>
          <mesh geometry={OCTA} material={OCTA_BODY} position={[0, OCTA_Y, 0]} scale={NOTE_S} castShadow raycast={meshRaycast} />
          <mesh ref={outlineMesh} geometry={OCTA} position={[0, OCTA_Y, 0]} scale={NOTE_S * 1.2} material={outline} visible={false} raycast={noRaycast} renderOrder={5} />
          <Glow color={OCTA_GLOW} size={NOTE_S * 1.8} p={[0, OCTA_Y, 0]} opacity={0.35} />
        </group>
      ) : kind === 'other' ? (
        <group rotation={[0, -Math.PI / 4, 0]}>
          <mesh geometry={UNIT_BOX} material={body} position={[0, 0.2 * NOTE_S, 0]} scale={[1.1 * NOTE_S, 0.1 * NOTE_S, 0.8 * NOTE_S]} castShadow receiveShadow raycast={meshRaycast} />
          {PAD_LINES.map((l, i) => (
            <mesh key={i} geometry={UNIT_BOX} material={PAD_LINE} position={[l.x, 0.26 * NOTE_S, l.z]} scale={[l.w, 0.02 * NOTE_S, 0.07 * NOTE_S]} raycast={meshRaycast} />
          ))}
          <mesh
            ref={outlineMesh}
            geometry={UNIT_BOX}
            position={[0, 0.2 * NOTE_S, 0]}
            scale={[1.1 * NOTE_S * 1.15, 0.1 * NOTE_S + 0.05, 0.8 * NOTE_S * 1.15]}
            material={outline}
            visible={false}
            raycast={noRaycast}
            renderOrder={5}
          />
        </group>
      ) : kind === 'pr' ? (
        <>
          <mesh geometry={PRISM} material={body} scale={PRISM_S} castShadow receiveShadow raycast={meshRaycast} />
          <mesh geometry={PRISM_BAND} material={band} scale={PRISM_S} castShadow raycast={meshRaycast} />
          <mesh ref={outlineMesh} geometry={PRISM} position={[0, -0.03, 0]} scale={PRISM_S * 1.16} material={outline} visible={false} raycast={noRaycast} renderOrder={5} />
        </>
      ) : (
        <>
          <mesh geometry={CUBE} material={body} position={[0, h / 2, 0]} scale={[BOX_W, h, BOX_D]} castShadow receiveShadow raycast={meshRaycast} />
          <mesh geometry={UNIT_BOX} material={band} position={[0, h - 0.07, 0]} scale={[BOX_W + 0.01, 0.035, BOX_D + 0.01]} castShadow raycast={meshRaycast} />
          <mesh
            ref={outlineMesh}
            geometry={UNIT_BOX}
            position={[0, h / 2, 0]}
            scale={[BOX_W * 1.2, h * 1.12 + 0.05, BOX_D * 1.2]}
            material={outline}
            visible={false}
            raycast={noRaycast}
            renderOrder={5}
          />
        </>
      )}
      {!isEmptyBadgeView(badges) && <CargoBadges view={badges} y={h + 0.22} />}
    </group>
  )
})

/**
 * Press on an original issue / PR: a mouse or pen picks it up once it moves a few pixels; a finger has to rest on it for a
 * moment first (otherwise it orbits the camera). While held the shape follows the pointer on the y = DRAG_Y plane and the
 * bridge lights up when letting go would raise it. Releasing over the bridge opens the agenda dialog; Escape cancels.
 */
function startCargoDrag(key: string, source: AgendaSource, dropZoneAt: ThemeLayout['dropZoneAt'], down: PointerEvent) {
  const pointerId = down.pointerId
  const touch = down.pointerType === 'touch'
  const sx = down.clientX
  const sy = down.clientY
  let px = sx
  let py = sy
  let dragging = false
  let timer = 0
  if (!touch && cameraLock.controls) cameraLock.controls.enabled = false
  if (touch) cameraGesture.begin()

  const follow = (cx: number, cy: number) => {
    const p = pointerOnPlane(cx, cy, DRAG_Y)
    if (!p) {
      cargoDrag.overMeeting = false
      return
    }
    cargoDrag.x = p.x
    cargoDrag.y = DRAG_Y
    cargoDrag.z = p.z
    cargoDrag.overMeeting = dropZoneAt([p.x, 0, p.z]) === 'meeting'
  }
  const begin = () => {
    dragging = true
    if (touch) {
      if (cameraLock.controls) cameraLock.controls.enabled = false
      cameraGesture.discard() // undo the tiny orbit made while the finger rested
      navigator.vibrate?.(12)
    }
    const s = useOffice.getState()
    if (s.hover?.kind === 'task' && s.hover.id === key) s.setHover(null)
    cargoDrag.key = key
    follow(px, py)
    setCursor('grabbing')
  }
  const stop = (): boolean => {
    window.clearTimeout(timer)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', escape)
    if (cameraLock.controls) cameraLock.controls.enabled = true
    const over = dragging && cargoDrag.overMeeting
    if (cargoDrag.key === key) cargoDrag.key = null
    cargoDrag.overMeeting = false
    setCursor('')
    return over
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    px = ev.clientX
    py = ev.clientY
    const moved = Math.hypot(px - sx, py - sy)
    if (dragging) follow(px, py)
    else if (touch && moved > LONG_PRESS_SLOP_PX) stop() // an orbit gesture, not a pick-up
    else if (!touch && moved > CLICK_SLOP_PX) begin()
  }
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    if (dragging) follow(ev.clientX, ev.clientY)
    if (stop()) useOffice.getState().openDialog({ kind: 'raiseAgenda', source })
  }
  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId === pointerId) stop()
  }
  const escape = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') stop()
  }
  if (touch) timer = window.setTimeout(begin, LONG_PRESS_MS)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', escape)
}
