// 스페이 팔레트 스왑 — 남색 판별(셰이더와 같은 식)과 8색 팔레트.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { accentWeight, CREW_PALETTE, crewColor } from '../../src/theme/station/crewPalette'

/** 0~255 → 0~1 */
const w = (r: number, g: number, b: number) => accentWeight(r / 255, g / 255, b / 255)

describe('crewPalette — 남색만 바꾼다', () => {
  it('원본의 짙은 남색(밝은 면 · 그늘진 면)은 바꾼다', () => {
    assert.ok(w(58, 74, 138) > 0.9, '남색')
    assert.ok(w(42, 54, 104) > 0.9, '그늘진 남색')
  })

  it('몸통 회보라 · 램프 하늘색 · 눈 · 볼 · 입 · 흰색은 그대로 둔다', () => {
    const keep: [string, number, number, number][] = [
      ['몸통 회보라', 200, 205, 225],
      ['그늘진 회보라', 150, 156, 180],
      ['램프 하늘색', 90, 200, 240],
      ['눈동자 검정', 12, 12, 20],
      ['볼 분홍', 240, 150, 165],
      ['입 빨강', 140, 30, 40],
      ['흰색', 255, 255, 255],
    ]
    for (const [name, r, g, b] of keep) assert.ok(w(r, g, b) < 0.05, `${name}: ${w(r, g, b).toFixed(3)}`)
  })
})

describe('crewPalette — 팀원 색', () => {
  it('8자리마다 서로 다른 색이 하나씩 있다 (0~3은 시안 포드 색)', () => {
    assert.equal(CREW_PALETTE.length, 8)
    assert.equal(new Set(CREW_PALETTE).size, 8)
    assert.deepEqual(CREW_PALETTE.slice(0, 4), ['#5fc4b8', '#f29a52', '#b39ae6', '#f2a7b8'])
    for (let i = 0; i < 8; i++) assert.equal(crewColor(i), CREW_PALETTE[i])
  })
})
