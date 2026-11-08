// 사무실 3D 활동 메모지 — SceneModel (#173 — FR-ACT-03). v1 mock Snapshot을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { ActivityNote, WorkspaceSnapshot } from '../../src/data/types'
import { buildSceneModel } from '../../src/scene/model/buildSceneModel'
import { stationSceneOf } from '../../src/scene/stationScene'

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
