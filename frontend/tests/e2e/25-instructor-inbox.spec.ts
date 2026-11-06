// 25. 강사 요청함 (#224 — FR-LRN-23, CONTRACTS_API.md 「16」): 강사에게만 사무실 고르기의 "강사 요청함"과 상단 바 더보기 "강사 요청함"이
// 있다. 항목을 누르면 그 사무실을 열고 관리 패널의 해당 탭(도움 요청 · 결정 기록 · 회고의 카드 주인 · 기술 결정 카드 보기)으로 간다.
// mock에는 강사 계정이 없다 — 학생 화면(메뉴 · 목록 없음)은 mock으로, 강사 흐름은 ?source=api로 보되 /api/**를 계약 예시로 돌려준다
// (서버 없이 화면 흐름만 본다. 실제 Spring 통합은 PR 「검증」에 따로 적는다).
import type { Page, Route } from '@playwright/test'
import { helpRequestDetailExample, helpRequestSummaryExample, inboxItemExample, meResponseExample, retroReportExample, workspaceSnapshotExample } from '../contract/examples'
import { expect, openApp, test } from './fixtures'

const WS = workspaceSnapshotExample.workspace
const OWNER = workspaceSnapshotExample.members[0] // 김옥토 — 도움 요청 · 카드의 주인
const INSTRUCTOR = { ...meResponseExample, user: { userId: '40', githubLogin: 'instructor-kim', displayName: '김강사', avatarUrl: null }, githubUserId: '9001', isInstructor: true }

const HELP_TITLE = inboxItemExample.title
const help = { ...helpRequestSummaryExample, requesterMemberId: OWNER.id, instructorRequested: true, instructorRequestedAt: '2026-11-05T01:30:00Z' }
// 꼬리질문을 요청한 카드 — 주인 김옥토, PR #15
const card = { ...retroReportExample.decisionCards[0], id: '50', memberId: OWNER.id, followUpRequested: true, followUpRequestedAt: '2026-11-05T01:00:00Z' }
const items = {
  help: { ...inboxItemExample, ownerMemberId: OWNER.id, answeredAt: null },
  card: { ...inboxItemExample, kind: 'follow_up_question', targetId: '50', ownerMemberId: OWNER.id, title: 'feat(auth): GitHub 로그인', requestedAt: '2026-11-05T01:00:00Z', answeredAt: null },
  decision: { ...inboxItemExample, kind: 'decision_feedback', targetId: '60', ownerMemberId: OWNER.id, title: '세션 만료 처리 방식', requestedAt: '2026-11-04T09:00:00Z', answeredAt: '2026-11-04T10:00:00Z' },
}

/** 강사로 로그인한 서버 흉내 — 계약 경로만 답하고, 그 밖의 /api 요청은 테스트를 실패시킨다 */
async function serveInstructorApi(page: Page): Promise<string[]> {
  const unexpected: string[] = []
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })
  // 경로가 /api/로 시작하는 것만 — '**/api/**'는 Vite 모듈(/src/data/api/…)까지 잡는다
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const ws = `/api/workspaces/${WS.id}`
    if (req.method() !== 'GET') return unexpected.push(`${req.method()} ${path}`), route.abort()
    if (path === '/api/me') return json(route, INSTRUCTOR)
    if (path === '/api/workspaces') return json(route, [{ ...WS, myRole: 'instructor' }])
    if (path === '/api/repositories') return json(route, { organizations: [] })
    if (path === '/api/instructor/inbox') {
      const answered = url.searchParams.get('answered')
      const all = [items.help, items.card, items.decision]
      return json(route, answered === null ? all : all.filter((i) => (i.answeredAt !== null) === (answered === 'true')))
    }
    if (path === `${ws}/snapshot`) {
      return json(route, { ...workspaceSnapshotExample, viewer: { userId: INSTRUCTOR.user.userId, role: 'instructor', memberId: null, activityConsented: false }, helpRequests: [help] })
    }
    if (path === `${ws}/events`) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' })
    if (path === `${ws}/help-requests/${help.id}`) return json(route, { ...helpRequestDetailExample, ...help, comments: [], commentCount: 0 })
    if (path === `${ws}/members/${OWNER.id}/decision-cards`) return json(route, [card])
    unexpected.push(`GET ${path}${url.search}`)
    return route.abort()
  })
  // 도착 장면은 이 계정이 이미 본 것으로 — 장면 흐름은 15-entry가 본다
  await page.addInitScript((userId) => localStorage.setItem(`gravit.landingSeen.${userId}`, '1'), INSTRUCTOR.user.userId)
  return unexpected
}

