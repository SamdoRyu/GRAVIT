// v1 Snapshot → 정거장 3D(StationScene · slots) 테스트 (#102 T5-c-2 · #10 · #11). v1 mock Snapshot을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { WorkspaceSnapshot } from '../../src/data/types'
import { computeSlots, DONE_VISIBLE, recentDone, type Slot } from '../../src/scene/slots'
import { podsShown, stationSceneFor, stationSceneOf } from '../../src/scene/stationScene'

const load = (workspaceId: string) =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load(workspaceId)

const iso = (minutes: number) => new Date(Date.UTC(2026, 10, 1) + minutes * 60_000).toISOString()

describe('StationScene — 포드 · 아바타', () => {
  it('포드 0~3은 늘 그리고, 4~7은 앉은 팀원이 있을 때만 그린다', () => {
    assert.deepEqual([...podsShown(new Map())].sort(), [0, 1, 2, 3])
    assert.deepEqual([...podsShown(new Map([['a', 1], ['b', 5]]))].sort(), [0, 1, 2, 3, 5])
  })

  it('자리(deskIndex)가 있는 지금 팀원만 아바타 · 포드가 있다', async () => {
    const snap = await load('ws_1')
    const scene = stationSceneOf(snap)
    const seated = snap.members.filter((m) => m.removedAt === null && m.deskIndex !== null)
    assert.deepEqual(scene.crew.map((m) => m.id), seated.map((m) => m.id))
    assert.deepEqual([...scene.seats], seated.map((m) => [m.id, m.deskIndex]))
    assert.deepEqual(scene.entities.filter((e) => e.kind === 'avatar').map((e) => e.refId), seated.map((m) => m.id))
  })

  it('포드 번호가 정거장 포드 수(8)를 넘는 팀원은 3D에 없고, 그가 대표 담당인 이슈는 도킹 베이로 간다', async () => {
    const snap = await load('ws_1')
    const far = { ...snap.members[0], id: 'm_far', deskIndex: 8, removedAt: null }
    const task = { ...snap.tasks[0], id: 'x_far', state: 'open' as const, closedReason: null, assigneeMemberIds: [far.id] }
    const scene = stationSceneOf({ ...snap, members: [...snap.members, far], tasks: [task] })
    assert.ok(!scene.seats.has(far.id))
    assert.ok(!scene.crew.some((m) => m.id === far.id))
    assert.ok(!scene.entities.some((e) => e.key === `member:${far.id}`))
    assert.equal(scene.entities.find((e) => e.key === 'task:x_far')?.placeRole, 'backlog')
    assert.ok(!scene.pods.has(8))
  })

  it('같은 Snapshot 객체면 같은 결과를 돌려준다', async () => {
    const snap = await load('ws_1')
    assert.equal(stationSceneFor(snap), stationSceneFor(snap))
    assert.notEqual(stationSceneFor({ ...snap }), stationSceneFor(snap))
  })
})

