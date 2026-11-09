// SceneModel 단위 테스트 (CONTRACTS.md 「8」 · 「9」 프론트 계약 테스트) — v1 mock Snapshot을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { WorkspaceSnapshot } from '../../src/data/types'
import { BADGE, buildSceneModel, countBadge, isSeated } from '../../src/scene/model/buildSceneModel'

const load = (workspaceId: string) =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load(workspaceId)

const avatars = (snapshot: WorkspaceSnapshot) => buildSceneModel(snapshot).filter((e) => e.kind === 'avatar')

describe('SceneModel — 팀원 아바타 (#10)', () => {
  it('자리가 있는 지금 팀원마다 아바타 하나, 공간 역할은 desk:<memberId>', async () => {
    const snap = await load('ws_1')
    const seated = snap.members.filter((m) => m.removedAt === null && m.deskIndex !== null)
    assert.ok(seated.length > 0, 'seed에 자리가 있는 팀원이 있어야 한다')
    const blocked = new Set(snap.flow.blockedMemberIds)
    assert.deepEqual(
      avatars(snap),
      seated.map((m) => ({
        key: `member:${m.id}`,
        kind: 'avatar',
        refId: m.id,
        placeRole: `desk:${m.id}`,
        badges: [],
        ...(blocked.has(m.id) ? { highlight: 'blocked' } : {}),
      })),
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

/** 원본 이슈 · PR 엔티티 — 회의실의 안건(agenda:) 모양은 빼고 */
const isOriginal = (e: { key: string }) => e.key.startsWith('task:') || e.key.startsWith('submission:')

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
    // 평가 배지(#21)는 따로 본다 — 여기서는 회차 없이
    const submissions = (['open', 'draft', 'merged', 'closed'] as const).map((state) => ({ ...pr, id: `p_${state}`, state, currentRound: null }))
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
    const before = buildSceneModel(snap).filter(isOriginal)
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
    }).filter(isOriginal)
    assert.deepEqual(after, before)
  })
})

describe('SceneModel — 막힘 강조 (#23)', () => {
  const byKey = (snap: WorkspaceSnapshot) => new Map(buildSceneModel(snap).map((e) => [e.key, e]))

  it('서버가 막혔다고 계산한 이슈 · PR은 blocked 강조 + 막힘 배지, 아닌 것은 둘 다 없다', async () => {
    const snap = await load('ws_1')
    const t = snap.tasks.find((x) => x.state === 'open')
    const p = snap.submissions[0]
    assert.ok(t && p)
    const s = {
      ...snap,
      tasks: [
        { ...t, id: 'x_blocked', isBlocked: true },
        { ...t, id: 'x_clear', isBlocked: false },
      ],
      submissions: [
        { ...p, id: 'p_blocked', state: 'draft' as const, isBlocked: true, currentRound: null },
        { ...p, id: 'p_clear', state: 'open' as const, isBlocked: false, currentRound: null },
      ],
    }
    const m = byKey(s)
    assert.equal(m.get('task:x_blocked')?.highlight, 'blocked')
    assert.deepEqual(m.get('task:x_blocked')?.badges, [BADGE.blocked])
    assert.equal(m.get('submission:p_blocked')?.highlight, 'blocked')
    assert.deepEqual(m.get('submission:p_blocked')?.badges, [BADGE.blocked, BADGE.draft])
    for (const key of ['task:x_clear', 'submission:p_clear']) {
      assert.equal(m.get(key)?.highlight, undefined, key)
      assert.ok(!m.get(key)?.badges.includes(BADGE.blocked), key)
    }
  })

  it('막힌 도형이 있는 팀원(flow.blockedMemberIds)의 아바타만 blocked 강조, 배지는 없다', async () => {
    const snap = await load('ws_1')
    const seated = snap.members.filter(isSeated)
    assert.ok(seated.length >= 2)
    const [stuck, fine] = seated
    const m = byKey({ ...snap, flow: { ...snap.flow, blockedMemberIds: [stuck.id] } })
    assert.equal(m.get(`member:${stuck.id}`)?.highlight, 'blocked')
    assert.deepEqual(m.get(`member:${stuck.id}`)?.badges, [])
    assert.equal(m.get(`member:${fine.id}`)?.highlight, undefined)
  })

  it('막혔다는 사실만 — 엔티티에 이유 문구가 없다', async () => {
    const snap = await load('ws_1')
    const blocked = buildSceneModel(snap).filter((e) => e.highlight === 'blocked')
    assert.ok(blocked.length > 0, 'seed에 막힌 도형 · 팀원이 있어야 한다')
    for (const e of blocked) {
      assert.deepEqual(Object.keys(e).sort(), ['badges', 'highlight', 'key', 'kind', 'placeRole', 'refId'])
      // 정해진 값 또는 수 배지('recommend:2')뿐 — 문장(이유)이 끼어들지 않는다
      assert.ok(e.badges.every((b) => Object.values(BADGE).includes(b.replace(/:\d+$/, '') as never)), `배지는 정해진 값만: ${e.badges}`)
    }
  })

  it('막힘은 자리(placeRole)를 바꾸지 않는다', async () => {
    const snap = await load('ws_1')
    const roles = (s: WorkspaceSnapshot) => buildSceneModel(s).map((e) => [e.key, e.placeRole])
    const flipped = {
      ...snap,
      tasks: snap.tasks.map((x) => ({ ...x, isBlocked: !x.isBlocked })),
      submissions: snap.submissions.map((x) => ({ ...x, isBlocked: !x.isBlocked })),
      flow: { ...snap.flow, blockedMemberIds: snap.members.map((x) => x.id) },
    }
    assert.deepEqual(roles(flipped), roles(snap))
  })
})

