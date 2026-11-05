// One issue / PR as a piece of cargo (the v1 SceneModel's `issue` · `pr` entity), drawn like the confirmed design's cargo:
// an issue is a cube, a PR a triangular prism, both cream with an orange band (#11). A blocked one glows warm (#23), and its
// badges (blocked · Draft · 미병합 종료 · 계획 안 함 · a PR's current-round votes — #21) float above it. Keeps its own world
// position and flies along an arc when its slot changes. Read-only: a click opens the v1 detail drawer; nothing is dragged (the GitHub
// originals are never changed from the app — CON-02; putting a shape on the agenda comes with #26 · #30).
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import { BackSide, Color, CylinderGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, type BufferGeometry, type Group } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useOffice } from '../store'
import { PALETTE } from '../theme'
import { CargoBadges } from './CargoBadges'
import { cargoBadgeView, isEmptyBadgeView } from './badgeView'
import type { SceneEntity } from './model/types'
import { boxLive, clickSlop, noRaycast, setCursor, type BoxLive } from './runtime'
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

interface Props {
  entity: SceneEntity
  slot: Slot
  /** An open issue past its due date: a soft glow. */
  overdue: boolean
  /** Appeared after the first load: pop in instead of being there from the start. */
  pop: boolean
}

export const TaskBox = memo(function TaskBox({ entity, slot, overdue, pop }: Props) {
  const { key, refId } = entity
  const blocked = entity.highlight === 'blocked'
  const badges = useMemo(() => cargoBadgeView(entity.badges), [entity.badges])
  const kind = entity.kind === 'pr' ? 'pr' : 'issue'
  const selectKind = kind === 'pr' ? 'submission' : 'task'
  const selected = useOffice((s) => s.officeSelection?.kind === selectKind && s.officeSelection.id === refId)
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

    // ---- position: fly to the slot ----
    if (slot.x !== a.tx || slot.y !== a.ty || slot.z !== a.tz) {
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
    if (a.flying) {
      a.t += delta / a.dur
      const u = Math.min(a.t, 1)
      const e = easeInOut(u)
      a.px = a.fx + (a.tx - a.fx) * e
      a.pz = a.fz + (a.tz - a.fz) * e
      a.py = a.fy + (a.ty - a.fy) * e + Math.sin(Math.PI * u) * a.arc
      if (u >= 1) a.flying = false
    }

    // ---- hover lift, pop-in ----
    a.lift += ((hovered ? 0.1 : 0) - a.lift) * (1 - Math.exp(-14 * dt))
    if (a.pop < 1) a.pop = Math.min(1, a.pop + dt / 0.45)
    a.scale += (slot.scale - a.scale) * (1 - Math.exp(-14 * dt))
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

    const om = outlineMesh.current
    if (om) {
      const on = selected || hovered
      if (om.visible !== on) om.visible = on
      outline.opacity = selected ? 0.75 + 0.25 * Math.sin(t * 5) : 0.85
    }
  })

  const h = BOX_H
  return (
    <group
      ref={group}
      onPointerOver={(e) => {
        e.stopPropagation()
        useOffice.getState().setHover({ kind: 'task', id: key })
        setCursor('pointer')
      }}
      onPointerOut={() => {
        const s = useOffice.getState()
        if (s.hover?.kind === 'task' && s.hover.id === key) s.setHover(null)
        setCursor('')
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (e.delta > clickSlop(e) || refId === null) return
        useOffice.getState().selectInOffice({ kind: selectKind, id: refId })
      }}
    >
      {kind === 'pr' ? (
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
