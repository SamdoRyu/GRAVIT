// 활동 기록 (#173 — FR-ACT-01 ~ 03 · P12, CONTRACTS_API.md 「14」). 규칙(rules/activity) · mock · store를 함께 본다.
// mock 세션은 김옥토(m_1)이고, seed에 내 확인된 기획 활동 ac_1 · 박데브(m_3)의 확인 대기 자료조사 ac_2가 있다. mock에는 강사가 없다.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import { ACTIVITY_MSG, activityCreateError, activityMinutesByKind, canConfirmActivity, canWriteActivity } from '../../src/data/rules/activity'
import type { ActivityCreateRequest, ActivityRecordDto, Viewer } from '../../src/data/types'
import { useOffice } from '../../src/store'
import { activityRecordExample } from './examples'

const TEAM_WS = 'ws_1'
const make = () => createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], syncDurationMs: 0 })
const req = (patch: Partial<ActivityCreateRequest> = {}): ActivityCreateRequest => ({ kind: 'design', content: '화면 시안 정리', durationMinutes: 30, ...patch })
const me: Viewer = { userId: 'u_1', role: 'participant', memberId: 'm_1', activityConsented: true }

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, `expected DataError, got ${String(e)}`)
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

afterEach(() => useOffice.getState().closeOffice())

describe('활동 기록 — 규칙', () => {
  it('내용 1~500자(공백뿐이면 빈 것) · 1~1440분 정수', () => {
    assert.equal(activityCreateError(req()), null)
    assert.equal(activityCreateError(req({ content: '   ' })), ACTIVITY_MSG.content)
    assert.equal(activityCreateError(req({ content: 'a'.repeat(500) })), null)
    assert.equal(activityCreateError(req({ content: 'a'.repeat(501) })), ACTIVITY_MSG.content)
    for (const ok of [1, 1440]) assert.equal(activityCreateError(req({ durationMinutes: ok })), null)
    for (const bad of [0, 1441, 1.5, Number.NaN]) assert.equal(activityCreateError(req({ durationMinutes: bad })), ACTIVITY_MSG.minutes)
  })

  it('리포트 분포 — 확인된 것만 유형별 합계, 계약 enum 순서, 없는 유형은 빠진다', () => {
    const r = (kind: ActivityRecordDto['kind'], minutes: number, status: ActivityRecordDto['status']): ActivityRecordDto => ({ ...activityRecordExample, kind, durationMinutes: minutes, status })
    assert.deepEqual(activityMinutesByKind([r('research', 30, 'confirmed'), r('planning', 20, 'confirmed'), r('research', 15, 'confirmed'), r('design', 60, 'pending')]), [
      { kind: 'planning', totalMinutes: 20 },
      { kind: 'research', totalMinutes: 45 },
    ])
  })

  it('확인 버튼 — 작성자가 아닌 팀원이 아직 확인하지 않았을 때만, 강사는 쓰기 · 확인 없음', () => {
    const other: ActivityRecordDto = { ...activityRecordExample, authorMemberId: 'm_3', confirmedByMemberIds: [] }
    assert.equal(canConfirmActivity(other, me), true)
    assert.equal(canConfirmActivity({ ...other, confirmedByMemberIds: ['m_1'] }, me), false)
    assert.equal(canConfirmActivity({ ...other, authorMemberId: 'm_1' }, me), false)
    const instructor: Viewer = { userId: 'u_9', role: 'instructor', memberId: null, activityConsented: false }
    assert.equal(canWriteActivity(instructor), false)
    assert.equal(canConfirmActivity(other, instructor), false)
  })
})

describe('활동 기록 — mock', () => {
  it('목록은 createdAt 내림차순, status로 거른다 · 이상한 status는 invalid', async () => {
    const source = make()
    assert.deepEqual((await source.listActivities(TEAM_WS)).items.map((a) => a.id), ['ac_2', 'ac_1'])
    assert.deepEqual((await source.listActivities(TEAM_WS, 'pending')).items.map((a) => a.id), ['ac_2'])
    await rejectsCode(source.listActivities(TEAM_WS, 'done' as never), 'invalid')
  })

  it('기록하면 pending · 맨 앞, 동의를 거두면 conflict, 내용이 틀리면 invalid가 먼저', async () => {
    const source = make()
    const created = await source.createActivity(TEAM_WS, req())
    assert.deepEqual([created.status, created.authorMemberId, created.confirmedByMemberIds], ['pending', 'm_1', []])
    assert.equal((await source.listActivities(TEAM_WS)).items[0].id, created.id)
    assert.equal(await source.setActivityConsent(TEAM_WS, false), false)
    assert.equal((await source.load(TEAM_WS)).viewer.activityConsented, false)
    await rejectsCode(source.createActivity(TEAM_WS, req({ content: '' })), 'invalid')
    await rejectsCode(source.createActivity(TEAM_WS, req()), 'conflict', ACTIVITY_MSG.notConsented)
  })

  it('다른 팀원 것을 확인하면 confirmed + 메모지 하나(시간 · 내용 없음), 다시 확인해도 그대로, 내 것은 forbidden_role', async () => {
    const source = make()
    const before = (await source.load(TEAM_WS)).activityNotes.length
    const done = await source.confirmActivity(TEAM_WS, 'ac_2')
    assert.deepEqual([done.status, done.confirmedByMemberIds], ['confirmed', ['m_1']])
    const notes = (await source.load(TEAM_WS)).activityNotes
    assert.equal(notes.length, before + 1)
    assert.deepEqual(Object.keys(notes.at(-1)!).sort(), ['authorMemberId', 'confirmedAt', 'id', 'kind'])
    assert.deepEqual((await source.confirmActivity(TEAM_WS, 'ac_2')).confirmedByMemberIds, ['m_1'])
    assert.equal((await source.load(TEAM_WS)).activityNotes.length, before + 1)
    await rejectsCode(source.confirmActivity(TEAM_WS, 'ac_1'), 'forbidden_role', ACTIVITY_MSG.ownRecord)
    await rejectsCode(source.confirmActivity(TEAM_WS, 'nope'), 'not_found')
  })

  it('회고 리포트 분포는 내 확인된 활동만 (FR-ACT-03)', async () => {
    const source = make()
    await source.createActivity(TEAM_WS, req({ kind: 'planning', durationMinutes: 999 })) // 확인 전 — 빠진다
    const report = await source.createReport(TEAM_WS, 'm_1', { kind: 'midterm' })
    assert.deepEqual(report.activityDistribution, [{ kind: 'planning', totalMinutes: 90 }])
  })
})

describe('활동 기록 — store', () => {
  it('동의를 바꾸면 snapshot.viewer.activityConsented가 응답 값으로 (SSE 알림이 없다)', async () => {
    await useOffice.getState().openOffice(make(), TEAM_WS)
    assert.equal(useOffice.getState().office?.snapshot?.viewer.activityConsented, true)
    assert.equal(await useOffice.getState().setActivityConsent(false), false)
    assert.equal(useOffice.getState().office?.snapshot?.viewer.activityConsented, false)
    assert.equal(await useOffice.getState().createActivity(req()), null, '동의 안 함 — 알림 후 null')
  })
})
