// 선택 빛 번짐(#305)에 어느 재질이 번지는지 정하는 표. 소유: C.
// 기본: 더하기(AdditiveBlending) 재질 — 빛 무리 · 불꽃 · 빛 줄기 · 입자 — 만 번진다. 벽 · 행성 같은 보통 재질은 번지지 않는다.
// 그 밖에 번질 것(콘솔 화면 · 청록 띠 같은 발광 면)은 glowing()으로 넣고, 하늘의 더하기 재질(행성 대기 · 성운 · 별똥별)은
// noGlow()로 뺀다 — 하늘까지 번지면 행성이 뿌옇게 날아간다.
import { AdditiveBlending, type Material } from 'three'

const include = new WeakSet<Material>()
const exclude = new WeakSet<Material>()
const gains = new WeakMap<Material, number>()

/** 더하기 재질이 아니어도 번지게 한다(발광 면) */
export function glowing<T extends Material>(m: T): T {
  include.add(m)
  return m
}

/** 더하기 재질이어도 번지지 않게 한다(하늘) */
export function noGlow<T extends Material>(m: T): T {
  exclude.add(m)
  return m
}

/**
 * 번짐에 들어가는 세기를 줄인다(0~1) — 화면에 보이는 밝기는 그대로, 번짐만 약하게. 번짐용 그리기 동안 opacity를 곱한다
 * (직접 쓴 셰이더 재질은 opacity 유니폼을 쓰면 같은 방식으로 줄어든다).
 */
export function glowGain<T extends Material>(m: T, gain: number): T {
  gains.set(m, gain)
  return m
}

/** 번짐에 들어가는 세기(기본 1) */
export function bloomGain(m: Material): number {
  return gains.get(m) ?? 1
}

/** 이 재질이 빛 번짐에 들어가는가 */
export function blooms(m: Material): boolean {
  if (exclude.has(m)) return false
  return include.has(m) || m.blending === AdditiveBlending
}
