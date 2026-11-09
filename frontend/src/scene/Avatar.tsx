// One crew member of the open v1 office: the confirmed design's 스페이 (Spay) glTF avatar in its crew pod — or at a bridge
// seat while attending a meeting (SceneModel placeRole meeting) — with a floating diamond that turns red while the member has
// a blocked shape (SceneModel highlight 'blocked' — FR-FLOW-02; the fact only, no reason). A member who leaves fades out at
// the exit. The station's tubes are smaller than the crew, so it never walks between rooms (CONTRACTS.md 「10」 아바타 이동
// 연출): it fades out (0.4 s), a dot in its crew colour runs along the tube centre line (ThemeLayout.route — distance
// proportional, at most about 1.8 s), and it fades in at the new spot (0.4 s). Several move 0.15 s apart (the caller's delay).
// With prefers-reduced-motion there is no dot: fade out, fade in.
import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { Color, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, SphereGeometry, type Group, type Material, type Mesh, type Texture } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Id, MemberDto } from '../data/types'
import { useOffice } from '../store'
import { PALETTE } from '../theme'
import { crewEnvironment } from '../theme/station/crewEnvironment'
import { applyCrewPalette, crewColor, setCrewColor } from '../theme/station/crewPalette'
import { EXIT_SPOT, type Spot } from '../theme/station/spots'
import { WORLD_SCALE } from '../theme/station/geometry'
import { useLinearTextures } from './linearTextures'
import type { Vec3 } from './model/types'
import { SceneHtml, useDynamicLayer } from './shared'
import { avatarLive, clickSlop, noRaycast, setCursor, trailLive, type AvatarLive, type TrailLive } from './runtime'

/** Crew avatar from the confirmed design (public/station — read only). Model: height 1, feet at the origin, facing +z. */
export const CREW_MODEL_URL = '/station/models/spay_avatar.glb'
/** World height of a crew member: the design's crew (about 3.1 station units) at WORLD_SCALE. */
const CREW_HEIGHT = 1.3
const CHEER_S = 2
const GEM = new OctahedronGeometry(1, 0)
/** Seconds to fade out at the old spot, and again to fade in at the new one. */
const FADE_S = 0.4
/** Light dot speed along the tubes (station units per second → world) and its longest run (CONTRACTS.md 「10」). */
const TRAIL_SPEED = 22 * WORLD_SCALE
const TRAIL_MAX_S = 1.8
const TRAIL_MIN_S = 0.5
const DOT = new SphereGeometry(0.11, 12, 8)
const HALO = new SphereGeometry(0.26, 12, 8)
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
/** Diamond colours: calm, or blocked (FR-FLOW-02). No per-person workload level (P6). */
const GEM_COLOR = { calm: '#22b07d', blocked: '#e5484d' } as const

useGLTF.preload(CREW_MODEL_URL)

function lerpAngle(a: number, b: number, k: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  else if (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

/**
 * Where a crew member should be and how it gets there — made by the caller (Avatars) only when the member's place changes.
 * `trail` = the tube centre line from the old place to the new (empty: just fade), `delay` = seconds to wait first.
 */
export interface CrewMove {
  spot: Spot
  trail: Vec3[]
  delay: number
}

/** Length of a polyline */
function trailLength(pts: readonly Vec3[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])
  return len
}

/** The point `d` along a polyline */
function pointAt(pts: readonly Vec3[], d: number, out: { x: number; y: number; z: number }) {
  let left = d
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay, az] = pts[i - 1]
    const [bx, by, bz] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay, bz - az)
    if (left <= seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, left / seg) : 1
      out.x = ax + (bx - ax) * k
      out.y = ay + (by - ay) * k
      out.z = az + (bz - az) * k
      return
    }
    left -= seg
  }
}