test('a student has no instructor inbox — not on the workspace picker, not in the more menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '사무실 고르기' })).toBeVisible()
  await expect(page.getByRole('list', { name: '들어갈 수 있는 사무실' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '강사 요청함' })).toHaveCount(0)

  await openApp(page, 'mock', { scene: false })
  await page.getByRole('banner').getByRole('button', { name: '더보기' }).click()
  await expect(page.getByRole('menuitem', { name: '강사' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '강사 요청함' })).toHaveCount(0)
})

test('an instructor filters the inbox on the picker, opens a help request in its office, then a card owner from the menu', async ({ page }) => {
  const unexpected = await serveInstructorApi(page)
  await page.goto('/?source=api')

  // 사무실 고르기 — 처음은 "답할 것"(answered=false)
  const section = page.getByRole('region', { name: '강사 요청함' })
  const list = section.getByRole('list', { name: '강사 요청함 목록' })
  await expect(list.getByRole('button')).toHaveCount(2)
  const helpItem = list.getByRole('button', { name: `도움 요청: ${HELP_TITLE}` })
  await expect(helpItem).toContainText(WS.displayName)
  await expect(helpItem).toContainText('답 전')
  await expect(list.getByRole('button', { name: '꼬리질문: feat(auth): GitHub 로그인' })).toBeVisible()

  const filters = section.getByRole('group', { name: '요청함 고르기' })
  await filters.getByRole('button', { name: '답한 것' }).click()
  await expect(list.getByRole('button')).toHaveCount(1)
  await expect(list.getByRole('button', { name: '결정 피드백: 세션 만료 처리 방식' })).toContainText('답함')
  await filters.getByRole('button', { name: '전부' }).click()
  await expect(list.getByRole('button')).toHaveCount(3)

  // 도움 요청을 누르면 그 사무실에 들어가 도움 요청 탭의 그 글이 열린다
  await list.getByRole('button', { name: `도움 요청: ${HELP_TITLE}` }).click()
  const panel = page.getByRole('region', { name: '관리 패널' })
  await expect(panel.getByRole('tab', { name: /^도움 요청/ })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('region', { name: '도움 요청 상세' })).toContainText('SameSite')

  // 사무실 안 — 더보기 "강사 요청함"에서 꼬리질문을 누르면 대화상자가 닫히고 회고 탭에서 카드 주인 · "기술 결정 카드" 보기가 열린다
  await page.getByRole('banner').getByRole('button', { name: '더보기' }).click()
  await page.getByRole('menuitem', { name: '강사 요청함' }).click()
  const dialog = page.getByRole('dialog', { name: '강사 요청함' })
  await dialog.getByRole('button', { name: '꼬리질문: feat(auth): GitHub 로그인' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(panel.getByRole('tab', { name: /^회고/ })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('combobox', { name: '팀원' })).toHaveValue(OWNER.id)
  await expect(panel.getByRole('group', { name: '회고 보기' }).getByRole('button', { name: '기술 결정 카드' })).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByRole('list', { name: '기술 결정 카드 목록' }).getByRole('button', { name: '기술 결정 카드: #15 feat(auth): GitHub 로그인' })).toContainText('꼬리질문 요청')

  expect(unexpected, 'only contract paths are called').toEqual([])
})
