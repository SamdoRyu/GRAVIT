// One cube bot: a rounded cube in the member color with a dark screen face (two eye dots) and a floating
// status diamond. Presence decides where it is: its crew pod, the bridge, or gone. The station's tubes are smaller than
// the crew, so it never walks between rooms: it fades out where it was and fades in at the new spot
// (CONTRACTS.md 「10」 아바타 이동 연출 — the light trail between the two comes with the meeting issues).
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import { Color, MathUtils, MeshStandardMaterial, OctahedronGeometry, type Group } from 'three'
import type { Id, Member, Presence } from '../data/types'
import { SIGNAL_META } from '../data/insights'
import { useOffice } from '../store'
import { PALETTE } from '../theme'
import { bridgeSeat, crewSpot, EXIT_SPOT, type Spot } from '../theme/station/spots'
import { roundedGeo, SceneHtml, UNIT_CYL, UNIT_SPHERE, useDynamicLayer } from './shared'
import { parseSignalKey, signalKeyOf, useToday } from './signals'
import { avatarLive, clickSlop, setCursor, type AvatarLive } from './runtime'

const CUBE = 0.55
const BODY = roundedGeo(CUBE, CUBE, CUBE, 0.16)
const SCREEN = roundedGeo(0.42, 0.22, 0.05, 0.06)
const EYE_BAR = roundedGeo(0.075, 0.03, 0.03, 0.012)
const GEM = new OctahedronGeometry(1, 0)
const HOVER_Y = 0.12
const SEAT_Y = 0.02
/** Seconds to fade out at the old spot, and again to fade in at the new one. */
const FADE_S = 0.4
const WHITE = new Color('#ffffff')
const BLACK = new Color('#000000')

