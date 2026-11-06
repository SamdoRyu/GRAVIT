// 요구사항 판 배치 · 구역 엔티티 · 데크 자리 테스트 (#16 · #17 — CONTRACTS.md 「8」 요구사항 판 배치 · 「10」, 2026-11-06 결정).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { RequirementDto, WorkspaceSnapshot } from '../../src/data/types'
import { buildSceneModel, REQUIREMENT_WAITING_KEY, requirementGroupKey, UNGROUPED } from '../../src/scene/model/buildSceneModel'
import { DECK_MAX_PLATES, DECK_MIN_PLATES, planRequirementDeck } from '../../src/scene/model/requirementDeck'
import { badgeCount, litCells, PLATE_CELLS, plateTag } from '../../src/scene/requirementPlate'
import { deckPlan, stationSceneOf } from '../../src/scene/stationScene'
import { REQ_DECK, REQ_PLATE, REQ_PLATE_SLOTS, reqPlateCenter, WORLD_SCALE } from '../../src/theme/station/geometry'
import { createStationLayout, reqPlateAnchor } from '../../src/theme/station/stationLayout'

const load = () =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load('ws_1')

/** n개의 active 요구사항(position 0..n-1). linked · done은 i로 정한다: 3의 배수 번째는 빈 구역 */
function requirements(n: number, extra: Partial<RequirementDto>[] = []): RequirementDto[] {
  const list: RequirementDto[] = Array.from({ length: n }, (_, i) => ({
    id: String(100 + i),
    sourceKey: i === 1 ? null : `FR-T-${String(i + 1).padStart(2, '0')}`,
    title: `요구사항 ${i}`,
    position: i,
    status: 'active',
    linkedTaskCount: i % 3 === 0 ? 0 : 2,
    doneTaskCount: i % 3 === 2 ? 2 : 0,
    lastSeenAt: '2026-11-05T03:00:00Z',
  }))
  return [...list, ...extra.map((e, i) => ({ ...list[0], id: `x${i}`, position: 100 + i, ...e }))]
}

const ids = (rs: readonly RequirementDto[]) => rs.map((r) => r.id)

describe('요구사항 판 배치 — 판 수 · 대기 칸 (2026-11-06)', () => {
  it('5개 이하는 판 5장, 6~10개는 그 수만큼, 대기 칸 없음 — position 순서', () => {
    for (const [n, plates] of [[0, 5], [3, 5], [5, 5], [6, 6], [10, 10]] as const) {
      const plan = planRequirementDeck(requirements(n).reverse())
      assert.equal(plan.plates, plates, `${n}개`)
      assert.deepEqual(ids(plan.shown), ids(requirements(n)), `${n}개 순서`)
      assert.equal(plan.waiting.length, 0)
    }
    assert.equal(DECK_MIN_PLATES, 5)
    assert.equal(DECK_MAX_PLATES, 10)
  })

  it('11개 이상은 판 10장 = 표기용 9 + 대기 칸, 나머지는 position 순서로 대기', () => {
    const plan = planRequirementDeck(requirements(13))
    assert.equal(plan.plates, 10)
    assert.deepEqual(ids(plan.shown), ids(requirements(9)))
    assert.deepEqual(ids(plan.waiting), ['109', '110', '111', '112'])
  })

  it('active만 판 · 대기 칸에 오른다 (missing · needs_review는 패널에만)', () => {
    const plan = planRequirementDeck(requirements(4, [{ status: 'missing' }, { status: 'needs_review' }]))
    assert.deepEqual(ids(plan.shown), ['100', '101', '102', '103'])
  })

  it('교환 결과: 11개 이상이면 그 요구사항을 먼저 판에 놓고, 남는 판을 position 순서로 채운다', () => {
    const plan = planRequirementDeck(requirements(12), ['111', '104'])
    assert.deepEqual(ids(plan.shown), ['111', '104', '100', '101', '102', '103', '105', '106', '107'])
    assert.deepEqual(ids(plan.waiting), ['108', '109', '110'])
    // 판 9장을 넘는 교환 결과는 앞 9개만, 같은 ID는 한 번
    const long = planRequirementDeck(requirements(12), ['111', '111', '110', '109', '108', '107', '106', '105', '104', '103', '102'])
    assert.deepEqual(ids(long.shown), ['111', '110', '109', '108', '107', '106', '105', '104', '103'])
  })

  it('교환 결과를 버리는 때: 10개 이하 · 교환한 요구사항이 active가 아님 → position 순서', () => {
    assert.deepEqual(ids(planRequirementDeck(requirements(8), ['107', '106']).shown), ids(requirements(8)))
    const reqs = requirements(12, [{ id: 'gone', status: 'missing' }])
    assert.deepEqual(ids(planRequirementDeck(reqs, ['111', 'gone']).shown), ids(requirements(9)))
    assert.deepEqual(ids(planRequirementDeck(requirements(12), ['nope']).shown), ids(requirements(9)))
  })
})