describe('SceneModel — 평가 결과 (#21)', () => {
  const prBadges = (snap: WorkspaceSnapshot, id: string) => buildSceneModel(snap).find((e) => e.key === `submission:${id}`)?.badges

  it('현재 회차의 추천 · 비추천 수만 배지로 — 이전 회차 · 이유 · 평가자는 없다', async () => {
    const snap = await load('ws_1')
    const p = snap.submissions.find((x) => x.currentRound !== null)
    assert.ok(p?.currentRound, 'seed에 회차가 있는 PR이 있어야 한다')
    const round = { ...p.currentRound, roundNumber: 3, recommendCount: 2, notRecommendCount: 1 }
    const s = { ...snap, submissions: [{ ...p, id: 'p_eval', state: 'open' as const, isBlocked: false, currentRound: round }] }
    assert.deepEqual(prBadges(s, 'p_eval'), [countBadge(BADGE.recommend, 2), countBadge(BADGE.notRecommend, 1)])
    assert.deepEqual(countBadge(BADGE.recommend, 2), 'recommend:2')
  })

  it('0표도 그대로 보인다(회차는 열려 있음), 회차가 없으면 평가 배지가 없다', async () => {
    const snap = await load('ws_1')
    const p = snap.submissions.find((x) => x.currentRound !== null)
    assert.ok(p?.currentRound)
    const empty = { ...p.currentRound, recommendCount: 0, notRecommendCount: 0, reasons: [] }
    const s = {
      ...snap,
      submissions: [
        { ...p, id: 'p_zero', state: 'open' as const, isBlocked: false, currentRound: empty },
        { ...p, id: 'p_none', state: 'open' as const, isBlocked: false, currentRound: null },
      ],
    }
    assert.deepEqual(prBadges(s, 'p_zero'), [countBadge(BADGE.recommend, 0), countBadge(BADGE.notRecommend, 0)])
    assert.deepEqual(prBadges(s, 'p_none'), [])
  })

  it('닫힌 PR도 마지막 회차를 보이고, 다른 배지 뒤에 붙는다', async () => {
    const snap = await load('ws_1')
    const p = snap.submissions.find((x) => x.currentRound !== null)
    assert.ok(p?.currentRound)
    const round = { ...p.currentRound, recommendCount: 1, notRecommendCount: 3 }
    const s = { ...snap, submissions: [{ ...p, id: 'p_closed', state: 'closed' as const, isBlocked: true, currentRound: round }] }
    assert.deepEqual(prBadges(s, 'p_closed'), [BADGE.blocked, BADGE.unmergedClosed, countBadge(BADGE.recommend, 1), countBadge(BADGE.notRecommend, 3)])
  })

  it('평가 결과는 자리(placeRole)를 바꾸지 않는다', async () => {
    const snap = await load('ws_1')
    const roles = (x: WorkspaceSnapshot) => buildSceneModel(x).map((e) => [e.key, e.placeRole])
    const noRounds = { ...snap, submissions: snap.submissions.map((x) => ({ ...x, currentRound: null })) }
    assert.deepEqual(roles(noRounds), roles(snap))
  })
})

