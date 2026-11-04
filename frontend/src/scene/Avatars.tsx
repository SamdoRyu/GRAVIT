// One Avatar per crew member with a pod, plus short-lived "leaving" ghosts for removed members.
// Members without a pod (the 8 seats are full) are not in 3D (CONTRACTS.md 「10」 책상 자리가 없는 팀원).
import { useCallback, useReducer, useRef } from 'react'
import type { Id, Member } from '../data/types'
import { useOffice } from '../store'
import { Avatar } from './Avatar'
import { stationFor } from './stationSeats'

export function Avatars() {
  const members = useOffice((s) => s.members)
  const status = useOffice((s) => s.status)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const { seats } = stationFor(members)

  const known = useRef(new Map<Id, { member: Member; seat: number }>())
  const ghosts = useRef(new Map<Id, { member: Member; seat: number }>())
  const spawn = useRef(new Map<Id, 'target' | 'entrance'>())
  const firstBatch = useRef(true)

  // Members present in the first loaded workspace appear in place; later arrivals fade in at their pod.
  for (const id of seats.keys()) {
    if (!spawn.current.has(id)) spawn.current.set(id, firstBatch.current ? 'target' : 'entrance')
    ghosts.current.delete(id)
  }
  if (status === 'ready') firstBatch.current = false

  // Removed members keep their avatar mounted (same key) so it can fade out.
  for (const [id, k] of known.current) {
    if (!seats.has(id) && !ghosts.current.has(id)) ghosts.current.set(id, k)
  }
  known.current = new Map([...seats].map(([id, seat]) => [id, { member: members[id], seat }]))

  const onGone = useCallback((id: Id) => {
    if (ghosts.current.delete(id)) {
      spawn.current.delete(id)
      bump()
    }
  }, [])

  const list = [...known.current.values(), ...ghosts.current.values()]
  return (
    <>
      {list.map(({ member, seat }) => (
        <Avatar key={member.id} member={member} seat={seat} spawn={spawn.current.get(member.id) ?? 'target'} leaving={ghosts.current.has(member.id)} onGone={onGone} />
      ))}
    </>
  )
}
