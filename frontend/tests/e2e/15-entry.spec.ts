// 15. 진입 흐름 (#64 · #68 화면 몫): 사무실 고르기 → 사무실 → 사무실 바꾸기 → 로그아웃 → 로그인(심사용 · GitHub mock),
// 지난번 사무실 기억. mock 기본 세션은 GitHub 사용자(김옥토)이고 팀 사무실 · 시연 사무실에 들어갈 수 있다.
import type { Page } from '@playwright/test'
import { expect, readStore, test } from './fixtures'

const picker = (page: Page) => page.getByRole('region', { name: '사무실 고르기' })
const login = (page: Page) => page.getByRole('region', { name: '로그인' })

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
  await expect(login(page).getByRole('button', { name: 'GitHub로 로그인' })).toBeVisible()

  // 심사용 로그인 — 비어 있으면 · 틀리면 안내(어느 값인지 말하지 않음), 맞으면 시연 사무실만
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
  await login(page).getByRole('button', { name: 'GitHub로 로그인' }).click()
  await expect(picker(page)).toBeVisible()
  await expect(picker(page).getByText('김옥토')).toBeVisible()
})
