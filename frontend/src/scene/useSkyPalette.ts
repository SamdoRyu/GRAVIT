// 지금 사무실의 행성 팔레트 (#277 — theme/station/skyPalette.ts의 A안). 이 계정이 들어갈 수 있는 사무실 목록을 한 번 읽어
// 짝짓기에 쓰고, 읽기 전에는 사무실 ID만으로 고른다. 목록에 없는 사무실로 옮기면(새로 연 사무실 등) 다시 읽는다. 소유: C.
import { useEffect, useRef, useState } from 'react'
import { useSession } from '../session'
import { useOffice } from '../store'
import { SKY_PALETTES, skyPaletteFor, type SkyPalette } from '../theme/station/skyPalette'

export function useSkyPalette(): SkyPalette {
  const workspaceId = useOffice((s) => s.office?.workspaceId ?? null)
  const [accessible, setAccessible] = useState<string[] | null>(null)
  // 같은 사무실 때문에 목록을 두 번 읽지 않는다(목록에 없어도 다시 묻지 않게)
  const askedFor = useRef(new Set<string>())

  useEffect(() => {
    if (!workspaceId || accessible?.includes(workspaceId) || askedFor.current.has(workspaceId)) return
    askedFor.current.add(workspaceId)
    // 응답은 늦게 와도 그대로 쓴다 — 목록은 사무실과 상관없이 이 계정의 것이고, 같은 사무실로는 다시 묻지 않으니까
    void useSession
      .getState()
      .listWorkspaces()
      .then((list) => {
        if (list) setAccessible(list.map((w) => w.id))
      })
  }, [workspaceId, accessible])

  return workspaceId ? skyPaletteFor(workspaceId, accessible) : SKY_PALETTES[0]
}
