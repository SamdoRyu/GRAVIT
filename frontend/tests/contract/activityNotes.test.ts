// 사무실 3D 활동 메모지 — SceneModel · 콘솔 책상 위 자리 (#173 — FR-ACT-03). v1 mock Snapshot을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { ActivityNote, WorkspaceSnapshot } from '../../src/data/types'
import { buildSceneModel } from '../../src/scene/model/buildSceneModel'
import { stationSceneOf } from '../../src/scene/stationScene'
import { POD, PODS, WORLD_SCALE } from '../../src/theme/station/geometry'
import { COMM_CONSOLE, MEMOS_PER_CONSOLE, memoSpot, podConsole } from '../../src/theme/station/memoSpots'

const load = (workspaceId: string) =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load(workspaceId)

const note = (id: string, authorMemberId: string, kind: ActivityNote['kind'] = 'planning'): ActivityNote => ({ id, authorMemberId, kind, confirmedAt: '2026-11-05T01:00:00Z' })

describe('SceneModel — 활동 메모지', () => {
  it('확인된 활동마다 activity:<id> 하나 — 자리는 작성자 책상, 배지는 유형 하나뿐(시간 · 내용 없음)', async () => {
    const snap = await load('ws_1')
    const author = snap.members.find((m) => m.removedAt === null && m.deskIndex !== null)!
    const model = buildSceneModel({ ...snap, activityNotes: [note('n_1', author.id, 'research')] })
    assert.deepEqual(
      model.filter((e) => e.kind === 'activity'),
      [{ key: 'activity:n_1', kind: 'activity', refId: 'n_1', placeRole: `desk:${author.id}`, badges: ['research'] }],
    )
  })

  it('작성자에게 책상 자리가 없으면(빠진 팀원 · 자리 없는 팀원) 게시판', async () => {
    const snap = await load('ws_1')
    const removed = snap.members.find((m) => m.removedAt !== null)!
    const deskless = { ...snap.members[0], id: 'm_deskless', deskIndex: null, removedAt: null }
    const model = buildSceneModel({ ...snap, members: [...snap.members, deskless], activityNotes: [note('n_r', removed.id), note('n_d', deskless.id)] })
    assert.deepEqual(model.filter((e) => e.kind === 'activity').map((e) => e.placeRole), ['board', 'board'])
  })

  it('포드 번호가 정거장 포드 수를 넘는 작성자의 메모지도 게시판(StationScene)', async () => {
    const snap = await load('ws_1')
    const far = { ...snap.members[0], id: 'm_far', deskIndex: 8, removedAt: null }
    const scene = stationSceneOf({ ...snap, members: [...snap.members, far], activityNotes: [note('n_far', far.id)] } as WorkspaceSnapshot)
    assert.equal(scene.entities.find((e) => e.key === 'activity:n_far')?.placeRole, 'board')
  })

  it('메모지는 원본 이슈 · PR의 자리를 바꾸지 않는다', async () => {
    const snap = await load('ws_1')
    const roles = (s: WorkspaceSnapshot) => buildSceneModel(s).filter((e) => e.kind !== 'activity').map((e) => [e.key, e.placeRole])
    const author = snap.members.find((m) => m.removedAt === null)!
    assert.deepEqual(roles({ ...snap, activityNotes: [note('n_1', author.id), note('n_2', author.id)] }), roles({ ...snap, activityNotes: [] }))
  })
})

describe('memoSpots — 콘솔 책상 위 자리', () => {
  it('포드마다 콘솔이 있고, 메모지 자리는 그 포드 바닥 사각형 안 · 책상 높이', () => {
    PODS.forEach((pod, i) => {
      const c = podConsole(i)!
      for (let k = 0; k < MEMOS_PER_CONSOLE; k++) {
        const s = memoSpot(c, k)
        const along = pod.axis === 'x' ? s.x / WORLD_SCALE - pod.x : s.z / WORLD_SCALE - pod.z
        const across = pod.axis === 'x' ? s.z / WORLD_SCALE - pod.z : s.x / WORLD_SCALE - pod.x
        assert.ok(Math.abs(along) <= POD.length / 2 && Math.abs(across) <= POD.radius, `pod ${i} memo ${k}`)
        assert.ok(Math.abs(s.y / WORLD_SCALE - (POD.deckY + 1.115)) < 1e-9)
      }
    })
    assert.equal(podConsole(8), null)
  })

  it('한 콘솔의 메모지 자리는 서로 겹치지 않는다(간격 0.5)', () => {
    for (const c of [podConsole(0)!, podConsole(1)!, COMM_CONSOLE]) {
      const spots = Array.from({ length: MEMOS_PER_CONSOLE }, (_, k) => memoSpot(c, k))
      for (let a = 0; a < spots.length; a++)
        for (let b = a + 1; b < spots.length; b++) {
          const d = Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z) / WORLD_SCALE
          assert.ok(d >= 0.49, `${a}-${b}: ${d}`)
        }
    }
  })
})