describe('SceneModel — 요구사항 구역 · 대기 칸 (#16 · #17)', () => {
  const withRequirements = async (reqs: RequirementDto[]): Promise<WorkspaceSnapshot> => ({ ...(await load()), requirements: reqs })
  const reqEntities = (snap: WorkspaceSnapshot, order: string[] | null = null) =>
    buildSceneModel(snap, order).filter((e) => e.kind === 'requirement' || e.kind === 'requirementGroup')

  it('판에 오른 요구사항마다 requirement:<id> 하나(판 순서), 빈 구역은 dim, groupKey = 요구사항 종류', async () => {
    const snap = await withRequirements(requirements(4, [{ status: 'missing' }]))
    assert.deepEqual(reqEntities(snap), [
      { key: 'requirement:100', kind: 'requirement', refId: '100', placeRole: 'requirement:100', badges: [], groupKey: 'FR-T', highlight: 'dim' },
      { key: 'requirement:101', kind: 'requirement', refId: '101', placeRole: 'requirement:101', badges: [], groupKey: UNGROUPED },
      { key: 'requirement:102', kind: 'requirement', refId: '102', placeRole: 'requirement:102', badges: [], groupKey: 'FR-T' },
      { key: 'requirement:103', kind: 'requirement', refId: '103', placeRole: 'requirement:103', badges: [], groupKey: 'FR-T', highlight: 'dim' },
    ])
  })

  it('11개 이상: 대기 칸 하나 — requirement-group:waiting · requirement:waiting · refId null · waiting:N · empty:k', async () => {
    const snap = await withRequirements(requirements(13))
    const es = reqEntities(snap)
    assert.equal(es.length, 10)
    assert.deepEqual(es[9], { key: REQUIREMENT_WAITING_KEY, kind: 'requirementGroup', refId: null, placeRole: 'requirement:waiting', badges: ['waiting:4', 'empty:2'] })
    // 대기 중에 빈 구역이 없으면 empty 배지가 없다
    const noEmpty = await withRequirements(requirements(11).map((r) => ({ ...r, linkedTaskCount: 1 })))
    assert.deepEqual(reqEntities(noEmpty).at(-1)?.badges, ['waiting:2'])
  })

  it('교환 결과가 SceneModel 입력이다 — 판 순서가 바뀌고 원본 이슈 · PR 엔티티는 그대로', async () => {
    const snap = await withRequirements(requirements(12))
    assert.deepEqual(
      reqEntities(snap, ['110']).slice(0, 2).map((e) => e.key),
      ['requirement:110', 'requirement:100'],
    )
    const originals = (order: string[] | null) => buildSceneModel(snap, order).filter((e) => e.key.startsWith('task:') || e.key.startsWith('submission:'))
    assert.deepEqual(originals(['110']), originals(null))
  })

  it('요구사항 종류: 원본 ID에서 끝 번호를 뺀 접두사, 없으면 "미분류"', () => {
    assert.equal(requirementGroupKey('FR-AUTH-01'), 'FR-AUTH')
    assert.equal(requirementGroupKey('NFR-04'), 'NFR')
    assert.equal(requirementGroupKey(null), UNGROUPED)
  })
})

