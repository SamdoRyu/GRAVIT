// SceneModel 단위 테스트 (CONTRACTS.md 「8」 · 「9」 프론트 계약 테스트) — v1 mock Snapshot을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { WorkspaceSnapshot } from '../../src/data/types'
import { buildSceneModel, isSeated } from '../../src/scene/model/buildSceneModel'

const load = (workspaceId: string) =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load(workspaceId)

const avatars = (snapshot: WorkspaceSnapshot) => buildSceneModel(snapshot).filter((e) => e.kind === 'avatar')

describe('SceneModel — 팀원 아바타 (#10)', () => {
  it('자리가 있는 지금 팀원마다 아바타 하나, 공간 역할은 desk:<memberId>', async () => {
    const snap = await load('ws_1')
    const seated = snap.members.filter((m) => m.removedAt === null && m.deskIndex !== null)
    assert.ok(seated.length > 0, 'seed에 자리가 있는 팀원이 있어야 한다')
    assert.deepEqual(
      avatars(snap),
      seated.map((m) => ({ key: `member:${m.id}`, kind: 'avatar', refId: m.id, placeRole: `desk:${m.id}`, badges: [] })),
    )
  })

  it('빠진 팀원은 아바타가 없다', async () => {
    const snap = await load('ws_1')
    const removed = snap.members.filter((m) => m.removedAt !== null)
    assert.ok(removed.length > 0, 'seed에 빠진 팀원이 있어야 한다')
    const refs = new Set(avatars(snap).map((e) => e.refId))
    for (const m of removed) assert.ok(!refs.has(m.id), `빠진 팀원 ${m.id}`)
  })

  it('자리가 없는 지금 팀원(8자리가 다 참)은 아바타가 없다', async () => {
    const snap = await load('ws_1')
    const deskless = { ...snap.members[0], id: 'm_deskless', deskIndex: null, removedAt: null }
    const result = avatars({ ...snap, members: [...snap.members, deskless] })
    assert.ok(!result.some((e) => e.refId === deskless.id))
    assert.equal(isSeated(deskless), false)
  })

  it('화면 키가 겹치지 않는다 (두 사무실)', async () => {
    for (const ws of ['ws_1', 'ws_2']) {
      const keys = buildSceneModel(await load(ws)).map((e) => e.key)
      assert.equal(new Set(keys).size, keys.length, ws)
    }
  })

  it('순수 함수 — 입력을 바꾸지 않고 같은 입력에 같은 결과', async () => {
    const snap = await load('ws_1')
    const before = structuredClone(snap)
    assert.deepEqual(buildSceneModel(snap), buildSceneModel(snap))
    assert.deepEqual(snap, before)
  })
})
