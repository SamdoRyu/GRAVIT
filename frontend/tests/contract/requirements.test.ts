// 요구사항 연결 (#197 — CONTRACTS_API.md 「8」 · CONTRACTS.md 「3」 진행률). 규칙(rules/requirements) · mock · store를 함께 본다.
// mock seed: 팀 사무실(ws_1) — 보는 사람 김옥토는 R2가 아니다, 요구사항 7개(active 5 · missing · needs_review).
// 시연 사무실(ws_2) — 김옥토가 R2, active 12개(판 9 + 대기 칸).
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage, type StorageLike } from '../../src/data/mock'
import { createV1MockDataSource, V1_STORAGE_KEY } from '../../src/data/mock/v1'
import { REQUIREMENT_MSG, deckOrderKey, existingLink, keepDeckOrder, linkRequestError, parseDeckOrder, sameDeckOrder, swapDeckOrder, withProgress } from '../../src/data/rules/requirements'
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

describe('판 배치 교환 결과 — 규칙 (「8」 · 「10」)', () => {
  const actives = (n: number): Pick<RequirementDto, 'id' | 'status'>[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, status: 'active' }))

  it('저장값 읽기 — 문자열 ID 배열만, 깨진 값 · 빈 배열은 null', () => {
    assert.deepEqual(parseDeckOrder('["a","b"]'), ['a', 'b'])
    for (const raw of [null, '', '{nope', '[]', '[1,2]', '["a",""]', '{"a":1}']) assert.equal(parseDeckOrder(raw), null, String(raw))
  })

  it('버리는 때 — 비어 있음 · active 10개 이하 · 교환한 요구사항이 active가 아님(missing · needs_review · 사라짐)', () => {
    assert.equal(keepDeckOrder(null, actives(12)), null)
    assert.equal(keepDeckOrder([], actives(12)), null)
    assert.equal(keepDeckOrder(['r0'], actives(10)), null, '10개 이하면 대기 칸이 없다')
    assert.equal(keepDeckOrder(['r0', 'gone'], actives(12)), null)
    assert.equal(keepDeckOrder(['r0'], actives(12).map((r) => (r.id === 'r0' ? { ...r, status: 'missing' as const } : r))), null)
    assert.equal(keepDeckOrder(['r1'], actives(12).map((r) => (r.id === 'r1' ? { ...r, status: 'needs_review' as const } : r))), null)
  })

  it('쓸 수 있으면 중복을 빼고 판 자리 수(9)까지', () => {
    assert.deepEqual(keepDeckOrder(['r11', 'r0', 'r11'], actives(12)), ['r11', 'r0'])
    assert.equal(keepDeckOrder(actives(12).map((r) => r.id), actives(12))?.length, 9)
  })

  it('자리 바꾸기 — 고른 판 자리에 대기 요구사항, 나머지 판 순서는 그대로', () => {
    assert.deepEqual(swapDeckOrder(['a', 'b', 'c'], 'b', 'z'), ['a', 'z', 'c'])
    assert.ok(sameDeckOrder(['a'], ['a']) && sameDeckOrder(null, null) && !sameDeckOrder(['a'], null) && !sameDeckOrder(['a', 'b'], ['b', 'a']))
  })
})

describe('store — 판 배치 교환 결과 · 대기 목록', () => {
  // 브라우저 저장소 — Node에는 없어 메모리로 흉내 낸다
  const mem = new Map<string, string>()
  let broken = false
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => {
      if (broken) throw new Error('blocked')
      return mem.get(k) ?? null
    },
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  }
  afterEach(() => {
    useOffice.getState().closeOffice()
    useOffice.getState().openDialog(null)
    mem.clear()
    broken = false
  })
  const st = () => useOffice.getState()
  const KEY = deckOrderKey(DEMO_WS)

  it('바꾸면 사무실별로 저장하고, 다시 열면 읽는다 · "기본 순서로"는 지운다 · 사무실을 닫으면 비운다', async () => {
    const source = make()
    await st().openOffice(source, DEMO_WS)
    st().setRequirementDeckOrder(['rq_31', 'rq_21'])
    assert.deepEqual(st().requirementDeckOrder, ['rq_31', 'rq_21'])
    assert.equal(mem.get(KEY), '["rq_31","rq_21"]')

    st().closeOffice()
    assert.equal(st().requirementDeckOrder, null)
    await st().openOffice(source, DEMO_WS)
    assert.deepEqual(st().requirementDeckOrder, ['rq_31', 'rq_21'])

    st().setRequirementDeckOrder(null)
    assert.equal(st().requirementDeckOrder, null)
    assert.equal(mem.has(KEY), false)
  })

  it('쓸 수 없는 교환 결과는 null로 저장 — active 10개 이하인 사무실 · active가 아닌 요구사항', async () => {
    await st().openOffice(make(), TEAM_WS)
    st().setRequirementDeckOrder(['rq_1'])
    assert.equal(st().requirementDeckOrder, null, '팀 사무실은 active 5개')
    assert.equal(mem.has(deckOrderKey(TEAM_WS)), false)
  })

  it('저장소를 읽지 못하거나 저장값이 깨졌으면 기본 순서(null)', async () => {
    mem.set(KEY, '{broken')
    await st().openOffice(make(), DEMO_WS)
    assert.equal(st().requirementDeckOrder, null)
    st().closeOffice()
    mem.set(KEY, '["rq_31"]')
    broken = true
    await st().openOffice(make(), DEMO_WS)
    assert.equal(st().requirementDeckOrder, null)
  })

  it('재동기화로 교환한 요구사항이 active가 아니게 되면 버리고 저장값도 지운다', async () => {
    mem.set(KEY, '["rq_31"]')
    await st().openOffice(make(), DEMO_WS)
    assert.deepEqual(st().requirementDeckOrder, ['rq_31'])
    // 서버가 다시 보낸 Snapshot에서 rq_31이 missing이 됐다
    const office = st().office!
    const snapshot = { ...office.snapshot!, requirements: office.snapshot!.requirements.map((r) => (r.id === 'rq_31' ? { ...r, status: 'missing' as const } : r)) }
    useOffice.setState({ office: { ...office, snapshot } })
    assert.equal(st().requirementDeckOrder, null)
    assert.equal(mem.has(KEY), false)
  })

  it('대기 목록 열기 — 대기 칸을 누르면 인자 없이, 이슈 상자를 놓으면 그 이슈 ID로', async () => {
    await st().openOffice(make(), DEMO_WS)
    st().openRequirementWaiting()
    assert.deepEqual(st().dialog, { kind: 'requirementWaiting', linkTaskId: null })
    st().openRequirementWaiting('t_12')
    assert.deepEqual(st().dialog, { kind: 'requirementWaiting', linkTaskId: 't_12' })
  })
})