interface Walker {
  init: boolean
  x: number
  y: number
  z: number
  yaw: number
  /** Where it stands now (it is moved here while invisible). */
  spot: Spot | null
  /** Where it should be; differs from `spot` while fading out. */
  next: Spot | null
  alpha: number
  /** Last alpha written to the materials. */
  shown: number
  gone: boolean
  /** Seconds left before this move starts (stagger) */
  wait: number
  /** The dot's path for this move, and how far along it is (seconds; -1 = not running) */
  trail: Vec3[]
  trailT: number
  trailDur: number
}

function newWalker(): Walker {
  return { init: false, x: 0, y: 0, z: 0, yaw: 0, spot: null, next: null, alpha: 0, shown: -1, gone: false, wait: 0, trail: [], trailT: -1, trailDur: 0 }
}

function place(w: Walker, spot: Spot) {
  w.spot = spot
  w.x = spot.x
  w.y = spot.y
  w.z = spot.z
  w.yaw = spot.facing
}

interface AvatarProps {
  member: MemberDto
  /** The member's crew pod (deskIndex) — its colour */
  seat: number
  /** Where it should be and how it gets there (see CrewMove) */
  move: CrewMove
  /** SceneModel highlight 'blocked': the member has a blocked issue / PR. */
  blocked: boolean
  /** 'target' = already there when the office loads; 'entrance' = fades in (a member who just joined). */
  spawn: 'target' | 'entrance'
  leaving: boolean
  onGone: (id: Id) => void
}

