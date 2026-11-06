// 지금 연 v1 사무실의 StationScene을 읽는 hook. 소유: C.
import { useOffice } from '../store'
import { stationSceneFor, type StationScene } from './stationScene'

/** 아직 Snapshot을 읽기 전이면 null */
export function useStationScene(): StationScene | null {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  // 보는 사람이 대기 칸에서 바꾼 판 배치(#197) — 바꾸면 판이 다시 놓인다
  const deckOrder = useOffice((s) => s.requirementDeckOrder)
  return snapshot ? stationSceneFor(snapshot, deckOrder) : null
}
