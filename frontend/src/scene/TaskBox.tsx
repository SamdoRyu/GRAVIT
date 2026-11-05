// One issue / PR as a little cargo box (the v1 SceneModel's `issue` · `pr` entity). Keeps its own world position and flies
// along an arc when its slot changes. Read-only: a click opens the v1 detail drawer; nothing is dragged (the GitHub
// originals are never changed from the app — CON-02; putting a shape on the agenda comes with #26 · #30).
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import { BackSide, Color, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Group } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PRIORITY_META } from '../data/meta'
import type { Priority } from '../data/types'
import { useOffice } from '../store'
import { PALETTE } from '../theme'
import type { SceneEntity } from './model/types'
import { boxLive, clickSlop, noRaycast, setCursor, type BoxLive } from './runtime'
import { clamp, UNIT_BOX, useDynamicLayer } from './shared'
import { BOX_D, BOX_H, BOX_W, type Slot } from './slots'

const ROUNDED = new RoundedBoxGeometry(1, 1, 1, 3, 0.1)
const meshRaycast = Mesh.prototype.raycast
/** The band colour tells issues and PRs apart until PRs get their own prism (#11). */
const KIND_BAND = { issue: '#f29a52', pr: '#5fc4b8' } as const
const PR_BODY = '#bfe7e1'

const hsl = { h: 0, s: 0, l: 0 }
/** Slightly desaturate so the boxes read as calm. */
function calm(c: Color): Color {
  c.getHSL(hsl)
  return c.setHSL(hsl.h, hsl.s * 0.8, hsl.l + (1 - hsl.l) * 0.06)
}

const bodyColor = (kind: 'issue' | 'pr', priority: Priority | null) => calm(new Color(kind === 'pr' ? PR_BODY : PRIORITY_META[priority ?? 'low'].color))

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
  priority: Priority | null
  /** An open issue past its due date: a soft glow. */
  overdue: boolean
  /** Appeared after the first load: pop in instead of being there from the start. */
  pop: boolean
}

export const TaskBox = memo(function TaskBox({ entity, slot, priority, overdue, pop }: Props) {
  const { key, refId } = entity
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
  const main = useMemo(() => bodyColor(kind, priority), [kind, priority])
  const strip = useMemo(() => new Color(KIND_BAND[kind]), [kind])

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
    if (overdue) body.emissiveIntensity = 0.08 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.4 + phase))
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
      <mesh geometry={ROUNDED} material={body} position={[0, h / 2, 0]} scale={[BOX_W, h, BOX_D]} castShadow receiveShadow raycast={meshRaycast} />
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
    </group>
  )
})
