// Command-bridge (meeting room) status layer: calm "in session" glow + sign, "안건 N" tag when idle, and the agenda drop highlight.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MeshBasicMaterial, type Group } from 'three'
import { isOpen } from '../data/selectors'
import { ongoingMeeting, useOffice } from '../store'
import { PALETTE } from '../theme'
import { BRIDGE, WORLD_SCALE } from '../theme/station/geometry'
import { noRaycast } from './runtime'
import { SceneHtml } from './shared'
import { AGENDA_VISIBLE } from './slots'

// The bridge in world units: centre, deck and table-top heights, and the deck radius.
const CX = BRIDGE.x * WORLD_SCALE
const CZ = BRIDGE.z * WORLD_SCALE
const FLOOR_Y = BRIDGE.floorY * WORLD_SCALE
const TABLE_Y = BRIDGE.tableTopY * WORLD_SCALE
const DECK_R = (BRIDGE.radius - 0.3) * WORLD_SCALE
const TABLE_R = 3.0 * WORLD_SCALE
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
function RoomLabel({ title, startedAt, agendaCount }: { title: string | null; startedAt: string; agendaCount: number }) {
  const minutes = useElapsedMinutes(startedAt)
  const live = title !== null
  return (
    <group position={[CX, live ? 3.4 : 2.2, CZ]}>
      <SceneHtml center zIndexRange={[0, 0]} pointerEvents="none">
        {live ? (
          <div style={{ ...pill, padding: '4px 11px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: PALETTE.accent, flex: 'none' }} />
            {title} · {minutes}분
          </div>
        ) : agendaCount > 0 ? (
          <div style={{ ...pill, padding: '2px 8px', font: '600 11px var(--font, sans-serif)' }}>안건 {agendaCount}
            {agendaCount > AGENDA_VISIBLE ? ` · +${agendaCount - AGENDA_VISIBLE}` : ''}
          </div>
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

/** Drop-target highlight while a drag would put the task on the agenda (same style as desk drops). */
function AgendaDrop() {
  const hot = useOffice((s) => s.dropTarget?.kind === 'agenda')
  if (!hot) return null
  return (
    <group>
      <mesh position={[CX, TABLE_Y + 0.012, CZ]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3} raycast={noRaycast}>
        <circleGeometry args={[TABLE_R, 48]} />
        <meshBasicMaterial color={PALETTE.dropOk} transparent opacity={0.5} depthWrite={false} />
      </mesh>
      <mesh position={[CX, FLOOR_Y + 0.03, CZ]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3} raycast={noRaycast}>
        <circleGeometry args={[DECK_R, 48]} />
        <meshBasicMaterial color={PALETTE.dropOk} transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function MeetingRoomState() {
  const meeting = useOffice((s) => ongoingMeeting(s.meetings))
  const agendaCount = useOffice((s) => {
    let n = 0
    for (const id in s.tasks) {
      const t = s.tasks[id]
      if (t.onAgenda === true && isOpen(t)) n++
    }
    return n
  })
  return (
    <>
      <SessionGlow on={!!meeting} />
      <RoomLabel title={meeting ? meeting.title : null} startedAt={meeting?.startedAt ?? ''} agendaCount={agendaCount} />
      <AgendaDrop />
    </>
  )
}
