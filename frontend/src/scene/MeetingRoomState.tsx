// Command-bridge (meeting room) status layer of the v1 office: calm "in session" glow + sign while a meeting runs,
// "안건 N" (confirmed agenda items) when idle, and the drop highlight while an issue / PR is dragged over it (#30 · #26).
// While a meeting runs, a teal hologram beam rises from the table with light rings drifting up it, the agenda shapes circle
// the table slowly and the rest of the station's lights dim a little (#299 — theme/station/ambient.tsx bridgeMood).
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, ShaderMaterial, SpriteMaterial, TorusGeometry, type Group, type Mesh } from 'three'
import { useOffice } from '../store'
import { PALETTE } from '../theme'
import { bridgeMood } from '../theme/station/bridgeMood'
import { glowTex } from '../theme/station/parts'
import { BRIDGE, WORLD_SCALE } from '../theme/station/geometry'
import { cargoDrag, noRaycast } from './runtime'
import { SceneHtml } from './shared'

// The bridge in world units: centre, deck and table-top heights, and the deck radius.
const CX = BRIDGE.x * WORLD_SCALE
const CZ = BRIDGE.z * WORLD_SCALE
const FLOOR_Y = BRIDGE.floorY * WORLD_SCALE
const DECK_R = (BRIDGE.radius - 0.3) * WORLD_SCALE
const EDGE = 0.07

const pill = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.96)',
  boxShadow: '0 2px 10px rgba(30,45,90,0.16)',
  font: '600 12px var(--font, sans-serif)',
  color: '#1b2333',
  whiteSpace: 'nowrap',
  userSelect: 'none',
} as const

/** Minutes since an ISO time, refreshed every 15 s (never per frame). */
function useElapsedMinutes(startedAt: string): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [startedAt])
  const start = Date.parse(startedAt)
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 60_000)) : 0
}

/**
 * One label for the room, mounted for the whole session (drei's Html misbehaves when mounted/unmounted often):
 * the "in session" sign while a meeting runs, the "안건 N" tag when idle with agenda items, nothing otherwise.
 */
function RoomLabel({ live, startedAt, agendaCount }: { live: boolean; startedAt: string; agendaCount: number }) {
  const minutes = useElapsedMinutes(startedAt)
  return (
    <group position={[CX, live ? 3.4 : 2.2, CZ]}>
      <SceneHtml center zIndexRange={[0, 0]} pointerEvents="none">
        {live ? (
          <div style={{ ...pill, padding: '4px 11px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: PALETTE.accent, flex: 'none' }} />
            회의 중 · {minutes}분
          </div>
        ) : agendaCount > 0 ? (
          <div style={{ ...pill, padding: '2px 8px', font: '600 11px var(--font, sans-serif)' }}>안건 {agendaCount}</div>
        ) : (
          <div />
        )}
      </SceneHtml>
    </group>
  )
}

/** Soft accent wash + thin ring on the bridge deck; eases in and out with the session. */
function SessionGlow({ on }: { on: boolean }) {
  const group = useRef<Group>(null)
  const k = useRef(0)
  const wash = useMemo(() => new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0, depthWrite: false }), [])
  const edge = useMemo(() => new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0, depthWrite: false }), [])
  useEffect(
    () => () => {
      wash.dispose()
      edge.dispose()
    },
    [wash, edge],
  )

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const goal = on ? 1 : 0
    if (Math.abs(goal - k.current) > 0.002) k.current += (goal - k.current) * (1 - Math.exp(-4 * Math.min(delta, 0.05)))
    else k.current = goal
    const vis = k.current > 0.005
    if (g.visible !== vis) g.visible = vis
    if (!vis) return
    const breathe = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 1.2)
    wash.opacity = k.current * (0.07 + 0.04 * breathe)
    edge.opacity = k.current * (0.26 + 0.14 * breathe)
  })

  return (
    <group ref={group} visible={false}>
      <mesh position={[CX, FLOOR_Y + 0.012, CZ]} rotation={[-Math.PI / 2, 0, 0]} material={wash} renderOrder={1} raycast={noRaycast}>
        <circleGeometry args={[DECK_R, 48]} />
      </mesh>
      <mesh position={[CX, FLOOR_Y + 0.014, CZ]} rotation={[-Math.PI / 2, 0, 0]} material={edge} renderOrder={1} raycast={noRaycast}>
        <ringGeometry args={[DECK_R - EDGE, DECK_R, 64]} />
      </mesh>
    </group>
  )
}

