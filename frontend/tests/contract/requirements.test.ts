// 요구사항 연결 (#197 — CONTRACTS_API.md 「8」 · CONTRACTS.md 「3」 진행률). 규칙(rules/requirements) · mock · store를 함께 본다.
// mock seed: 팀 사무실(ws_1) — 보는 사람 김옥토는 R2가 아니다, 요구사항 7개(active 5 · missing · needs_review).
// 시연 사무실(ws_2) — 김옥토가 R2, active 12개(판 9 + 대기 칸).
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage, type StorageLike } from '../../src/data/mock'
import { createV1MockDataSource, V1_STORAGE_KEY } from '../../src/data/mock/v1'
import { REQUIREMENT_MSG, existingLink, linkRequestError, withProgress } from '../../src/data/rules/requirements'
import type { Change, RequirementDto, RequirementLinkDto } from '../../src/data/types'
import { useOffice } from '../../src/store'

const TEAM_WS = 'ws_1'
const DEMO_WS = 'ws_2'

const make = (storage: StorageLike = createMemoryStorage()) =>
  createV1MockDataSource({ storage, session: 'github', latencyMs: [0, 0], syncDurationMs: 0, now: () => new Date('2026-11-05T03:00:00Z') })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, `expected DataError, got ${String(e)}`)
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

const req = (id: string, patch: Partial<RequirementDto> = {}): RequirementDto => ({
  id,
  sourceKey: null,
  title: id,
  position: 0,
  status: 'active',
  linkedTaskCount: 0,
  doneTaskCount: 0,
  lastSeenAt: null,
  ...patch,
})
const link = (id: string, requirementId: string, taskId: string): RequirementLinkDto => ({ id, requirementId, taskId, linkedAt: '2026-11-05T00:00:00Z' })
const progressOf = (rs: readonly RequirementDto[], id: string) => {
  const r = rs.find((x) => x.id === id)!
  return [r.linkedTaskCount, r.doneTaskCount]
}

describe('진행 수 규칙 (FR-REQ-05)', () => {
  it('연결된 이슈 수 · 그중 닫힌 이슈 수 — 닫힘 사유는 보지 않는다', () => {
    const tasks = [
      { id: 't1', state: 'open' as const },
      { id: 't2', state: 'closed' as const },
      { id: 't3', state: 'closed' as const },
    ]
    const out = withProgress([req('a'), req('b'), req('c')], [link('1', 'a', 't1'), link('2', 'a', 't2'), link('3', 'b', 't3')], tasks)
    assert.deepEqual(progressOf(out, 'a'), [2, 1])
    assert.deepEqual(progressOf(out, 'b'), [1, 1])
    assert.deepEqual(progressOf(out, 'c'), [0, 0], '빈 구역')
  })

  it('바뀐 것이 없으면 같은 객체 — 화면이 다시 그리지 않게', () => {
    const same = req('a', { linkedTaskCount: 1, doneTaskCount: 0 })
    const [out] = withProgress([same], [link('1', 'a', 't1')], [{ id: 't1', state: 'open' }])
    assert.equal(out, same)
  })

  it('요청 모양 · 같은 연결 찾기', () => {
    assert.equal(linkRequestError({ requirementId: '5', taskId: '41' }), null)
    for (const bad of [null, { requirementId: '', taskId: '41' }, { requirementId: '5' }, { requirementId: 5, taskId: '41' }]) {
      assert.equal(linkRequestError(bad as never), REQUIREMENT_MSG.invalid, JSON.stringify(bad))
    }
    const links = [link('1', 'a', 't1')]
    assert.equal(existingLink(links, { requirementId: 'a', taskId: 't1' })?.id, '1')
    assert.equal(existingLink(links, { requirementId: 'a', taskId: 't2' }), null)
  })
})

describe('mock seed — 요구사항', () => {
  it('팀 사무실: 진행 중 · 모두 닫힘 · 빈 구역 · 원본 ID 없음 · missing(연결 남음) · needs_review, active 10개 이하', async () => {
    const snap = await make().load(TEAM_WS)
    const rs = snap.requirements
    assert.deepEqual(
      rs.map((r) => [r.sourceKey, r.status, r.linkedTaskCount, r.doneTaskCount]),
      [
        ['FR-WS-01', 'active', 2, 1],
        ['FR-UI-09', 'active', 1, 1],
        ['FR-REQ-05', 'active', 0, 0],
        [null, 'active', 1, 0],
        ['FR-AUTH-01', 'active', 1, 0],
        ['FR-OLD-01', 'missing', 1, 0],
        ['FR-REP-01', 'needs_review', 1, 0],
      ],
    )
    assert.deepEqual(rs.map((r) => r.position), [0, 1, 2, 3, 4, 5, 6])
    assert.ok(rs.filter((r) => r.status === 'active').length <= 10)
    assert.equal(snap.viewer.role, 'participant', '팀 사무실의 김옥토는 R2가 아니다')
  })

  it('시연 사무실: active 12개(판 9 + 대기 칸), 김옥토가 R2', async () => {
    const snap = await make().load(DEMO_WS)
    assert.equal(snap.requirements.filter((r) => r.status === 'active').length, 12)
    assert.equal(snap.viewer.role, 'repo_admin')
    const ids = new Set(snap.tasks.map((t) => t.id))
    assert.ok(snap.requirementLinks.every((l) => ids.has(l.taskId)), '연결은 이 사무실 이슈만')
  })
})

