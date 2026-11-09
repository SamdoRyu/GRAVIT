// Orbit camera with limits and a floor-clamped target, framing the station in the area the HUD leaves free. Dragging a box
// locks it through runtime cameraLock (TaskBox) — the store's old drag / focus state is gone (#102 ④).
// Selecting a crew member / issue / PR (3D click or a HUD panel) eases the camera toward it, keeping the viewing angle; clearing
// the selection eases back to where it was — unless the user moved the camera meanwhile, then it stays theirs (#286).
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { MathUtils, PerspectiveCamera as ScratchCamera, TOUCH, Vector3, type PerspectiveCamera } from 'three'
import { useOffice, type OfficeSelection } from '../store'
import { STATION_BOUNDS, WORLD_SCALE } from '../theme/station/geometry'
import { FOCUS_S, easeInOut, focusPose } from './cameraFocus'
import { avatarLive, boxLive, cameraGesture, cameraLock, type ControlsImpl } from './runtime'

// Station extent in world units (the station is drawn at WORLD_SCALE).
const B = {
  minX: STATION_BOUNDS.minX * WORLD_SCALE,
  maxX: STATION_BOUNDS.maxX * WORLD_SCALE,
  minY: STATION_BOUNDS.minY * WORLD_SCALE,
  maxY: STATION_BOUNDS.maxY * WORLD_SCALE,
  minZ: STATION_BOUNDS.minZ * WORLD_SCALE,
  maxZ: STATION_BOUNDS.maxZ * WORLD_SCALE,
}
/** Look-at point of the design's home view (station.js: target (30, 3, 20)). */
const TARGET0: [number, number, number] = [30 * WORLD_SCALE, 3 * WORLD_SCALE, 20 * WORLD_SCALE]
const FOV = 23 // near-isometric
const MIN_DIST = 7
const MAX_DIST = 80
/** Share of the free area the station may span (the rest is margin). */
const SPAN = 0.94
const offset = new Vector3()
const dir = new Vector3()
const lastPos = new Vector3()
const lastTarget = new Vector3()
const prevOff = new Vector3()
/** A gesture counts as the user taking over the camera past these (a click's jitter stays below them). */
const MOVED_ANGLE = (1.5 * Math.PI) / 180
const MOVED_DIST = 0.015
const MOVED_TARGET = 0.1
const GESTURE_TAIL_MS = 800

// Station bounding box used to frame the whole thing.
const CORNERS: Vector3[] = []
for (const x of [B.minX, B.maxX]) for (const y of [B.minY, B.maxY]) for (const z of [B.minZ, B.maxZ]) CORNERS.push(new Vector3(x, y, z))
const scratch = new ScratchCamera(FOV, 1, 0.1, 300)
const corner = new Vector3()
const box = { w: 0, h: 0, cx: 0, cy: 0 }

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Where the selected thing is in 3D, or null when it has no place there (a member without a pod, …). */
function focusPoint(sel: OfficeSelection): Vector3 | null {
  if (sel.kind === 'member') {
    const a = avatarLive.get(sel.id)
    return a?.visible ? new Vector3(a.x, a.y + 0.5, a.z) : null
  }
  const b = boxLive.get(`${sel.kind}:${sel.id}`)
  return b ? new Vector3(b.x, b.y + 0.18, b.z) : null
}

/** Projected pixel extent / centre (relative to the view centre, y down) of the station seen from `dist` along `d`. */
function measure(dist: number, d: Vector3, tgt: Vector3, W: number, H: number) {
  scratch.fov = FOV
  scratch.aspect = W / H
  scratch.position.copy(tgt).addScaledVector(d, dist)
  scratch.lookAt(tgt)
  scratch.updateProjectionMatrix()
  scratch.updateMatrixWorld(true)
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const c of CORNERS) {
    corner.copy(c).project(scratch)
    const px = (corner.x * W) / 2
    const py = (-corner.y * H) / 2
    if (px < x0) x0 = px
    if (px > x1) x1 = px
    if (py < y0) y0 = py
    if (py > y1) y1 = py
  }
  box.w = x1 - x0
  box.h = y1 - y0
  box.cx = (x0 + x1) / 2
  box.cy = (y0 + y1) / 2
}

/** Camera distance (along `d`) at which the whole station fits the free area, plus its pixel centre then. */
function fitDistance(d: Vector3, tgt: Vector3, W: number, H: number, availW: number, availH: number) {
  let dist = 30
  for (let i = 0; i < 5; i++) {
    measure(dist, d, tgt, W, H)
    dist *= Math.max(box.w / (availW * SPAN), box.h / (availH * SPAN))
  }
  measure(dist, d, tgt, W, H)
  return { dist, cx: box.cx, cy: box.cy }
}