const TABLE_Y = BRIDGE.tableTopY * WORLD_SCALE
/** Hologram size (world): beam radius at the base / top, height; rings drifting up it */
const HOLO = { r0: 2.1 * WORLD_SCALE, r1: 0.9 * WORLD_SCALE, h: 9 * WORLD_SCALE, rings: 4, ringS: 3.2 }
/** How fast the agenda shapes circle the table (rad/s at full meeting) */
const AGENDA_SPIN = 0.22
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Beam: bright at the table, fading upward, with faint scan lines; additive teal. */
function beamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(0x8ff0e0) }, k: { value: 0 }, t: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float k; uniform float t;
      varying vec2 vUv;
      void main() {
        float fade = pow(1.0 - vUv.y, 1.3);
        float scan = 0.78 + 0.22 * sin(vUv.y * 70.0 - t * 3.0);
        float a = k * fade * scan * 0.85;
        gl_FragColor = vec4(color * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
}

/**
 * Meeting in session (#299): hologram beam over the table with rings drifting up, and the shared bridge mood (dim the rest of
 * the station's lights, circle the agenda shapes). Eases in and out with the session; with reduced motion the beam stays still.
 */
function SessionHologram({ on }: { on: boolean }) {
  const group = useRef<Group>(null)
  const rings = useRef<(Mesh | null)[]>([])
  const k = useRef(0)
  const still = useMemo(() => reducedMotion(), [])
  const res = useMemo(
    () => ({
      beam: beamMaterial(),
      ringGeo: new TorusGeometry(1, 0.05, 6, 48).rotateX(Math.PI / 2),
      glow: new SpriteMaterial({ map: glowTex(), color: 0x8ff0e0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
      ringMats: Array.from({ length: HOLO.rings }, () => new MeshBasicMaterial({ color: 0xbffcf2, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })),
    }),
    [],
  )
  useEffect(
    () => () => {
      res.beam.dispose()
      res.ringGeo.dispose()
      res.ringMats.forEach((m) => m.dispose())
      res.glow.dispose()
      bridgeMood.focus = bridgeMood.spin = 0
    },
    [res],
  )

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(delta, 0.05)
    const goal = on ? 1 : 0
    k.current += (goal - k.current) * (1 - Math.exp(-2.2 * dt))
    if (Math.abs(goal - k.current) < 0.002) k.current = goal
    const kk = k.current
    bridgeMood.focus = kk
    bridgeMood.spin = still ? 0 : kk
    if (!still) {
      bridgeMood.angle += dt * AGENDA_SPIN * kk
      if (bridgeMood.angle > Math.PI) bridgeMood.angle -= Math.PI * 2
    }
    // when the meeting ends the shapes unwind toward their places (at most half a turn)
    if (!on) bridgeMood.angle *= 1 - (1 - Math.exp(-2.2 * dt))
    const vis = kk > 0.005
    if (g.visible !== vis) g.visible = vis
    if (!vis) return
    const t = state.clock.elapsedTime
    res.beam.uniforms.k.value = kk
    res.beam.uniforms.t.value = still ? 0 : t
    g.scale.set(1, 0.15 + 0.85 * kk, 1)
    for (let i = 0; i < HOLO.rings; i++) {
      const m = rings.current[i]
      if (!m) continue
      const u = still ? (i + 0.5) / HOLO.rings : (t / HOLO.ringS + i / HOLO.rings) % 1
      const r = HOLO.r0 + (HOLO.r1 - HOLO.r0) * u
      m.position.y = u * HOLO.h
      m.scale.setScalar(r)
      res.ringMats[i].opacity = kk * 0.95 * Math.sin(u * Math.PI)
    }
    res.glow.opacity = kk * (0.55 + (still ? 0 : 0.12 * Math.sin(t * 1.6)))
  })

  return (
    <group ref={group} position={[CX, TABLE_Y, CZ]} visible={false}>
      <mesh position={[0, HOLO.h / 2, 0]} material={res.beam} renderOrder={2} raycast={noRaycast}>
        <cylinderGeometry args={[HOLO.r1, HOLO.r0, HOLO.h, 40, 1, true]} />
      </mesh>
      {/* 탁자 위 빛 번짐 */}
      <sprite material={res.glow} position={[0, 0.25, 0]} scale={[HOLO.r0 * 4, HOLO.r0 * 4, 1]} raycast={noRaycast} />
      {res.ringMats.map((m, i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el
          }}
          geometry={res.ringGeo}
          material={m}
          renderOrder={2}
          raycast={noRaycast}
        />
      ))}
    </group>
  )
}

/**
 * Drop highlight while an issue / PR dragged over the bridge would be raised as an agenda item (#30 · #26). Reads the drag
 * state every frame — nothing re-renders while dragging.
 */
function AgendaDropGlow() {
  const group = useRef<Group>(null)
  const k = useRef(0)
  const mat = useMemo(() => new MeshBasicMaterial({ color: PALETTE.dropOk, transparent: true, opacity: 0, depthWrite: false }), [])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const goal = cargoDrag.key !== null && cargoDrag.overMeeting ? 1 : 0
    k.current += (goal - k.current) * (1 - Math.exp(-12 * Math.min(delta, 0.05)))
    const vis = k.current > 0.01
    if (g.visible !== vis) g.visible = vis
    mat.opacity = k.current * 0.28
  })
  return (
    <group ref={group} visible={false}>
      <mesh position={[CX, FLOOR_Y + 0.03, CZ]} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={3} raycast={noRaycast}>
        <circleGeometry args={[DECK_R, 48]} />
      </mesh>
    </group>
  )
}

export function MeetingRoomState() {
  const startedAt = useOffice((s) => s.office?.snapshot?.meetings.find((m) => m.status === 'ongoing')?.startedAt ?? null)
  const agendaCount = useOffice((s) => s.office?.snapshot?.agendaItems.filter((a) => a.status === 'confirmed').length ?? 0)
  return (
    <>
      <SessionGlow on={startedAt !== null} />
      <SessionHologram on={startedAt !== null} />
      <RoomLabel live={startedAt !== null} startedAt={startedAt ?? ''} agendaCount={agendaCount} />
      <AgendaDropGlow />
    </>
  )
}
