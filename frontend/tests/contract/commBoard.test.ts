// 통신 허브 게시판 (#205 — CONTRACTS.md 「8」 게시판, 2026-11-06 결정): 오브젝트 하나, 배지는 help:N · candidate:k.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import type { HelpRequestSummary, WorkspaceSnapshot } from '../../src/data/types'
import { BOARD_KEY, buildSceneModel } from '../../src/scene/model/buildSceneModel'

const load = () =>
  createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => new Date('2026-11-05T03:00:00Z') }).load('ws_1')

const boardOf = (snap: WorkspaceSnapshot) => buildSceneModel(snap).filter((e) => e.kind === 'board')

function help(id: string, status: HelpRequestSummary['status'], isAgendaCandidate = false): HelpRequestSummary {
  return {
    id,
    requesterMemberId: 'm_1',
    content: `도움 ${id}`,
    status,
    isAgendaCandidate,
    instructorRequested: false,
    instructorRequestedAt: null,
    agendaItemId: null,
    fromStandupId: null,
    commentCount: 0,
    createdAt: '2026-11-03T00:00:00Z',
    closedAt: null,
  }
}

describe('SceneModel — 통신 허브 게시판 (#205)', () => {
  it('게시판은 늘 하나 — key board · kind board · placeRole board · refId null', async () => {
    const snap = await load()
    const boards = boardOf(snap)
    assert.equal(boards.length, 1)
    assert.deepEqual({ ...boards[0], badges: [] }, { key: BOARD_KEY, kind: 'board', refId: null, placeRole: 'board', badges: [] })
  })

  it('배지: 열린 · 논의 중 도움 요청 수(help:N), 그중 48시간 안건 후보 수(candidate:k) — 해결 · 안건 · 종료는 세지 않는다', async () => {
    const snap = { ...(await load()), helpRequests: [help('1', 'open', true), help('2', 'discussing'), help('3', 'discussing', true), help('4', 'resolved'), help('5', 'on_agenda'), help('6', 'ended')] }
    assert.deepEqual(boardOf(snap)[0].badges, ['help:3', 'candidate:2'])
  })

  it('0이면 배지를 붙이지 않는다 — 후보가 없으면 help만, 도움 요청이 없으면 배지 없음', async () => {
    const base = await load()
    assert.deepEqual(boardOf({ ...base, helpRequests: [help('1', 'open')] })[0].badges, ['help:1'])
    assert.deepEqual(boardOf({ ...base, helpRequests: [help('1', 'resolved')] })[0].badges, [])
    assert.deepEqual(boardOf({ ...base, helpRequests: [] })[0].badges, [])
  })

  it('mock 팀 사무실 seed와 같은 값 — 도움 요청 요약에서 바로 센다(사람별 값 없음)', async () => {
    const snap = await load()
    const live = snap.helpRequests.filter((h) => h.status === 'open' || h.status === 'discussing')
    const expected = live.length > 0 ? [`help:${live.length}`] : []
    const k = live.filter((h) => h.isAgendaCandidate).length
    if (k > 0) expected.push(`candidate:${k}`)
    assert.deepEqual(boardOf(snap)[0].badges, expected)
    assert.ok(boardOf(snap)[0].badges.every((b) => /^(help|candidate):\d+$/.test(b)))
  })
})
