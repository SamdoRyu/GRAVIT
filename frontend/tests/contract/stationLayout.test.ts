// 우주정거장 ThemeLayout 단위 테스트 — 공간 역할 → 좌표 · 드롭 구역 (CONTRACTS.md 「8」 · 「10」 작업 포드).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import { deskSeats } from '../../src/scene/model/buildSceneModel'
import type { PlaceRole, Vec3 } from '../../src/scene/model/types'
import { ALWAYS_SHOWN_PODS, BRIDGE, POD, PODS, podConsole, WORLD_SCALE } from '../../src/theme/station/geometry'
import { createStationLayout } from '../../src/theme/station/stationLayout'

const load = (workspaceId: string) =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load(workspaceId)

/** 8자리를 모두 채운 자리표: m0 → 0 … m7 → 7 */
const fullSeats = new Map(PODS.map((_, i) => [`m${i}`, i]))

const keyOf = ([x, y, z]: Vec3) => `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`

describe('stationLayout — 작업 포드', () => {
  // 시안 포드 0~3은 허브 둘레에서 끝 캡이 맞닿게 그려져 있어 사각형으로는 모서리가 겹친다 — 추가한 4~7만 검사한다.
  it('포드는 8개이고 추가 포드(4~7)는 위에서 볼 때 다른 포드와 겹치지 않는다', () => {
    assert.equal(PODS.length, 8)
    const half = (p: (typeof PODS)[number]) => {
      const along = POD.length / 2 + POD.capLength
      return p.axis === 'x' ? { hx: along, hz: POD.outerRadius } : { hx: POD.outerRadius, hz: along }
    }
    PODS.forEach((a, i) =>
      PODS.slice(i + 1).forEach((b, j) => {
        if (i + j + 1 < ALWAYS_SHOWN_PODS) return
        const ha = half(a)
        const hb = half(b)
        const overlap = Math.abs(a.x - b.x) < ha.hx + hb.hx && Math.abs(a.z - b.z) < ha.hz + hb.hz
        assert.ok(!overlap, `포드 ${i}와 ${i + j + 1}`)
      }),
    )
  })

  it('팀원의 작업 상자 자리는 그 팀원 포드의 드롭 구역 안이다 (8자리 모두)', () => {
    const layout = createStationLayout(fullSeats)
    for (const memberId of fullSeats.keys()) {
      const role: PlaceRole = `desk:${memberId}`
      for (let i = 0; i < 10; i++) assert.equal(layout.dropZoneAt(layout.anchor(role, i)), role, `${role} #${i}`)
    }
  })

  it('한 포드 안의 작업 상자 자리는 겹치지 않는다', () => {
    const layout = createStationLayout(fullSeats)
    const slots = Array.from({ length: 9 }, (_, i) => keyOf(layout.anchor('desk:m0', i)))
    assert.equal(new Set(slots).size, slots.length)
  })

  it('아무도 앉지 않은 포드는 드롭 구역이 아니다', () => {
    const layout = createStationLayout(new Map([['m0', 0]]))
    assert.equal(layout.dropZoneAt([PODS[4].x * WORLD_SCALE, 0, PODS[4].z * WORLD_SCALE]), null)
    assert.equal(layout.dropZoneAt([PODS[0].x * WORLD_SCALE, 0, PODS[0].z * WORLD_SCALE]), 'desk:m0')
  })

  it('자리가 없는 팀원의 desk 역할은 호출 쪽 버그로 본다', () => {
    assert.throws(() => createStationLayout(new Map()).anchor('desk:m9', 0))
  })

  it('v1 mock 사무실: 자리가 있는 팀원만 자리표에 들어간다', async () => {
    const snap = await load('ws_1')
    const seats = deskSeats(snap.members)
    const expected = snap.members.filter((m) => m.removedAt === null && m.deskIndex !== null)
    assert.deepEqual([...seats.keys()], expected.map((m) => m.id))
    const layout = createStationLayout(seats)
    for (const id of seats.keys()) assert.equal(layout.dropZoneAt(layout.anchor(`desk:${id}`, 0)), `desk:${id}`)
  })
})

