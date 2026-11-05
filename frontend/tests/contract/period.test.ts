// 프로젝트 기간 D-day 규칙 (#38 — FR-PLAN-01). 날짜는 한국 시간 달력 날짜 기준.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SETTINGS_MSG, ddayText, kstToday, periodError, projectDay, settingsError } from '../../src/data/rules/period'

const period = { projectStartDate: '2026-11-04', projectEndDate: '2026-11-17' }
const dday = (today: string) => {
  const d = projectDay(period, today)
  assert.ok(d, today)
  return { ...d, ...ddayText(d) }
}

describe('D-day — 한국 시간 오늘', () => {
  it('UTC 14:59는 아직 한국 날짜로 그날, UTC 15:00부터 다음 날', () => {
    assert.equal(kstToday(new Date('2026-11-04T14:59:59Z')), '2026-11-04')
    assert.equal(kstToday(new Date('2026-11-04T15:00:00Z')), '2026-11-05')
  })
  it('달 · 해가 바뀌는 날도 한국 날짜', () => {
    assert.equal(kstToday(new Date('2026-12-31T15:00:00Z')), '2027-01-01')
    assert.equal(kstToday(new Date('2026-02-28T15:30:00Z')), '2026-03-01')
  })
})

describe('D-day — 단계와 문구', () => {
  it('기간 중 — D-남은 날 · 종료까지 · 오늘 몇째 날', () => {
    const d = dday('2026-11-06')
    assert.deepEqual([d.phase, d.value, d.label, d.dayOfProject, d.totalDays], ['during', 'D-11', '종료까지', 3, 14])
  })
  it('시작 날짜는 1일째', () => {
    const d = dday('2026-11-04')
    assert.deepEqual([d.phase, d.value, d.dayOfProject], ['during', 'D-13', 1])
  })
  it('끝 날짜 — D-day · 오늘 종료 · 마지막 날', () => {
    const d = dday('2026-11-17')
    assert.deepEqual([d.phase, d.value, d.label, d.dayOfProject], ['end_day', 'D-day', '오늘 종료', 14])
  })
  it('끝난 뒤 — D+지난 날 · 종료됨 · 기간 밖', () => {
    const d = dday('2026-11-20')
    assert.deepEqual([d.phase, d.value, d.label, d.dayOfProject], ['after', 'D+3', '종료됨', null])
  })
  it('시작 전 — 끝 날짜까지 D- · 시작 전 · 기간 밖', () => {
    const d = dday('2026-11-01')
    assert.deepEqual([d.phase, d.value, d.label, d.dayOfProject], ['before', 'D-16', '시작 전', null])
  })
  it('하루짜리 기간 — 그날이 D-day, 총 1일', () => {
    const d = projectDay({ projectStartDate: '2026-11-04', projectEndDate: '2026-11-04' }, '2026-11-04')
    assert.deepEqual([d?.phase, d?.totalDays, d?.dayOfProject], ['end_day', 1, 1])
  })
  it('달을 넘는 기간도 날 수가 맞다(일광 절약 시간과 무관)', () => {
    const d = projectDay({ projectStartDate: '2026-03-25', projectEndDate: '2026-04-07' }, '2026-03-31')
    assert.deepEqual([d?.totalDays, d?.dayOfProject, d?.daysToEnd], [14, 7, 7])
  })
})

describe('D-day — 보일 수 없는 기간은 null(화면은 "—")', () => {
  it('끝이 시작보다 빠름 · 형식이 틀림 · 없는 날짜 · 빈 값', () => {
    const today = '2026-11-06'
    assert.equal(projectDay({ projectStartDate: '2026-11-17', projectEndDate: '2026-11-04' }, today), null)
    assert.equal(projectDay({ projectStartDate: '2026/11/04', projectEndDate: '2026-11-17' }, today), null)
    assert.equal(projectDay({ projectStartDate: '2026-02-30', projectEndDate: '2026-03-17' }, today), null)
    assert.equal(projectDay({ projectStartDate: '', projectEndDate: '2026-11-17' }, today), null)
    assert.equal(projectDay({ projectStartDate: null as unknown as string, projectEndDate: '2026-11-17' }, today), null)
    assert.equal(projectDay(period, 'not-a-date'), null)
  })
})

describe('팀 설정 검사 — PUT W/settings 400 규칙 (화면 · mock 공통)', () => {
  const ok = { projectStartDate: '2026-11-04', projectEndDate: '2026-11-17', specDocumentPath: 'docs/requirements.md', reviewWaitHours: 48, noCommitHours: 48 }
  it('맞는 값과 경계(1 · 720시간, 경로 null · 300자, 하루짜리 기간)', () => {
    assert.equal(settingsError(ok), null)
    assert.equal(settingsError({ ...ok, reviewWaitHours: 1, noCommitHours: 720 }), null)
    assert.equal(settingsError({ ...ok, specDocumentPath: null }), null)
    assert.equal(settingsError({ ...ok, specDocumentPath: 'a'.repeat(300) }), null)
    assert.equal(settingsError({ ...ok, projectEndDate: ok.projectStartDate }), null)
  })
  it('날짜 순서 · 형식', () => {
    assert.equal(periodError('2026-11-17', '2026-11-04'), SETTINGS_MSG.endBeforeStart)
    assert.equal(periodError('', '2026-11-04'), SETTINGS_MSG.invalidDate)
    assert.equal(periodError('2026-02-30', '2026-03-04'), SETTINGS_MSG.invalidDate)
    assert.equal(settingsError({ ...ok, projectEndDate: '2026-11-03' }), SETTINGS_MSG.endBeforeStart)
  })
  it('경로 · 기준 시간 범위', () => {
    assert.equal(settingsError({ ...ok, specDocumentPath: '' }), SETTINGS_MSG.invalidSpecPath)
    assert.equal(settingsError({ ...ok, specDocumentPath: 'a'.repeat(301) }), SETTINGS_MSG.invalidSpecPath)
    assert.equal(settingsError({ ...ok, reviewWaitHours: 0 }), SETTINGS_MSG.invalidHours)
    assert.equal(settingsError({ ...ok, noCommitHours: 721 }), SETTINGS_MSG.invalidHours)
    assert.equal(settingsError({ ...ok, noCommitHours: 2.5 }), SETTINGS_MSG.invalidHours)
    assert.equal(settingsError({ ...ok, reviewWaitHours: '48' as unknown as number }), SETTINGS_MSG.invalidHours)
  })
})
