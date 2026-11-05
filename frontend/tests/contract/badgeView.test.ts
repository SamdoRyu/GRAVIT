// SceneModel 배지 → 화물 위 배지 보기 (#11 · #21 · #23). v1 mock Snapshot을 입력으로 쓴다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import { BADGE, buildSceneModel, countBadge } from '../../src/scene/model/buildSceneModel'
import { BADGE_LABEL, cargoBadgeView, isEmptyBadgeView } from '../../src/scene/badgeView'

const load = (workspaceId: string) =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load(workspaceId)

describe('badgeView — 화물 위 배지', () => {
  it('아이콘 배지는 SceneModel 순서대로, 추천 · 비추천 수는 한 묶음으로', () => {
    const view = cargoBadgeView([BADGE.blocked, BADGE.draft, countBadge(BADGE.recommend, 2), countBadge(BADGE.notRecommend, 1)])
    assert.deepEqual(view, { icons: [BADGE.blocked, BADGE.draft], votes: { recommend: 2, notRecommend: 1 } })
  })

  it('회차가 없으면 수 묶음이 없고, 0표 회차는 0으로 보인다', () => {
    assert.equal(cargoBadgeView([BADGE.unmergedClosed]).votes, null)
    assert.deepEqual(cargoBadgeView([countBadge(BADGE.recommend, 0), countBadge(BADGE.notRecommend, 0)]).votes, { recommend: 0, notRecommend: 0 })
  })

  it('모르는 배지는 무시하고, 배지가 없으면 그릴 것이 없다', () => {
    assert.deepEqual(cargoBadgeView(['someday', 'recommend:x']), { icons: [], votes: null })
    assert.ok(isEmptyBadgeView(cargoBadgeView([])))
    assert.ok(!isEmptyBadgeView(cargoBadgeView([BADGE.notPlanned])))
  })

  it('막힘 · Draft · 미병합 종료 · 계획 안 함 이름표는 사실만 — 이유 문구가 없다', () => {
    assert.deepEqual(BADGE_LABEL, { blocked: '막힘', draft: 'Draft', unmerged_closed: '미병합 종료', not_planned: '계획 안 함' })
  })

  it('v1 mock의 이슈 · PR 배지가 모두 보기로 바뀐다(버려지는 배지 없음)', async () => {
    const snap = await load('ws_1')
    for (const e of buildSceneModel(snap).filter((x) => x.kind === 'issue' || x.kind === 'pr')) {
      const view = cargoBadgeView(e.badges)
      const shown = view.icons.length + (view.votes ? 2 : 0)
      assert.equal(shown, e.badges.length, `${e.key}: ${e.badges}`)
    }
  })
})
