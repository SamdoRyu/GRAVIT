// 지금 연 v1 사무실의 StationScene을 읽는 hook. 소유: C.
import { useOffice } from '../store'
import { stationSceneFor, type StationScene } from './stationScene'

/** 아직 Snapshot을 읽기 전이면 null */
export function useStationScene(): StationScene | null {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  return snapshot ? stationSceneFor(snapshot) : null
}
