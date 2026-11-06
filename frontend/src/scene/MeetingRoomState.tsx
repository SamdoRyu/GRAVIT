// Command-bridge (meeting room) status layer of the v1 office: calm "in session" glow + sign while a meeting runs,
// "안건 N" (confirmed agenda items) when idle, and the drop highlight while an issue / PR is dragged over it (#30 · #26).
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MeshBasicMaterial, type Group } from 'three'
import { useOffice } from '../store'
import { PALETTE } from '../theme'
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
      <RoomLabel live={startedAt !== null} startedAt={startedAt ?? ''} agendaCount={agendaCount} />
      <AgendaDropGlow />
    </>
  )
}