describe('SceneModel — 회의실의 안건 (#30 · #26)', () => {
  const agenda = (id: string, kind: 'issue' | 'pr' | 'help_request' | 'learning' | 'other', status: 'confirmed' | 'discussed' | 'withdrawn', source: { type: 'task' | 'submission'; id: string } | null) => ({
    id,
    kind,
    status,
    title: '안건',
    background: null,
    tried: null,
    unresolvedReason: null,
    source,
    evaluationRoundId: null,
    raisedByMemberId: 'm_1',
    raisedAt: '2026-11-05T03:00:00Z',
    decision: null,
    feedbackRequested: false,
    feedbackRequestedAt: null,
    instructorFeedbacks: [],
  })

  it('결정 전 안건마다 agenda:<id> 모양 하나 — 종류는 안건 종류, 자리는 meeting. 결정 · 거둔 안건은 없다', async () => {
    const snap = await load('ws_1')
    const t = snap.tasks[0]
    const p = snap.submissions[0]
    const items = [
      agenda('a_issue', 'issue', 'confirmed', { type: 'task', id: t.id }),
      agenda('a_pr', 'pr', 'confirmed', { type: 'submission', id: p.id }),
      agenda('a_learn', 'learning', 'confirmed', null),
      agenda('a_help', 'help_request', 'confirmed', null),
      agenda('a_done', 'issue', 'discussed', { type: 'task', id: t.id }),
      agenda('a_gone', 'other', 'withdrawn', null),
    ]
    const model = buildSceneModel({ ...snap, agendaItems: items })
    assert.deepEqual(
      model.filter((e) => e.key.startsWith('agenda:')),
      [
        { key: 'agenda:a_issue', kind: 'issue', refId: 'a_issue', placeRole: 'meeting', badges: [] },
        { key: 'agenda:a_pr', kind: 'pr', refId: 'a_pr', placeRole: 'meeting', badges: [] },
        { key: 'agenda:a_learn', kind: 'learning', refId: 'a_learn', placeRole: 'meeting', badges: [] },
        { key: 'agenda:a_help', kind: 'help', refId: 'a_help', placeRole: 'meeting', badges: [] },
      ],
    )
    // 원본은 그대로 한 번씩, 제자리
    assert.equal(model.filter((e) => e.key === `task:${t.id}`).length, 1)
    assert.notEqual(model.find((e) => e.key === `task:${t.id}`)?.placeRole, 'meeting')
    assert.notEqual(model.find((e) => e.key === `submission:${p.id}`)?.placeRole, 'meeting')
  })
})

describe('SceneModel — 회의 참석 (CONTRACTS.md 「10」 아바타 이동)', () => {
  const meeting = (status: 'ongoing' | 'ended', attendeeMemberIds: string[]) => ({
    id: 'mt_t',
    status,
    startedAt: '2026-11-05T02:00:00Z',
    endedAt: status === 'ended' ? '2026-11-05T02:30:00Z' : null,
    attendeeMemberIds,
    notes: null,
    discussedAgendaItemIds: [],
  })

  it('진행 중 회의 참석자는 meeting, 나머지 팀원은 desk:<memberId>', async () => {
    const snap = await load('ws_1')
    const [a, b] = avatars(snap)
    const placed = avatars({ ...snap, meetings: [meeting('ongoing', [a.refId!])] })
    assert.equal(placed.find((e) => e.refId === a.refId)?.placeRole, 'meeting')
    assert.equal(placed.find((e) => e.refId === b.refId)?.placeRole, `desk:${b.refId}`)
  })

  it('끝난 회의 참석자는 자기 포드로 돌아간다', async () => {
    const snap = await load('ws_1')
    const [a] = avatars(snap)
    const placed = avatars({ ...snap, meetings: [meeting('ended', [a.refId!])] })
    assert.equal(placed.find((e) => e.refId === a.refId)?.placeRole, `desk:${a.refId}`)
  })
})
