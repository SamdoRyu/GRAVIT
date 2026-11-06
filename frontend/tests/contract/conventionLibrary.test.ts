// 컨벤션 라이브러리 (#225 — FR-LIB, CONTRACTS_API.md 「17」). 규칙(rules/conventionLibrary)과 mock을 함께 본다.
// mock에는 GitHub 계정 강사가 없어 쓰기는 늘 forbidden_role이다 — 등록 · 편집 성공은 백엔드 ConventionLibraryIntegrationTest가 본다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DataError, type DataErrorCode } from '../../src/data/DataSource'
import { createMemoryStorage } from '../../src/data/mock'
import { createV1MockDataSource, type MockSession } from '../../src/data/mock/v1'
import { CONVENTION_MSG, CONVENTION_TARGETS, canEditConventionLibrary, conventionRequestError } from '../../src/data/rules/conventionLibrary'
import type { ConventionLibraryItemRequest, ConventionTarget } from '../../src/data/types'
import { conventionLibraryItemRequestExample } from './examples'

const make = (session: MockSession | null) => createV1MockDataSource({ storage: createMemoryStorage(), session, latencyMs: [0, 0], syncDurationMs: 0 })
const req = (patch: Partial<ConventionLibraryItemRequest> = {}): ConventionLibraryItemRequest => ({ ...conventionLibraryItemRequestExample, ...patch })

async function rejectsCode(p: Promise<unknown>, code: DataErrorCode, message?: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof DataError, `expected DataError, got ${String(e)}`)
    assert.equal(e.code, code)
    if (message) assert.equal(e.message, message)
    return true
  })
}

describe('컨벤션 라이브러리 — 규칙', () => {
  it('대상 7종 계약 순서 그대로', () => {
    assert.deepEqual(CONVENTION_TARGETS, ['branch_name', 'commit_message', 'pr_title', 'pr_body', 'issue_body', 'issue_template', 'pr_template'])
  })

  it('name 1~100자 · content 1~20000자(공백만 거부) · description null 또는 0~2000자 · 대상 7종', () => {
    assert.equal(conventionRequestError(req()), null)
    assert.equal(conventionRequestError(req({ name: 'a'.repeat(100), content: 'a'.repeat(20000), description: 'a'.repeat(2000) })), null)
    assert.equal(conventionRequestError(req({ description: null })), null)
    assert.equal(conventionRequestError(req({ description: '' })), null)
    assert.equal(conventionRequestError(req({ target: 'label_name' as ConventionTarget })), CONVENTION_MSG.target)
    assert.equal(conventionRequestError(req({ target: 'BRANCH_NAME' as ConventionTarget })), CONVENTION_MSG.target)
    assert.equal(conventionRequestError(req({ name: '' })), CONVENTION_MSG.name)
    assert.equal(conventionRequestError(req({ name: '   ' })), CONVENTION_MSG.name)
    assert.equal(conventionRequestError(req({ name: 'a'.repeat(101) })), CONVENTION_MSG.name)
    assert.equal(conventionRequestError(req({ content: ' \n ' })), CONVENTION_MSG.content)
    assert.equal(conventionRequestError(req({ content: 'a'.repeat(20001) })), CONVENTION_MSG.content)
    assert.equal(conventionRequestError(req({ description: 'a'.repeat(2001) })), CONVENTION_MSG.description)
  })

  it('등록 · 편집은 GitHub 계정 강사만 — 심사용 계정은 강사여도 읽기만', () => {
    assert.equal(canEditConventionLibrary({ isInstructor: true, accountType: 'github' }), true)
    assert.equal(canEditConventionLibrary({ isInstructor: true, accountType: 'review' }), false)
    assert.equal(canEditConventionLibrary({ isInstructor: false, accountType: 'github' }), false)
    assert.equal(canEditConventionLibrary(null), false)
  })
})

describe('컨벤션 라이브러리 — mock', () => {
  it('로그인한 누구나(심사용 포함) target · name 순으로 읽는다, 로그인 없으면 unauthorized', async () => {
    for (const session of ['github', 'review'] as const) {
      const items = await make(session).listConventionLibrary()
      assert.ok(items.length > 0)
      const keys = items.map((i) => [CONVENTION_TARGETS.indexOf(i.target), i.name] as const)
      assert.deepEqual(keys, [...keys].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)))
    }
    await rejectsCode(make(null).listConventionLibrary(), 'unauthorized')
  })

  it('쓰기 — 본문 검사(invalid)가 먼저, 그다음 강사가 아니면 forbidden_role. 거부 뒤 목록 그대로', async () => {
    const src = make('github')
    const before = await src.listConventionLibrary()
    await rejectsCode(src.createConventionLibraryItem(req({ name: ' ' })), 'invalid', CONVENTION_MSG.name)
    await rejectsCode(src.createConventionLibraryItem(req()), 'forbidden_role', CONVENTION_MSG.notEditor)
    await rejectsCode(src.updateConventionLibraryItem(before[0].id, req()), 'forbidden_role', CONVENTION_MSG.notEditor)
    // 역할이 대상 조회보다 먼저 — 없는 항목이어도 forbidden_role (서버 ConventionLibraryController)
    await rejectsCode(src.updateConventionLibraryItem('cl_404', req()), 'forbidden_role')
    await rejectsCode(make('review').createConventionLibraryItem(req()), 'forbidden_role')
    await rejectsCode(make(null).createConventionLibraryItem(req()), 'unauthorized')
    assert.deepEqual(await src.listConventionLibrary(), before)
  })
})
