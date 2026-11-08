// 학습 타임라인 · 회고 리포트 (CONTRACTS_API.md 「15」, #209): 규칙(rules/report.ts)과 mock. 강사 읽기 · 권한 규칙 자체는
// Spring 통합 테스트(TimelineIntegrationTest · RetroReportIntegrationTest)가 맡는다 — mock에는 강사 계정이 없다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import {
  REPORT_LEARNING_MAX,
  REPORT_MSG,
  TIMELINE_KIND_LABEL,
  anonymizeMembers,
  reportFileName,
  reportCreateError,
  reportLearningError,
  reportMarkdown,
  slicePage,
  timelinePageError,
} from '../../src/data/rules/report'
import type { AgendaItemCreateRequest, Change, DecisionRequest } from '../../src/data/types'
import { retroReportExample, timelinePageExample } from './examples'

const TEAM_WS = 'ws_1'
/**
 * seed: 나(김옥토 m_1)의 PR s_1(#15, 20시간 전 회차 r_1 — 추천 1 · 비추천 1) · 머지된 s_4(#7, 이유 없는 회차 — #218), 내 이슈 t_2(area:auth) · t_3(area:workspace)
 */
const NOW = new Date('2026-11-05T03:00:00Z')
const ME = 'm_1'
const minutesLater = (m: number) => new Date(NOW.getTime() + m * 60_000)

function make() {
  const clock = { at: NOW }
  const source = createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], now: () => clock.at })
  return { source, clock }
}

const agenda = (over: Partial<AgendaItemCreateRequest> = {}): AgendaItemCreateRequest => ({ kind: 'learning', sourceId: null, title: '테스트 전략 공유', background: null, tried: null, unresolvedReason: null, ...over })
const decision = (over: Partial<DecisionRequest> = {}): DecisionRequest => ({ conclusion: '이대로 간다', learning: null, prDecision: null, followUpAssigneeMemberId: null, followUpDueDate: null, meetingId: null, ...over })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, String(e))
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

describe('회고 리포트 규칙', () => {
  it('요청 검사 — 종류는 final · midterm, 배운 점은 문자열 0~5000자, 타임라인 page ≥ 0 · size 1~100', () => {
    assert.equal(reportCreateError({ kind: 'final' }), null)
    assert.equal(reportCreateError({ kind: 'midterm' }), null)
    assert.equal(reportCreateError({ kind: 'weekly' }), REPORT_MSG.kind)
    assert.equal(reportCreateError(null), REPORT_MSG.kind)
    assert.equal(reportLearningError({ learning: '' }), null)
    assert.equal(reportLearningError({ learning: '가'.repeat(REPORT_LEARNING_MAX) }), null)
    assert.equal(reportLearningError({ learning: '가'.repeat(REPORT_LEARNING_MAX + 1) }), REPORT_MSG.learning)
    assert.equal(reportLearningError({ learning: null }), REPORT_MSG.learning)
    assert.equal(timelinePageError(0, 20), null)
    assert.equal(timelinePageError(3, 100), null)
    for (const [page, size] of [[-1, 20], [0, 0], [0, 101], [1.5, 20]]) assert.equal(timelinePageError(page, size), REPORT_MSG.page)
  })

  it('화면 표시 — 타임라인 종류 이름 6개 전부, 내보낸 파일 이름은 만든 날(한국 시간)', () => {
    assert.deepEqual(Object.keys(TIMELINE_KIND_LABEL).sort(), ['agenda_decided', 'agenda_raised', 'commit_after_meeting', 'evaluation_given', 'evaluation_received', 'instructor_feedback'])
    assert.equal(reportFileName({ kind: 'final', createdAt: '2026-11-05T14:59:00Z' }), '최종-회고-리포트-2026-11-05.md')
    // UTC로는 11-05지만 한국 시간으로는 11-06
    assert.equal(reportFileName({ kind: 'midterm', createdAt: '2026-11-05T15:00:00Z' }), '중간-회고-리포트-2026-11-06.md')
  })

  it('페이지 자르기 — 마지막 페이지 뒤는 빈 items, 전체 수 · 페이지 수는 그대로', () => {
    assert.deepEqual(slicePage([1, 2, 3, 4, 5], 1, 2), { items: [3, 4], page: 1, size: 2, totalItems: 5, totalPages: 3 })
    assert.deepEqual(slicePage([1, 2, 3, 4, 5], 9, 2).items, [])
    assert.deepEqual(slicePage([], 0, 20), { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 })
  })

  it('익명화 — 처음 나온 순서대로 팀원 A · B…, 이름 · 로그인 · 대소문자 같은 사람, 영문에 붙은 곳은 건너뛰고 한글 조사는 바꾼다', () => {
    const members = [
      { id: 'm_1', displayName: '김옥토', githubLogin: 'octo-kim' },
      { id: 'm_2', displayName: '이삼도', githubLogin: 'samdo-lee' },
      { id: 'm_9', displayName: 'kim', githubLogin: null },
    ]
    assert.equal(
      anonymizeMembers('이삼도가 @OCTO-KIM에게 물었고 김옥토와 kimchi를 먹은 kim', members),
      '팀원 A가 @팀원 B에게 물었고 팀원 B와 kimchi를 먹은 팀원 C',
    )
    assert.equal(anonymizeMembers('아무도 없음', []), '아무도 없음')
  })

  it('마크다운 — 서버와 같은 절 순서, 값 있는 카드 칸만, 강사는 이름 없이 "강사"', () => {
    const md = reportMarkdown(retroReportExample)
    assert.deepEqual(
      md.split('\n').filter((l) => l.startsWith('#')),
      ['# 최종 회고 리포트', '## 요약', '## 담당 기능 영역', '## 내가 배운 점', '## 안건 결론', '### 실패 응답 모양을 계약대로 바꿀까?', '## 강사 피드백', '## 활동 분포', '## 기술 결정 카드', '### 확인한 카드 — 2026-11-06T01:00:00Z'],
    )
    assert.ok(md.includes('- PR 결정: revise_and_reevaluate\n'))
    assert.ok(md.includes('- 2026-11-05T06:00:00Z 강사: 401과 403을'))
    assert.ok(md.includes('- 자료조사: 90분\n'))
    assert.ok(md.includes('- 무엇을 하려 했나: 로그인 실패를 계약 모양으로 돌려주기\n'))
    assert.ok(!md.includes('왜 그렇게 결정했나'), 'null 칸은 싣지 않는다')
    assert.ok(!md.includes('김강사'))
    const empty = reportMarkdown({ ...retroReportExample, areaLabels: [], learning: '  ', agendaResults: [], instructorFeedbacks: [], activityDistribution: [], decisionCards: [] })
    assert.equal(empty.split('- 없음').length - 1, 6)
  })
})