export function CameraRig() {
  const ref = useRef<ControlsImpl>(null)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const insets = useOffice((s) => s.viewInsets)
  /** True once the camera was moved by the user: from then on the distance is theirs. */
  const userMoved = useRef(false)
  const [maxDist, setMaxDist] = useState(MAX_DIST)
  // Framing goals; the camera eases toward them (distance) and the view offset eases toward its goal.
  const goal = useRef({ dist: 0, ox: 0, oy: 0, has: false })
  const curOff = useRef({ x: 0, y: 0 })
  /** Centring correction (px) measured while the user hadn't moved yet; frozen afterwards so nothing jumps. */
  const adj = useRef({ x: 0, y: 0 })
  const framed = useRef(false)
  // Gesture bookkeeping: the camera counts as "moved by the user" only when a gesture really moved it.
  const gesture = useRef({ active: false, until: 0, angle: 0, dist: 0, target: 0 })
  const snap = useRef({ pos: new Vector3(), tgt: new Vector3(), moved: false })
  const mountedAt = useRef(performance.now())
  const selection = useOffice((s) => s.officeSelection)
  // Focus on the selection (#286): the view before the first focus (to come back to), a running ease, and whether the user
  // took the camera over while focused (then we never come back).
  const focus = useRef<{
    home: { pos: Vector3; tgt: Vector3; moved: boolean } | null
    anim: { fp: Vector3; ft: Vector3; tp: Vector3; tt: Vector3; t0: number; dur: number; done?: () => void } | null
    userTook: boolean
  }>({ home: null, anim: null, userTook: false })

  useEffect(() => {
    cameraLock.controls = ref.current
    return () => {
      cameraLock.controls = null
    }
  }, [])

  // A touch press on a task box may nudge the orbit a few px before it turns into a pick-up: remember / undo that.
  useEffect(() => {
    cameraGesture.begin = () => {
      const c = ref.current
      if (!c) return
      snap.current.pos.copy(camera.position)
      snap.current.tgt.copy(c.target)
      snap.current.moved = userMoved.current
    }
    cameraGesture.discard = () => {
      const c = ref.current
      if (!c) return
      camera.position.copy(snap.current.pos)
      c.target.copy(snap.current.tgt)
      userMoved.current = snap.current.moved
      const g = gesture.current
      g.active = false
      g.until = 0
      lastPos.copy(camera.position)
      lastTarget.copy(c.target)
      c.update()
    }
    return () => {
      cameraGesture.begin = () => {}
      cameraGesture.discard = () => {}
    }
  }, [camera])

  // One finger / pen / mouse drag on the canvas must never scroll or zoom the page.
  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    const t = window.setTimeout(() => (el.style.touchAction = 'none'), 300)
    return () => window.clearTimeout(t)
  }, [gl])

  // Selection changed: ease toward it, or back home when it was cleared.
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const f = focus.current
    const ease = (tp: Vector3, tt: Vector3, done?: () => void) => {
      f.anim = { fp: camera.position.clone(), ft: c.target.clone(), tp, tt, t0: performance.now(), dur: reducedMotion() ? 0 : FOCUS_S * 1000, done }
    }
    if (selection) {
      const at = focusPoint(selection)
      if (!at) return // nothing to look at in 3D: leave the camera where it is
      if (!f.home) {
        f.home = { pos: camera.position.clone(), tgt: c.target.clone(), moved: userMoved.current }
        f.userTook = false
      }
      const p = focusPose(camera.position.toArray(), c.target.toArray(), at.toArray(), undefined, MIN_DIST)
      ease(new Vector3(...p.position), new Vector3(...p.target))
      return
    }
    const home = f.home
    if (!home) return
    f.home = null
    if (f.userTook) {
      f.anim = null
      return
    }
    ease(home.pos, home.tgt, () => {
      userMoved.current = home.moved
    })
  }, [selection, camera])

  const applyOffset = (x: number, y: number, W: number, H: number) => {
    curOff.current.x = x
    curOff.current.y = y
    if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) camera.clearViewOffset()
    else camera.setViewOffset(W, H, -x, -y, W, H)
    camera.updateProjectionMatrix()
  }

  // Narrow FOV, station framed in the area not covered by HUD panels. The whole station is projected
  // to find the distance that fits it with a margin (by width in portrait, by height in landscape) and the shift that
  // centres it in the free area. The first fit is instant; later ones (insets change, window resize) ease in useFrame.
  // After the user orbits/zooms only the centring follows the insets; the distance is theirs.
  useEffect(() => {
    const W = size.width
    const H = size.height
    if (W === 0 || H === 0) return
    camera.fov = FOV
    const availW = Math.max(240, W - insets.left - insets.right)
    const availH = Math.max(240, H - insets.top - insets.bottom)
    const fx = (insets.left - insets.right) / 2
    const fy = (insets.top - insets.bottom) / 2
    const c = ref.current
    const tgt = c ? c.target : new Vector3(TARGET0[0], TARGET0[1], TARGET0[2])
    if (!userMoved.current) {
      dir.copy(camera.position).sub(tgt)
      if (dir.lengthSq() < 1e-6) dir.set(0, 22, 21)
      dir.normalize()
      const f = fitDistance(dir, tgt, W, H, availW, availH)
      goal.current.dist = Math.max(MIN_DIST, f.dist)
      goal.current.has = true
      adj.current.x = -f.cx
      adj.current.y = -f.cy
      const max = Math.max(MAX_DIST, f.dist * 1.5)
      if (c) c.maxDistance = max
      setMaxDist(max)
    }
    goal.current.ox = fx + adj.current.x
    goal.current.oy = fy + adj.current.y
    const instant = !framed.current || performance.now() - mountedAt.current < 1200
    if (instant) {
      framed.current = true
      if (!userMoved.current && goal.current.has) {
        offset.copy(camera.position).sub(tgt)
        if (offset.lengthSq() < 1e-6) offset.set(0, 22, 21)
        offset.setLength(goal.current.dist)
        camera.position.copy(tgt).add(offset)
        c?.update()
      }
      applyOffset(goal.current.ox, goal.current.oy, W, H)
    } else {
      camera.updateProjectionMatrix()
    }
    lastPos.copy(camera.position)
    lastTarget.copy(tgt)
  }, [camera, size.width, size.height, insets])

  useFrame((_, delta) => {
    const c = ref.current
    if (!c) return
    const dt = Math.min(delta, 0.1)

    // Focus ease (#286). Our own writes are recorded as the "last" pose so the gesture check below doesn't count them.
    const f = focus.current
    if (f.anim) {
      const a = f.anim
      const k = a.dur <= 0 ? 1 : (performance.now() - a.t0) / a.dur
      const e = easeInOut(k)
      c.target.lerpVectors(a.ft, a.tt, e)
      camera.position.lerpVectors(a.fp, a.tp, e)
      c.update()
      lastPos.copy(camera.position)
      lastTarget.copy(c.target)
      if (k >= 1) {
        f.anim = null
        a.done?.()
      }
    }
    const focusing = f.home !== null || f.anim !== null

    // Orbit/zoom/pan deltas since we last wrote the camera (our own writes are excluded) add up while a gesture is
    // running or settling (damping); a click or tap's few px of jitter stays under the thresholds.
    const g = gesture.current
    if (framed.current && (!userMoved.current || focusing) && (g.active || performance.now() < g.until)) {
      offset.copy(camera.position).sub(c.target)
      prevOff.copy(lastPos).sub(lastTarget)
      const len = offset.length()
      const plen = prevOff.length()
      if (len > 1e-6 && plen > 1e-6) {
        g.angle += offset.angleTo(prevOff)
        g.dist += Math.abs(len - plen) / plen
      }
      g.target += c.target.distanceTo(lastTarget)
      if (g.angle > MOVED_ANGLE || g.dist > MOVED_DIST || g.target > MOVED_TARGET) {
        userMoved.current = true
        // the user took over while focused: stop easing, and don't come back on deselect
        if (focusing) {
          f.userTook = true
          f.anim = null
        }
      }
    }

    // Smooth re-framing when the free area changes: ease the distance (until the user takes over) and the centring.
    if (framed.current && goal.current.has) {
      const k = 1 - Math.exp(-6 * dt)
      if (!userMoved.current && !focusing) {
        offset.copy(camera.position).sub(c.target)
        const len = offset.length()
        const dd = goal.current.dist - len
        if (Math.abs(dd) > 0.004 && len > 1e-6) {
          offset.setLength(Math.abs(dd) < 0.02 ? goal.current.dist : len + dd * k)
          camera.position.copy(c.target).add(offset)
        }
      }
      const ex = goal.current.ox - curOff.current.x
      const ey = goal.current.oy - curOff.current.y
      if (Math.abs(ex) > 0.01 || Math.abs(ey) > 0.01) {
        const snap = Math.abs(ex) < 0.3 && Math.abs(ey) < 0.3
        applyOffset(snap ? goal.current.ox : curOff.current.x + ex * k, snap ? goal.current.oy : curOff.current.y + ey * k, size.width, size.height)
      }
    }

    // Keep the look-at point over the station; shift the camera by the same amount.
    const cx = MathUtils.clamp(c.target.x, B.minX, B.maxX)
    const cz = MathUtils.clamp(c.target.z, B.minZ, B.maxZ)
    const cy = MathUtils.clamp(c.target.y, 0, 2)
    const ox = cx - c.target.x
    const oy = cy - c.target.y
    const oz = cz - c.target.z
    if (ox !== 0 || oy !== 0 || oz !== 0) {
      c.target.set(cx, cy, cz)
      camera.position.x += ox
      camera.position.y += oy
      camera.position.z += oz
    }
    lastPos.copy(camera.position)
    lastTarget.copy(c.target)
  })

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={TARGET0}
      enableDamping
      zoomToCursor
      dampingFactor={0.09}
      rotateSpeed={0.7}
      panSpeed={0.9}
      zoomSpeed={0.8}
      screenSpacePanning={false}
      minPolarAngle={MathUtils.degToRad(20)}
      maxPolarAngle={MathUtils.degToRad(70)}
      minDistance={MIN_DIST}
      maxDistance={maxDist}
      touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      onStart={() => {
        const g = gesture.current
        g.active = true
        g.angle = g.dist = g.target = 0
      }}
      onEnd={() => {
        const g = gesture.current
        g.active = false
        g.until = performance.now() + GESTURE_TAIL_MS
      }}
    />
  )
}
