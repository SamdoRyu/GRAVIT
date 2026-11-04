// 승무원(스페이) 팔레트 스왑 — 짙은 남색 부분만 팀원 색으로 바꿔 최대 8명을 색으로 구분한다. 소유: C.
// 마스크는 따로 그린 이미지가 아니라 원본 텍스처의 색에서 셰이더가 계산한다(채도가 높고 어두운 남색만 고른다).
// 시안 텍스처 파일은 고치지 않는다. 계약: 아바타 색은 팀원 구분 용도로 자유롭게(CONTRACTS.md 「10」) — v1 MemberDto에
// 색이 없으므로 자리 번호(deskIndex 0~7)마다 색 하나를 쓴다.
import { Color, type MeshStandardMaterial } from 'three'

/**
 * deskIndex → 팀원 색. 0~3은 시안 포드 K · L · P · C의 색, 4~7은 그와 구별되는 색.
 * 원본 남색처럼 어두운 쪽에 그늘이 지도록 셰이더가 원본 밝기를 곱한다.
 */
export const CREW_PALETTE = ['#5fc4b8', '#f29a52', '#b39ae6', '#f2a7b8', '#f2cf5b', '#7fc76a', '#5f9ef2', '#e8665e'] as const

export function crewColor(deskIndex: number): string {
  return CREW_PALETTE[((deskIndex % CREW_PALETTE.length) + CREW_PALETTE.length) % CREW_PALETTE.length]
}

/**
 * 남색 판별 기준(HSV, 0~1). 몸통의 연한 회보라(채도 낮음) · 램프의 밝은 하늘색(색상이 다르고 밝음) ·
 * 눈 · 볼 · 입(색상이 다르거나 거의 검정)은 빠진다. 경계는 smoothstep으로 부드럽게 섞는다.
 */
export const ACCENT = {
  /** 색상 중심 228° ± 폭 */
  hue: 228 / 360,
  hueWidth: 22 / 360,
  hueSoft: 8 / 360,
  satMin: 0.3,
  satSoft: 0.1,
  valueMax: 0.72,
  valueSoft: 0.08,
  /** 거의 검정인 눈동자 · 테두리는 남색 기운이 있어도 두지 않는다 */
  valueMin: 0.18,
  /** 원본 남색의 대표 밝기 — 이 밝기에서 팀원 색이 그대로 나온다 */
  valueRef: 0.54,
} as const

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
    if (h < 0) h += 1
  }
  return [h, max > 1e-6 ? d / max : 0, max]
}

/** 남색 정도(0~1). 셰이더와 같은 식 — 테스트와 조정용 */
export function accentWeight(r: number, g: number, b: number): number {
  const [h, s, v] = rgbToHsv(r, g, b)
  const dh = Math.abs(h - ACCENT.hue)
  const hueW = 1 - smoothstep(ACCENT.hueWidth, ACCENT.hueWidth + ACCENT.hueSoft, Math.min(dh, 1 - dh))
  const satW = smoothstep(ACCENT.satMin - ACCENT.satSoft, ACCENT.satMin, s)
  const valW = (1 - smoothstep(ACCENT.valueMax - ACCENT.valueSoft, ACCENT.valueMax, v)) * smoothstep(ACCENT.valueMin - ACCENT.valueSoft, ACCENT.valueMin, v)
  return hueW * satW * valW
}

const GLSL = /* glsl */ `
uniform vec3 uCrewColor;
vec3 crewRgbToHsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  float h = 0.0;
  if (d > 1e-6) {
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, mx > 1e-6 ? d / mx : 0.0, mx);
}
float crewAccent(vec3 c) {
  vec3 hsv = crewRgbToHsv(c);
  float dh = abs(hsv.x - ${ACCENT.hue.toFixed(5)});
  dh = min(dh, 1.0 - dh);
  float hueW = 1.0 - smoothstep(${ACCENT.hueWidth.toFixed(5)}, ${(ACCENT.hueWidth + ACCENT.hueSoft).toFixed(5)}, dh);
  float satW = smoothstep(${(ACCENT.satMin - ACCENT.satSoft).toFixed(5)}, ${ACCENT.satMin.toFixed(5)}, hsv.y);
  float valW = (1.0 - smoothstep(${(ACCENT.valueMax - ACCENT.valueSoft).toFixed(5)}, ${ACCENT.valueMax.toFixed(5)}, hsv.z))
    * smoothstep(${(ACCENT.valueMin - ACCENT.valueSoft).toFixed(5)}, ${ACCENT.valueMin.toFixed(5)}, hsv.z);
  return hueW * satW * valW;
}
`

/**
 * 재질에 팔레트 스왑을 건다(재질은 팀원마다 따로여야 한다). 원본 텍스처는 linear로 읽는다고 가정한다
 * (Canvas `linear`, 텍스처 NoColorSpace — 시안과 같은 방식). 색은 `setCrewColor`로 바꾼다.
 */
export function applyCrewPalette(material: MeshStandardMaterial, color: string): void {
  const uniform = { value: new Color(color) }
  material.userData.crewColor = uniform
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCrewColor = uniform
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
#ifdef USE_MAP
  {
    float w = crewAccent(sampledDiffuseColor.rgb);
    float shade = crewRgbToHsv(sampledDiffuseColor.rgb).z / ${ACCENT.valueRef.toFixed(5)};
    diffuseColor.rgb = mix(diffuseColor.rgb, uCrewColor * shade, w);
  }
#endif`,
      )
  }
  material.customProgramCacheKey = () => 'crew-palette'
  material.needsUpdate = true
}

export function setCrewColor(material: MeshStandardMaterial, color: string): void {
  const u = material.userData.crewColor as { value: Color } | undefined
  u?.value.set(color)
}