describe('mock v1 — 학습 타임라인', () => {
  it('내 PR이 받은 이유(평가자 없음 · 회차가 열린 시각 · 추천 먼저) — 모양은 계약 예시와 같다', async () => {
    const { source } = make()
    const page = await source.getTimeline(TEAM_WS, ME)
    assert.deepEqual(Object.keys(page), Object.keys(timelinePageExample))
    assert.deepEqual(Object.keys(page.items[0]), Object.keys(timelinePageExample.items[0]))
    assert.deepEqual(
      page.items.map((e) => [e.kind, e.occurredAt, e.title, e.verdict, e.detail, e.ref]),
      [
        ['evaluation_received', '2026-11-04T07:00:00Z', '#15 feat(auth): GitHub 로그인', 'recommend', '세션 만료 처리가 명확해요', { type: 'submission', id: 's_1' }],
        ['evaluation_received', '2026-11-04T07:00:00Z', '#15 feat(auth): GitHub 로그인', 'not_recommend', '실패 응답 모양이 계약과 달라요', { type: 'submission', id: 's_1' }],
      ],
    )
    assert.deepEqual([page.page, page.size, page.totalItems, page.totalPages], [0, 20, 2, 1])
  })

  it('내가 남긴 평가 · 올린 안건 · 그 결론이 occurredAt 내림차순으로 더해지고, 페이지로 자른다', async () => {
    const { source, clock } = make()
    clock.at = minutesLater(10)
    await source.evaluate(TEAM_WS, 's_2', { roundId: 'r_2', verdict: 'not_recommend', reason: '리포트 칸 이름이 계약과 달라요' })
    clock.at = minutesLater(20)
    const item = await source.createAgendaItem(TEAM_WS, agenda({ background: '리포트 테스트를 어디까지 쓸까' }))
    clock.at = minutesLater(30)
    await source.recordDecision(TEAM_WS, item.id, decision({ conclusion: '규칙은 순수 함수로 시험한다' }))
    const page = await source.getTimeline(TEAM_WS, ME)
    assert.deepEqual(
      page.items.map((e) => [e.kind, e.occurredAt, e.title, e.detail, e.verdict]),
      [
        ['agenda_decided', '2026-11-05T03:30:00Z', '테스트 전략 공유', '규칙은 순수 함수로 시험한다', null],
        ['agenda_raised', '2026-11-05T03:20:00Z', '테스트 전략 공유', '리포트 테스트를 어디까지 쓸까', null],
        ['evaluation_given', '2026-11-05T03:10:00Z', '#16 feat(report): 회고 리포트 초안', '리포트 칸 이름이 계약과 달라요', 'not_recommend'],
        ['evaluation_received', '2026-11-04T07:00:00Z', '#15 feat(auth): GitHub 로그인', '세션 만료 처리가 명확해요', 'recommend'],
        ['evaluation_received', '2026-11-04T07:00:00Z', '#15 feat(auth): GitHub 로그인', '실패 응답 모양이 계약과 달라요', 'not_recommend'],
      ],
    )
    const second = await source.getTimeline(TEAM_WS, ME, 1, 2)
    assert.deepEqual([second.items.map((e) => e.kind), second.totalItems, second.totalPages], [['evaluation_given', 'evaluation_received'], 5, 3])
    // 다른 팀원(최하나)이 받은 이유에는 내가 남긴 평가가 평가자 없이 섞인다 — 다만 mock에서는 본인 것만 읽을 수 있다
    await rejectsCode(source.getTimeline(TEAM_WS, 'm_4'), 'forbidden_role', REPORT_MSG.notSelf)
  })

  it('경로 팀원 — 없는 팀원 not_found, 빠진 팀원 · 다른 팀원은 있으니 forbidden_role, 페이지 범위 밖 invalid, 남의 사무실 not_found', async () => {
    const { source } = make()
    await rejectsCode(source.getTimeline(TEAM_WS, 'm_nope'), 'not_found', REPORT_MSG.memberNotFound)
    await rejectsCode(source.getTimeline(TEAM_WS, 'm_5'), 'forbidden_role')
    await rejectsCode(source.getTimeline(TEAM_WS, 'm_2'), 'forbidden_role')
    await rejectsCode(source.getTimeline(TEAM_WS, ME, 0, 101), 'invalid', REPORT_MSG.page)
    await rejectsCode(source.getTimeline('ws_nope', ME), 'not_found')
  })
})

