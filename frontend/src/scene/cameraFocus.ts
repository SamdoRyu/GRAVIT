// 선택한 대상으로 카메라 이동 (#286 — 팀 결정 2026-11-09). 보는 각도는 그대로 두고 대상이 화면 가운데 오도록 다가간다.
// 실제 이동 · 되돌아가기 · 사용자 조작 판정은 CameraRig가 하고, 여기는 "어디로 갈지"만 계산하는 순수 함수다. 소유: C.

export type V3 = readonly [number, number, number]

/** 다가가는 정도 — 지금 거리의 이만큼으로 */
export const FOCUS_ZOOM = 0.65
/** 이동 시간(초) */
export const FOCUS_S = 0.8

/**
 * 대상(at)으로 다가간 카메라 자리와 바라볼 점. 지금 카메라(camera)가 지금 바라보는 점(target)을 보는 방향을 그대로 쓰고,
 * 거리는 지금의 zoom배(minDist 아래로는 가지 않는다).
 */
export function focusPose(camera: V3, target: V3, at: V3, zoom = FOCUS_ZOOM, minDist = 0): { position: [number, number, number]; target: [number, number, number] } {
  const d = [camera[0] - target[0], camera[1] - target[1], camera[2] - target[2]]
  const len = Math.hypot(d[0], d[1], d[2])
  if (len < 1e-9) return { position: [at[0], at[1], at[2]], target: [at[0], at[1], at[2]] }
  const dist = Math.max(minDist, len * zoom)
  const s = dist / len
  return { position: [at[0] + d[0] * s, at[1] + d[1] * s, at[2] + d[2] * s], target: [at[0], at[1], at[2]] }
}

/** 부드러운 시작 · 끝(0 ~ 1) */
export const easeInOut = (k: number) => {
  const x = Math.min(1, Math.max(0, k))
  return x * x * (3 - 2 * x)
}
