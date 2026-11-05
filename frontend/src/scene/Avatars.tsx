// One Avatar per crew member of the open v1 office with a pod, plus short-lived "leaving" ghosts for members who left.
// Members without a pod (removed, or the 8 pods are full) are not in 3D (CONTRACTS.md 「10」 책상 자리가 없는 팀원).
import { useCallback, useMemo, useReducer, useRef } from 'react'
import type { Id, MemberDto } from '../data/types'
import { Avatar } from './Avatar'
import { useStationScene } from './useStationScene'

interface Seated {
  member: MemberDto
  seat: number
}

export function Avatars() {
  const scene = useStationScene()
  const [, bump] = useReducer((n: number) => n + 1, 0)

  const known = useRef(new Map<Id, Seated>())
  const ghosts = useRef(new Map<Id, Seated>())
  const spawn = useRef(new Map<Id, 'target' | 'entrance'>())
  const firstBatch = useRef(true)

  const blocked = useMemo(() => new Set(scene?.entities.filter((e) => e.kind === 'avatar' && e.highlight === 'blocked').map((e) => e.refId)), [scene])

  const onGone = useCallback((id: Id) => {
    if (ghosts.current.delete(id)) {
      spawn.current.delete(id)
      bump()
    }
  }, [])

  if (!scene) return null
  const { crew, seats } = scene

  // Members present in the first loaded snapshot appear in place; later arrivals fade in at their pod.
  for (const m of crew) {
    if (!spawn.current.has(m.id)) spawn.current.set(m.id, firstBatch.current ? 'target' : 'entrance')
    ghosts.current.delete(m.id)
  }
  firstBatch.current = false

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
          blocked={blocked.has(member.id)}
          spawn={spawn.current.get(member.id) ?? 'target'}
          leaving={ghosts.current.has(member.id)}
          onGone={onGone}
        />
      ))}
    </>
  )
}