describe('mock v1 — 회고 리포트', () => {
  it('만들기 → 목록(createdAt 내림차순) · 읽기 — 계산 칸은 지금 데이터, 모양은 계약 예시와 같다', async () => {
    const { source, clock } = make()
    assert.deepEqual(await source.listReports(TEAM_WS, ME), [])
    const item = await source.createAgendaItem(TEAM_WS, agenda({ title: '에러 응답 모양' }))
    await source.recordDecision(TEAM_WS, item.id, decision({ conclusion: '전역 예외 처리 한 곳', learning: '처음부터 한 곳에서' }))
    clock.at = minutesLater(5)
    const final = await source.createReport(TEAM_WS, ME, { kind: 'final' })
    assert.deepEqual(Object.keys(final), Object.keys(retroReportExample))
    assert.deepEqual(
      [final.kind, final.createdAt, final.memberId, final.summary, final.areaLabels, final.learning, final.activityDistribution, final.decisionCards],
      ['final', '2026-11-05T03:05:00Z', ME, '맡은 이슈 2개(닫힘 0) · 작성한 PR 2개(머지 1) · 올린 안건 1건(결론 1)', ['area:auth', 'area:workspace'], null, [{ kind: 'planning', totalMinutes: 90 }], []],
    )
    assert.deepEqual(final.agendaResults, [{ agendaItemId: item.id, title: '에러 응답 모양', conclusion: '전역 예외 처리 한 곳', learning: '처음부터 한 곳에서', prDecision: null, decidedAt: '2026-11-05T03:00:00Z' }])
    assert.deepEqual(final.instructorFeedbacks, [])
    clock.at = minutesLater(6)
    const midterm = await source.createReport(TEAM_WS, ME, { kind: 'midterm' })
    assert.deepEqual(await source.listReports(TEAM_WS, ME), [
      { id: midterm.id, kind: 'midterm', createdAt: '2026-11-05T03:06:00Z' },
      { id: final.id, kind: 'final', createdAt: '2026-11-05T03:05:00Z' },
    ])
    // 계산 칸은 읽을 때 다시 계산한다 — 만든 뒤 올린 안건도 요약에 들어간다
    await source.createAgendaItem(TEAM_WS, agenda({ title: '다음 안건' }))
    assert.equal((await source.getReport(TEAM_WS, ME, final.id)).summary, '맡은 이슈 2개(닫힘 0) · 작성한 PR 2개(머지 1) · 올린 안건 2건(결론 1)')
  })

  it('내가 배운 점 — 통째로 바꾸고 빈 값으로 지울 수 있다. 5000자 넘으면 invalid, 없는 리포트 not_found', async () => {
    const { source } = make()
    const report = await source.createReport(TEAM_WS, ME, { kind: 'final' })
    assert.equal((await source.updateReportLearning(TEAM_WS, ME, report.id, { learning: '계약을 먼저 읽는다' })).learning, '계약을 먼저 읽는다')
    assert.equal((await source.getReport(TEAM_WS, ME, report.id)).learning, '계약을 먼저 읽는다')
    assert.equal((await source.updateReportLearning(TEAM_WS, ME, report.id, { learning: '' })).learning, '')
    await rejectsCode(source.updateReportLearning(TEAM_WS, ME, report.id, { learning: 'a'.repeat(REPORT_LEARNING_MAX + 1) }), 'invalid', REPORT_MSG.learning)
    await rejectsCode(source.updateReportLearning(TEAM_WS, ME, 'rp_nope', { learning: '' }), 'not_found', REPORT_MSG.reportNotFound)
    await rejectsCode(source.getReport(TEAM_WS, ME, 'rp_nope'), 'not_found', REPORT_MSG.reportNotFound)
  })

  it('본인만 — 다른 팀원 경로의 목록 · 만들기 · 읽기 · 배운 점 · 내보내기는 forbidden_role, 종류가 틀리면 invalid', async () => {
    const { source } = make()
    const report = await source.createReport(TEAM_WS, ME, { kind: 'final' })
    await rejectsCode(source.listReports(TEAM_WS, 'm_2'), 'forbidden_role', REPORT_MSG.notSelf)
    await rejectsCode(source.createReport(TEAM_WS, 'm_2', { kind: 'final' }), 'forbidden_role', REPORT_MSG.notSelfWrite)
    await rejectsCode(source.getReport(TEAM_WS, 'm_2', report.id), 'forbidden_role')
    await rejectsCode(source.updateReportLearning(TEAM_WS, 'm_2', report.id, { learning: '' }), 'forbidden_role', REPORT_MSG.notSelfWrite)
    await rejectsCode(source.exportReportMarkdown(TEAM_WS, 'm_2', report.id), 'forbidden_role')
    await rejectsCode(source.createReport(TEAM_WS, ME, { kind: 'weekly' as never }), 'invalid', REPORT_MSG.kind)
    await rejectsCode(source.getReport(TEAM_WS, 'm_nope', report.id), 'not_found', REPORT_MSG.memberNotFound)
  })

  it('마크다운 내보내기 — 팀원 이름 · 로그인이 "팀원 A"처럼 바뀐다(빠진 팀원 포함)', async () => {
    const { source } = make()
    const item = await source.createAgendaItem(TEAM_WS, agenda({ title: '이삼도와 강떠남(left-kang)이 정한 테스트 전략' }))
    await source.recordDecision(TEAM_WS, item.id, decision({ conclusion: 'samdo-lee가 정리한다' }))
    const report = await source.createReport(TEAM_WS, ME, { kind: 'midterm' })
    await source.updateReportLearning(TEAM_WS, ME, report.id, { learning: '김옥토는 이삼도에게 배웠다' })
    const md = await source.exportReportMarkdown(TEAM_WS, ME, report.id)
    assert.ok(md.startsWith('# 중간 회고 리포트\n\n'))
    // 처음 나온 순서 — 「내가 배운 점」이 「안건 결론」보다 앞이다: 김옥토 A · 이삼도 B · 강떠남 C
    assert.ok(md.includes('팀원 A는 팀원 B에게 배웠다'))
    assert.ok(md.includes('### 팀원 B와 팀원 C(팀원 C)이 정한 테스트 전략\n'))
    assert.ok(md.includes('- 결론: 팀원 B가 정리한다\n'))
    for (const name of ['이삼도', '강떠남', 'left-kang', 'samdo-lee', '김옥토']) assert.ok(!md.includes(name), name)
  })

  it('개인 데이터라 Snapshot · SSE에 실리지 않는다 — 만들기 · 배운 점 쓰기에 알림이 없다', async () => {
    const { source } = make()
    const changes: Change[] = []
    const off = source.subscribe(TEAM_WS, (c) => changes.push(c))
    const report = await source.createReport(TEAM_WS, ME, { kind: 'final' })
    await source.updateReportLearning(TEAM_WS, ME, report.id, { learning: '배운 점' })
    off()
    assert.deepEqual(changes, [])
    assert.ok(!('reports' in (await source.load(TEAM_WS))))
  })
})
