// One Avatar per crew member of the open v1 office with a pod, plus short-lived "leaving" ghosts for members who left.
// Members without a pod (removed, or the 8 pods are full) are not in 3D (CONTRACTS.md 「10」 책상 자리가 없는 팀원).
// A meeting attendee (SceneModel placeRole meeting) sits at a bridge seat; when the meeting starts or ends, the members
// whose place changed move together, 0.15 s apart in pod order, along the tubes (CONTRACTS.md 「10」 아바타 이동 연출).
import { useCallback, useMemo, useReducer, useRef } from 'react'
import type { Id, MemberDto } from '../data/types'
import { bridgeSeat, crewSpot, EXIT_SPOT } from '../theme/station/spots'
import { Avatar, type CrewMove } from './Avatar'
import type { PlaceRole } from './model/types'
import { useStationScene } from './useStationScene'

/** Seconds between the members who move in the same update (CONTRACTS.md 「10」). */
const MOVE_STAGGER_S = 0.15

interface Seated {
  member: MemberDto
  seat: number
}

interface Placed {
  role: PlaceRole
  move: CrewMove
}

export function Avatars() {
  const scene = useStationScene()
  const [, bump] = useReducer((n: number) => n + 1, 0)

  const known = useRef(new Map<Id, Seated>())
  const ghosts = useRef(new Map<Id, Seated>())
  const spawn = useRef(new Map<Id, 'target' | 'entrance'>())
  // Each member's place role and the move that took them there — kept so a re-render does not restart the move.
  const placed = useRef(new Map<Id, Placed>())
  const firstBatch = useRef(true)

  const blocked = useMemo(() => new Set(scene?.entities.filter((e) => e.kind === 'avatar' && e.highlight === 'blocked').map((e) => e.refId)), [scene])

  const onGone = useCallback((id: Id) => {
    if (ghosts.current.delete(id)) {
      spawn.current.delete(id)
      placed.current.delete(id)
      bump()
    }
  }, [])

  if (!scene) return null
  const { crew, seats, meetingSeats, layout } = scene

  // Members present in the first loaded snapshot appear in place; later arrivals fade in at their pod.
  for (const m of crew) {
    if (!spawn.current.has(m.id)) spawn.current.set(m.id, firstBatch.current ? 'target' : 'entrance')
    ghosts.current.delete(m.id)
  }
  firstBatch.current = false

  // Where each crew member belongs now; a member whose role changed gets a new move with the tube route from the old one.
  const changed: { id: Id; seat: number; role: PlaceRole; prev: PlaceRole | null }[] = []
  for (const m of crew) {
    const role: PlaceRole = meetingSeats.has(m.id) ? 'meeting' : `desk:${m.id}`
    const prev = placed.current.get(m.id)
    if (prev?.role !== role) changed.push({ id: m.id, seat: seats.get(m.id) ?? 0, role, prev: prev?.role ?? null })
  }
  changed.sort((a, b) => a.seat - b.seat)
  let order = 0
  for (const c of changed) {
    const seat = meetingSeats.get(c.id)
    const spot = c.role === 'meeting' && seat !== undefined ? bridgeSeat(seat) : (crewSpot(c.seat, true) ?? EXIT_SPOT)
    const trail = c.prev ? layout.route?.(c.prev, c.role) ?? [] : []
    placed.current.set(c.id, { role: c.role, move: { spot, trail, delay: c.prev ? MOVE_STAGGER_S * order++ : 0 } })
  }

  // Members who left keep their avatar mounted (same key) so it can fade out.
  for (const [id, k] of known.current) {
    if (!seats.has(id) && !ghosts.current.has(id)) ghosts.current.set(id, k)
  }
  known.current = new Map(crew.map((m) => [m.id, { member: m, seat: seats.get(m.id) ?? 0 }]))

  const list = [...known.current.values(), ...ghosts.current.values()]
  return (
    <>
      {list.map(({ member, seat }) => (
        <Avatar
          key={member.id}
          member={member}
          seat={seat}
          move={placed.current.get(member.id)?.move ?? { spot: EXIT_SPOT, trail: [], delay: 0 }}
          blocked={blocked.has(member.id)}
          spawn={spawn.current.get(member.id) ?? 'target'}
          leaving={ghosts.current.has(member.id)}
          onGone={onGone}
        />
      ))}
    </>
  )
}
