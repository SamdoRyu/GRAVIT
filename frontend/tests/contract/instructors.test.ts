// 강사 지정 · 해제 (#53 — FR-AUTH-06, CONTRACTS_API.md 「7」). 규칙(rules/instructors) · mock · store를 함께 본다.
// mock seed: 팀 사무실(ws_1) — 김옥토는 참여자, 박멘토(9001) 지정됨. 시연 사무실(ws_2) — 김옥토가 R2, 지정 없음.
// 승인된 강사 계정(허용 목록): 9001 박멘토 · 9002(로그인한 적 없음) · 9003 한멘토.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource } from '../../src/data/mock/v1'
import { INSTRUCTOR_MSG, assignError, assignableCandidates, canManageInstructors, instructorName } from '../../src/data/rules/instructors'
import type { Change } from '../../src/data/types'
import { useOffice } from '../../src/store'

const TEAM_WS = 'ws_1'
const DEMO_WS = 'ws_2'
const make = () => createV1MockDataSource({ storage: createMemoryStorage(), session: 'github', latencyMs: [0, 0], syncDurationMs: 0, now: () => new Date('2026-11-05T03:00:00Z') })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, `expected DataError, got ${String(e)}`)
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

describe('강사 지정 — 규칙', () => {
  it('요청한 사람 자신이 먼저(conflict), 그다음 허용 목록(invalid) — 서버와 같은 순서', () => {
    assert.deepEqual(assignError('1001', '1001', ['9001']), { code: 'conflict', message: INSTRUCTOR_MSG.self })
    assert.deepEqual(assignError('42', '1001', ['9001']), { code: 'invalid', message: INSTRUCTOR_MSG.notAllowlisted })
    assert.equal(assignError('9001', '1001', ['9001']), null)
    assert.equal(assignError('9001', null, ['9001']), null, '심사용 계정(GitHub ID 없음)')
  })

  it('지정 · 해제는 레포 관리자만 · 이름 · 지정할 수 있는 후보', () => {
    assert.equal(canManageInstructors({ role: 'repo_admin' }), true)
    assert.equal(canManageInstructors({ role: 'participant' }), false)
    assert.equal(canManageInstructors({ role: 'instructor' }), false)
    assert.equal(instructorName({ githubUserId: '9001', githubLogin: 'mentor-park', displayName: '박멘토' }), '박멘토')
    assert.equal(instructorName({ githubUserId: '9003', githubLogin: 'mentor-han' }), '@mentor-han')
    assert.equal(instructorName({ githubUserId: '9002', githubLogin: null }), 'GitHub 사용자 #9002')
    const c = (id: string, isAssigned: boolean) => ({ githubUserId: id, githubLogin: null, avatarUrl: null, isAssigned })
    assert.deepEqual(assignableCandidates([c('1', true), c('2', false)]).map((x) => x.githubUserId), ['2'])
  })
})

describe('강사 지정 — mock (「7」)', () => {
  it('목록은 사무실에 들어온 누구나 — 팀 사무실에는 박멘토가 지정돼 있다', async () => {
    const list = await make().listInstructors(TEAM_WS)
    assert.deepEqual(list.map((i) => [i.githubUserId, i.displayName, i.assignedBy.displayName]), [['9001', '박멘토', '이삼도']])
  })

  it('후보 · 지정 · 해제는 레포 관리자만(forbidden_role)', async () => {
    const source = make()
    await rejectsCode(source.listInstructorCandidates(TEAM_WS), 'forbidden_role', INSTRUCTOR_MSG.notAdmin)
    await rejectsCode(source.assignInstructor(TEAM_WS, '9003'), 'forbidden_role')
    await rejectsCode(source.revokeInstructor(TEAM_WS, '9001'), 'forbidden_role')
  })

  it('R2가 지정하면 목록 · 후보에 반영되고 instructors 변경 알림 · 이미 지정돼 있으면 그 지정 · 해제하면 빠진다', async () => {
    const source = make()
    const changes: Change[] = []
    const off = source.subscribe(DEMO_WS, (c) => changes.push(c))
    assert.deepEqual((await source.listInstructorCandidates(DEMO_WS)).map((c) => [c.githubUserId, c.githubLogin, c.isAssigned]), [
      ['9001', 'mentor-park', false],
      ['9002', null, false],
      ['9003', 'mentor-han', false],
    ])
    const made = await source.assignInstructor(DEMO_WS, '9003')
    assert.equal(made.displayName, '한멘토')
    assert.equal(made.assignedBy.displayName, '김옥토')
    assert.ok(changes.some((c) => c.type === 'changed' && c.resources.includes('instructors')))
    assert.equal((await source.assignInstructor(DEMO_WS, '9003')).assignedAt, made.assignedAt, '이미 지정돼 있으면 그 지정')
    assert.deepEqual((await source.listInstructors(DEMO_WS)).map((i) => i.githubUserId), ['9003'])
    assert.equal((await source.listInstructorCandidates(DEMO_WS)).find((c) => c.githubUserId === '9003')?.isAssigned, true)

    await source.revokeInstructor(DEMO_WS, '9003')
    assert.deepEqual(await source.listInstructors(DEMO_WS), [])
    await rejectsCode(source.revokeInstructor(DEMO_WS, '9003'), 'not_found', INSTRUCTOR_MSG.notFound) // 현재 지정 없음
    off()
  })

  it('허용 목록 밖 invalid · 요청한 사람 자신 conflict', async () => {
    const source = make()
    await rejectsCode(source.assignInstructor(DEMO_WS, '42'), 'invalid', INSTRUCTOR_MSG.notAllowlisted)
    await rejectsCode(source.assignInstructor(DEMO_WS, '1001'), 'conflict', INSTRUCTOR_MSG.self)
  })
})

describe('강사 지정 — store', () => {
  afterEach(() => useOffice.getState().closeOffice())
  const st = () => useOffice.getState()

  it('지정 · 해제 · 목록을 DataSource로 — 실패하면 알림 후 null(false)', async () => {
    await st().openOffice(make(), DEMO_WS)
    assert.equal((await st().assignInstructor('9001'))?.githubUserId, '9001')
    assert.deepEqual((await st().loadInstructors())?.map((i) => i.githubUserId), ['9001'])
    assert.equal(await st().revokeInstructor('9001'), true)
    assert.equal(await st().revokeInstructor('9001'), false)
    assert.equal(st().toasts.at(-1)?.level, 'bad')
    assert.equal(await st().assignInstructor('42'), null)
    assert.equal(st().toasts.at(-1)?.text, INSTRUCTOR_MSG.notAllowlisted)
  })

  it('참여자는 후보를 읽지 못한다(알림 후 null)', async () => {
    await st().openOffice(make(), TEAM_WS)
    assert.equal(await st().loadInstructorCandidates(), null)
    assert.deepEqual((await st().loadInstructors())?.map((i) => i.githubUserId), ['9001'])
  })
})