describe('mock — 연결 · 끊기 (「8」)', () => {
  it('R2가 연결하면 새 연결, 진행 수가 응답 때 다시 계산된다 · requirements 변경 알림', async () => {
    const source = make()
    const changes: Change[] = []
    const off = source.subscribe(DEMO_WS, (c) => changes.push(c))
    const before = await source.load(DEMO_WS)
    const target = before.requirements.find((r) => r.linkedTaskCount === 0)!
    const created = await source.linkRequirement(DEMO_WS, { requirementId: target.id, taskId: 't_13' })
    assert.equal(created.requirementId, target.id)
    assert.equal(created.taskId, 't_13')
    const after = await source.load(DEMO_WS)
    assert.deepEqual(progressOf(after.requirements, target.id), [1, 1], 't_13은 닫힌 이슈')
    assert.ok(after.requirementLinks.some((l) => l.id === created.id))
    assert.ok(changes.some((c) => c.type === 'changed' && c.resources.includes('requirements')))

    // 같은 연결은 기존 연결 그대로(새로 만들지 않음)
    const again = await source.linkRequirement(DEMO_WS, { requirementId: target.id, taskId: 't_13' })
    assert.equal(again.id, created.id)
    assert.equal((await source.load(DEMO_WS)).requirementLinks.length, after.requirementLinks.length)

    await source.unlinkRequirement(DEMO_WS, created.id)
    assert.deepEqual(progressOf((await source.load(DEMO_WS)).requirements, target.id), [0, 0])
    await rejectsCode(source.unlinkRequirement(DEMO_WS, created.id), 'not_found')
    off()
  })

  it('R2가 아니면 forbidden_role — 연결 · 끊기 모두', async () => {
    const source = make()
    const snap = await source.load(TEAM_WS)
    await rejectsCode(source.linkRequirement(TEAM_WS, { requirementId: 'rq_3', taskId: 't_5' }), 'forbidden_role', REQUIREMENT_MSG.notAdmin)
    await rejectsCode(source.unlinkRequirement(TEAM_WS, snap.requirementLinks[0].id), 'forbidden_role', REQUIREMENT_MSG.notAdmin)
  })

  it('없거나 다른 사무실 것 not_found · 모양이 틀리면 invalid', async () => {
    const source = make()
    // t_1은 팀 사무실 이슈 · rq_1은 팀 사무실 요구사항
    await rejectsCode(source.linkRequirement(DEMO_WS, { requirementId: 'rq_21', taskId: 't_1' }), 'not_found', REQUIREMENT_MSG.notFound)
    await rejectsCode(source.linkRequirement(DEMO_WS, { requirementId: 'rq_1', taskId: 't_11' }), 'not_found')
    await rejectsCode(source.linkRequirement(DEMO_WS, { requirementId: '', taskId: 't_11' }), 'invalid')
  })

  it('active가 아니면 새 연결은 conflict, 이미 있는 연결은 상태와 상관없이 그 연결', async () => {
    // 시연 사무실 요구사항 둘을 missing · needs_review로 바꾼 저장값에서 시작한다
    const storage = createMemoryStorage()
    make(storage)
    const saved = JSON.parse(storage.getItem(V1_STORAGE_KEY) ?? 'null')
    const demo = saved.workspaces.find((w: { snapshot: { workspace: { id: string } } }) => w.snapshot.workspace.id === DEMO_WS).snapshot
    demo.requirements.find((r: RequirementDto) => r.id === 'rq_21').status = 'missing'
    demo.requirements.find((r: RequirementDto) => r.id === 'rq_23').status = 'needs_review'
    storage.setItem(V1_STORAGE_KEY, JSON.stringify(saved))
    const source = make(storage)
    const kept = demo.requirementLinks.find((l: RequirementLinkDto) => l.requirementId === 'rq_21')
    assert.equal((await source.linkRequirement(DEMO_WS, { requirementId: 'rq_21', taskId: kept.taskId })).id, kept.id)
    await rejectsCode(source.linkRequirement(DEMO_WS, { requirementId: 'rq_21', taskId: 't_12' }), 'conflict', REQUIREMENT_MSG.notActive)
    await rejectsCode(source.linkRequirement(DEMO_WS, { requirementId: 'rq_23', taskId: 't_12' }), 'conflict')
  })
})

describe('store — linkRequirement · unlinkRequirement', () => {
  afterEach(() => useOffice.getState().closeOffice())
  const office = () => useOffice.getState().office

  it('성공하면 연결과 진행 수를 바로 고치고 연결을 돌려준다 · 끊으면 다시 센다', async () => {
    await useOffice.getState().openOffice(make(), DEMO_WS)
    const target = office()!.snapshot!.requirements.find((r) => r.linkedTaskCount === 0)!
    const created = await useOffice.getState().linkRequirement(target.id, 't_11')
    assert.ok(created)
    const snap = office()!.snapshot!
    assert.ok(snap.requirementLinks.some((l) => l.id === created.id))
    assert.deepEqual(progressOf(snap.requirements, target.id), [1, 0])

    assert.equal(await useOffice.getState().unlinkRequirement(created.id), true)
    assert.ok(!office()!.snapshot!.requirementLinks.some((l) => l.id === created.id))
    assert.deepEqual(progressOf(office()!.snapshot!.requirements, target.id), [0, 0])
  })

  it('실패하면 알림을 띄우고 null(false) — snapshot은 그대로', async () => {
    await useOffice.getState().openOffice(make(), TEAM_WS)
    const before = office()!.snapshot!
    const toasts = useOffice.getState().toasts.length
    assert.equal(await useOffice.getState().linkRequirement('rq_3', 't_5'), null)
    assert.equal(await useOffice.getState().unlinkRequirement(before.requirementLinks[0].id), false)
    assert.deepEqual(office()!.snapshot!.requirementLinks, before.requirementLinks)
    const shown = useOffice.getState().toasts.slice(toasts)
    assert.ok(shown.length >= 1 && shown.every((t) => t.level === 'bad' && t.text === REQUIREMENT_MSG.notAdmin))
  })
})
