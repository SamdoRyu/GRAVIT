// 선택한 대상으로 카메라 이동 (#286) — 다가갈 자리 계산.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FOCUS_ZOOM, easeInOut, focusPose } from '../../src/scene/cameraFocus'

const sub = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v - b[i])
const len = (v: number[]) => Math.hypot(...v)
const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9)

describe('cameraFocus — 다가갈 자리', () => {
  const camera = [60, 29, 56] as const
  const target = [12, 1, 8] as const
  const at = [5, 1.2, 15] as const

  it('바라볼 점은 대상, 보는 방향(각도)은 그대로', () => {
    const p = focusPose(camera, target, at)
    assert.deepEqual(p.target, [...at])
    const before = sub(camera, target)
    const after = sub(p.position, p.target)
    const nb = before.map((v) => v / len(before))
    const na = after.map((v) => v / len(after))
    assert.ok(near(na, nb))
  })

  it('거리는 지금의 FOCUS_ZOOM배, 최소 거리 아래로는 가지 않는다', () => {
    const d0 = len(sub(camera, target))
    const p = focusPose(camera, target, at)
    assert.ok(Math.abs(len(sub(p.position, p.target)) - d0 * FOCUS_ZOOM) < 1e-9)
    const q = focusPose(camera, target, at, 0.01, 7)
    assert.ok(Math.abs(len(sub(q.position, q.target)) - 7) < 1e-9)
  })

  it('카메라와 바라보는 점이 겹쳐도 NaN 없이 대상 자리', () => {
    const p = focusPose([1, 2, 3], [1, 2, 3], at)
    assert.ok(p.position.every(Number.isFinite))
  })

  it('easeInOut은 0에서 시작해 1에서 끝나고 범위를 넘지 않는다', () => {
    assert.equal(easeInOut(0), 0)
    assert.equal(easeInOut(1), 1)
    assert.equal(easeInOut(2), 1)
    assert.equal(easeInOut(-1), 0)
    assert.ok(easeInOut(0.25) < 0.25 && easeInOut(0.75) > 0.75)
  })
})
