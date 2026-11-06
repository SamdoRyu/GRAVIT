// 29. 활동 기록 (#173 — FR-ACT-01 ~ 03 · P12): 상단 바 더보기 → "활동 기록". 다른 팀원 것을 확인하고, 내 활동을 쓰고,
// 수집 동의를 거두면 쓰기 폼이 없다. 동의하지 않은 팀원이 사무실에 처음 들어오면 동의 화면이 한 번 뜬다.
// mock seed(팀 사무실): 내(김옥토) 확인된 기획 활동 · 박데브의 확인 대기 자료조사.
import type { Page } from '@playwright/test'
import { expect, openApp, readStore, test } from './fixtures'

async function openActivities(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: '더보기' }).click()
  await page.getByRole('menuitem', { name: '활동 기록' }).click()
  const dialog = page.getByRole('dialog', { name: '활동 기록' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('confirm a teammate activity, filter, and record my own', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const dialog = await openActivities(page)
  const list = dialog.getByRole('list', { name: '활동 기록 목록' })
  await expect(list.getByRole('listitem')).toHaveCount(2)

  const mine = list.getByRole('listitem', { name: '김옥토 · 기획' })
  await expect(mine).toContainText('확인: 이삼도')
  await expect(mine.getByRole('button', { name: '확인' })).toHaveCount(0) // 내 것은 다른 팀원이 확인한다

  const theirs = list.getByRole('listitem', { name: '박데브 · 자료조사' })
  await expect(theirs).toContainText('확인 대기')
  await theirs.getByRole('button', { name: '확인' }).click()
  await expect(theirs).toContainText('확인: 김옥토')
  await expect(theirs.getByRole('button', { name: '확인' })).toHaveCount(0)
  await expect.poll(() => readStore(page, (s) => s.office.snapshot.activityNotes.length)).toBe(2) // 메모지가 하나 늘었다(changed 알림 → 다시 읽기)

  await dialog.getByRole('button', { name: '확인 대기' }).click()
  await expect(dialog.getByText('확인을 기다리는 활동이 없어요.')).toBeVisible()
  await dialog.getByRole('button', { name: '전체' }).click()

  const form = dialog.getByRole('form', { name: '활동 기록하기' })
  await form.getByRole('button', { name: '기록하기' }).click()
  await expect(form.getByRole('alert')).toHaveText('내용은 1~500자로 써 주세요')
  await form.getByRole('combobox', { name: '유형' }).selectOption({ label: '발표 준비' })
  await form.getByLabel('걸린 시간(분)').fill('40')
  await form.getByLabel('내용').fill('중간 발표 슬라이드')
  await form.getByRole('button', { name: '기록하기' }).click()
  await expect(list.getByRole('listitem').first()).toContainText('중간 발표 슬라이드')
  await expect(list.getByRole('listitem').first()).toContainText('확인 대기')
})

test('withdrawing consent hides the form; an unconsented member is asked once on entering', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const dialog = await openActivities(page)
  await dialog.getByRole('button', { name: '동의 거두기' }).click()
  await expect(dialog.getByRole('button', { name: '수집에 동의하기' })).toBeVisible()
  await expect(dialog.getByRole('form', { name: '활동 기록하기' })).toHaveCount(0)
  await dialog.locator('.modal-foot').getByRole('button', { name: '닫기' }).click()

  // 다시 들어오면(동의 안 함 · 아직 안 물음) 동의 화면이 한 번 뜬다
  await page.reload()
  const ask = page.getByRole('dialog', { name: '활동 기록 수집 동의' })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: '수집에 동의하기' }).click()
  await expect(ask.getByRole('form', { name: '활동 기록하기' })).toBeVisible()
  expect(await readStore(page, (s) => s.office.snapshot.viewer.activityConsented)).toBe(true)
  await ask.locator('.modal-foot').getByRole('button', { name: '닫기' }).click()

  // 물은 뒤에는 다시 뜨지 않는다
  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null)).toBe('ready')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
