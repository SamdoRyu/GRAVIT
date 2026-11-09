// 사무실별 행성 색 (#277) — 팔레트 · 짝짓기(A안). 내 사무실 6개까지는 겹치지 않고, 같은 목록이면 늘 같은 색.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SKY_PALETTES, blockOrder, compareWorkspaceIds, skyPaletteIndex } from '../../src/theme/station/skyPalette'

const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `ws_${from + i}`)
const isPermutation = (p: number[]) => [...p].sort().join() === '0,1,2,3,4,5'

describe('skyPalette — 팔레트', () => {
  it('6개이고, 0번은 확정 시안의 행성 색 그대로', () => {
    assert.equal(SKY_PALETTES.length, 6)
    assert.deepEqual(SKY_PALETTES[0].planet, [0xffe3cf, 0xf6b9b0, 0xe7a3c0, 0xc4a2dc, 0x9f8ad0])
    assert.equal(new Set(SKY_PALETTES.map((p) => p.name)).size, 6)
    for (const p of SKY_PALETTES) assert.equal(p.nebula.length, 6)
  })
})

describe('skyPalette — 묶음마다 섞은 순서', () => {
  it('어느 묶음이든 6색을 한 번씩 쓰는 순서이고, 같은 묶음은 늘 같은 순서', () => {
    for (let b = 0; b < 50; b++) {
      assert.ok(isPermutation(blockOrder(b)), `묶음 ${b}`)
      assert.deepEqual(blockOrder(b), blockOrder(b))
    }
  })

  it('묶음마다 순서가 섞인다(모두 같은 순서가 아니다)', () => {
    const seen = new Set(Array.from({ length: 30 }, (_, b) => blockOrder(b).join()))
    assert.ok(seen.size > 10)
  })
})

describe('skyPalette — 짝짓기(A안: 내가 들어갈 수 있는 사무실 목록)', () => {
  it('내 사무실 6개는 모두 다른 색 — 다른 팀 사무실이 사이에 껴 번호가 띄엄띄엄이어도', () => {
    const mine = ['ws_3', 'ws_40', 'ws_41', 'ws_99', 'ws_120', 'ws_7']
    const got = mine.map((id) => skyPaletteIndex(id, mine))
    assert.equal(new Set(got).size, 6)
  })

  it('7 ~ 12번째도 그 6개끼리는 모두 다른 색', () => {
    const mine = ids(12)
    assert.equal(new Set(mine.slice(6).map((id) => skyPaletteIndex(id, mine))).size, 6)
  })

  it('목록을 어떤 순서로 받아도 같은 색 · 새 사무실(더 큰 ID)이 붙어도 이미 있던 사무실 색은 그대로', () => {
    const mine = ['ws_5', 'ws_2', 'ws_9']
    const before = mine.map((id) => skyPaletteIndex(id, mine))
    assert.deepEqual(
      mine.map((id) => skyPaletteIndex(id, [...mine].reverse())),
      before,
    )
    assert.deepEqual(
      mine.map((id) => skyPaletteIndex(id, [...mine, 'ws_30'])),
      before,
    )
  })

  it('목록을 아직 모르거나 목록에 없으면 ID 끝 숫자로 같은 규칙 — ws_1 ~ ws_6은 모두 다른 색', () => {
    assert.equal(new Set(ids(6).map((id) => skyPaletteIndex(id, null))).size, 6)
    assert.equal(skyPaletteIndex('ws_4', null), skyPaletteIndex('ws_4', ['ws_1', 'ws_2']))
    // 목록이 ws_1 ~ ws_n 그대로면 목록을 읽기 전과 뒤의 색이 같다 — 읽는 순간 색이 바뀌지 않는다
    assert.deepEqual(
      ids(6).map((id) => skyPaletteIndex(id, ids(6))),
      ids(6).map((id) => skyPaletteIndex(id, null)),
    )
  })

  it('숫자가 없는 ID도 팔레트 범위 안에서 늘 같은 색', () => {
    const a = skyPaletteIndex('demo', null)
    assert.ok(a >= 0 && a < 6)
    assert.equal(skyPaletteIndex('demo', null), a)
  })

  it('줄 세우기는 끝 숫자 기준(ws_10이 ws_9 뒤)', () => {
    assert.deepEqual(['ws_10', 'ws_9', 'ws_1'].sort(compareWorkspaceIds), ['ws_1', 'ws_9', 'ws_10'])
  })
})