describe('요구사항 데크 — 판 자리 · 드롭 구역', () => {
  it('판 10자리는 데크 바닥 안에 있고 서로 겹치지 않는다', () => {
    assert.equal(REQ_PLATE_SLOTS, DECK_MAX_PLATES)
    const half = REQ_DECK.radius * 0.83
    const centers = Array.from({ length: REQ_PLATE_SLOTS }, (_, i) => reqPlateCenter(i))
    for (const c of centers) {
      assert.ok(Math.abs(c.x - REQ_DECK.x) + REQ_PLATE.width / 2 <= REQ_DECK.length / 2, `x ${c.x}`)
      assert.ok(Math.abs(c.z - REQ_DECK.z) + REQ_PLATE.depth / 2 <= half, `z ${c.z}`)
    }
    centers.forEach((a, i) =>
      centers.slice(i + 1).forEach((b) => {
        assert.ok(Math.abs(a.x - b.x) >= REQ_PLATE.width || Math.abs(a.z - b.z) >= REQ_PLATE.depth, `${i}`)
      }),
    )
  })

  it('판 위가 그 요구사항 구역 · 대기 칸이고, 요구사항이 없는 빈 판은 드롭 구역이 아니다', () => {
    const layout = createStationLayout(new Map(), ['100', '101', 'waiting'])
    assert.equal(layout.dropZoneAt(layout.anchor('requirement:100', 0)), 'requirement:100')
    assert.equal(layout.dropZoneAt(layout.anchor('requirement:101', 0)), 'requirement:101')
    assert.equal(layout.dropZoneAt(layout.anchor('requirement:waiting', 0)), 'requirement:waiting')
    assert.deepEqual(layout.anchor('requirement:101', 0), reqPlateAnchor(1))
    for (let i = 3; i < REQ_PLATE_SLOTS; i++) assert.equal(layout.dropZoneAt(reqPlateAnchor(i)), null, `빈 판 ${i}`)
    assert.throws(() => layout.anchor('requirement:999', 0), '판이 없는 요구사항은 호출 쪽 버그')
  })

  it('데크는 다른 드롭 구역(회의실 · 도킹 베이)과 겹치지 않는다', () => {
    const layout = createStationLayout(new Map(), Array.from({ length: REQ_PLATE_SLOTS }, (_, i) => String(i)))
    for (let i = 0; i < REQ_PLATE_SLOTS; i++) assert.equal(layout.dropZoneAt(reqPlateAnchor(i)), `requirement:${i}`)
    assert.equal(layout.dropZoneAt(layout.anchor('meeting', 0)), 'meeting')
    assert.equal(layout.dropZoneAt(layout.anchor('backlog', 0)), 'backlog')
    const [x, , z] = reqPlateAnchor(0)
    assert.ok(Math.abs(x / WORLD_SCALE - reqPlateCenter(0).x) < 1e-9 && Math.abs(z / WORLD_SCALE - reqPlateCenter(0).z) < 1e-9)
  })

  it('StationScene: SceneModel이 낸 판 순서 · 대기 칸을 판 자리 0번부터 놓고, 판 수는 최소 5', async () => {
    const snap = { ...(await load()), requirements: requirements(12) }
    const scene = stationSceneOf(snap)
    assert.deepEqual(scene.deck, { slots: 10, places: ['100', '101', '102', '103', '104', '105', '106', '107', '108', 'waiting'] })
    assert.equal(scene.layout.dropZoneAt(reqPlateAnchor(9)), 'requirement:waiting')
    assert.deepEqual(deckPlan([]), { slots: 5, places: [] })
  })
})

describe('요구사항 판이 보이는 것', () => {
  it('켜진 칸 = 닫힌 연결 이슈 비율(반올림) — 다 닫히기 전엔 다 켜지지 않고, 하나라도 닫히면 하나는 켜진다', () => {
    assert.equal(PLATE_CELLS, 10)
    assert.equal(litCells(0, 0), 0)
    assert.equal(litCells(0, 3), 0)
    assert.equal(litCells(1, 3), 3)
    assert.equal(litCells(1, 30), 1)
    assert.equal(litCells(29, 30), 9)
    assert.equal(litCells(2, 2), 10)
  })

  it('이름표: 원본 ID(없으면 제목) · 진행 수, 연결 이슈가 없으면 진행 수 없음', () => {
    const [a, b] = requirements(3).slice(0, 3).filter((_, i) => i !== 2)
    assert.deepEqual(plateTag(a), { head: 'FR-T-01', progress: null, title: '요구사항 0' })
    assert.deepEqual(plateTag(b), { head: '요구사항 1', progress: '0/2', title: null })
  })

  it('수 배지 읽기: waiting:N · empty:k, 없으면 0', () => {
    assert.equal(badgeCount(['waiting:4', 'empty:2'], 'waiting'), 4)
    assert.equal(badgeCount(['waiting:4'], 'empty'), 0)
  })
})