describe('stationLayout — 공용 구역', () => {
  const layout = createStationLayout(fullSeats)

  it('백로그 · 회의 자리는 각자의 드롭 구역 안이다', () => {
    for (let i = 0; i < 20; i++) assert.equal(layout.dropZoneAt(layout.anchor('backlog', i)), 'backlog', `backlog #${i}`)
    for (let i = 0; i < 14; i++) assert.equal(layout.dropZoneAt(layout.anchor('meeting', i)), 'meeting', `meeting #${i}`)
  })

  it('검토 · 완료 · 게시판은 드롭 구역이 아니다 (CONTRACTS.md 「8」 드롭 결과)', () => {
    for (const role of ['review', 'done', 'board'] as const) assert.equal(layout.dropZoneAt(layout.anchor(role, 0)), null, role)
  })

  it('역할마다 첫 칸들이 서로 겹치지 않는다', () => {
    for (const [role, n] of [['backlog', 16], ['review', 9], ['done', 14], ['meeting', 12], ['board', 7]] as const) {
      const slots = Array.from({ length: n }, (_, i) => keyOf(layout.anchor(role, i)))
      assert.equal(new Set(slots).size, n, role)
    }
  })

  it('데크에 판이 없는 요구사항 구역은 호출 쪽 버그로 본다 (#16)', () => {
    assert.throws(() => layout.anchor('requirement:r_1', 0))
  })
})

describe('stationLayout — 이동 길 route (CONTRACTS.md 「8」 · 「10」 아바타 이동 연출)', () => {
  const layout = createStationLayout(fullSeats)
  const near = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6)
  const length = (pts: Vec3[]) => pts.reduce((s, p, i) => (i === 0 ? 0 : s + Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2])), 0)

  it('포드 8개 모두 지휘 브리지까지 통로 길이 있고, 포드 중심에서 시작해 브리지 중심에서 끝난다', () => {
    PODS.forEach((p, i) => {
      const path = layout.route!(`desk:m${i}` as PlaceRole, 'meeting')
      assert.ok(path.length >= 2, `pod ${i}`)
      assert.ok(near(path[0], [p.x * WORLD_SCALE, path[0][1], p.z * WORLD_SCALE]), `pod ${i} start`)
      const end = path[path.length - 1]
      assert.ok(near(end, [BRIDGE.x * WORLD_SCALE, end[1], BRIDGE.z * WORLD_SCALE]), `pod ${i} end`)
      assert.ok(length(path) > 0)
      // 돌아오는 길은 같은 길을 거꾸로 간다
      assert.deepEqual(layout.route!('meeting', `desk:m${i}` as PlaceRole), [...path].reverse())
    })
  })

  it('자리가 없는 팀원 · 같은 곳 · 이동 대상이 아닌 역할은 빈 길(빛 점 없이 페이드만)', () => {
    assert.deepEqual(layout.route!('desk:nobody' as PlaceRole, 'meeting'), [])
    assert.deepEqual(layout.route!('meeting', 'meeting'), [])
    assert.deepEqual(layout.route!('backlog', 'meeting'), [])
  })
})

describe('작업 포드 승무원은 자기 컴퓨터를 바라본다 (#302)', () => {
  it('포드 8개 모두 — 승무원의 방향이 콘솔 쪽이고, 콘솔 화면은 승무원 쪽을 향한다', () => {
    const diff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
    assert.equal(PODS.length, 8)
    for (const [i, pod] of PODS.entries()) {
      const c = podConsole(pod)
      const toConsole = Math.atan2(c.x - pod.crew.x, c.z - pod.crew.z)
      assert.ok(diff(pod.crew.facing, toConsole) < 1e-9, `포드 ${i}: 콘솔 쪽을 본다`)
      // 콘솔 앞면(로컬 +z를 ry만큼 돌린 방향)은 승무원 쪽 — 승무원이 화면 앞에 선다
      assert.ok(diff(c.ry, toConsole + Math.PI) < Math.PI / 4, `포드 ${i}: 화면이 승무원 쪽`)
    }
  })

  it('시안 자리보다 콘솔 쪽으로 조금만 다가선다 — 책상과 작업 상자는 넉넉히 비운다', () => {
    for (const [i, pod] of PODS.entries()) {
      const c = podConsole(pod)
      const along = pod.axis === 'x' ? Math.abs(c.x - pod.crew.x) : Math.abs(c.z - pod.crew.z)
      // 시안 자리는 콘솔에서 2.9~3.1 — 0.5 다가서 2.4~2.6, 책상 앞(콘솔 깊이 0.8 + 상판 0.65)에는 닿지 않는다
      assert.ok(along > 2.3 && along < 2.7, `포드 ${i}: 콘솔까지 ${along.toFixed(2)}`)
      assert.ok(Math.hypot(pod.crew.x - pod.cargo.x, pod.crew.z - pod.cargo.z) > 1.2, `포드 ${i}: 작업 상자와 떨어짐`)
    }
  })
})
