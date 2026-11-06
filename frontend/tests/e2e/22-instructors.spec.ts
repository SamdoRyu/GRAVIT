// 22. 강사 지정 · 해제 (#53 — FR-AUTH-06): 상단 바 더보기 → "강사". 지정된 강사는 누구나 보고, 레포 관리자는 승인된 강사 계정
// 중에서 지정 · 해제(한 번 더 확인)한다. mock seed: 팀 사무실(ws_1) — 김옥토는 참여자, 박멘토 지정됨 / 시연 사무실(ws_2) — 김옥토가 R2.
import type { Page } from '@playwright/test'
import { expect, openApp, readStore, test } from './fixtures'

async function openInstructors(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: '더보기' }).click()
  await page.getByRole('menuitem', { name: '강사' }).click()
  const dialog = page.getByRole('dialog', { name: '강사' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('a participant sees the assigned instructors but cannot assign or revoke', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const dialog = await openInstructors(page)
  const current = dialog.getByRole('list', { name: '지정된 강사' })
  await expect(current.getByRole('listitem')).toHaveCount(1)
  await expect(current.getByRole('listitem', { name: '박멘토' })).toContainText('이삼도')
  await expect(dialog.getByRole('list', { name: '지정할 수 있는 강사' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /강사 지정 해제|강사로 지정/ })).toHaveCount(0)
})

test('a repo admin assigns an approved instructor account and revokes it after confirming', async ({ page }) => {
  await page.goto('/?workspace=ws_2')
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null)).toBe('ready')
  const dialog = await openInstructors(page)
  await expect(dialog).toContainText('아직 지정된 강사가 없어요')
  const candidates = dialog.getByRole('list', { name: '지정할 수 있는 강사' })
  await expect(candidates.getByRole('listitem')).toHaveCount(3)
  // 로그인한 적 없는 계정은 GitHub ID로
  await expect(candidates.getByRole('listitem', { name: 'GitHub 사용자 #9002' })).toContainText('아직 GRAVIT에 로그인한 적 없는 계정')

  await candidates.getByRole('button', { name: '@mentor-han 강사로 지정' }).click()
  await expect(page.getByText('한멘토 님을 강사로 지정했어요')).toBeVisible()
  const current = dialog.getByRole('list', { name: '지정된 강사' })
  await expect(current.getByRole('listitem', { name: '한멘토' })).toContainText('김옥토')
  await expect(candidates.getByRole('listitem')).toHaveCount(2)

  // 해제는 한 번 더 확인 — 취소하면 그대로
  await current.getByRole('button', { name: '한멘토 강사 지정 해제' }).click()
  await current.getByRole('group', { name: '한멘토 강사 해제 확인' }).getByRole('button', { name: '취소' }).click()
  await expect(current.getByRole('listitem', { name: '한멘토' })).toBeVisible()
  await current.getByRole('button', { name: '한멘토 강사 지정 해제' }).click()
  await current.getByRole('group', { name: '한멘토 강사 해제 확인' }).getByRole('button', { name: '해제' }).click()
  await expect(page.getByText('한멘토 님의 강사 지정을 해제했어요')).toBeVisible()
  await expect(dialog).toContainText('아직 지정된 강사가 없어요')
  await expect(candidates.getByRole('listitem')).toHaveCount(3)
})