describe('slots — 역할 안의 순서 · 아카이브', () => {
  const slotsOf = (snap: WorkspaceSnapshot, doneAssign = new Map<string, number>(), prev = new Map<string, Slot>()) => {
    const scene = stationSceneOf(snap)
    return computeSlots(scene.entities, snap, scene.layout, doneAssign, prev)
  }

  it('이슈 · PR마다 자리가 하나, 아바타는 없다. 열린 PR은 스캐너(review)', async () => {
    const snap = await load('ws_1')
    const slots = slotsOf(snap)
    const cargo = stationSceneOf(snap).entities.filter((e) => e.key.startsWith('task:') || e.key.startsWith('submission:'))
    const done = cargo.filter((e) => e.placeRole === 'done')
    assert.equal(slots.size, cargo.length - Math.max(0, done.length - DONE_VISIBLE))
    assert.ok(![...slots.keys()].some((k) => k.startsWith('member:')))
    for (const s of snap.submissions.filter((x) => x.state === 'open' || x.state === 'draft')) assert.equal(slots.get(`submission:${s.id}`)?.home, 'review')
  })

  it('같은 포드의 이슈는 Snapshot 순서대로 칸을 채우고, 서로 다른 자리에 놓인다', async () => {
    const snap = await load('ws_1')
    const lead = snap.members.find((m) => m.removedAt === null && m.deskIndex !== null)
    assert.ok(lead)
    const base = { ...snap.tasks[0], state: 'open' as const, closedReason: null, assigneeMemberIds: [lead.id] }
    const tasks = Array.from({ length: 5 }, (_, i) => ({ ...base, id: `x_${i}`, githubIssueNumber: 100 + i }))
    const slots = slotsOf({ ...snap, tasks, submissions: [] })
    const scene = stationSceneOf({ ...snap, tasks, submissions: [] })
    tasks.forEach((t, i) => {
      const s = slots.get(`task:${t.id}`)
      assert.equal(s?.home, 'desk')
      const [x, y, z] = scene.layout.anchor(`desk:${lead.id}`, i)
      assert.deepEqual([s?.x, s?.y, s?.z], [x, y, z])
    })
    const spots = new Set(tasks.map((t) => { const s = slots.get(`task:${t.id}`)!; return `${s.x},${s.y},${s.z}` }))
    assert.equal(spots.size, tasks.length)
  })

  it('아카이브는 최근에 끝난 14개만, 새 것이 와도 남은 것은 자기 칸을 지킨다', async () => {
    const snap = await load('ws_1')
    const base = { ...snap.tasks[0], state: 'closed' as const, closedReason: 'completed' as const }
    const tasks = Array.from({ length: DONE_VISIBLE + 2 }, (_, i) => ({ ...base, id: `d_${i}`, githubIssueNumber: 200 + i, closedAt: iso(i) }))
    const s1 = { ...snap, tasks, submissions: [] }
    const scene1 = stationSceneOf(s1)
    assert.deepEqual(recentDone(scene1.entities, s1).map((e) => e.refId).slice(0, 3), ['d_15', 'd_14', 'd_13'])

    const doneAssign = new Map<string, number>()
    const first = slotsOf(s1, doneAssign)
    assert.equal(first.size, DONE_VISIBLE)
    assert.ok(!first.has('task:d_0') && !first.has('task:d_1'), '가장 오래된 둘은 숨는다')
    const cellOfD5 = doneAssign.get('task:d_5')

    // 하나가 더 끝나면 가장 오래된 것(d_2)이 빠지고, 새 것이 그 빈칸을 쓴다
    const s2 = { ...s1, tasks: [...tasks, { ...base, id: 'd_new', githubIssueNumber: 300, closedAt: iso(100) }] }
    const second = slotsOf(s2, doneAssign, first)
    assert.ok(!second.has('task:d_2'))
    assert.equal(doneAssign.get('task:d_5'), cellOfD5)
    assert.equal(second.get('task:d_5'), first.get('task:d_5'), '안 움직인 자리는 같은 객체')
    assert.ok(second.has('task:d_new'))
  })

  it('PR은 머지(없으면 닫힌) 시각으로 아카이브 순서를 정한다', async () => {
    const snap = await load('ws_1')
    const p = snap.submissions[0]
    const submissions = [
      { ...p, id: 'p_old', state: 'merged' as const, mergedAt: iso(1), closedAt: iso(1) },
      { ...p, id: 'p_closed', state: 'closed' as const, mergedAt: null, closedAt: iso(3) },
      { ...p, id: 'p_new', state: 'merged' as const, mergedAt: iso(2), closedAt: iso(2) },
    ]
    const s = { ...snap, tasks: [], submissions }
    assert.deepEqual(recentDone(stationSceneOf(s).entities, s).map((e) => e.refId), ['p_closed', 'p_new', 'p_old'])
  })
})