function lerpAngle(a: number, b: number, k: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  else if (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

/** Where a crew member is. `seat` = their pod number; members without a pod are not in 3D (the caller skips them). */
function spotFor(seat: number, presence: Presence): Spot {
  switch (presence) {
    case 'working':
      return crewSpot(seat, true) ?? EXIT_SPOT
    case 'break':
      return crewSpot(seat, false) ?? EXIT_SPOT
    case 'meeting':
      return bridgeSeat(seat)
    default:
      return EXIT_SPOT
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
  sit: number
  alpha: number
  /** Last alpha written to the materials. */
  shown: number
  gone: boolean
}

function newWalker(): Walker {
  return { init: false, x: 0, y: 0, z: 0, yaw: 0, spot: null, next: null, sit: 0, alpha: 0, shown: -1, gone: false }
}

function place(w: Walker, spot: Spot) {
  w.spot = spot
  w.x = spot.x
  w.y = spot.y
  w.z = spot.z
  w.yaw = spot.facing
  w.sit = spot.seated ? 1 : 0
}

interface AvatarProps {
  member: Member
  /** The member's crew pod (deskIndex). */
  seat: number
  /** 'target' = already there when the office loads; 'entrance' = fades in (a member who just joined). */
  spawn: 'target' | 'entrance'
  leaving: boolean
  onGone: (id: Id) => void
}

export const Avatar = memo(function Avatar({ member, seat, spawn, leaving, onGone }: AvatarProps) {
  const id = member.id
  const presence: Presence = leaving ? 'away' : member.presence
  // Only identity, seat and presence decide where the bot is; other edits must not make it stand up.
  const spot = useMemo(() => spotFor(seat, presence), [seat, presence])

  // Signal is memoized on tasks/member changes; nothing is computed per frame.
  const today = useToday()
  const signalKey = useOffice((s) => signalKeyOf(member, s.tasks, today))
  const signal = useMemo(() => parseSignalKey(signalKey), [signalKey])
  const signalColor = SIGNAL_META[signal.level].color
  const alert = signal.level === 'alert'

  const selected = useOffice((s) => s.selection?.kind === 'member' && s.selection.id === id)
  const hovered = useOffice((s) => s.hover?.kind === 'member' && s.hover.id === id)
  const dropHot = useOffice((s) => s.dropTarget?.kind === 'member' && s.dropTarget.id === id)

  const variant = member.avatarVariant
  const mats = useMemo(() => {
    const mk = (c: Color) => new MeshStandardMaterial({ color: c, roughness: 0.55 })
    const base = new Color(member.color)
    return {
      body: mk(base),
      screen: mk(base.clone().lerp(BLACK, 0.72)),
      eye: new MeshStandardMaterial({ color: WHITE.clone().lerp(base, 0.06), roughness: 0.4, emissive: WHITE.clone().lerp(base, 0.2), emissiveIntensity: 0.35 }),
      nub: mk(base.clone().lerp(WHITE, 0.35)),
      gem: new MeshStandardMaterial({ color: new Color(SIGNAL_META.ok.color), roughness: 0.3, emissive: new Color(SIGNAL_META.ok.color), emissiveIntensity: 0.5 }),
    }
  }, [member.color])
  useEffect(() => {
    mats.gem.color.set(signalColor)
    mats.gem.emissive.set(signalColor)
  }, [mats, signalColor])
  useEffect(() => {
    walkerReset.current = true
    return () => {
      Object.values(mats).forEach((m) => m.dispose())
    }
  }, [mats])

  const root = useRef<Group>(null)
  const lift = useRef<Group>(null)
  const float = useRef<Group>(null)
  const gem = useRef<Group>(null)
  const eyes = useRef<Group>(null)
  useDynamicLayer(root)
  const walker = useRef<Walker>(newWalker())
  const walkerReset = useRef(false)
  const live = useRef<AvatarLive>({ x: 0, y: 0, z: 0, visible: false })
  const seed = useMemo(() => {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
    return h / 997
  }, [id])

  useEffect(() => {
    const l = live.current
    avatarLive.set(id, l)
    return () => {
      if (avatarLive.get(id) === l) avatarLive.delete(id)
      const s = useOffice.getState()
      if (s.hover?.kind === 'member' && s.hover.id === id) s.setHover(null)
    }
  }, [id])

  useEffect(() => {
    if (lift.current) lift.current.rotation.order = 'YXZ'
  }, [])

  useFrame((state, delta) => {
    const g = root.current
    if (!g) return
    const dt = Math.min(delta, 0.1)
    const w = walker.current
    if (walkerReset.current) {
      walkerReset.current = false
      w.shown = -1 // new materials: re-apply the opacity
    }

    if (!w.init) {
      w.init = true
      place(w, spot)
      w.alpha = spawn === 'entrance' ? 0 : 1
    }
    if (w.next !== spot) {
      w.next = spot
      w.gone = false
    }

    // ---- transit: fade out where it is, move while invisible, fade in at the new spot ----
    const travelling = w.spot !== w.next
    if (travelling && w.next) {
      // A tab in the background arrives at once instead of replaying the fade.
      w.alpha = delta > 1 ? 0 : Math.max(0, w.alpha - dt / FADE_S)
      if (w.alpha === 0) place(w, w.next)
    } else if (!w.spot?.exit) {
      w.alpha = Math.min(1, w.alpha + dt / FADE_S)
    }
    if (w.spot) w.yaw = lerpAngle(w.yaw, w.spot.facing, 1 - Math.exp(-6 * dt))
    const sitGoal = w.spot?.seated ? 1 : 0
    w.sit += (sitGoal - w.sit) * (1 - Math.exp(-7 * dt))

    const alpha = w.spot?.exit ? 0 : w.alpha
    if (Math.abs(alpha - w.shown) > 0.004) {
      w.shown = alpha
      const tr = alpha < 0.999
      for (const m of Object.values(mats)) {
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

    // ---- pose ----
    g.position.set(w.x, w.y, w.z)
    const t = state.clock.elapsedTime
    const working = presence === 'working' && w.sit > 0.5
    const idleBob = Math.sin(t * 1.5 + seed * 6) * 0.012 * (1 - w.sit)
    const y = MathUtils.lerp(HOVER_Y + idleBob, SEAT_Y, w.sit)
    const breathe = Math.sin(t * 1.8 + seed * 9) * 0.01 * w.sit
    const l = lift.current
    if (l) {
      l.position.y = y
      l.rotation.y = w.yaw
      l.scale.y = 1 + breathe
    }
    const e = eyes.current
    if (e) {
      // blink every few seconds; glance around slightly while working
      const period = 3.6 + seed * 2.4
      const bp = (t + seed * 10) % period
      e.scale.y = bp < 0.12 ? 0.12 : 1
      e.position.x = working ? Math.sin(t * 0.55 + seed * 7) * 0.035 : 0
      e.position.y = working ? Math.sin(t * 0.37 + seed * 3) * 0.012 : 0
    }
    if (float.current) float.current.position.y = y + CUBE + 0.42 + Math.sin(t * 1.3 + seed * 5) * 0.04
    if (gem.current) {
      gem.current.rotation.y += dt * 0.9
      if (alert) mats.gem.emissiveIntensity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2 + seed * 4))
      else if (mats.gem.emissiveIntensity !== 0.5) mats.gem.emissiveIntensity = 0.5
    }
  })

  const ringColor = dropHot ? PALETTE.dropOk : selected ? PALETTE.selection : hovered ? PALETTE.hover : null
  const showTag = selected || hovered || dropHot
  const tagText = signal.reasons.length ? `${member.name} · ${signal.reasons.join(', ')}` : `${member.name} · ${SIGNAL_META.ok.label}`
  const roundEyes = variant % 2 === 0
  const eyeY = CUBE / 2 + 0.03

  return (
    <group
      ref={root}
      onPointerOver={(e) => {
        if (!live.current.visible || useOffice.getState().drag) return
        e.stopPropagation()
        useOffice.getState().setHover({ kind: 'member', id })
        setCursor('pointer')
      }}
      onPointerOut={() => {
        const s = useOffice.getState()
        if (s.hover?.kind === 'member' && s.hover.id === id) s.setHover(null)
        if (!s.drag) setCursor('')
      }}
      onClick={(e) => {
        if (!live.current.visible) return
        e.stopPropagation()
        if (e.delta > clickSlop(e)) return
        useOffice.getState().select({ kind: 'member', id })
      }}
    >
      <group ref={lift}>
        <mesh geometry={BODY} material={mats.body} position={[0, CUBE / 2, 0]} castShadow receiveShadow />
        <mesh geometry={SCREEN} material={mats.screen} position={[0, eyeY, CUBE / 2 - 0.008]} />
        <group ref={eyes}>
          {roundEyes ? (
            <>
              <mesh geometry={UNIT_SPHERE} material={mats.eye} position={[-0.09, eyeY, CUBE / 2 + 0.022]} scale={[0.035, 0.035, 0.02]} />
              <mesh geometry={UNIT_SPHERE} material={mats.eye} position={[0.09, eyeY, CUBE / 2 + 0.022]} scale={[0.035, 0.035, 0.02]} />
            </>
          ) : (
            <>
              <mesh geometry={EYE_BAR} material={mats.eye} position={[-0.09, eyeY, CUBE / 2 + 0.03]} rotation={[0, 0, Math.PI / 2]} />
              <mesh geometry={EYE_BAR} material={mats.eye} position={[0.09, eyeY, CUBE / 2 + 0.03]} rotation={[0, 0, Math.PI / 2]} />
            </>
          )}
        </group>
        {variant % 3 === 0 && (
          <>
            <mesh geometry={UNIT_CYL} material={mats.nub} position={[0, CUBE + 0.04, 0]} scale={[0.012, 0.08, 0.012]} />
            <mesh geometry={UNIT_SPHERE} material={mats.nub} position={[0, CUBE + 0.095, 0]} scale={0.032} castShadow />
          </>
        )}
      </group>

      {/* soft ring on the floor for selection / hover / drop */}
      {ringColor && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={dropHot ? 1.3 : 1} renderOrder={4}>
          <ringGeometry args={[0.5, 0.62, 40]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.65} depthWrite={false} />
        </mesh>
      )}

      {/* status diamond (plumbob): slow spin, gentle bob, color = signal */}
      <group ref={float}>
        <group ref={gem}>
          <mesh geometry={GEM} material={mats.gem} scale={[0.09, 0.15, 0.09]} castShadow />
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
  )
})