export const Avatar = memo(function Avatar({ member, seat, move, blocked, spawn, leaving, onGone }: AvatarProps) {
  const id = member.id
  /** Hover key: the SceneModel key, so it never matches a demo panel's member id */
  const hoverKey = `member:${id}`
  // Only the move (made when the place changes) and leaving decide where the crew member is; other edits must not move them.
  const spot = leaving ? EXIT_SPOT : move.spot
  const signalColor = blocked ? GEM_COLOR.blocked : GEM_COLOR.calm

  const selected = useOffice((s) => s.officeSelection?.kind === 'member' && s.officeSelection.id === id)
  const hovered = useOffice((s) => s.hover === hoverKey)

  // ---- the glTF crew: one skinned clone per member, with its own materials so each can fade on its own ----
  const gltf = useGLTF(CREW_MODEL_URL)
  const gl = useThree((s) => s.gl)
  const crew = useMemo(() => {
    const env = crewEnvironment(gl)
    const root = cloneSkinned(gltf.scene) as Group
    const materials: Material[] = []
    const textures: (Texture | null)[] = []
    root.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false // a skinned mesh moving away from its bind pose must not be culled
      mesh.raycast = noRaycast // picking uses the simple hit volume below
      const mat = (mesh.material as MeshStandardMaterial).clone()
      applyCrewPalette(mat, crewColor(0))
      mat.envMap = env
      mat.envMapIntensity = 0.7
      textures.push(mat.map)
      mesh.material = mat
      materials.push(mat)
    })
    return { root, materials, textures }
  }, [gltf, gl])
  useLinearTextures(crew.textures)
  // 팀원 색 = 포드 번호의 팔레트 색(남색 부분만 바뀐다)
  useEffect(() => {
    for (const m of crew.materials) setCrewColor(m as MeshStandardMaterial, crewColor(seat))
  }, [crew, seat])
  const gemMat = useMemo(
    () => new MeshStandardMaterial({ color: new Color(GEM_COLOR.calm), roughness: 0.3, emissive: new Color(GEM_COLOR.calm), emissiveIntensity: 0.5 }),
    [],
  )
  const fadeMats = useMemo(() => [...crew.materials, gemMat], [crew, gemMat])
  // The light dot of a move between rooms: crew colour, a soft halo around it
  const dotMats = useMemo(() => {
    const c = new Color(crewColor(seat))
    return { core: new MeshBasicMaterial({ color: c }), halo: new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false }) }
  }, [seat])
  useEffect(
    () => () => {
      dotMats.core.dispose()
      dotMats.halo.dispose()
    },
    [dotMats],
  )
  useEffect(() => {
    gemMat.color.set(signalColor)
    gemMat.emissive.set(signalColor)
  }, [gemMat, signalColor])
  useEffect(() => {
    walker.current.shown = -1 // new materials: re-apply the opacity
    return () => {
      fadeMats.forEach((m) => m.dispose())
    }
  }, [fadeMats])

  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const float = useRef<Group>(null)
  const gem = useRef<Group>(null)
  useDynamicLayer(root)
  const walker = useRef<Walker>(newWalker())
  const dot = useRef<Group>(null)
  const trail = useRef<TrailLive>({ x: 0, y: 0, z: 0, visible: false })
  const live = useRef<AvatarLive>({ x: 0, y: 0, z: 0, visible: false })
  const seed = useMemo(() => {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
    return h / 997
  }, [id])

  // ---- animation: Idle, with a short Cheer when clicked (the design's 반가워하기) ----
  const { actions, mixer } = useAnimations(gltf.animations, body)
  const current = useRef<string | null>(null)
  const cheerUntil = useRef(0)
  const play = useCallback(
    (name: string) => {
      const next = actions[name]
      if (!next || current.current === name) return
      next.reset().setEffectiveWeight(1).fadeIn(0.35).play()
      if (current.current) actions[current.current]?.fadeOut(0.35)
      current.current = name
    },
    [actions],
  )
  useEffect(() => {
    play('Idle')
    mixer.setTime(seed * 3) // crew members don't idle in lockstep
  }, [play, mixer, seed])

  useEffect(() => {
    const l = live.current
    const tl = trail.current
    avatarLive.set(id, l)
    trailLive.set(id, tl)
    return () => {
      if (avatarLive.get(id) === l) avatarLive.delete(id)
      if (trailLive.get(id) === tl) trailLive.delete(id)
      const s = useOffice.getState()
      if (s.hover === hoverKey) s.setHover(null)
    }
  }, [id, hoverKey])

  useFrame((state, delta) => {
    const g = root.current
    if (!g) return
    const dt = Math.min(delta, 0.1)
    const w = walker.current

    if (!w.init) {
      w.init = true
      place(w, spot)
      w.alpha = spawn === 'entrance' ? 0 : 1
    }
    if (w.next !== spot) {
      w.next = spot
      w.gone = false
      w.wait = leaving ? 0 : move.delay
      w.trail = leaving ? [] : move.trail
      w.trailT = -1
    }

    // ---- transit: (wait) → fade out where it is → light dot along the tubes → fade in at the new spot ----
    const travelling = w.spot !== w.next
    const td = trail.current
    if (travelling && w.next) {
      if (delta > 1) {
        // A tab in the background arrives at once instead of replaying the move.
        w.alpha = 0
        w.trailT = -1
        place(w, w.next)
      } else if (w.wait > 0) {
        w.wait -= delta
      } else if (w.trailT >= 0) {
        w.trailT += delta
        pointAt(w.trail, (Math.min(w.trailT, w.trailDur) / w.trailDur) * trailLength(w.trail), td)
        if (w.trailT >= w.trailDur) {
          w.trailT = -1
          place(w, w.next)
        }
      } else {
        w.alpha = Math.max(0, w.alpha - dt / FADE_S)
        if (w.alpha === 0) {
          const len = trailLength(w.trail)
          if (w.trail.length >= 2 && len > 0 && !reducedMotion()) {
            w.trailT = 0
            w.trailDur = Math.min(TRAIL_MAX_S, Math.max(TRAIL_MIN_S, len / TRAIL_SPEED))
            pointAt(w.trail, 0, td)
          } else {
            place(w, w.next)
          }
        }
      }
    } else if (!w.spot?.exit) {
      w.alpha = Math.min(1, w.alpha + dt / FADE_S)
    }
    td.visible = w.trailT >= 0
    const d = dot.current
    if (d) {
      if (d.visible !== td.visible) d.visible = td.visible
      if (td.visible) {
        d.position.set(td.x, td.y, td.z)
        d.scale.setScalar(0.9 + 0.15 * Math.sin(state.clock.elapsedTime * 12))
      }
    }
    if (w.spot) w.yaw = lerpAngle(w.yaw, w.spot.facing, 1 - Math.exp(-6 * dt))

    const alpha = w.spot?.exit ? 0 : w.alpha
    if (Math.abs(alpha - w.shown) > 0.004) {
      w.shown = alpha
      const tr = alpha < 0.999
      for (const m of fadeMats) {
        if (m.transparent !== tr) {
          m.transparent = tr
          m.needsUpdate = true
        }
        m.opacity = alpha
      }
      g.visible = alpha > 0.01
    }
    live.current.x = w.x
    live.current.y = w.y
    live.current.z = w.z
    live.current.visible = alpha > 0.05

    if (leaving && !travelling && w.spot?.exit && !w.gone) {
      w.gone = true
      onGone(id)
    }

    if (current.current === 'Cheer' && performance.now() > cheerUntil.current) play('Idle')

    // ---- pose ----
    g.position.set(w.x, w.y, w.z)
    if (body.current) body.current.rotation.y = w.yaw
    const t = state.clock.elapsedTime
    if (float.current) float.current.position.y = CREW_HEIGHT + 0.28 + Math.sin(t * 1.3 + seed * 5) * 0.04
    if (gem.current) {
      gem.current.rotation.y += dt * 0.9
      if (blocked) gemMat.emissiveIntensity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2 + seed * 4))
      else if (gemMat.emissiveIntensity !== 0.5) gemMat.emissiveIntensity = 0.5
    }
  })

  const ringColor = selected ? PALETTE.selection : hovered ? PALETTE.hover : null
  const showTag = selected || hovered
  const tagText = blocked ? `${member.displayName} · 막힘` : member.displayName

  return (
    <>
    <group
      ref={root}
      onPointerOver={(e) => {
        if (!live.current.visible) return
        e.stopPropagation()
        useOffice.getState().setHover(hoverKey)
        setCursor('pointer')
      }}
      onPointerOut={() => {
        const s = useOffice.getState()
        if (s.hover === hoverKey) s.setHover(null)
        setCursor('')
      }}
      onClick={(e) => {
        if (!live.current.visible) return
        e.stopPropagation()
        if (e.delta > clickSlop(e)) return
        useOffice.getState().selectInOffice({ kind: 'member', id })
        cheerUntil.current = performance.now() + CHEER_S * 1000
        play('Cheer')
      }}
    >
      <group ref={body} scale={CREW_HEIGHT}>
        <primitive object={crew.root} />
      </group>
      {/* invisible hit volume: hover / click on the crew member */}
      <mesh position={[0, CREW_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.32, 0.32, CREW_HEIGHT, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      {/* soft ring on the deck for selection / hover */}
      {ringColor && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4} raycast={noRaycast}>
          <ringGeometry args={[0.5, 0.62, 40]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.65} depthWrite={false} />
        </mesh>
      )}

      {/* status diamond (plumbob): slow spin, gentle bob, red while blocked */}
      <group ref={float}>
        <group ref={gem}>
          <mesh geometry={GEM} material={gemMat} scale={[0.09, 0.15, 0.09]} castShadow raycast={noRaycast} />
        </group>
        {showTag && (
          <SceneHtml position={[0, 0.34, 0]} center zIndexRange={[0, 0]} pointerEvents="none">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.96)',
                boxShadow: '0 2px 8px rgba(30,45,90,0.16)',
                font: '600 12px var(--font, sans-serif)',
                color: '#1b2333',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: signalColor, flex: 'none' }} />
              {tagText}
            </div>
          </SceneHtml>
        )}
      </group>
    </group>
    {/* the light dot of a move between rooms (world space, outside the moving body) */}
    <group ref={dot} visible={false}>
      <mesh geometry={DOT} material={dotMats.core} raycast={noRaycast} />
      <mesh geometry={HALO} material={dotMats.halo} raycast={noRaycast} />
    </group>
    </>
  )
})
