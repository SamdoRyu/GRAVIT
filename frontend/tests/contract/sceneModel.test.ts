// SceneModel 단위 테스트 (CONTRACTS.md 「8」 · 「9」 프론트 계약 테스트) — v1 mock Snapshot을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { WorkspaceSnapshot } from '../../src/data/types'
import { BADGE, buildSceneModel, isSeated } from '../../src/scene/model/buildSceneModel'

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

describe('SceneModel — 이슈 · PR 상태별 자리 (#11)', () => {
  const roleOf = (snap: WorkspaceSnapshot, key: string) => buildSceneModel(snap).find((e) => e.key === key)?.placeRole

  it('이슈: 닫힘 → done, 담당자 없음 → backlog, 담당자 있음 → 대표 담당자(첫 번째)의 책상', async () => {
    const snap = await load('ws_1')
    const base = snap.tasks[0]
    const seatedIds = snap.members.filter(isSeated).map((m) => m.id)
    const [first, second] = seatedIds
    const tasks = [
      { ...base, id: 'x_closed', state: 'closed' as const, closedReason: 'completed' as const, assigneeMemberIds: [first] },
      { ...base, id: 'x_none', state: 'open' as const, closedReason: null, assigneeMemberIds: [] },
      { ...base, id: 'x_two', state: 'open' as const, closedReason: null, assigneeMemberIds: [second, first] },
    ]
    const s = { ...snap, tasks }
    assert.equal(roleOf(s, 'task:x_closed'), 'done')
    assert.equal(roleOf(s, 'task:x_none'), 'backlog')
    assert.equal(roleOf(s, 'task:x_two'), `desk:${second}`, '대표 담당자 = assigneeMemberIds[0]')
  })

  it('대표 담당자에게 책상 자리가 없으면(빠진 팀원 · 자리 없는 팀원) backlog', async () => {
    const snap = await load('ws_1')
    const removed = snap.members.find((m) => m.removedAt !== null)
    assert.ok(removed)
    const deskless = { ...snap.members[0], id: 'm_deskless', deskIndex: null, removedAt: null }
    const base = { ...snap.tasks[0], state: 'open' as const, closedReason: null }
    const s = {
      ...snap,
      members: [...snap.members, deskless],
      tasks: [
        { ...base, id: 'x_removed', assigneeMemberIds: [removed.id] },
        { ...base, id: 'x_deskless', assigneeMemberIds: [deskless.id, snap.members[0].id] },
      ],
    }
    assert.equal(roleOf(s, 'task:x_removed'), 'backlog')
    assert.equal(roleOf(s, 'task:x_deskless'), 'backlog', '두 번째 담당자에게 자리가 있어도 대표 담당자 기준')
  })

  it('PR: 열림 · Draft → review, 머지 · 닫힘 → done. Draft · 미병합 종료 · 계획 안 함 배지', async () => {
    const snap = await load('ws_1')
    const pr = snap.submissions[0]
    const submissions = (['open', 'draft', 'merged', 'closed'] as const).map((state) => ({ ...pr, id: `p_${state}`, state }))
    const notPlanned = { ...snap.tasks[0], id: 'x_np', state: 'closed' as const, closedReason: 'not_planned' as const }
    const model = buildSceneModel({ ...snap, submissions, tasks: [notPlanned] })
    const get = (key: string) => model.find((e) => e.key === key)
    assert.deepEqual(
      ['open', 'draft', 'merged', 'closed'].map((st) => [get(`submission:p_${st}`)?.placeRole, get(`submission:p_${st}`)?.badges]),
      [
        ['review', []],
        ['review', [BADGE.draft]],
        ['done', []],
        ['done', [BADGE.unmergedClosed]],
      ],
    )
    assert.equal(get('submission:p_open')?.kind, 'pr')
    assert.deepEqual(get('task:x_np')?.badges, [BADGE.notPlanned])
  })

  it('안건 · 요구사항 연결이 있어도 원본 이슈 · PR의 자리는 그대로다', async () => {
    const snap = await load('ws_1')
    const before = buildSceneModel(snap).filter((e) => e.kind === 'issue' || e.kind === 'pr')
    const t = snap.tasks.find((x) => x.state === 'open')
    const p = snap.submissions[0]
    assert.ok(t && p)
    const agenda = (id: string, source: { type: 'task' | 'submission'; id: string }) => ({
      id,
      kind: source.type === 'task' ? ('issue' as const) : ('pr' as const),
      status: 'confirmed' as const,
      title: '안건',
      background: null,
      tried: null,
      unresolvedReason: null,
      source,
      evaluationRoundId: null,
      raisedByMemberId: snap.members[0].id,
      raisedAt: '2026-11-05T03:00:00Z',
      decision: null,
      feedbackRequested: false,
      feedbackRequestedAt: null,
      instructorFeedbacks: [],
    })
    const after = buildSceneModel({
      ...snap,
      agendaItems: [agenda('a_1', { type: 'task', id: t.id }), agenda('a_2', { type: 'submission', id: p.id })],
      requirementLinks: [{ id: 'l_1', requirementId: 'r_1', taskId: t.id, linkedAt: '2026-11-05T03:00:00Z' }],
    }).filter((e) => e.kind === 'issue' || e.kind === 'pr')
    assert.deepEqual(after, before)
  })
})