describe('slots — 회의실의 안건 모양 (#30 · #26)', () => {
  it('이슈 · PR · 배운 점 · 기타 안건은 회의 탁자 자리(올린 순서), 원본은 제 자리 그대로', async () => {
    const ds = createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') })
    const before = await ds.load('ws_1')
    const t = before.tasks.find((x) => x.state === 'open')!
    const p = before.submissions.find((x) => x.state === 'open')!
    const raise = (kind: 'issue' | 'pr' | 'learning' | 'other', sourceId: string | null, title: string) =>
      ds.createAgendaItem('ws_1', { kind, sourceId, title, background: null, tried: null, unresolvedReason: null })
    const a1 = await raise('issue', t.id, '이슈 안건')
    const a2 = await raise('pr', p.id, 'PR 안건')
    const a3 = await raise('learning', null, '배운 점')
    const a4 = await raise('other', null, '기타')
    const after = await ds.load('ws_1')

    const slotsOf = (snap: WorkspaceSnapshot) => {
      const scene = stationSceneOf(snap)
      return { scene, slots: computeSlots(scene.entities, snap, scene.layout, new Map(), new Map()) }
    }
    const { scene, slots } = slotsOf(after)
    const s1 = slots.get(`agenda:${a1.id}`)
    const s2 = slots.get(`agenda:${a2.id}`)
    assert.equal(s1?.home, 'agenda')
    assert.deepEqual([s1?.x, s1?.y, s1?.z], scene.layout.anchor('meeting', 0))
    assert.deepEqual([s2?.x, s2?.y, s2?.z], scene.layout.anchor('meeting', 1))
    for (const [i, a] of [a3, a4].entries()) {
      const s = slots.get(`agenda:${a.id}`)
      assert.equal(s?.home, 'agenda', a.kind)
      assert.deepEqual([s?.x, s?.y, s?.z], scene.layout.anchor('meeting', 2 + i), a.kind)
      assert.equal(scene.entities.find((e) => e.key === `agenda:${a.id}`)?.kind, a.kind, '모양 = 안건 종류 (팔면체 · 메모지)')
    }

    // 원본 자리는 안건을 올리기 전과 같다
    const old = slotsOf(before).slots
    for (const key of [`task:${t.id}`, `submission:${p.id}`]) {
      const [x, y] = [old.get(key), slots.get(key)]
      assert.deepEqual([y?.x, y?.y, y?.z, y?.home], [x?.x, x?.y, x?.z, x?.home], key)
    }
  })
})

describe('slots — 도움 요청 안건 구 (#205)', () => {
  it('도움 요청을 안건으로 올리면 회의 탁자에 help 모양 하나(올린 순서), 원본 도움 요청은 3D 자리가 없다', async () => {
    const ds = createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') })
    const before = await ds.load('ws_1')
    const mine = before.helpRequests.find((h) => h.requesterMemberId === before.viewer.memberId && (h.status === 'open' || h.status === 'discussing'))
    assert.ok(mine, 'seed에 보는 사람의 열린 도움 요청이 있어야 한다')
    const t = before.tasks.find((x) => x.state === 'open')!
    const first = await ds.createAgendaItem('ws_1', { kind: 'issue', sourceId: t.id, title: '이슈 안건', background: null, tried: null, unresolvedReason: null })
    const help = await ds.convertHelpRequestToAgenda('ws_1', mine.id, { title: '도움 요청 안건' })
    assert.equal(help.kind, 'help_request')
    const after = await ds.load('ws_1')

    const scene = stationSceneOf(after)
    const slots = computeSlots(scene.entities, after, scene.layout, new Map(), new Map())
    assert.equal(scene.entities.find((e) => e.key === `agenda:${help.id}`)?.kind, 'help')
    const s = slots.get(`agenda:${help.id}`)
    assert.equal(s?.home, 'agenda')
    assert.deepEqual([s?.x, s?.y, s?.z], scene.layout.anchor('meeting', 1), '이슈 안건 다음 자리')
    assert.ok(slots.has(`agenda:${first.id}`))
    assert.ok(![...slots.keys()].some((k) => k.includes(mine.id) && !k.startsWith('agenda:')), '도움 요청 자체는 3D에 자리가 없다(게시판 오브젝트는 #205 2단계)')
  })
})
