// 사무실별 행성 색 (#277 — 팀 결정 2026-11-09). 같은 정거장 모델을 쓰는 사무실들을 배경 행성 · 대기 빛 · 성운 색으로 구분한다.
// 시각 구분용이라 색에 뜻(진행 · 순위)은 없다. 정거장을 비추는 조명은 바꾸지 않는다(정거장 · 아바타 · 배지 가독성). 소유: C.
//
// 짝짓기(A안): 이 계정이 들어갈 수 있는 사무실 목록을 ID 순으로 줄 세워 6개씩 묶고, 묶음마다 6색을 섞은 순서(6! = 720가지 중
// 하나 — 묶음 번호의 해시로 고른다)를 차례로 준다. 그래서 내 사무실 6개까지는 색이 겹치지 않고, 같은 계정이면 어느 컴퓨터에서
// 열어도 같은 색이다. 새 사무실은 ID가 커서 줄 끝에 붙으니 이미 있던 사무실의 색은 그대로다. 목록을 아직 못 읽었거나 목록에
// 없으면 ID 끝의 숫자(서비스 전체 순번)를 줄 번호로 써서 같은 규칙으로 고른다. three를 모르는 순수 계산이다.

export interface SkyPalette {
  /** 이름(테스트 · 디버그용) */
  name: string
  /** 행성 줄무늬 5색 — 밝은 쪽부터 */
  planet: readonly [number, number, number, number, number]
  /** 행성을 감싼 대기 빛 */
  halo: number
  /** 멀리 깔린 성운 6덩이(StationSky의 성운 자리 순서) */
  nebula: readonly [number, number, number, number, number, number]
  /** 목록 등에 붙이는 작은 색 점 */
  swatch: number
}

/** 0번은 확정 시안의 색 그대로. 나머지는 그 파스텔 톤에 맞춰 채도를 낮췄다(조명을 받으면 진해지니까) */
export const SKY_PALETTES: readonly SkyPalette[] = [
  {
    name: '라벤더',
    planet: [0xffe3cf, 0xf6b9b0, 0xe7a3c0, 0xc4a2dc, 0x9f8ad0],
    halo: 0xf7c1d9,
    nebula: [0x6a55b0, 0x2f8f96, 0x8d5aa8, 0xc36f9a, 0x5a6fd0, 0x2f8f96],
    swatch: 0xb08fd8,
  },
  {
    name: '민트',
    planet: [0xeafaf0, 0xc3f0df, 0xa3e0d4, 0x86c9c4, 0x72aab4],
    halo: 0xa6f0dc,
    nebula: [0x2f8f96, 0x3a6fb0, 0x2a9a84, 0x5ab0a0, 0x4a6fd0, 0x6a55b0],
    swatch: 0x4fb3a8,
  },
  {
    name: '코랄',
    planet: [0xfef0e8, 0xfed2c2, 0xf6b4a7, 0xe99a9d, 0xd48b9a],
    halo: 0xffc4b8,
    nebula: [0xb0556a, 0x8f5aa8, 0xc3704f, 0xd0806a, 0x6a55b0, 0x2f8f96],
    swatch: 0xec8f88,
  },
  {
    name: '하늘',
    planet: [0xe9f3fe, 0xc6dffe, 0xa7c7f3, 0x91ade6, 0x8193d0],
    halo: 0xa9d0ff,
    nebula: [0x3a5ad0, 0x2f8f96, 0x5a6fd0, 0x6a8fe0, 0x6a55b0, 0x2f8fb6],
    swatch: 0x6e9be6,
  },
  {
    name: '모래',
    planet: [0xfef9e8, 0xfbefc5, 0xf4e2aa, 0xead193, 0xd6bc86],
    halo: 0xfff0b0,
    nebula: [0x9a8a40, 0x6a55b0, 0xb0a050, 0xc3b06a, 0x5a6fd0, 0x2f8f96],
    swatch: 0xe2c35a,
  },
  {
    name: '장미',
    planet: [0xfee7f1, 0xf8c4dd, 0xeba6cb, 0xd38ebb, 0xb47cad],
    halo: 0xffb0d8,
    nebula: [0xa04a90, 0x6a55b0, 0xc0508a, 0xd070a0, 0x5a6fd0, 0x2f8f96],
    swatch: 0xd2669f,
  },
]

const N = SKY_PALETTES.length

/** 32비트 정수 섞기(murmur3 마무리) — 묶음 번호 · 문자열에서 고르게 퍼진 수를 얻는다 */
function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return mix(h)
}

/** 묶음 번호 → 6색을 섞은 순서(0 ~ 5의 순열). 같은 묶음 번호면 늘 같은 순서 */
export function blockOrder(block: number): number[] {
  let k = mix((block + 1) * 0x9e3779b1) % 720 // 6! 가지 중 하나
  const left = Array.from({ length: N }, (_, i) => i)
  const out: number[] = []
  for (let f = N - 1; f >= 0; f--) {
    let fact = 1
    for (let i = 2; i <= f; i++) fact *= i
    const idx = Math.floor(k / fact)
    k %= fact
    out.push(left.splice(idx, 1)[0])
  }
  return out
}

/** ID 끝의 숫자(서버 내부 번호 · mock "ws_3"의 3). 없으면 null */
function trailingNumber(id: string): number | null {
  const m = /(\d+)$/.exec(id)
  return m ? Number(m[1]) : null
}

/** 사무실 ID 줄 세우기 — 끝 숫자가 있으면 숫자로, 아니면 문자열로 */
export function compareWorkspaceIds(a: string, b: string): number {
  const na = trailingNumber(a)
  const nb = trailingNumber(b)
  if (na !== null && nb !== null && na !== nb) return na - nb
  return a < b ? -1 : a > b ? 1 : 0
}

/** 줄 번호(0부터) → 팔레트 번호 */
function paletteAt(position: number): number {
  return blockOrder(Math.floor(position / N))[position % N]
}

/**
 * 사무실의 팔레트 번호. `accessible`은 이 계정이 들어갈 수 있는 사무실 ID들(순서 상관없음) — 아직 모르면 null.
 * 목록에 있으면 그 안의 줄 번호로, 없으면 ID 끝 숫자(없으면 ID 해시)로 고른다.
 */
export function skyPaletteIndex(workspaceId: string, accessible: readonly string[] | null): number {
  if (accessible && accessible.includes(workspaceId)) {
    const sorted = [...new Set(accessible)].sort(compareWorkspaceIds)
    return paletteAt(sorted.indexOf(workspaceId))
  }
  const n = trailingNumber(workspaceId)
  return paletteAt(n !== null && n > 0 ? n - 1 : hashString(workspaceId) % 600)
}

export const skyPaletteFor = (workspaceId: string, accessible: readonly string[] | null): SkyPalette => SKY_PALETTES[skyPaletteIndex(workspaceId, accessible)]
