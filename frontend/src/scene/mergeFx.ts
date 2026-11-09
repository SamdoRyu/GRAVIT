// PR 머지 축하(#300)의 알림 통로 — 상자(TaskBox)가 쓰고 입자(MergeBurst)가 읽는다. 소유: C.
// trails = 지금 빛 꼬리를 남기는 상자 키, bursts = 터뜨릴 반짝이(자리 · 터질 시각, ms).

/** 여러 개가 머지되면 반짝이 사이 간격(ms) */
const BURST_GAP_MS = 350

export const mergeFx = {
  trails: new Set<string>(),
  bursts: [] as { x: number; y: number; z: number; at: number }[],
  lastAt: 0,
}

/** 아카이브에 닿은 상자 자리에 반짝이를 줄 세운다 — 앞 반짝이와 간격을 둔다 */
export function celebrateArrival(x: number, y: number, z: number) {
  const now = performance.now()
  const at = Math.max(now, mergeFx.lastAt + BURST_GAP_MS)
  mergeFx.lastAt = at
  mergeFx.bursts.push({ x, y, z, at })
}
