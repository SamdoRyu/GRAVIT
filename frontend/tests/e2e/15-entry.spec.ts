// 15. 진입 흐름 (#64 · #68 화면 몫): 사무실 고르기 → 사무실 → 사무실 바꾸기 → 로그아웃 → 로그인(심사용 · GitHub mock),
// 지난번 사무실 기억. mock 기본 세션은 GitHub 사용자(김옥토)이고 팀 사무실 · 시연 사무실에 들어갈 수 있다.
import type { Page } from '@playwright/test'
import { expect, readStore, test } from './fixtures'

const picker = (page: Page) => page.getByRole('region', { name: '사무실 고르기' })
const login = (page: Page) => page.getByRole('region', { name: '정거장에 탑승하기' })

async function openMenu(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: '더보기' }).click()
  return page.getByRole('menu')
}

test('pick an office, switch, log out, log in for review, and come back to the last office', async ({ page }) => {
  await page.goto('/')
  // 고른 사무실 · 지난번 사무실이 없으면 고르기
  await expect(picker(page)).toBeVisible()
  const offices = picker(page).getByRole('list', { name: '들어갈 수 있는 사무실' }).getByRole('button')
  await expect(offices).toHaveCount(2)
  await offices.filter({ hasText: 'gitvillage' }).click()

  // 사무실 — 상단 바와 v1 데이터
  await expect(page.getByRole('banner').getByText('팀 오피스')).toBeVisible()
  await expect.poll(() => readStore(page, (s) => s.office?.workspaceId ?? null)).toBe('ws_1')
  await expect(page.locator('.kpis .kpi').first().locator('.kpi-label')).toHaveText(/^(시작 전|종료까지|오늘 종료|종료됨)$/)

  // 새로 고침하면 지난번 사무실로 바로
  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null)).toBe('ready')
  expect(await readStore(page, (s) => s.office?.workspaceId)).toBe('ws_1')

  // 사무실 바꾸기 → 고르기, 새로 고침해도 고르기부터
  const menu = await openMenu(page)
  await expect(menu.getByText('김옥토')).toBeVisible()
  await menu.getByRole('menuitem', { name: '사무실 바꾸기' }).click()
  await expect(picker(page)).toBeVisible()
  await page.reload()
  await expect(picker(page)).toBeVisible()

  // 로그아웃 → 로그인 화면
  await picker(page).getByRole('button', { name: '로그아웃' }).click()
  await expect(login(page)).toBeVisible()
  await expect(login(page).getByRole('button', { name: 'GitHub로 계속하기' })).toBeVisible()

  // 심사용 로그인 — 비어 있으면 · 틀리면 안내(어느 값인지 말하지 않음), 맞으면 시연 사무실만
  // 심사용 폼은 접혀 있다 — 펼쳐서 쓴다
  await login(page).getByText('보안 심사용 계정으로 로그인', { exact: true }).click()
  const form = login(page).getByRole('form', { name: '보안 심사용 로그인' })
  await form.getByRole('button', { name: '심사용 계정으로 로그인' }).click()
  await expect(form.getByRole('alert')).toHaveText('아이디와 비밀번호를 입력해 주세요')
  await form.getByLabel('아이디').fill('review')
  await form.getByLabel('비밀번호').fill('wrong')
  await form.getByRole('button', { name: '심사용 계정으로 로그인' }).click()
  await expect(form.getByRole('alert')).toHaveText('아이디나 비밀번호가 맞지 않아요')
  await expect(form.getByLabel('비밀번호')).toHaveValue('')
  await form.getByLabel('비밀번호').fill('review')
  await form.getByRole('button', { name: '심사용 계정으로 로그인' }).click()
  await expect(picker(page)).toBeVisible()
  await expect(picker(page).getByText('심사 계정')).toBeVisible()
  await expect(offices).toHaveCount(1)
  await expect(offices.first()).toContainText('시연')
  await offices.first().click()
  await expect.poll(() => readStore(page, (s) => s.office?.workspaceId ?? null)).toBe('ws_2')

  // 메뉴에서 로그아웃 → GitHub 로그인(mock은 바로 로그인) → 고르기
  await (await openMenu(page)).getByRole('menuitem', { name: '로그아웃' }).click()
  await expect(login(page)).toBeVisible()
  await expect.poll(() => readStore(page, (s) => s.office)).toBeNull()
  await login(page).getByRole('button', { name: 'GitHub로 계속하기' }).click()
  await expect(picker(page)).toBeVisible()
  await expect(picker(page).getByText('김옥토')).toBeVisible()
})

test('open a new office from a repository: admin form with period and spec path, participant and app-approval hints', async ({ page }) => {
  await page.goto('/')
  await expect(picker(page)).toBeVisible()
  const repos = picker(page).getByRole('region', { name: '레포에서 사무실 열기' })
  await expect(repos).toBeVisible()

  // 이미 열린 레포는 들어가기, 앱이 없는 조직은 승인 요청 링크
  const samdo = repos.getByRole('region', { name: 'team-samdo 레포' })
  await expect(samdo.getByRole('listitem').filter({ hasText: 'gitvillage' }).getByRole('button', { name: '들어가기' })).toBeVisible()
  const lab = repos.getByRole('region', { name: 'bootcamp-lab 레포' })
  await expect(lab.getByText('앱 승인 필요')).toBeVisible()
  await expect(lab.getByRole('link', { name: '승인 요청하기' })).toHaveAttribute('href', /github\.com\/apps\//)
  await expect(lab.getByText('앱 승인 뒤 열 수 있어요')).toBeVisible()

  // 레포 관리자 레포 — 사무실 열기 폼
  await samdo.getByRole('listitem').filter({ hasText: 'side-lab' }).getByRole('button', { name: '사무실 열기' }).click()
  const form = samdo.getByRole('form', { name: 'team-samdo/side-lab 사무실 열기' })
  await expect(form).toBeVisible()
  const start = await form.getByLabel('시작 날짜').inputValue()
  await form.getByLabel('끝 날짜').fill('2020-01-01')
  await expect(form.getByRole('alert')).toHaveText('끝 날짜는 시작 날짜보다 빠를 수 없어요')
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + 20 * 86_400_000).toISOString().slice(0, 10)
  await form.getByLabel('끝 날짜').fill(end)
  await expect(form.getByRole('alert')).toHaveCount(0)
  await expect(form.getByText('총 21일')).toBeVisible()
  await form.getByLabel(/명세 문서 경로/).fill('  docs/requirements.md ')
  await form.getByLabel(/활동 기록/).check()
  await form.getByRole('button', { name: '사무실 열기' }).click()

  // 새 사무실에 바로 들어간다 — 레포 관리자, 기간 · 경로가 팀 설정에
  await expect.poll(() => readStore(page, (s) => s.office?.snapshot?.workspace.displayName ?? null)).toBe('team-samdo/side-lab')
  const settings = await readStore(page, (s) => s.office!.snapshot!.settings)
  expect([settings.projectStartDate, settings.projectEndDate, settings.specDocumentPath]).toEqual([start, end, 'docs/requirements.md'])
  expect(await readStore(page, (s) => s.office!.snapshot!.viewer.role)).toBe('repo_admin')
  await expect(page.getByRole('banner').getByText('팀 오피스')).toBeVisible()
})
